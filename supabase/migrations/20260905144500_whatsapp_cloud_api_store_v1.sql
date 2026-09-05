-- WhatsApp Cloud API por loja V1.
-- Estrutura aditiva e independente do Evolution. Execucao externa permanece desligada.

create table public.store_whatsapp_cloud_integrations (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  provider text not null default 'meta_cloud' check (provider = 'meta_cloud'),
  status text not null default 'draft' check (status in ('draft','testing','ready','disabled','error')),
  enabled boolean not null default false,
  is_synthetic boolean not null default false,
  waba_id text,
  phone_number_id text,
  display_phone_number text,
  business_account_name text,
  graph_api_version text,
  access_token_secret_id uuid,
  app_secret_secret_id uuid,
  verify_token_secret_id uuid,
  last_tested_at timestamptz,
  last_synced_at timestamptz,
  last_error text,
  created_by uuid references public.users(id) on delete set null,
  updated_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id),
  constraint store_whatsapp_cloud_integrations_enable_ready check (
    not enabled or (
      waba_id is not null and btrim(waba_id) <> '' and
      phone_number_id is not null and btrim(phone_number_id) <> '' and
      access_token_secret_id is not null and
      app_secret_secret_id is not null and
      verify_token_secret_id is not null
    )
  )
);
create unique index store_whatsapp_cloud_integrations_phone_number_unique
  on public.store_whatsapp_cloud_integrations(phone_number_id) where phone_number_id is not null;

create table public.whatsapp_message_template_blueprints (
  id uuid primary key default gen_random_uuid(),
  logical_key text not null unique,
  name text not null,
  description text,
  category text,
  active boolean not null default true,
  definition jsonb not null default '{}'::jsonb,
  created_by uuid references public.users(id) on delete set null,
  updated_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.store_whatsapp_message_templates (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  integration_id uuid not null references public.store_whatsapp_cloud_integrations(id) on delete cascade,
  blueprint_id uuid references public.whatsapp_message_template_blueprints(id) on delete set null,
  logical_key text not null,
  meta_template_id text,
  name text not null,
  language text not null default 'pt_BR',
  category text,
  status text not null default 'draft' check (status in ('draft','pending','approved','rejected','paused','disabled')),
  version integer not null default 1 check (version > 0),
  components jsonb not null default '[]'::jsonb,
  is_synthetic boolean not null default false,
  last_synced_at timestamptz,
  last_error text,
  created_by uuid references public.users(id) on delete set null,
  updated_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (integration_id, name, language),
  unique (integration_id, logical_key)
);

create table public.store_whatsapp_flows (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  integration_id uuid not null references public.store_whatsapp_cloud_integrations(id) on delete cascade,
  logical_key text not null,
  meta_flow_id text,
  name text not null,
  status text not null default 'draft' check (status in ('draft','pending','published','deprecated','blocked','disabled')),
  version integer not null default 1 check (version > 0),
  definition jsonb not null default '{}'::jsonb,
  data_endpoint_path text,
  is_synthetic boolean not null default false,
  last_synced_at timestamptz,
  last_error text,
  created_by uuid references public.users(id) on delete set null,
  updated_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (integration_id, logical_key)
);

create table public.store_whatsapp_journeys (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  integration_id uuid references public.store_whatsapp_cloud_integrations(id) on delete set null,
  name text not null,
  trigger_type text not null,
  status text not null default 'draft' check (status in ('draft','disabled','active')),
  execution_enabled boolean not null default false,
  safe_core_required boolean not null default true,
  config jsonb not null default '{}'::jsonb,
  is_synthetic boolean not null default false,
  created_by uuid references public.users(id) on delete set null,
  updated_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.store_whatsapp_journey_steps (
  id uuid primary key default gen_random_uuid(),
  journey_id uuid not null references public.store_whatsapp_journeys(id) on delete cascade,
  step_order integer not null check (step_order > 0),
  step_type text not null check (step_type in ('condition','send_template','open_flow','crm_action','autocar_action','wait','handoff')),
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (journey_id, step_order)
);

create table public.whatsapp_cloud_webhook_events (
  id uuid primary key default gen_random_uuid(),
  integration_id uuid not null references public.store_whatsapp_cloud_integrations(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  provider_event_id text not null,
  event_type text not null,
  payload_hash text not null,
  status text not null default 'received' check (status in ('received','verified','rejected','processed','duplicate','error')),
  is_synthetic boolean not null default false,
  error_code text,
  error_message text,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  unique (integration_id, provider_event_id)
);

create table public.whatsapp_cloud_audit_events (
  id uuid primary key default gen_random_uuid(),
  store_id uuid references public.stores(id) on delete set null,
  integration_id uuid references public.store_whatsapp_cloud_integrations(id) on delete set null,
  actor_user_id uuid references public.users(id) on delete set null,
  source text not null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  outcome text not null check (outcome in ('success','denied','error','noop')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create or replace function public.whatsapp_cloud_audit_immutable()
returns trigger language plpgsql set search_path='' as $$
begin
  raise exception 'whatsapp_cloud_audit_events is immutable';
end $$;
create trigger whatsapp_cloud_audit_events_immutable
before update or delete on public.whatsapp_cloud_audit_events
for each row execute function public.whatsapp_cloud_audit_immutable();

create or replace function public.store_whatsapp_cloud_set_secrets(
  p_integration_id uuid, p_access_token text, p_app_secret text, p_verify_token text
) returns uuid language plpgsql security definer set search_path='' as $$
declare
  r public.store_whatsapp_cloud_integrations%rowtype;
  access_id uuid; app_id uuid; verify_id uuid;
begin
  if p_access_token is null or btrim(p_access_token) = ''
    or p_app_secret is null or btrim(p_app_secret) = ''
    or p_verify_token is null or btrim(p_verify_token) = '' then
    raise exception 'All secrets are required';
  end if;
  select * into r from public.store_whatsapp_cloud_integrations where id=p_integration_id for update;
  if not found then raise exception 'Integration not found'; end if;
  access_id := r.access_token_secret_id;
  if access_id is null then
    access_id := vault.create_secret(p_access_token,'whatsapp_cloud_access_'||r.id::text,'WhatsApp Cloud access token');
  else perform vault.update_secret(access_id,p_access_token); end if;
  app_id := r.app_secret_secret_id;
  if app_id is null then
    app_id := vault.create_secret(p_app_secret,'whatsapp_cloud_app_'||r.id::text,'WhatsApp Cloud app secret');
  else perform vault.update_secret(app_id,p_app_secret); end if;
  verify_id := r.verify_token_secret_id;
  if verify_id is null then
    verify_id := vault.create_secret(p_verify_token,'whatsapp_cloud_verify_'||r.id::text,'WhatsApp Cloud webhook verify token');
  else perform vault.update_secret(verify_id,p_verify_token); end if;
  update public.store_whatsapp_cloud_integrations set
    access_token_secret_id=access_id, app_secret_secret_id=app_id, verify_token_secret_id=verify_id, updated_at=now()
  where id=r.id;
  return r.id;
end $$;

create or replace function public.store_whatsapp_cloud_get_secrets(p_integration_id uuid)
returns table(access_token text, app_secret text, verify_token text)
language sql security definer set search_path='' as $$
  select a.decrypted_secret,b.decrypted_secret,c.decrypted_secret
  from public.store_whatsapp_cloud_integrations i
  join vault.decrypted_secrets a on a.id=i.access_token_secret_id
  join vault.decrypted_secrets b on b.id=i.app_secret_secret_id
  join vault.decrypted_secrets c on c.id=i.verify_token_secret_id
  where i.id=p_integration_id
$$;

create or replace function public.store_whatsapp_cloud_revoke_secrets(p_integration_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare r public.store_whatsapp_cloud_integrations%rowtype;
begin
  select * into r from public.store_whatsapp_cloud_integrations where id=p_integration_id for update;
  if not found then return; end if;
  delete from vault.secrets where id in (r.access_token_secret_id,r.app_secret_secret_id,r.verify_token_secret_id);
  update public.store_whatsapp_cloud_integrations set
    access_token_secret_id=null, app_secret_secret_id=null, verify_token_secret_id=null,
    enabled=false, status='disabled', updated_at=now()
  where id=p_integration_id;
end $$;

revoke all on function public.store_whatsapp_cloud_set_secrets(uuid,text,text,text) from public,anon,authenticated;
revoke all on function public.store_whatsapp_cloud_get_secrets(uuid) from public,anon,authenticated;
revoke all on function public.store_whatsapp_cloud_revoke_secrets(uuid) from public,anon,authenticated;
grant execute on function public.store_whatsapp_cloud_set_secrets(uuid,text,text,text) to service_role;
grant execute on function public.store_whatsapp_cloud_get_secrets(uuid) to service_role;
grant execute on function public.store_whatsapp_cloud_revoke_secrets(uuid) to service_role;

alter table public.store_whatsapp_cloud_integrations enable row level security;
alter table public.whatsapp_message_template_blueprints enable row level security;
alter table public.store_whatsapp_message_templates enable row level security;
alter table public.store_whatsapp_flows enable row level security;
alter table public.store_whatsapp_journeys enable row level security;
alter table public.store_whatsapp_journey_steps enable row level security;
alter table public.whatsapp_cloud_webhook_events enable row level security;
alter table public.whatsapp_cloud_audit_events enable row level security;

create policy cloud_integrations_manager_select on public.store_whatsapp_cloud_integrations for select to authenticated using (
  exists(select 1 from public.users u where u.auth_user_id=(select auth.uid()) and u.status='active' and (u.role='master' or (u.role='store' and u.store_id=store_whatsapp_cloud_integrations.store_id)))
);
create policy cloud_integrations_service_all on public.store_whatsapp_cloud_integrations for all to service_role using(true) with check(true);
create policy template_blueprints_manager_select on public.whatsapp_message_template_blueprints for select to authenticated using (
  active or exists(select 1 from public.users u where u.auth_user_id=(select auth.uid()) and u.status='active' and u.role='master')
);
create policy template_blueprints_service_all on public.whatsapp_message_template_blueprints for all to service_role using(true) with check(true);
create policy store_templates_manager_select on public.store_whatsapp_message_templates for select to authenticated using (
  exists(select 1 from public.users u where u.auth_user_id=(select auth.uid()) and u.status='active' and (u.role='master' or (u.role='store' and u.store_id=store_whatsapp_message_templates.store_id)))
);
create policy store_templates_service_all on public.store_whatsapp_message_templates for all to service_role using(true) with check(true);
create policy store_flows_manager_select on public.store_whatsapp_flows for select to authenticated using (
  exists(select 1 from public.users u where u.auth_user_id=(select auth.uid()) and u.status='active' and (u.role='master' or (u.role='store' and u.store_id=store_whatsapp_flows.store_id)))
);
create policy store_flows_service_all on public.store_whatsapp_flows for all to service_role using(true) with check(true);
create policy store_journeys_manager_select on public.store_whatsapp_journeys for select to authenticated using (
  exists(select 1 from public.users u where u.auth_user_id=(select auth.uid()) and u.status='active' and (u.role='master' or (u.role='store' and u.store_id=store_whatsapp_journeys.store_id)))
);
create policy store_journeys_service_all on public.store_whatsapp_journeys for all to service_role using(true) with check(true);
create policy journey_steps_manager_select on public.store_whatsapp_journey_steps for select to authenticated using (
  exists(select 1 from public.store_whatsapp_journeys j join public.users u on true where j.id=journey_id and u.auth_user_id=(select auth.uid()) and u.status='active' and (u.role='master' or (u.role='store' and u.store_id=j.store_id)))
);
create policy journey_steps_service_all on public.store_whatsapp_journey_steps for all to service_role using(true) with check(true);
create policy webhook_events_manager_select on public.whatsapp_cloud_webhook_events for select to authenticated using (
  exists(select 1 from public.users u where u.auth_user_id=(select auth.uid()) and u.status='active' and (u.role='master' or (u.role='store' and u.store_id=whatsapp_cloud_webhook_events.store_id)))
);
create policy webhook_events_service_all on public.whatsapp_cloud_webhook_events for all to service_role using(true) with check(true);
create policy cloud_audit_manager_select on public.whatsapp_cloud_audit_events for select to authenticated using (
  exists(select 1 from public.users u where u.auth_user_id=(select auth.uid()) and u.status='active' and (u.role='master' or (u.role='store' and u.store_id=whatsapp_cloud_audit_events.store_id)))
);
create policy cloud_audit_service_insert on public.whatsapp_cloud_audit_events for insert to service_role with check(true);

revoke all on table public.store_whatsapp_cloud_integrations from anon,authenticated,service_role;
revoke all on table public.whatsapp_message_template_blueprints from anon,authenticated,service_role;
revoke all on table public.store_whatsapp_message_templates from anon,authenticated,service_role;
revoke all on table public.store_whatsapp_flows from anon,authenticated,service_role;
revoke all on table public.store_whatsapp_journeys from anon,authenticated,service_role;
revoke all on table public.store_whatsapp_journey_steps from anon,authenticated,service_role;
revoke all on table public.whatsapp_cloud_webhook_events from anon,authenticated,service_role;
revoke all on table public.whatsapp_cloud_audit_events from anon,authenticated,service_role;

grant select on public.store_whatsapp_cloud_integrations,public.whatsapp_message_template_blueprints,public.store_whatsapp_message_templates,public.store_whatsapp_flows,public.store_whatsapp_journeys,public.store_whatsapp_journey_steps,public.whatsapp_cloud_webhook_events,public.whatsapp_cloud_audit_events to authenticated;
grant select,insert,update,delete on public.store_whatsapp_cloud_integrations,public.whatsapp_message_template_blueprints,public.store_whatsapp_message_templates,public.store_whatsapp_flows,public.store_whatsapp_journeys,public.store_whatsapp_journey_steps to service_role;
grant select,insert,update on public.whatsapp_cloud_webhook_events to service_role;
grant select,insert on public.whatsapp_cloud_audit_events to service_role;
