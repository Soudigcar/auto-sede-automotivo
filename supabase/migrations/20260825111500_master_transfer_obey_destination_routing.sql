-- Route Master-transferred leads through the destination store's operational routing flow.
-- Historical event/campaign/source in leads_base remain Master-only and MUST NOT influence
-- the receiving store assignment. Master transfers may match only an explicit
-- source=master_transfer rule or the destination store default rule.

create or replace function public.route_master_transfer_lead_by_rules(
  p_lead_id uuid,
  p_actor_user_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_lead public.leads%rowtype;
  v_rule public.lead_routing_rules%rowtype;
  v_state public.lead_routing_rule_state%rowtype;
  v_selected_user_id uuid;
  v_selected_role text;
  v_eligible_ids uuid[] := '{}';
  v_excluded_ids uuid[] := '{}';
  v_total integer := 0;
  v_last_position integer;
  v_next_position integer;
begin
  select * into v_lead
  from public.leads
  where id = p_lead_id
  for update;

  if not found then
    raise exception 'Lead nao encontrado.' using errcode = 'P0002';
  end if;

  if v_lead.assigned_store_id is null then
    return jsonb_build_object('outcome','no_store','lead_id',p_lead_id);
  end if;

  -- Fail closed: this specialized router may only process sanitized Master transfers.
  if coalesce(v_lead.origin,'') <> 'master_transfer' then
    raise exception 'Roteamento Master recusado: origem operacional invalida.' using errcode = '22023';
  end if;

  if v_lead.assigned_user_id is not null then
    return jsonb_build_object(
      'outcome','already_assigned',
      'user_id',v_lead.assigned_user_id,
      'role',v_lead.assigned_user_role,
      'audited',false
    );
  end if;

  -- Privacy boundary: do not read leads_base event/campaign/source for rule matching.
  -- Only an explicit source=master_transfer rule or the store default may match.
  select r.* into v_rule
  from public.lead_routing_rules r
  where r.store_id = v_lead.assigned_store_id
    and r.status = 'active'
    and (r.starts_at is null or r.starts_at <= now())
    and (r.ends_at is null or r.ends_at > now())
    and (
      (r.match_type = 'source' and lower(btrim(coalesce(r.source_key,''))) = 'master_transfer')
      or r.match_type = 'default'
    )
  order by
    case r.match_type when 'source' then 1 else 2 end,
    r.priority asc,
    r.created_at asc
  limit 1
  for update;

  if not found then
    insert into public.lead_routing_decisions(lead_id,store_id,outcome,reason,metadata)
    values(
      v_lead.id,
      v_lead.assigned_store_id,
      'no_rule',
      'Transferencia Master sem regra operacional source=master_transfer ou default.',
      jsonb_build_object(
        'operational_source','master_transfer',
        'operational_event_id',null,
        'historical_provenance_used',false
      )
    );
    return jsonb_build_object('outcome','no_rule','fallback_allowed',true,'operational_source','master_transfer');
  end if;

  v_excluded_ids := coalesce(v_rule.excluded_member_ids,'{}');

  if v_rule.strategy = 'fixed' then
    select u.id,u.role
    into v_selected_user_id,v_selected_role
    from public.users u
    where u.id = v_rule.fixed_user_id
      and u.store_id = v_lead.assigned_store_id
      and u.status = 'active'
      and u.receives_leads = true
      and not (u.id = any(v_excluded_ids))
    for update;

    if v_selected_user_id is not null and exists (
      select 1
      from public.users u
      where u.id = v_selected_user_id
        and (
          u.max_open_leads is null
          or (
            select count(*)
            from public.leads ol
            where ol.assigned_user_id = u.id
              and ol.status not in ('sale_confirmed','lost')
          ) < u.max_open_leads
        )
    ) then
      v_eligible_ids := array[v_selected_user_id];
    else
      v_selected_user_id := null;
      v_selected_role := null;
    end if;
  else
    perform 1
    from public.users u
    where u.store_id = v_lead.assigned_store_id
      and u.status = 'active'
      and u.receives_leads = true
      and u.role in ('pre_sales','seller','prospector')
      and (cardinality(v_rule.target_roles) = 0 or u.role = any(v_rule.target_roles))
      and (
        cardinality(v_rule.target_member_ids) = 0
        or u.id = any(v_rule.target_member_ids)
        or u.role = any(v_rule.target_roles)
      )
      and not (u.id = any(v_excluded_ids))
    order by u.id
    for update;

    create temporary table if not exists pg_temp._master_transfer_route_candidates(
      id uuid,
      role text,
      pos integer
    ) on commit drop;

    truncate pg_temp._master_transfer_route_candidates;

    insert into pg_temp._master_transfer_route_candidates(id,role,pos)
    select
      u.id,
      u.role,
      row_number() over(order by u.routing_order asc,u.full_name asc,u.id asc)::integer - 1
    from public.users u
    where u.store_id = v_lead.assigned_store_id
      and u.status = 'active'
      and u.receives_leads = true
      and u.role in ('pre_sales','seller','prospector')
      and (cardinality(v_rule.target_roles) = 0 or u.role = any(v_rule.target_roles))
      and (
        cardinality(v_rule.target_member_ids) = 0
        or u.id = any(v_rule.target_member_ids)
        or u.role = any(v_rule.target_roles)
      )
      and not (u.id = any(v_excluded_ids))
      and (
        u.max_open_leads is null
        or (
          select count(*)
          from public.leads ol
          where ol.assigned_user_id = u.id
            and ol.status not in ('sale_confirmed','lost')
        ) < u.max_open_leads
      );

    select coalesce(array_agg(id order by pos),'{}'),count(*)
    into v_eligible_ids,v_total
    from pg_temp._master_transfer_route_candidates;

    if v_total > 0 then
      insert into public.lead_routing_rule_state(rule_id)
      values(v_rule.id)
      on conflict(rule_id) do nothing;

      select * into v_state
      from public.lead_routing_rule_state
      where rule_id = v_rule.id
      for update;

      select c.pos into v_last_position
      from pg_temp._master_transfer_route_candidates c
      where c.id = v_state.last_user_id;

      v_next_position := case
        when v_last_position is null then 0
        else (v_last_position + 1) % v_total
      end;

      select c.id,c.role
      into v_selected_user_id,v_selected_role
      from pg_temp._master_transfer_route_candidates c
      where c.pos = v_next_position;

      update public.lead_routing_rule_state
      set
        last_user_id = v_selected_user_id,
        last_position = v_next_position,
        routed_count = routed_count + 1,
        last_routed_at = now(),
        updated_at = now()
      where rule_id = v_rule.id;
    end if;
  end if;

  if v_selected_user_id is null then
    insert into public.lead_unassigned_queue(lead_id,store_id,rule_id,reason,metadata)
    values(
      v_lead.id,
      v_lead.assigned_store_id,
      v_rule.id,
      'Regra operacional da transferencia Master sem destinatario elegivel.',
      jsonb_build_object(
        'eligible_user_ids',v_eligible_ids,
        'excluded_user_ids',v_excluded_ids,
        'operational_source','master_transfer',
        'historical_provenance_used',false
      )
    )
    on conflict(lead_id) do update
    set
      rule_id = excluded.rule_id,
      reason = excluded.reason,
      status = 'open',
      last_seen_at = now(),
      metadata = excluded.metadata;

    insert into public.lead_routing_decisions(
      lead_id,store_id,rule_id,outcome,strategy,eligible_user_ids,excluded_user_ids,reason,metadata
    )
    values(
      v_lead.id,
      v_lead.assigned_store_id,
      v_rule.id,
      'unassigned',
      v_rule.strategy,
      v_eligible_ids,
      v_excluded_ids,
      'Regra operacional da transferencia Master sem destinatario elegivel.',
      jsonb_build_object('operational_source','master_transfer','historical_provenance_used',false)
    );

    return jsonb_build_object(
      'outcome','unassigned',
      'fallback_allowed',false,
      'rule_id',v_rule.id,
      'operational_source','master_transfer'
    );
  end if;

  update public.leads
  set
    captured_by_user_id = case when v_selected_role = 'prospector' then v_selected_user_id else captured_by_user_id end,
    pre_sales_user_id = case when v_selected_role = 'pre_sales' then v_selected_user_id else pre_sales_user_id end,
    pre_sales_assigned_at = case when v_selected_role = 'pre_sales' then now() else pre_sales_assigned_at end,
    seller_user_id = case when v_selected_role = 'seller' then v_selected_user_id else seller_user_id end,
    seller_assigned_at = case when v_selected_role = 'seller' then now() else seller_assigned_at end,
    assigned_user_id = v_selected_user_id,
    assigned_user_role = v_selected_role,
    assigned_user_at = now(),
    assignment_source = 'routing_rule',
    updated_at = now()
  where id = v_lead.id;

  update public.leads_base
  set
    assigned_consultant_id = v_selected_user_id,
    assigned_at = coalesce(assigned_at,now()),
    routing_strategy = 'routing_rule',
    metadata = jsonb_set(
      coalesce(metadata,'{}'::jsonb),
      '{routing}',
      coalesce(metadata->'routing','{}'::jsonb) || jsonb_build_object(
        'post_master_transfer_rule_id',v_rule.id,
        'post_master_transfer_user_id',v_selected_user_id,
        'post_master_transfer_user_role',v_selected_role,
        'post_master_transfer_routed_at',now(),
        'historical_provenance_used_for_assignment',false
      ),
      true
    ),
    updated_at = now()
  where routed_lead_id = v_lead.id;

  delete from public.lead_unassigned_queue where lead_id = v_lead.id;

  insert into public.lead_assignment_logs(
    lead_id,store_id,assignment_role,from_user_id,to_user_id,assignment_mode,
    assigned_by_user_id,notes,metadata
  )
  values(
    v_lead.id,
    v_lead.assigned_store_id,
    v_selected_role,
    null,
    v_selected_user_id,
    'system',
    p_actor_user_id,
    'Roteamento operacional apos Transferencia Master.',
    jsonb_build_object(
      'rule_id',v_rule.id,
      'strategy',v_rule.strategy,
      'operational_source','master_transfer',
      'historical_provenance_used',false
    )
  );

  insert into public.lead_routing_decisions(
    lead_id,store_id,rule_id,outcome,selected_user_id,selected_role,strategy,
    eligible_user_ids,excluded_user_ids,reason,metadata
  )
  values(
    v_lead.id,
    v_lead.assigned_store_id,
    v_rule.id,
    'assigned',
    v_selected_user_id,
    v_selected_role,
    v_rule.strategy,
    v_eligible_ids,
    v_excluded_ids,
    'Transferencia Master distribuida pelo fluxo operacional da loja destino.',
    jsonb_build_object('operational_source','master_transfer','historical_provenance_used',false)
  );

  return jsonb_build_object(
    'outcome','assigned',
    'fallback_allowed',false,
    'rule_id',v_rule.id,
    'user_id',v_selected_user_id,
    'role',v_selected_role,
    'operational_source','master_transfer',
    'historical_provenance_used',false
  );
end;
$function$;

revoke all on function public.route_master_transfer_lead_by_rules(uuid,uuid) from public;
revoke all on function public.route_master_transfer_lead_by_rules(uuid,uuid) from anon;
revoke all on function public.route_master_transfer_lead_by_rules(uuid,uuid) from authenticated;
grant execute on function public.route_master_transfer_lead_by_rules(uuid,uuid) to service_role;

create or replace function public.master_transfer_base_lead_to_store_routed(
  p_base_lead_id uuid,
  p_store_id uuid,
  p_actor_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_transfer jsonb;
  v_routing jsonb;
  v_routed_lead_id uuid;
begin
  -- Inner transfer and routing execute in the same database transaction.
  -- Any technical exception raised by the routing step rolls back the transfer.
  v_transfer := public.master_transfer_base_lead_to_store(
    p_base_lead_id,
    p_store_id,
    p_actor_user_id
  );

  if coalesce(v_transfer->>'outcome','') <> 'transferred' then
    return v_transfer;
  end if;

  v_routed_lead_id := nullif(v_transfer->>'routed_lead_id','')::uuid;
  if v_routed_lead_id is null then
    raise exception 'Transferencia Master sem routed_lead_id; operacao abortada.';
  end if;

  v_routing := public.route_master_transfer_lead_by_rules(
    v_routed_lead_id,
    p_actor_user_id
  );

  return v_transfer || jsonb_build_object(
    'routing',v_routing,
    'routing_outcome',v_routing->>'outcome',
    'assigned_user_id',v_routing->>'user_id',
    'assigned_user_role',v_routing->>'role'
  );
end;
$function$;

revoke all on function public.master_transfer_base_lead_to_store_routed(uuid,uuid,uuid) from public;
revoke all on function public.master_transfer_base_lead_to_store_routed(uuid,uuid,uuid) from anon;
revoke all on function public.master_transfer_base_lead_to_store_routed(uuid,uuid,uuid) from authenticated;
grant execute on function public.master_transfer_base_lead_to_store_routed(uuid,uuid,uuid) to service_role;
