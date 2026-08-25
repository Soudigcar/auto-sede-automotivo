-- Prevent one customer from being created/routed more than once inside the same
-- store. This migration is structural only: it does not merge or rewrite any
-- existing production rows.

create or replace function public.normalize_lead_phone(p_phone text)
returns text
language sql
immutable
strict
set search_path = public, pg_temp
as $function$
  select case
    when length(regexp_replace(p_phone, '\D', '', 'g')) in (12,13)
      and regexp_replace(p_phone, '\D', '', 'g') like '55%'
      then substr(regexp_replace(p_phone, '\D', '', 'g'),3)
    else regexp_replace(p_phone, '\D', '', 'g')
  end;
$function$;

revoke all on function public.normalize_lead_phone(text) from public, anon;
grant execute on function public.normalize_lead_phone(text) to authenticated, service_role;

create index if not exists leads_store_normalized_phone_idx
  on public.leads(assigned_store_id,public.normalize_lead_phone(customer_phone))
  where customer_phone is not null and status <> 'deleted';

create index if not exists leads_base_store_normalized_phone_idx
  on public.leads_base(assigned_store_id,public.normalize_lead_phone(phone))
  where phone is not null;

create or replace function public.find_or_create_store_lead_by_phone(
  p_store_id uuid,
  p_phone text,
  p_customer_name text,
  p_origin text,
  p_notes text,
  p_event_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_phone text := public.normalize_lead_phone(p_phone);
  v_lead_id uuid;
begin
  if p_store_id is null or not exists (
    select 1 from public.stores s
    where s.id = p_store_id and lower(coalesce(s.status,'')) = 'active'
  ) then
    raise exception 'Loja ativa nao encontrada.' using errcode = '22023';
  end if;

  if v_phone is null or v_phone !~ '^[1-9][0-9]{9,10}$' then
    raise exception 'Telefone invalido para identidade do lead.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('store_lead_phone:' || p_store_id::text || ':' || v_phone,0));

  select l.id into v_lead_id
  from public.leads l
  where l.assigned_store_id = p_store_id
    and l.status <> 'deleted'
    and public.normalize_lead_phone(l.customer_phone) = v_phone
  order by l.created_at asc,l.id asc
  limit 1
  for update;

  if v_lead_id is not null then
    return jsonb_build_object('lead_id',v_lead_id,'created',false,'idempotent',true);
  end if;

  insert into public.leads(
    event_id,customer_name,customer_phone,customer_bank,interested_vehicle,
    vehicle_category_interest,origin,assigned_store_id,status,notes
  ) values (
    p_event_id,coalesce(nullif(btrim(p_customer_name),''),v_phone),v_phone,'','','',
    p_origin,p_store_id,'new_lead',coalesce(p_notes,'')
  ) returning id into v_lead_id;

  return jsonb_build_object('lead_id',v_lead_id,'created',true,'idempotent',false);
end;
$function$;

revoke all on function public.find_or_create_store_lead_by_phone(uuid,text,text,text,text,uuid)
  from public, anon, authenticated;
grant execute on function public.find_or_create_store_lead_by_phone(uuid,text,text,text,text,uuid)
  to service_role;

create or replace function public.find_or_create_base_lead_by_phone(
  p_store_id uuid,
  p_store_name text,
  p_phone text,
  p_name text,
  p_source text,
  p_campaign_name text,
  p_routed_lead_id uuid,
  p_routing_strategy text,
  p_notes text,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_phone text := public.normalize_lead_phone(p_phone);
  v_base_id uuid;
  v_routed_lead_id uuid;
begin
  if v_phone is null or v_phone !~ '^[1-9][0-9]{9,10}$' then
    raise exception 'Telefone invalido para identidade da Base.' using errcode = '22023';
  end if;

  if p_store_id is not null and not exists (
    select 1 from public.stores s
    where s.id = p_store_id and lower(coalesce(s.status,'')) = 'active'
  ) then
    raise exception 'Loja ativa nao encontrada.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'base_lead_phone:' || coalesce(p_store_id::text,'master') || ':' || v_phone,0
  ));

  select lb.id,lb.routed_lead_id into v_base_id,v_routed_lead_id
  from public.leads_base lb
  where lb.assigned_store_id is not distinct from p_store_id
    and public.normalize_lead_phone(lb.phone) = v_phone
  order by lb.created_at asc,lb.id asc
  limit 1
  for update;

  if v_base_id is not null then
    update public.leads_base
    set routed_lead_id = coalesce(routed_lead_id,p_routed_lead_id),
        updated_at = now()
    where id = v_base_id
    returning routed_lead_id into v_routed_lead_id;
    return jsonb_build_object(
      'base_lead_id',v_base_id,'routed_lead_id',v_routed_lead_id,
      'created',false,'idempotent',true
    );
  end if;

  insert into public.leads_base(
    name,phone,source,campaign_name,status,assigned_store_id,assigned_store_name,
    assigned_at,routed_lead_id,routing_strategy,notes,metadata
  ) values (
    coalesce(nullif(btrim(p_name),''),v_phone),v_phone,p_source,p_campaign_name,'Novo lead',
    p_store_id,p_store_name,case when p_store_id is null then null else now() end,
    p_routed_lead_id,p_routing_strategy,coalesce(p_notes,''),coalesce(p_metadata,'{}'::jsonb)
  ) returning id into v_base_id;

  return jsonb_build_object(
    'base_lead_id',v_base_id,'routed_lead_id',p_routed_lead_id,
    'created',true,'idempotent',false
  );
end;
$function$;

revoke all on function public.find_or_create_base_lead_by_phone(uuid,text,text,text,text,text,uuid,text,text,jsonb)
  from public, anon, authenticated;
grant execute on function public.find_or_create_base_lead_by_phone(uuid,text,text,text,text,text,uuid,text,text,jsonb)
  to service_role;

create or replace function public.find_store_lead_phone_conflicts(
  p_store_id uuid,
  p_phones text[]
)
returns table(normalized_phone text,lead_id uuid)
language sql
security definer
set search_path = public, pg_temp
as $function$
  with requested as (
    select distinct public.normalize_lead_phone(phone) as normalized_phone
    from unnest(coalesce(p_phones,array[]::text[])) as phone
  )
  select distinct on (public.normalize_lead_phone(l.customer_phone))
    public.normalize_lead_phone(l.customer_phone),l.id
  from public.leads l
  join requested r
    on r.normalized_phone = public.normalize_lead_phone(l.customer_phone)
  where l.assigned_store_id = p_store_id
    and l.status <> 'deleted'
    and r.normalized_phone ~ '^[1-9][0-9]{9,10}$'
  order by public.normalize_lead_phone(l.customer_phone),l.created_at asc,l.id asc;
$function$;

revoke all on function public.find_store_lead_phone_conflicts(uuid,text[])
  from public, anon, authenticated;
grant execute on function public.find_store_lead_phone_conflicts(uuid,text[])
  to service_role;

-- Multistore distribution must fail closed if a different canonical record with
-- the same phone is already present in the destination. The advisory lock closes
-- the gap between the API preflight and the INSERT performed by the RPC.
create or replace function public.guard_master_transfer_duplicate_phone_trigger()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_phone text;
  v_existing uuid;
begin
  if new.origin <> 'master_transfer' or new.assigned_store_id is null then
    return new;
  end if;

  v_phone := public.normalize_lead_phone(new.customer_phone);
  if v_phone is null or v_phone !~ '^[1-9][0-9]{9,10}$' then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'store_lead_phone:' || new.assigned_store_id::text || ':' || v_phone,0
  ));

  select l.id into v_existing
  from public.leads l
  where l.assigned_store_id = new.assigned_store_id
    and l.status <> 'deleted'
    and public.normalize_lead_phone(l.customer_phone) = v_phone
  order by l.created_at asc,l.id asc
  limit 1;

  if v_existing is not null then
    raise exception 'Cliente ja possui atendimento nesta loja; distribuicao cancelada para revisao.'
      using errcode = '23505', detail = 'duplicate_store_customer';
  end if;

  return new;
end;
$function$;

revoke all on function public.guard_master_transfer_duplicate_phone_trigger()
  from public, anon, authenticated;

drop trigger if exists trg_guard_master_transfer_duplicate_phone on public.leads;
create trigger trg_guard_master_transfer_duplicate_phone
before insert on public.leads
for each row execute function public.guard_master_transfer_duplicate_phone_trigger();
