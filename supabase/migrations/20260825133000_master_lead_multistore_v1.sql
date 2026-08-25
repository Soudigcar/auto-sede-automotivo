-- Master multistore lead distribution V1.
--
-- Goals:
--   * keep leads_base as Master provenance/history;
--   * give each store an independent operational public.leads row;
--   * make distribution idempotent per canonical lead + store;
--   * never move/reuse another store's operational lead;
--   * preserve current legacy callers through compatibility wrappers;
--   * harden the deferred master_transfer routing trigger against unrelated UPDATEs.
--
-- This migration intentionally does NOT contain any A4/7hs recovery data.

-- ---------------------------------------------------------------------------
-- 1. Fail closed on leads.origin drift and add master_transfer when needed.
-- ---------------------------------------------------------------------------
do $origin_guard$
declare
  v_current text;
  v_expected_legacy constant text := $legacy$CHECK (((origin)::text = ANY (ARRAY['street_survey'::text, 'quick_registration'::text, 'manual'::text, 'event_landing'::text, 'Facebook Lead Ads'::text, 'facebook_lead_ads'::text, 'WhatsApp Oficial'::text, 'whatsapp_official'::text, 'WATI / Click-to-WhatsApp'::text, 'wati_leads'::text, 'WATI'::text, 'marketplace_site'::text, 'Umbler Talk / WhatsApp'::text, 'umbler_talk'::text, 'inventory_sale_door'::text, 'inventory_sale_internet'::text, 'inventory_sale_event'::text])))$legacy$;
  v_expected_master constant text := $master$CHECK (((origin)::text = ANY (ARRAY['street_survey'::text, 'quick_registration'::text, 'manual'::text, 'event_landing'::text, 'Facebook Lead Ads'::text, 'facebook_lead_ads'::text, 'WhatsApp Oficial'::text, 'whatsapp_official'::text, 'WATI / Click-to-WhatsApp'::text, 'wati_leads'::text, 'WATI'::text, 'marketplace_site'::text, 'Umbler Talk / WhatsApp'::text, 'umbler_talk'::text, 'inventory_sale_door'::text, 'inventory_sale_internet'::text, 'inventory_sale_event'::text, 'master_transfer'::text])))$master$;
begin
  select pg_get_constraintdef(c.oid)
    into v_current
  from pg_constraint c
  join pg_class t on t.oid = c.conrelid
  join pg_namespace n on n.oid = t.relnamespace
  where n.nspname = 'public'
    and t.relname = 'leads'
    and c.conname = 'leads_origin_check';

  if v_current is null then
    raise exception 'leads_origin_check ausente; multistore V1 abortado para evitar drift.';
  end if;

  if v_current = v_expected_legacy then
    alter table public.leads drop constraint leads_origin_check;
    alter table public.leads
      add constraint leads_origin_check
      check (((origin)::text = any (array[
        'street_survey'::text,
        'quick_registration'::text,
        'manual'::text,
        'event_landing'::text,
        'Facebook Lead Ads'::text,
        'facebook_lead_ads'::text,
        'WhatsApp Oficial'::text,
        'whatsapp_official'::text,
        'WATI / Click-to-WhatsApp'::text,
        'wati_leads'::text,
        'WATI'::text,
        'marketplace_site'::text,
        'Umbler Talk / WhatsApp'::text,
        'umbler_talk'::text,
        'inventory_sale_door'::text,
        'inventory_sale_internet'::text,
        'inventory_sale_event'::text,
        'master_transfer'::text
      ]))) not valid;
    alter table public.leads validate constraint leads_origin_check;
  elsif v_current <> v_expected_master then
    raise exception 'leads_origin_check divergiu dos dois baselines auditados; multistore V1 abortado. Atual=%', v_current;
  end if;
end;
$origin_guard$;

-- ---------------------------------------------------------------------------
-- 2. Canonical Master identity. No PII is duplicated here: leads_base remains
--    the provenance source of truth.
-- ---------------------------------------------------------------------------
create table if not exists public.lead_master_identities (
  id uuid primary key default gen_random_uuid(),
  primary_base_lead_id uuid references public.leads_base(id) on delete set null,
  resolution_source text not null default 'base_row'
    check (resolution_source in ('base_row','shared_operational_lead','manual_review')),
  status text not null default 'active'
    check (status in ('active','review')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists lead_master_identities_primary_base_uidx
  on public.lead_master_identities(primary_base_lead_id)
  where primary_base_lead_id is not null;

alter table public.leads_base
  add column if not exists canonical_lead_id uuid;

do $canonical_fk$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.leads_base'::regclass
      and conname = 'leads_base_canonical_lead_id_fkey'
  ) then
    alter table public.leads_base
      add constraint leads_base_canonical_lead_id_fkey
      foreign key (canonical_lead_id)
      references public.lead_master_identities(id)
      on delete set null;
  end if;
end;
$canonical_fk$;

create index if not exists leads_base_canonical_lead_id_idx
  on public.leads_base(canonical_lead_id);

-- If a partially prepared environment already has one canonical identity for a
-- routed lead, reuse it before creating any new identity.
with existing_group as (
  select routed_lead_id, min(canonical_lead_id::text)::uuid as canonical_lead_id
  from public.leads_base
  where routed_lead_id is not null
    and canonical_lead_id is not null
  group by routed_lead_id
  having count(distinct canonical_lead_id) = 1
)
update public.leads_base lb
set canonical_lead_id = eg.canonical_lead_id,
    updated_at = now()
from existing_group eg
where lb.routed_lead_id = eg.routed_lead_id
  and lb.canonical_lead_id is null;

-- Abort if the same historical operational lead was already mapped to different
-- canonical identities. Silently merging this drift would be unsafe.
do $canonical_drift$
begin
  if exists (
    select 1
    from public.leads_base
    where routed_lead_id is not null
      and canonical_lead_id is not null
    group by routed_lead_id
    having count(distinct canonical_lead_id) > 1
  ) then
    raise exception 'Mesmo routed_lead_id possui mais de uma identidade canonica; multistore V1 abortado.';
  end if;
end;
$canonical_drift$;

create temporary table pg_temp._multistore_identity_seed on commit drop as
select distinct on (group_key)
  group_key,
  id as primary_base_lead_id,
  case when routed_lead_id is null then 'base_row'::text else 'shared_operational_lead'::text end as resolution_source
from (
  select
    lb.*,
    case
      when lb.routed_lead_id is not null then 'lead:' || lb.routed_lead_id::text
      else 'base:' || lb.id::text
    end as group_key
  from public.leads_base lb
  where lb.canonical_lead_id is null
) pending
order by group_key, created_at asc, id asc;

insert into public.lead_master_identities(primary_base_lead_id,resolution_source,status)
select primary_base_lead_id,resolution_source,'active'
from pg_temp._multistore_identity_seed
on conflict do nothing;

with seed_identity as (
  select s.group_key, i.id as canonical_lead_id
  from pg_temp._multistore_identity_seed s
  join public.lead_master_identities i
    on i.primary_base_lead_id = s.primary_base_lead_id
)
update public.leads_base lb
set canonical_lead_id = si.canonical_lead_id,
    updated_at = now()
from seed_identity si
where lb.canonical_lead_id is null
  and si.group_key = case
    when lb.routed_lead_id is not null then 'lead:' || lb.routed_lead_id::text
    else 'base:' || lb.id::text
  end;

-- Every existing Base row must now have a canonical identity.
do $canonical_complete$
begin
  if exists (select 1 from public.leads_base where canonical_lead_id is null) then
    raise exception 'Backfill canonico incompleto; multistore V1 abortado.';
  end if;
end;
$canonical_complete$;

-- ---------------------------------------------------------------------------
-- 3. Store instances: exactly one operational lead per canonical lead + store.
-- ---------------------------------------------------------------------------
create table if not exists public.lead_store_instances (
  id uuid primary key default gen_random_uuid(),
  canonical_lead_id uuid not null references public.lead_master_identities(id) on delete restrict,
  store_id uuid not null references public.stores(id) on delete restrict,
  lead_id uuid not null references public.leads(id) on delete cascade,
  source_base_lead_id uuid references public.leads_base(id) on delete set null,
  distribution_source text not null default 'master_multistore'
    check (distribution_source in ('legacy','master_multistore')),
  created_by uuid references public.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lead_store_instances_canonical_store_key unique(canonical_lead_id,store_id),
  constraint lead_store_instances_lead_id_key unique(lead_id)
);

create index if not exists lead_store_instances_store_idx
  on public.lead_store_instances(store_id,created_at desc);
create index if not exists lead_store_instances_canonical_idx
  on public.lead_store_instances(canonical_lead_id,created_at desc);

-- Backfill only relationships that are provably consistent today: the Base row,
-- its routed lead and the routed lead itself all point to the same store.
insert into public.lead_store_instances(
  canonical_lead_id,store_id,lead_id,source_base_lead_id,distribution_source,metadata,created_at,updated_at
)
select
  lb.canonical_lead_id,
  lb.assigned_store_id,
  lb.routed_lead_id,
  lb.id,
  'legacy',
  jsonb_build_object('backfilled',true,'legacy_routing_strategy',lb.routing_strategy),
  coalesce(lb.assigned_at,lb.created_at,now()),
  now()
from public.leads_base lb
join public.leads l on l.id = lb.routed_lead_id
where lb.canonical_lead_id is not null
  and lb.assigned_store_id is not null
  and lb.routed_lead_id is not null
  and l.assigned_store_id = lb.assigned_store_id
on conflict do nothing;

-- Canonical/instance control plane is server-side Master-only. Stores never need
-- direct access to another store's instance list.
alter table public.lead_master_identities enable row level security;
alter table public.lead_store_instances enable row level security;

revoke all on table public.lead_master_identities from public, anon, authenticated;
revoke all on table public.lead_store_instances from public, anon, authenticated;
grant all on table public.lead_master_identities to service_role;
grant all on table public.lead_store_instances to service_role;

-- ---------------------------------------------------------------------------
-- 4. Canonical identity resolver for future Base rows.
--    It only groups rows that already share the exact same routed_lead_id.
--    CPF/phone/e-mail collisions are never auto-merged here.
-- ---------------------------------------------------------------------------
create or replace function public.ensure_master_lead_identity(p_base_lead_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_base public.leads_base%rowtype;
  v_identity_id uuid;
  v_lock_key text;
begin
  select * into v_base
  from public.leads_base
  where id = p_base_lead_id
  for update;

  if not found then
    raise exception 'Base lead nao encontrado.' using errcode = 'P0002';
  end if;

  if v_base.canonical_lead_id is not null then
    return v_base.canonical_lead_id;
  end if;

  v_lock_key := case
    when v_base.routed_lead_id is not null then 'lead:' || v_base.routed_lead_id::text
    else 'base:' || v_base.id::text
  end;
  perform pg_advisory_xact_lock(hashtextextended('master_lead_identity:' || v_lock_key,0));

  -- Re-read after the advisory lock in case another transaction resolved it.
  select * into v_base
  from public.leads_base
  where id = p_base_lead_id
  for update;

  if v_base.canonical_lead_id is not null then
    return v_base.canonical_lead_id;
  end if;

  if v_base.routed_lead_id is not null then
    select lb.canonical_lead_id
      into v_identity_id
    from public.leads_base lb
    where lb.routed_lead_id = v_base.routed_lead_id
      and lb.canonical_lead_id is not null
    order by lb.created_at asc, lb.id asc
    limit 1;
  end if;

  if v_identity_id is null then
    select i.id into v_identity_id
    from public.lead_master_identities i
    where i.primary_base_lead_id = v_base.id
    limit 1;
  end if;

  if v_identity_id is null then
    insert into public.lead_master_identities(
      primary_base_lead_id,resolution_source,status
    ) values (
      v_base.id,
      case when v_base.routed_lead_id is null then 'base_row' else 'shared_operational_lead' end,
      'active'
    ) returning id into v_identity_id;
  end if;

  if v_base.routed_lead_id is not null then
    update public.leads_base
    set canonical_lead_id = v_identity_id,
        updated_at = now()
    where routed_lead_id = v_base.routed_lead_id
      and canonical_lead_id is null;
  else
    update public.leads_base
    set canonical_lead_id = v_identity_id,
        updated_at = now()
    where id = v_base.id;
  end if;

  return v_identity_id;
end;
$function$;

revoke all on function public.ensure_master_lead_identity(uuid) from public, anon, authenticated;
grant execute on function public.ensure_master_lead_identity(uuid) to service_role;

create or replace function public.ensure_master_lead_identity_after_insert_trigger()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  perform public.ensure_master_lead_identity(new.id);
  return new;
end;
$function$;

revoke all on function public.ensure_master_lead_identity_after_insert_trigger() from public, anon, authenticated;

drop trigger if exists trg_ensure_master_lead_identity_after_insert on public.leads_base;
create trigger trg_ensure_master_lead_identity_after_insert
after insert on public.leads_base
for each row
execute function public.ensure_master_lead_identity_after_insert_trigger();

-- ---------------------------------------------------------------------------
-- 5. Core multistore distribution RPC.
-- ---------------------------------------------------------------------------
create or replace function public.distribute_base_lead_multistore(
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
  v_legacy public.leads%rowtype;
  v_member public.users%rowtype;
  v_existing_instance public.lead_store_instances%rowtype;
  v_canonical_id uuid;
  v_new_lead_id uuid;
  v_instance_id uuid;
  v_route_result jsonb := '{}'::jsonb;
  v_open_count bigint := 0;
  v_existing_legacy_lead_id uuid;
  v_now timestamptz := clock_timestamp();
begin
  if p_mode not in ('configured_rotation','selected_members') then
    raise exception 'Modo de distribuicao invalido.' using errcode = '22023';
  end if;

  if p_actor_user_id is null or not exists (
    select 1 from public.users u
    where u.id = p_actor_user_id
      and u.role = 'master'
      and u.status = 'active'
  ) then
    raise exception 'Ator Master invalido.' using errcode = '42501';
  end if;

  -- Prevent generic insert/update routing triggers from firing before the new
  -- operational record has been fully created and explicitly routed below.
  perform set_config('app.lead_routing_explicit','on',true);
  perform set_config('app.master_multistore_explicit_routing','on',true);

  select * into v_base
  from public.leads_base
  where id = p_base_lead_id
  for update;

  if not found then
    return jsonb_build_object('outcome','not_found','base_lead_id',p_base_lead_id);
  end if;

  if v_base.status = 'Venda concluída' then
    return jsonb_build_object('outcome','protected','reason','sale_completed','base_lead_id',v_base.id);
  end if;

  if v_base.routed_lead_id is not null then
    select * into v_legacy
    from public.leads
    where id = v_base.routed_lead_id;
    if found and v_legacy.status = 'sale_confirmed' then
      return jsonb_build_object('outcome','protected','reason','sale_confirmed','base_lead_id',v_base.id);
    end if;
  end if;

  select * into v_store
  from public.stores
  where id = p_store_id
    and lower(coalesce(status,'')) = 'active'
  for key share;

  if not found then
    return jsonb_build_object('outcome','invalid_store','store_id',p_store_id);
  end if;

  v_canonical_id := public.ensure_master_lead_identity(v_base.id);
  perform 1 from public.lead_master_identities where id = v_canonical_id for update;

  select * into v_existing_instance
  from public.lead_store_instances
  where canonical_lead_id = v_canonical_id
    and store_id = v_store.id
  for update;

  if found then
    return jsonb_build_object(
      'outcome','already_present',
      'canonical_lead_id',v_canonical_id,
      'store_instance_id',v_existing_instance.id,
      'store_id',v_existing_instance.store_id,
      'routed_lead_id',v_existing_instance.lead_id,
      'idempotent',true
    );
  end if;

  -- Compatibility bridge for a future Base row that already has a provably
  -- consistent legacy operational lead but was inserted after migration backfill.
  select l.id
    into v_existing_legacy_lead_id
  from public.leads_base lb
  join public.leads l on l.id = lb.routed_lead_id
  where lb.canonical_lead_id = v_canonical_id
    and lb.assigned_store_id = v_store.id
    and l.assigned_store_id = v_store.id
  order by lb.assigned_at asc nulls last, lb.created_at asc, lb.id asc
  limit 1
  for update of l;

  if v_existing_legacy_lead_id is not null then
    insert into public.lead_store_instances(
      canonical_lead_id,store_id,lead_id,source_base_lead_id,distribution_source,created_by,metadata
    ) values (
      v_canonical_id,v_store.id,v_existing_legacy_lead_id,v_base.id,'legacy',p_actor_user_id,
      jsonb_build_object('late_legacy_backfill',true)
    )
    on conflict(canonical_lead_id,store_id) do nothing
    returning id into v_instance_id;

    if v_instance_id is null then
      select id into v_instance_id
      from public.lead_store_instances
      where canonical_lead_id = v_canonical_id and store_id = v_store.id;
    end if;

    return jsonb_build_object(
      'outcome','already_present',
      'canonical_lead_id',v_canonical_id,
      'store_instance_id',v_instance_id,
      'store_id',v_store.id,
      'routed_lead_id',v_existing_legacy_lead_id,
      'idempotent',true,
      'legacy',true
    );
  end if;

  -- selected_members must fail before creating any operational row.
  if p_mode = 'selected_members' then
    if p_selected_user_id is null then
      return jsonb_build_object('outcome','member_required','store_id',v_store.id);
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
      return jsonb_build_object('outcome','member_ineligible','user_id',p_selected_user_id,'store_id',v_store.id);
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
  end if;

  -- CRITICAL INVARIANT: always INSERT a new operational lead for this store.
  -- No UPDATE of v_base.routed_lead_id or another store's public.leads row occurs.
  insert into public.leads(
    event_id,customer_name,customer_phone,customer_bank,interested_vehicle,
    vehicle_category_interest,origin,assigned_store_id,status,notes,
    assignment_source,created_at,updated_at
  ) values (
    null,
    coalesce(nullif(btrim(v_base.name),''),'Lead sem nome'),
    nullif(btrim(v_base.phone),''),
    '',
    coalesce(v_base.vehicle_name,''),
    '',
    'master_transfer',
    v_store.id,
    'new_lead',
    'Lead distribuido pelo Master para operacao independente desta loja.',
    'master_multistore',
    v_now,
    v_now
  ) returning id into v_new_lead_id;

  insert into public.lead_store_instances(
    canonical_lead_id,store_id,lead_id,source_base_lead_id,
    distribution_source,created_by,metadata,created_at,updated_at
  ) values (
    v_canonical_id,v_store.id,v_new_lead_id,v_base.id,
    'master_multistore',p_actor_user_id,
    jsonb_build_object(
      'operational_origin','master_transfer',
      'operational_event_id',null,
      'historical_provenance_used_for_assignment',false
    ),
    v_now,v_now
  ) returning id into v_instance_id;

  if p_mode = 'selected_members' then
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
      assignment_source = 'master_multistore',
      updated_at = v_now
    where id = v_new_lead_id;

    insert into public.lead_assignment_logs(
      lead_id,store_id,assignment_role,from_user_id,to_user_id,assignment_mode,
      assigned_by_user_id,notes,metadata
    ) values (
      v_new_lead_id,v_store.id,v_member.role,null,v_member.id,'manual',
      p_actor_user_id,'Distribuicao multiloja Master.',
      jsonb_build_object('store_instance_id',v_instance_id,'canonical_lead_id',v_canonical_id)
    );

    insert into public.lead_routing_decisions(
      lead_id,store_id,rule_id,outcome,selected_user_id,selected_role,strategy,
      eligible_user_ids,excluded_user_ids,reason,metadata
    ) values (
      v_new_lead_id,v_store.id,null,'assigned',v_member.id,v_member.role,'master_selected_member',
      array[v_member.id]::uuid[],'{}'::uuid[],
      'Distribuicao multiloja Master para membro selecionado.',
      jsonb_build_object('store_instance_id',v_instance_id,'canonical_lead_id',v_canonical_id)
    );

    v_route_result := jsonb_build_object(
      'outcome','assigned',
      'user_id',v_member.id,
      'role',v_member.role,
      'strategy','master_selected_member'
    );
  else
    -- Production may have the privacy-specialized router. saas-dev currently has
    -- only the generic router; with event_id=NULL, origin=master_transfer and no
    -- leads_base.routed_lead_id pointing to the new row, the generic router cannot
    -- consume historical event/campaign/source provenance.
    if to_regprocedure('public.route_master_transfer_lead_by_rules(uuid,uuid)') is not null then
      execute 'select public.route_master_transfer_lead_by_rules($1,$2)'
        into v_route_result
        using v_new_lead_id,p_actor_user_id;
    else
      v_route_result := public.route_lead_by_rules(v_new_lead_id,p_actor_user_id);
    end if;
  end if;

  update public.lead_store_instances
  set metadata = metadata || jsonb_build_object('routing',coalesce(v_route_result,'{}'::jsonb)),
      updated_at = clock_timestamp()
  where id = v_instance_id;

  insert into public.audit_logs(
    event_id,user_id,user_role,action_type,entity_type,entity_id,new_value,integrity_level
  ) values (
    v_base.event_id,
    p_actor_user_id,
    'master',
    'master_lead_multistore_distributed',
    'lead_store_instances',
    v_instance_id,
    jsonb_build_object(
      'canonical_lead_id',v_canonical_id,
      'base_lead_id',v_base.id,
      'store_id',v_store.id,
      'store_name',v_store.store_name,
      'lead_id',v_new_lead_id,
      'mode',p_mode,
      'routing_outcome',v_route_result->>'outcome',
      'historical_provenance_used_for_assignment',false
    ),
    'trusted_database'
  );

  return jsonb_build_object(
    'outcome','distributed',
    'canonical_lead_id',v_canonical_id,
    'store_instance_id',v_instance_id,
    'store_id',v_store.id,
    'store_name',v_store.store_name,
    'routed_lead_id',v_new_lead_id,
    'routing',v_route_result,
    'routing_outcome',v_route_result->>'outcome',
    'user_id',v_route_result->>'user_id',
    'role',v_route_result->>'role',
    'idempotent',false
  );
end;
$function$;

revoke all on function public.distribute_base_lead_multistore(uuid,uuid,uuid,text,uuid) from public, anon, authenticated;
grant execute on function public.distribute_base_lead_multistore(uuid,uuid,uuid,text,uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 6. Compatibility wrappers. Existing UI/API callers are now safe even before
--    every screen is renamed: they can no longer move/reuse another store lead.
-- ---------------------------------------------------------------------------
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
  v_result jsonb;
  v_routing_outcome text;
begin
  v_result := public.distribute_base_lead_multistore(
    p_base_lead_id,p_store_id,p_actor_user_id,p_mode,p_selected_user_id
  );

  if coalesce(v_result->>'outcome','') = 'distributed' then
    v_routing_outcome := coalesce(v_result->>'routing_outcome','');

    -- Legacy bulk distribution promises fail-closed assignment when configured
    -- rotation is selected. Roll back the new instance if routing did not assign.
    if p_mode = 'configured_rotation' and v_routing_outcome <> 'assigned' then
      raise exception 'Roteamento fail-closed cancelado: %', coalesce(v_result->'routing','{}'::jsonb)::text
        using errcode = 'P0001';
    end if;

    return v_result || jsonb_build_object(
      'outcome','assigned',
      'strategy',case when p_mode = 'configured_rotation' then 'routing_rule' else 'master_bulk_distribution' end
    );
  end if;

  if coalesce(v_result->>'outcome','') = 'already_present' then
    return v_result || jsonb_build_object('outcome','already_assigned');
  end if;

  return v_result;
end;
$function$;

revoke all on function public.distribute_base_lead_to_store(uuid,uuid,uuid,text,uuid) from public, anon, authenticated;
grant execute on function public.distribute_base_lead_to_store(uuid,uuid,uuid,text,uuid) to service_role;

create or replace function public.master_transfer_base_lead_to_store(
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
  v_result jsonb;
begin
  v_result := public.distribute_base_lead_multistore(
    p_base_lead_id,p_store_id,p_actor_user_id,'configured_rotation',null
  );

  if coalesce(v_result->>'outcome','') = 'distributed' then
    return v_result || jsonb_build_object(
      'outcome','transferred',
      'multistore',true,
      'privacy_mode','master_transfer'
    );
  end if;

  return v_result;
end;
$function$;

revoke all on function public.master_transfer_base_lead_to_store(uuid,uuid,uuid) from public, anon, authenticated;
grant execute on function public.master_transfer_base_lead_to_store(uuid,uuid,uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 7. Harden the deferred master_transfer router. Unrelated UPDATEs must never
--    route an unassigned lead again merely because origin=master_transfer.
-- ---------------------------------------------------------------------------
create or replace function public.route_master_transfer_after_sanitization_trigger()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_actor_user_id uuid;
begin
  if coalesce(new.origin,'') <> 'master_transfer'
    or new.assigned_store_id is null
    or new.assigned_user_id is not null then
    return new;
  end if;

  -- The multistore RPC routes synchronously and deliberately. The deferred
  -- trigger must not route the same new operational lead a second time.
  if coalesce(current_setting('app.master_multistore_explicit_routing',true),'') = 'on' then
    return new;
  end if;

  -- Most importantly: a generic UPDATE (notes, timestamps, view markers etc.)
  -- cannot become a routing event. Only a material routing-boundary transition
  -- may continue through this legacy trigger.
  if tg_op = 'UPDATE'
    and new.origin is not distinct from old.origin
    and new.assigned_store_id is not distinct from old.assigned_store_id
    and new.assignment_source is not distinct from old.assignment_source then
    return new;
  end if;

  -- saas-dev does not carry the Production-only specialized router. In that
  -- environment multistore routing is explicitly handled by the core RPC above.
  if to_regprocedure('public.route_master_transfer_lead_by_rules(uuid,uuid)') is null then
    return new;
  end if;

  select a.user_id
    into v_actor_user_id
  from public.audit_logs a
  where a.user_role = 'master'
    and (
      (
        a.action_type = 'master_lead_multistore_distributed'
        and a.new_value->>'lead_id' = new.id::text
      )
      or (
        a.action_type = 'master_lead_transfer'
        and a.entity_type = 'leads_base'
        and exists (
          select 1 from public.leads_base lb
          where lb.id = a.entity_id and lb.routed_lead_id = new.id
        )
      )
    )
  order by a.created_at desc
  limit 1;

  execute 'select public.route_master_transfer_lead_by_rules($1,$2)'
    using new.id,v_actor_user_id;

  return new;
end;
$function$;

revoke all on function public.route_master_transfer_after_sanitization_trigger() from public, anon, authenticated;

drop trigger if exists trg_route_master_transfer_after_sanitization on public.leads;
create constraint trigger trg_route_master_transfer_after_sanitization
after insert or update on public.leads
deferrable initially deferred
for each row
when (new.origin = 'master_transfer')
execute function public.route_master_transfer_after_sanitization_trigger();
