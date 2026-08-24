-- Hardening do Motor de Roteamento para distribuicao em lote da Base Master.
-- Mantem anon/authenticated sem acesso direto, concede somente o minimo ao service_role,
-- preserva precedencia Evento > Campanha > Origem > Padrao e evita dupla execucao/auditoria.

-- A API server-side precisa administrar regras e consultar estado/auditoria/fila.
-- Escritas internas de estado, decisoes e fila continuam exclusivas das funcoes SECURITY DEFINER.
revoke all on table public.lead_routing_rules from anon, authenticated;
revoke all on table public.lead_routing_rule_state from anon, authenticated;
revoke all on table public.lead_routing_decisions from anon, authenticated;
revoke all on table public.lead_unassigned_queue from anon, authenticated;

grant select, insert, update on table public.lead_routing_rules to service_role;
grant select on table public.lead_routing_rule_state to service_role;
grant select on table public.lead_routing_decisions to service_role;
grant select on table public.lead_unassigned_queue to service_role;

-- O motor passa a usar a origem da Base quando houver Base vinculada, sem perder o fallback
-- para leads operacionais que nao nasceram em leads_base. Uma chamada repetida em lead ja
-- atribuido retorna o estado atual sem criar uma segunda linha de auditoria.
create or replace function public.route_lead_by_rules(p_lead_id uuid, p_actor_user_id uuid default null)
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
  v_campaign_id uuid;
  v_campaign_key text;
  v_source text;
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

  if v_lead.assigned_user_id is not null then
    return jsonb_build_object(
      'outcome','already_assigned',
      'user_id',v_lead.assigned_user_id,
      'role',v_lead.assigned_user_role,
      'audited',false
    );
  end if;

  v_source := lower(btrim(coalesce(v_lead.origin,'')));
  select
    lb.campaign_id,
    lower(btrim(coalesce(lb.campaign_name,''))),
    lower(btrim(coalesce(nullif(btrim(lb.source),''),v_lead.origin,'')))
  into v_campaign_id, v_campaign_key, v_source
  from public.leads_base lb
  where lb.routed_lead_id = v_lead.id
  order by lb.created_at desc
  limit 1;

  v_source := coalesce(v_source, lower(btrim(coalesce(v_lead.origin,''))));

  select r.* into v_rule
  from public.lead_routing_rules r
  where r.store_id = v_lead.assigned_store_id
    and r.status = 'active'
    and (r.starts_at is null or r.starts_at <= now())
    and (r.ends_at is null or r.ends_at > now())
    and (
      (r.match_type = 'event' and r.event_id = v_lead.event_id)
      or (
        r.match_type = 'campaign'
        and (
          (r.campaign_id is not null and r.campaign_id = v_campaign_id)
          or (
            r.campaign_id is null
            and lower(btrim(coalesce(r.campaign_key,''))) = v_campaign_key
          )
        )
      )
      or (r.match_type = 'source' and lower(btrim(r.source_key)) = v_source)
      or r.match_type = 'default'
    )
  order by
    case r.match_type when 'event' then 1 when 'campaign' then 2 when 'source' then 3 else 4 end,
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
      'Nenhuma regra configurada corresponde ao lead.',
      jsonb_build_object('source',v_source,'campaign_id',v_campaign_id,'event_id',v_lead.event_id)
    );
    return jsonb_build_object('outcome','no_rule','fallback_allowed',true);
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
      and (
        u.max_open_leads is null
        or (
          select count(*)
          from public.leads ol
          where ol.assigned_user_id = u.id
            and ol.status not in ('sale_confirmed','lost')
        ) < u.max_open_leads
      );

    if v_selected_user_id is not null then
      v_eligible_ids := array[v_selected_user_id];
    end if;
  else
    create temporary table if not exists pg_temp._lead_route_candidates(
      id uuid,
      role text,
      pos integer
    ) on commit drop;

    truncate pg_temp._lead_route_candidates;

    insert into pg_temp._lead_route_candidates(id,role,pos)
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
    from pg_temp._lead_route_candidates;

    if v_total > 0 then
      insert into public.lead_routing_rule_state(rule_id)
      values(v_rule.id)
      on conflict(rule_id) do nothing;

      select * into v_state
      from public.lead_routing_rule_state
      where rule_id = v_rule.id
      for update;

      select c.pos into v_last_position
      from pg_temp._lead_route_candidates c
      where c.id = v_state.last_user_id;

      v_next_position := case
        when v_last_position is null then 0
        else (v_last_position + 1) % v_total
      end;

      select c.id,c.role
      into v_selected_user_id,v_selected_role
      from pg_temp._lead_route_candidates c
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
      'Regra correspondente sem destinatario elegivel.',
      jsonb_build_object('eligible_user_ids',v_eligible_ids,'excluded_user_ids',v_excluded_ids)
    )
    on conflict(lead_id) do update
    set
      rule_id = excluded.rule_id,
      reason = excluded.reason,
      status = 'open',
      last_seen_at = now(),
      metadata = excluded.metadata;

    insert into public.lead_routing_decisions(
      lead_id,store_id,rule_id,outcome,strategy,eligible_user_ids,excluded_user_ids,reason
    )
    values(
      v_lead.id,
      v_lead.assigned_store_id,
      v_rule.id,
      'unassigned',
      v_rule.strategy,
      v_eligible_ids,
      v_excluded_ids,
      'Regra correspondente sem destinatario elegivel.'
    );

    return jsonb_build_object(
      'outcome','unassigned',
      'fallback_allowed',false,
      'rule_id',v_rule.id
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
    updated_at = now()
  where routed_lead_id = v_lead.id;

  delete from public.lead_unassigned_queue
  where lead_id = v_lead.id;

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
    'Motor configuravel de roteamento.',
    jsonb_build_object('rule_id',v_rule.id,'strategy',v_rule.strategy)
  );

  insert into public.lead_routing_decisions(
    lead_id,store_id,rule_id,outcome,selected_user_id,selected_role,strategy,
    eligible_user_ids,excluded_user_ids,reason
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
    'Distribuicao concluida.'
  );

  return jsonb_build_object(
    'outcome','assigned',
    'fallback_allowed',false,
    'rule_id',v_rule.id,
    'user_id',v_selected_user_id,
    'role',v_selected_role
  );
end;
$function$;

-- O trigger automatico respeita uma trava local de transacao. A RPC de distribuicao em lote
-- monta todo o contexto primeiro e chama o motor explicitamente uma unica vez.
create or replace function public.auto_route_lead_by_rules_trigger()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $trigger$
declare
  v_lead_id uuid;
  v_store_id uuid;
  v_assigned_user_id uuid;
begin
  if coalesce(current_setting('app.lead_routing_explicit', true),'off') = 'on' then
    return new;
  end if;

  if tg_table_name = 'leads' then
    if tg_op = 'UPDATE' and new.assigned_store_id is not distinct from old.assigned_store_id then
      return new;
    end if;
    v_lead_id := new.id;
  elsif tg_table_name = 'leads_base' then
    if tg_op = 'UPDATE'
      and new.routed_lead_id is not distinct from old.routed_lead_id
      and new.campaign_id is not distinct from old.campaign_id
      and new.campaign_name is not distinct from old.campaign_name
      and new.assigned_store_id is not distinct from old.assigned_store_id then
      return new;
    end if;
    v_lead_id := new.routed_lead_id;
  else
    return new;
  end if;

  if v_lead_id is null then
    return new;
  end if;

  select l.assigned_store_id,l.assigned_user_id
  into v_store_id,v_assigned_user_id
  from public.leads l
  where l.id = v_lead_id;

  if not found or v_store_id is null or v_assigned_user_id is not null then
    return new;
  end if;

  if exists (
    select 1
    from public.lead_routing_decisions d
    where d.lead_id = v_lead_id
      and d.created_at >= transaction_timestamp()
  ) then
    return new;
  end if;

  if exists (
    select 1
    from public.lead_unassigned_queue q
    where q.lead_id = v_lead_id
      and q.status = 'open'
  ) then
    return new;
  end if;

  perform public.route_lead_by_rules(v_lead_id,null);
  return new;
end;
$trigger$;

-- RPC transacional por lead. O lock em leads_base serializa duas tentativas concorrentes
-- para o mesmo lead; o lock do usuario protege capacidade no modo de membros; o lock do
-- estado da regra dentro de route_lead_by_rules preserva a sequencia do rodizio.
create or replace function public.distribute_base_lead_to_store(
  p_base_lead_id uuid,
  p_store_id uuid,
  p_actor_user_id uuid,
  p_mode text default 'configured_rotation',
  p_selected_user_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_base public.leads_base%rowtype;
  v_store public.stores%rowtype;
  v_routed public.leads%rowtype;
  v_member public.users%rowtype;
  v_routed_id uuid;
  v_now timestamptz := clock_timestamp();
  v_operational_origin text;
  v_route_result jsonb;
  v_outcome text;
  v_metadata jsonb;
  v_open_count bigint;
begin
  if p_mode not in ('configured_rotation','selected_members') then
    raise exception 'Modo de distribuicao invalido.' using errcode = '22023';
  end if;

  if p_actor_user_id is null or not exists (
    select 1
    from public.users u
    where u.id = p_actor_user_id
      and u.role = 'master'
      and u.status = 'active'
  ) then
    raise exception 'Ator Master invalido.' using errcode = '42501';
  end if;

  perform set_config('app.lead_routing_explicit','on',true);

  select * into v_base
  from public.leads_base
  where id = p_base_lead_id
  for update;

  if not found then
    return jsonb_build_object('outcome','not_found','base_lead_id',p_base_lead_id);
  end if;

  if v_base.status in ('Venda concluída','Perdido') then
    return jsonb_build_object(
      'outcome','protected',
      'reason','final_status',
      'status',v_base.status,
      'base_lead_id',v_base.id
    );
  end if;

  select * into v_store
  from public.stores
  where id = p_store_id
  for key share;

  if not found or lower(coalesce(v_store.status,'')) in ('deleted','excluido') then
    return jsonb_build_object('outcome','invalid_store','store_id',p_store_id);
  end if;

  if v_base.event_id is not null and not exists (
    select 1
    from public.store_event_participations sep
    where sep.event_id = v_base.event_id
      and sep.store_id = v_store.id
      and sep.status in ('active','inactive')
  ) then
    return jsonb_build_object(
      'outcome','event_blocked',
      'event_id',v_base.event_id,
      'store_id',v_store.id
    );
  end if;

  if v_base.assigned_consultant_id is not null then
    return jsonb_build_object(
      'outcome','already_assigned',
      'user_id',v_base.assigned_consultant_id,
      'base_lead_id',v_base.id,
      'audited',false
    );
  end if;

  v_routed_id := v_base.routed_lead_id;
  if v_routed_id is not null then
    select * into v_routed
    from public.leads
    where id = v_routed_id
    for update;

    if not found then
      v_routed_id := null;
    elsif v_routed.assigned_user_id is not null then
      return jsonb_build_object(
        'outcome','already_assigned',
        'user_id',v_routed.assigned_user_id,
        'role',v_routed.assigned_user_role,
        'routed_lead_id',v_routed.id,
        'audited',false
      );
    elsif v_base.event_id is not null
      and v_routed.event_id is not null
      and v_base.event_id <> v_routed.event_id then
      return jsonb_build_object(
        'outcome','event_mismatch',
        'base_event_id',v_base.event_id,
        'routed_event_id',v_routed.event_id
      );
    end if;
  end if;

  v_operational_origin := case
    when lower(coalesce(v_base.source,'')) like '%facebook%' then 'facebook_lead_ads'
    when lower(coalesce(v_base.source,'')) like '%whatsapp%'
      or lower(coalesce(v_base.source,'')) like '%wati%'
      or lower(coalesce(v_base.source,'')) like '%umbler%' then 'whatsapp_official'
    when lower(coalesce(v_base.source,'')) like '%marketplace%'
      or lower(coalesce(v_base.source,'')) like '%portal%' then 'marketplace_site'
    when lower(coalesce(v_base.source,'')) like '%landing%'
      or lower(coalesce(v_base.source,'')) like '%simulador%'
      or lower(coalesce(v_base.source,'')) like '%form%' then 'event_landing'
    else 'manual'
  end;

  if v_routed_id is null then
    insert into public.leads(
      event_id,
      customer_name,
      customer_phone,
      customer_bank,
      interested_vehicle,
      vehicle_category_interest,
      origin,
      assigned_store_id,
      status,
      notes
    )
    values(
      v_base.event_id,
      coalesce(nullif(btrim(v_base.name),''),'Lead sem nome'),
      nullif(btrim(v_base.phone),''),
      '',
      coalesce(v_base.vehicle_name,''),
      '',
      v_operational_origin,
      v_store.id,
      'new_lead',
      'Lead distribuido em lote pela Base Master.'
    )
    returning * into v_routed;

    v_routed_id := v_routed.id;
  else
    update public.leads
    set
      assigned_store_id = v_store.id,
      event_id = coalesce(v_base.event_id,v_routed.event_id),
      origin = v_operational_origin,
      updated_at = v_now
    where id = v_routed_id
      and assigned_user_id is null
    returning * into v_routed;
  end if;

  v_metadata := coalesce(v_base.metadata,'{}'::jsonb);
  v_metadata := v_metadata || jsonb_build_object('event_id',v_base.event_id);
  v_metadata := jsonb_set(
    v_metadata,
    '{routing}',
    coalesce(v_metadata->'routing','{}'::jsonb) || jsonb_build_object(
      'strategy',case when p_mode = 'configured_rotation' then 'routing_rule' else 'master_bulk_distribution' end,
      'previous_store_id',v_base.assigned_store_id,
      'previous_store_name',v_base.assigned_store_name,
      'assigned_store_id',v_store.id,
      'assigned_store_name',v_store.store_name,
      'assigned_at',v_now,
      'routed_lead_id',v_routed_id
    ),
    true
  );

  -- O contexto completo (evento/campanha/origem e vinculo com o lead operacional) e salvo
  -- antes de qualquer decisao. O trigger imediato de leads_base esta suprimido apenas nesta transacao.
  update public.leads_base
  set
    assigned_store_id = v_store.id,
    assigned_store_name = v_store.store_name,
    assigned_at = v_now,
    routed_lead_id = v_routed_id,
    routing_strategy = case when p_mode = 'configured_rotation' then 'routing_rule' else 'master_bulk_distribution' end,
    metadata = v_metadata,
    updated_at = v_now
  where id = v_base.id;

  if p_mode = 'configured_rotation' then
    v_route_result := public.route_lead_by_rules(v_routed_id,p_actor_user_id);
    v_outcome := coalesce(v_route_result->>'outcome','error');

    select * into v_routed
    from public.leads
    where id = v_routed_id;

    if v_routed.assigned_user_id is not null then
      v_metadata := jsonb_set(
        v_metadata,
        '{routing}',
        coalesce(v_metadata->'routing','{}'::jsonb) || jsonb_build_object(
          'assigned_user_id',v_routed.assigned_user_id,
          'assigned_user_role',v_routed.assigned_user_role
        ),
        true
      );

      update public.leads_base
      set
        assigned_consultant_id = v_routed.assigned_user_id,
        routing_strategy = 'routing_rule',
        metadata = v_metadata,
        updated_at = clock_timestamp()
      where id = v_base.id;
    end if;

    return v_route_result || jsonb_build_object(
      'base_lead_id',v_base.id,
      'routed_lead_id',v_routed_id,
      'store_id',v_store.id
    );
  end if;

  if p_selected_user_id is null then
    return jsonb_build_object('outcome','member_required','base_lead_id',v_base.id);
  end if;

  select * into v_member
  from public.users u
  where u.id = p_selected_user_id
    and u.store_id = v_store.id
    and u.status = 'active'
    and u.receives_leads = true
    and u.role in ('pre_sales','seller','prospector')
  for update;

  if not found then
    return jsonb_build_object(
      'outcome','member_ineligible',
      'user_id',p_selected_user_id,
      'store_id',v_store.id
    );
  end if;

  if v_member.max_open_leads is not null then
    select count(*) into v_open_count
    from public.leads ol
    where ol.assigned_user_id = v_member.id
      and ol.status not in ('sale_confirmed','lost');

    if v_open_count >= v_member.max_open_leads then
      return jsonb_build_object(
        'outcome','member_capacity_reached',
        'user_id',v_member.id,
        'open_leads',v_open_count,
        'max_open_leads',v_member.max_open_leads
      );
    end if;
  end if;

  update public.leads
  set
    captured_by_user_id = case when v_member.role = 'prospector' then v_member.id else captured_by_user_id end,
    pre_sales_user_id = case when v_member.role = 'pre_sales' then v_member.id else pre_sales_user_id end,
    pre_sales_assigned_at = case when v_member.role = 'pre_sales' then v_now else pre_sales_assigned_at end,
    seller_user_id = case when v_member.role = 'seller' then v_member.id else seller_user_id end,
    seller_assigned_at = case when v_member.role = 'seller' then v_now else seller_assigned_at end,
    assigned_user_id = v_member.id,
    assigned_user_role = v_member.role,
    assigned_user_at = v_now,
    assignment_source = 'master_bulk_distribution',
    updated_at = v_now
  where id = v_routed_id
    and assigned_user_id is null
  returning * into v_routed;

  if not found then
    return jsonb_build_object('outcome','already_assigned','routed_lead_id',v_routed_id,'audited',false);
  end if;

  v_metadata := jsonb_set(
    v_metadata,
    '{routing}',
    coalesce(v_metadata->'routing','{}'::jsonb) || jsonb_build_object(
      'assigned_user_id',v_member.id,
      'assigned_user_role',v_member.role
    ),
    true
  );

  update public.leads_base
  set
    assigned_consultant_id = v_member.id,
    assigned_at = v_now,
    routing_strategy = 'master_bulk_distribution',
    metadata = v_metadata,
    updated_at = v_now
  where id = v_base.id;

  delete from public.lead_unassigned_queue
  where lead_id = v_routed_id;

  insert into public.lead_assignment_logs(
    lead_id,store_id,assignment_role,from_user_id,to_user_id,assignment_mode,
    assigned_by_user_id,notes,metadata
  )
  values(
    v_routed_id,
    v_store.id,
    v_member.role,
    null,
    v_member.id,
    'manual',
    p_actor_user_id,
    'Distribuicao em lote pela Base Master.',
    jsonb_build_object('source','master_base_bulk_distribution')
  );

  return jsonb_build_object(
    'outcome','assigned',
    'base_lead_id',v_base.id,
    'routed_lead_id',v_routed_id,
    'store_id',v_store.id,
    'user_id',v_member.id,
    'role',v_member.role,
    'strategy','master_bulk_distribution'
  );
end;
$function$;

revoke all on function public.route_lead_by_rules(uuid,uuid) from public, anon, authenticated;
grant execute on function public.route_lead_by_rules(uuid,uuid) to service_role;

revoke all on function public.auto_route_lead_by_rules_trigger() from public, anon, authenticated;

revoke all on function public.distribute_base_lead_to_store(uuid,uuid,uuid,text,uuid) from public, anon, authenticated;
grant execute on function public.distribute_base_lead_to_store(uuid,uuid,uuid,text,uuid) to service_role;
