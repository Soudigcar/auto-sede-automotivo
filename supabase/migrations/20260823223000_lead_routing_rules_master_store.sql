-- Motor configuravel de roteamento de leads por loja.
-- Migration versionada apenas; nao aplicar automaticamente em Production.

create table if not exists public.lead_routing_rules (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  status text not null default 'active' check (status in ('active','paused','archived')),
  priority integer not null default 100 check (priority between 1 and 10000),
  match_type text not null default 'default' check (match_type in ('event','campaign','source','default')),
  event_id uuid references public.events(id) on delete cascade,
  campaign_id uuid,
  campaign_key text,
  source_key text,
  strategy text not null default 'round_robin' check (strategy in ('round_robin','fixed')),
  target_roles text[] not null default '{}',
  target_member_ids uuid[] not null default '{}',
  excluded_member_ids uuid[] not null default '{}',
  fixed_user_id uuid references public.users(id) on delete set null,
  starts_at timestamptz,
  ends_at timestamptz,
  created_by uuid references public.users(id) on delete set null,
  updated_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lead_routing_rule_period check (ends_at is null or starts_at is null or ends_at > starts_at),
  constraint lead_routing_rule_match check (
    (match_type = 'event' and event_id is not null)
    or (match_type = 'campaign' and (campaign_id is not null or nullif(btrim(campaign_key),'') is not null))
    or (match_type = 'source' and nullif(btrim(source_key),'') is not null)
    or match_type = 'default'
  ),
  constraint lead_routing_rule_fixed check (strategy <> 'fixed' or fixed_user_id is not null)
);

create index if not exists lead_routing_rules_match_idx on public.lead_routing_rules(store_id,status,match_type,priority);
create index if not exists lead_routing_rules_event_idx on public.lead_routing_rules(event_id) where event_id is not null;

create table if not exists public.lead_routing_rule_state (
  rule_id uuid primary key references public.lead_routing_rules(id) on delete cascade,
  last_user_id uuid references public.users(id) on delete set null,
  last_position integer not null default -1,
  routed_count bigint not null default 0,
  last_routed_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.lead_routing_decisions (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  rule_id uuid references public.lead_routing_rules(id) on delete set null,
  outcome text not null check (outcome in ('assigned','unassigned','no_rule','already_assigned')),
  selected_user_id uuid references public.users(id) on delete set null,
  selected_role text,
  strategy text,
  eligible_user_ids uuid[] not null default '{}',
  excluded_user_ids uuid[] not null default '{}',
  reason text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists lead_routing_decisions_lead_idx on public.lead_routing_decisions(lead_id,created_at desc);
create index if not exists lead_routing_decisions_store_idx on public.lead_routing_decisions(store_id,created_at desc);

create table if not exists public.lead_unassigned_queue (
  lead_id uuid primary key references public.leads(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  rule_id uuid references public.lead_routing_rules(id) on delete set null,
  reason text not null,
  status text not null default 'open' check (status in ('open','resolved','dismissed')),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references public.users(id) on delete set null,
  metadata jsonb not null default '{}'
);
create index if not exists lead_unassigned_queue_store_idx on public.lead_unassigned_queue(store_id,status,last_seen_at desc);

alter table public.lead_routing_rules enable row level security;
alter table public.lead_routing_rule_state enable row level security;
alter table public.lead_routing_decisions enable row level security;
alter table public.lead_unassigned_queue enable row level security;

revoke all on public.lead_routing_rules from anon, authenticated;
revoke all on public.lead_routing_rule_state from anon, authenticated;
revoke all on public.lead_routing_decisions from anon, authenticated;
revoke all on public.lead_unassigned_queue from anon, authenticated;

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
  select * into v_lead from public.leads where id = p_lead_id for update;
  if not found then raise exception 'Lead nao encontrado.' using errcode='P0002'; end if;
  if v_lead.assigned_store_id is null then
    return jsonb_build_object('outcome','no_store','lead_id',p_lead_id);
  end if;
  if v_lead.assigned_user_id is not null then
    insert into public.lead_routing_decisions(lead_id,store_id,outcome,selected_user_id,selected_role,reason)
    values(v_lead.id,v_lead.assigned_store_id,'already_assigned',v_lead.assigned_user_id,v_lead.assigned_user_role,'Lead ja possui responsavel.');
    return jsonb_build_object('outcome','already_assigned','user_id',v_lead.assigned_user_id);
  end if;

  v_source := lower(btrim(coalesce(v_lead.origin,'')));
  select lb.campaign_id, lower(btrim(coalesce(lb.campaign_name,'')))
    into v_campaign_id, v_campaign_key
  from public.leads_base lb where lb.routed_lead_id = v_lead.id order by lb.created_at desc limit 1;

  select r.* into v_rule
  from public.lead_routing_rules r
  where r.store_id = v_lead.assigned_store_id
    and r.status = 'active'
    and (r.starts_at is null or r.starts_at <= now())
    and (r.ends_at is null or r.ends_at > now())
    and (
      (r.match_type='event' and r.event_id = v_lead.event_id)
      or (r.match_type='campaign' and ((r.campaign_id is not null and r.campaign_id = v_campaign_id) or (r.campaign_id is null and lower(btrim(coalesce(r.campaign_key,''))) = v_campaign_key)))
      or (r.match_type='source' and lower(btrim(r.source_key)) = v_source)
      or r.match_type='default'
    )
  order by
    case r.match_type when 'event' then 1 when 'campaign' then 2 when 'source' then 3 else 4 end,
    r.priority asc,
    r.created_at asc
  limit 1
  for update;

  if not found then
    insert into public.lead_routing_decisions(lead_id,store_id,outcome,reason,metadata)
    values(v_lead.id,v_lead.assigned_store_id,'no_rule','Nenhuma regra configurada corresponde ao lead.',jsonb_build_object('source',v_source,'campaign_id',v_campaign_id,'event_id',v_lead.event_id));
    return jsonb_build_object('outcome','no_rule','fallback_allowed',true);
  end if;

  v_excluded_ids := coalesce(v_rule.excluded_member_ids,'{}');

  if v_rule.strategy = 'fixed' then
    select u.id,u.role into v_selected_user_id,v_selected_role
    from public.users u
    where u.id=v_rule.fixed_user_id
      and u.store_id=v_lead.assigned_store_id
      and u.status='active'
      and u.receives_leads=true
      and not (u.id = any(v_excluded_ids))
      and (u.max_open_leads is null or (select count(*) from public.leads ol where ol.assigned_user_id=u.id and ol.status not in ('sale_confirmed','lost')) < u.max_open_leads);
    if v_selected_user_id is not null then v_eligible_ids := array[v_selected_user_id]; end if;
  else
    create temporary table if not exists pg_temp._lead_route_candidates(id uuid, role text, pos integer) on commit drop;
    truncate pg_temp._lead_route_candidates;
    insert into pg_temp._lead_route_candidates(id,role,pos)
    select u.id,u.role,row_number() over(order by u.routing_order asc,u.full_name asc,u.id asc)::integer-1
    from public.users u
    where u.store_id=v_lead.assigned_store_id
      and u.status='active'
      and u.receives_leads=true
      and u.role in ('pre_sales','seller','prospector')
      and (cardinality(v_rule.target_roles)=0 or u.role = any(v_rule.target_roles))
      and (cardinality(v_rule.target_member_ids)=0 or u.id = any(v_rule.target_member_ids) or u.role = any(v_rule.target_roles))
      and not (u.id = any(v_excluded_ids))
      and (u.max_open_leads is null or (select count(*) from public.leads ol where ol.assigned_user_id=u.id and ol.status not in ('sale_confirmed','lost')) < u.max_open_leads);

    select coalesce(array_agg(id order by pos),'{}'),count(*) into v_eligible_ids,v_total from pg_temp._lead_route_candidates;
    if v_total > 0 then
      insert into public.lead_routing_rule_state(rule_id) values(v_rule.id) on conflict(rule_id) do nothing;
      select * into v_state from public.lead_routing_rule_state where rule_id=v_rule.id for update;
      select c.pos into v_last_position from pg_temp._lead_route_candidates c where c.id=v_state.last_user_id;
      v_next_position := case when v_last_position is null then 0 else (v_last_position+1)%v_total end;
      select c.id,c.role into v_selected_user_id,v_selected_role from pg_temp._lead_route_candidates c where c.pos=v_next_position;
      update public.lead_routing_rule_state set last_user_id=v_selected_user_id,last_position=v_next_position,routed_count=routed_count+1,last_routed_at=now(),updated_at=now() where rule_id=v_rule.id;
    end if;
  end if;

  if v_selected_user_id is null then
    insert into public.lead_unassigned_queue(lead_id,store_id,rule_id,reason,metadata)
    values(v_lead.id,v_lead.assigned_store_id,v_rule.id,'Regra correspondente sem destinatario elegivel.',jsonb_build_object('eligible_user_ids',v_eligible_ids,'excluded_user_ids',v_excluded_ids))
    on conflict(lead_id) do update set rule_id=excluded.rule_id,reason=excluded.reason,status='open',last_seen_at=now(),metadata=excluded.metadata;
    insert into public.lead_routing_decisions(lead_id,store_id,rule_id,outcome,strategy,eligible_user_ids,excluded_user_ids,reason)
    values(v_lead.id,v_lead.assigned_store_id,v_rule.id,'unassigned',v_rule.strategy,v_eligible_ids,v_excluded_ids,'Regra correspondente sem destinatario elegivel.');
    return jsonb_build_object('outcome','unassigned','fallback_allowed',false,'rule_id',v_rule.id);
  end if;

  update public.leads set
    captured_by_user_id = case when v_selected_role='prospector' then v_selected_user_id else captured_by_user_id end,
    pre_sales_user_id = case when v_selected_role='pre_sales' then v_selected_user_id else pre_sales_user_id end,
    pre_sales_assigned_at = case when v_selected_role='pre_sales' then now() else pre_sales_assigned_at end,
    seller_user_id = case when v_selected_role='seller' then v_selected_user_id else seller_user_id end,
    seller_assigned_at = case when v_selected_role='seller' then now() else seller_assigned_at end,
    assigned_user_id=v_selected_user_id,
    assigned_user_role=v_selected_role,
    assigned_user_at=now(),
    assignment_source='routing_rule',
    updated_at=now()
  where id=v_lead.id;

  update public.leads_base set assigned_consultant_id=v_selected_user_id,assigned_at=coalesce(assigned_at,now()),routing_strategy='routing_rule',updated_at=now() where routed_lead_id=v_lead.id;
  delete from public.lead_unassigned_queue where lead_id=v_lead.id;

  insert into public.lead_assignment_logs(lead_id,store_id,assignment_role,from_user_id,to_user_id,assignment_mode,assigned_by_user_id,notes,metadata)
  values(v_lead.id,v_lead.assigned_store_id,v_selected_role,null,v_selected_user_id,'system',p_actor_user_id,'Motor configuravel de roteamento.',jsonb_build_object('rule_id',v_rule.id,'strategy',v_rule.strategy));
  insert into public.lead_routing_decisions(lead_id,store_id,rule_id,outcome,selected_user_id,selected_role,strategy,eligible_user_ids,excluded_user_ids,reason)
  values(v_lead.id,v_lead.assigned_store_id,v_rule.id,'assigned',v_selected_user_id,v_selected_role,v_rule.strategy,v_eligible_ids,v_excluded_ids,'Distribuicao concluida.');

  return jsonb_build_object('outcome','assigned','fallback_allowed',false,'rule_id',v_rule.id,'user_id',v_selected_user_id,'role',v_selected_role);
end;
$function$;

revoke all on function public.route_lead_by_rules(uuid,uuid) from public, anon, authenticated;
grant execute on function public.route_lead_by_rules(uuid,uuid) to service_role;

-- Gatilho generico: aplica regras somente a leads com loja definida e ainda sem responsavel.
-- O trigger de leads e diferido para permitir que leads_base/campanha sejam gravados na mesma transacao.
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

  select l.assigned_store_id, l.assigned_user_id
    into v_store_id, v_assigned_user_id
  from public.leads l
  where l.id = v_lead_id;

  if not found or v_store_id is null or v_assigned_user_id is not null then
    return new;
  end if;

  -- Evita uma segunda decisao no mesmo transaction boundary quando leads_base
  -- ja acionou o motor antes do trigger diferido de leads.
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

  perform public.route_lead_by_rules(v_lead_id, null);
  return new;
end;
$trigger$;

revoke all on function public.auto_route_lead_by_rules_trigger() from public, anon, authenticated;

drop trigger if exists leads_auto_route_by_rules on public.leads;
create constraint trigger leads_auto_route_by_rules
after insert or update on public.leads
deferrable initially deferred
for each row
execute function public.auto_route_lead_by_rules_trigger();

drop trigger if exists leads_base_auto_route_by_rules on public.leads_base;
create trigger leads_base_auto_route_by_rules
after insert or update on public.leads_base
for each row
execute function public.auto_route_lead_by_rules_trigger();
