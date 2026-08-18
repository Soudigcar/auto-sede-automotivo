begin;

set local lock_timeout = '5s';
set local statement_timeout = '2min';

-- Extensões não permanecem no schema exposto pela Data API. As únicas
-- funções que dependem de unaccent são recriadas com referência qualificada e
-- search_path fechado, evitando resolução de objetos controlados por terceiros.
create schema if not exists extensions;
alter extension unaccent set schema extensions;

create or replace function public.slugify_store_name(input text)
returns text
language sql
immutable
security invoker
set search_path = ''
as $$
  select trim(both '-' from regexp_replace(lower(extensions.unaccent(coalesce(input, 'loja'))), '[^a-z0-9]+', '-', 'g'));
$$;

create or replace function public.slugify_text(input text)
returns text
language sql
immutable
security invoker
set search_path = ''
as $$
  select trim(
    both '-' from regexp_replace(
      lower(extensions.unaccent(coalesce(input, ''))),
      '[^a-z0-9]+',
      '-',
      'g'
    )
  );
$$;

revoke execute on function extensions.unaccent(text), extensions.unaccent(regdictionary, text) from public, anon;
grant execute on function extensions.unaccent(text), extensions.unaccent(regdictionary, text) to authenticated, service_role;
revoke execute on function public.slugify_store_name(text), public.slugify_text(text) from public, anon;
grant execute on function public.slugify_store_name(text), public.slugify_text(text) to authenticated, service_role;

-- Prova de consentimento e base legal vinculada ao lead.
alter table public.leads_base
  add column if not exists consent_given boolean not null default false,
  add column if not exists consent_at timestamptz,
  add column if not exists consent_version text,
  add column if not exists consent_source text,
  add column if not exists consent_purposes text[] not null default '{}'::text[],
  add column if not exists privacy_notice_version text,
  add column if not exists legal_basis text;

alter table public.store_portal_applications
  add column if not exists privacy_notice_version text,
  add column if not exists privacy_acknowledged_at timestamptz;

create table if not exists public.privacy_consents (
  id uuid primary key default gen_random_uuid(),
  lead_base_id uuid references public.leads_base(id) on delete set null,
  consent_version text not null,
  privacy_notice_version text not null,
  source text not null,
  purposes text[] not null default '{}'::text[],
  granted boolean not null,
  proof jsonb not null default '{}'::jsonb,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.privacy_requests (
  id uuid primary key default gen_random_uuid(),
  request_type text not null check (request_type in ('confirmation','access','correction','portability','anonymization','deletion','consent_revocation','information')),
  requester_name text not null,
  requester_email text,
  requester_phone text,
  details text,
  status text not null default 'received' check (status in ('received','identity_verification','in_progress','completed','rejected')),
  verification_notes text,
  resolution_notes text,
  received_at timestamptz not null default now(),
  due_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.privacy_retention_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  lead_retention_days integer not null,
  webhook_retention_days integer not null,
  anonymized_leads integer not null default 0,
  minimized_webhooks integer not null default 0,
  status text not null default 'running',
  error_message text
);

create index if not exists privacy_consents_lead_created_idx
  on public.privacy_consents (lead_base_id, created_at desc);
create index if not exists privacy_requests_status_received_idx
  on public.privacy_requests (status, received_at);

create table if not exists private.api_rate_limits (
  scope text not null,
  key_hash text not null,
  window_started_at timestamptz not null default now(),
  hits integer not null default 1,
  primary key (scope, key_hash)
);

revoke all on table private.api_rate_limits from public, anon, authenticated;
grant select, insert, update, delete on table private.api_rate_limits to service_role;

-- Tokens de convite deixam de ser recuperáveis no banco. Links existentes de
-- equipe continuam válidos pelo hash; links antigos de evento são revogados e
-- devem ser regenerados pelo Master, pois eram exibidos em texto puro.
alter table public.store_registration_links
  add column if not exists public_token_hash text;
update public.store_registration_links
set is_active = false,
    public_token_hash = encode(extensions.digest(public_token, 'sha256'), 'hex')
where public_token is not null and public_token_hash is null;
alter table public.store_registration_links
  alter column public_token drop not null,
  alter column public_token drop default;
update public.store_registration_links set public_token = null where public_token is not null;
create unique index if not exists store_registration_links_token_hash_uidx
  on public.store_registration_links (public_token_hash) where public_token_hash is not null;

alter table public.store_team_registration_links
  add column if not exists token_hash text,
  add column if not exists revoked_at timestamptz;
update public.store_team_registration_links
set token_hash = encode(extensions.digest(token, 'sha256'), 'hex')
where token is not null and token_hash is null;
alter table public.store_team_registration_links
  alter column token drop not null;
update public.store_team_registration_links set token = null where token is not null;
create unique index if not exists store_team_registration_links_token_hash_uidx
  on public.store_team_registration_links (token_hash) where token_hash is not null;

alter table public.privacy_consents enable row level security;
alter table public.privacy_requests enable row level security;
alter table public.privacy_retention_runs enable row level security;

drop policy if exists privacy_consents_master_select on public.privacy_consents;
create policy privacy_consents_master_select on public.privacy_consents
  for select to authenticated using ((select public.is_master()));

drop policy if exists privacy_requests_master_all on public.privacy_requests;
create policy privacy_requests_master_all on public.privacy_requests
  for all to authenticated
  using ((select public.is_master()))
  with check ((select public.is_master()));

drop policy if exists privacy_retention_runs_master_select on public.privacy_retention_runs;
create policy privacy_retention_runs_master_select on public.privacy_retention_runs
  for select to authenticated using ((select public.is_master()));

grant select on public.privacy_consents, public.privacy_requests, public.privacy_retention_runs to authenticated;
grant select, insert, update, delete on public.privacy_consents, public.privacy_requests, public.privacy_retention_runs to service_role;

-- As tabelas operacionais sem policy são deliberadamente server-only. Grants
-- históricos de anon/authenticated são removidos e uma policy restritiva deixa
-- o bloqueio explícito. O detalhe comercial é a exceção: o Master já o edita
-- pelo navegador e recebe uma policy limitada por is_master().
drop policy if exists lead_commercial_details_master_all on public.lead_commercial_details;
create policy lead_commercial_details_master_all on public.lead_commercial_details
  for all to authenticated
  using ((select public.is_master()))
  with check ((select public.is_master()));
revoke all on table public.lead_commercial_details from anon;
grant select, insert, update, delete on table public.lead_commercial_details to authenticated, service_role;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'event_lead_routing_state',
    'lead_ingestion_locks',
    'lead_notes',
    'lead_routing_state',
    'marketing_integrations',
    'portal_settings',
    'site_campaign_layouts',
    'ai_agent_approvals',
    'ai_agent_events',
    'ai_agent_runs',
    'ai_conversation_memory',
    'ai_knowledge_chunks',
    'ai_knowledge_documents',
    'ai_runtime_conversations',
    'ai_runtime_message_claims',
    'ai_store_agents',
    'ai_store_knowledge',
    'ai_store_operational_profiles',
    'ai_store_policies',
    'ai_training_scenarios',
    'ai_training_simulations'
  ]
  loop
    if to_regclass(format('public.%I', table_name)) is null then
      continue;
    end if;
    execute format('revoke all on table public.%I from anon, authenticated', table_name);
    execute format('grant select, insert, update, delete on table public.%I to service_role', table_name);
    execute format('drop policy if exists service_only_deny_client_access on public.%I', table_name);
    execute format(
      'create policy service_only_deny_client_access on public.%I as restrictive for all to anon, authenticated using (false) with check (false)',
      table_name
    );
  end loop;
end;
$$;

-- Dados financeiros são exclusivos do Master. Rotas com service_role continuam operacionais.
drop policy if exists "MVP authenticated can insert financial entries" on public.financial_entries;
drop policy if exists "MVP authenticated can read financial entries" on public.financial_entries;
drop policy if exists "MVP authenticated can update financial entries" on public.financial_entries;
drop policy if exists financial_entries_master_select on public.financial_entries;
drop policy if exists financial_entries_master_insert on public.financial_entries;
drop policy if exists financial_entries_master_update on public.financial_entries;
drop policy if exists financial_entries_master_delete on public.financial_entries;

create policy financial_entries_master_select on public.financial_entries
  for select to authenticated using ((select public.is_master()));
create policy financial_entries_master_insert on public.financial_entries
  for insert to authenticated with check ((select public.is_master()));
create policy financial_entries_master_update on public.financial_entries
  for update to authenticated
  using ((select public.is_master()))
  with check ((select public.is_master()));
create policy financial_entries_master_delete on public.financial_entries
  for delete to authenticated using ((select public.is_master()));

revoke all on table public.financial_entries from anon;
grant select, insert, update, delete on table public.financial_entries to authenticated, service_role;

-- A captação pública passa obrigatoriamente pelas rotas validadas do servidor.
drop policy if exists "Public can create leads" on public.leads_base;
revoke all on table public.leads_base from anon;
grant select, insert, update, delete on table public.leads_base to authenticated, service_role;

-- Logs enviados pelo navegador são identificados como alegações do cliente;
-- logs do backend/banco permanecem diferenciados como fontes confiáveis.
alter table public.audit_logs
  add column if not exists integrity_level text not null default 'trusted_database';

create or replace function private.stamp_audit_log_integrity()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  jwt_role text := coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '');
begin
  if jwt_role = 'authenticated' then
    new.user_id := public.current_app_user_id();
    new.user_role := public.current_app_role();
    new.integrity_level := 'client_asserted';
  elsif jwt_role = 'service_role' then
    new.integrity_level := 'trusted_server';
  else
    new.integrity_level := 'trusted_database';
  end if;
  return new;
end;
$$;

revoke all on function private.stamp_audit_log_integrity() from public, anon, authenticated;
grant execute on function private.stamp_audit_log_integrity() to service_role;

drop trigger if exists trg_stamp_audit_log_integrity on public.audit_logs;
create trigger trg_stamp_audit_log_integrity
before insert on public.audit_logs
for each row execute function private.stamp_audit_log_integrity();

drop policy if exists secure_audit_logs_insert_authenticated on public.audit_logs;
create policy secure_audit_logs_insert_authenticated on public.audit_logs
  for insert to authenticated
  with check (
    (select auth.uid()) is not null
    and user_id = (select public.current_app_user_id())
    and user_role = (select public.current_app_role())
    and integrity_level = 'client_asserted'
  );

-- Bucket público somente para leitura; escritas diretas exigem Master.
update storage.buckets
set file_size_limit = 10485760,
    allowed_mime_types = array['image/jpeg','image/png','image/webp']::text[]
where id = 'vehicle-images';

drop policy if exists "Authenticated can delete vehicle images" on storage.objects;
drop policy if exists "Authenticated can update vehicle images" on storage.objects;
drop policy if exists "Authenticated can upload vehicle images" on storage.objects;
drop policy if exists vehicle_images_master_delete on storage.objects;
drop policy if exists vehicle_images_master_update on storage.objects;
drop policy if exists vehicle_images_master_insert on storage.objects;

create policy vehicle_images_master_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'vehicle-images' and (select public.is_master()));
create policy vehicle_images_master_update on storage.objects
  for update to authenticated
  using (bucket_id = 'vehicle-images' and (select public.is_master()))
  with check (bucket_id = 'vehicle-images' and (select public.is_master()));
create policy vehicle_images_master_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'vehicle-images' and (select public.is_master()));

-- SECURITY DEFINER em schema exposto deixa de herdar EXECUTE público.
do $$
declare
  fn record;
begin
  for fn in
    select n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef
  loop
    execute format('revoke execute on function %I.%I(%s) from public, anon', fn.nspname, fn.proname, fn.args);
    execute format('grant execute on function %I.%I(%s) to service_role', fn.nspname, fn.proname, fn.args);
  end loop;
end;
$$;

grant execute on function public.current_app_user() to authenticated;
grant execute on function public.current_app_user_id() to authenticated;
grant execute on function public.current_app_role() to authenticated;
grant execute on function public.current_app_store_id() to authenticated;
grant execute on function public.is_master() to authenticated;
grant execute on function public.is_store_user() to authenticated;
grant execute on function public.is_commercial_team() to authenticated;

revoke all on function public.rls_auto_enable() from public, anon, authenticated;

-- Novos objetos deixam de nascer expostos na Data API.
alter default privileges for role postgres in schema public
  revoke select, insert, update, delete on tables from anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke usage, select on sequences from anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated, service_role;

create or replace function public.run_lgpd_retention(
  p_lead_retention_days integer default 730,
  p_webhook_retention_days integer default 90
)
returns jsonb
language plpgsql
security definer
set search_path = ''
set lock_timeout = '5s'
set statement_timeout = '2min'
as $$
declare
  run_id uuid;
  anonymized_count integer := 0;
  minimized_count integer := 0;
begin
  if p_lead_retention_days < 30 or p_webhook_retention_days < 7 then
    raise exception 'Retention periods below the safety minimum are not allowed';
  end if;

  insert into public.privacy_retention_runs (lead_retention_days, webhook_retention_days)
  values (p_lead_retention_days, p_webhook_retention_days)
  returning id into run_id;

  update public.leads_base
  set metadata = metadata
        - 'raw_payload'
        - 'raw_webhook'
        - 'last_raw_webhook'
        - 'raw_meta_lead',
      updated_at = now()
  where created_at < now() - make_interval(days => p_webhook_retention_days)
    and metadata ?| array['raw_payload','raw_webhook','last_raw_webhook','raw_meta_lead'];
  get diagnostics minimized_count = row_count;

  update public.leads_base
  set name = 'Titular anonimizado',
      phone = 'anon-' || id::text,
      cpf = null,
      email = null,
      notes = null,
      consent_given = false,
      consent_at = null,
      consent_version = null,
      consent_source = null,
      consent_purposes = '{}'::text[],
      metadata = jsonb_build_object('anonymized_at', now(), 'retention_run_id', run_id),
      updated_at = now()
  where created_at < now() - make_interval(days => p_lead_retention_days)
    and lower(coalesce(status, '')) in ('excluido','excluído','deleted','perdido','lost','cancelado','cancelled')
    and phone not like 'anon-%';
  get diagnostics anonymized_count = row_count;

  update public.privacy_retention_runs
  set completed_at = now(),
      anonymized_leads = anonymized_count,
      minimized_webhooks = minimized_count,
      status = 'completed'
  where id = run_id;

  return jsonb_build_object(
    'run_id', run_id,
    'anonymized_leads', anonymized_count,
    'minimized_webhooks', minimized_count
  );
exception when others then
  if run_id is not null then
    update public.privacy_retention_runs
    set completed_at = now(), status = 'failed', error_message = left(sqlerrm, 500)
    where id = run_id;
  end if;
  raise;
end;
$$;

revoke all on function public.run_lgpd_retention(integer, integer) from public, anon, authenticated;
grant execute on function public.run_lgpd_retention(integer, integer) to service_role;

comment on function public.run_lgpd_retention(integer, integer) is
  'Minimiza webhooks antigos e anonimiza somente leads finalizados além do prazo configurado.';

create or replace function public.consume_api_rate_limit(
  p_scope text,
  p_key_hash text,
  p_window_seconds integer,
  p_max_hits integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
set lock_timeout = '3s'
set statement_timeout = '10s'
as $$
declare
  current_hits integer;
begin
  if length(p_scope) > 100 or length(p_key_hash) <> 64
     or p_window_seconds < 1 or p_window_seconds > 604800
     or p_max_hits < 1 or p_max_hits > 10000 then
    raise exception 'Invalid rate-limit parameters';
  end if;

  insert into private.api_rate_limits as limits (scope, key_hash, window_started_at, hits)
  values (p_scope, p_key_hash, now(), 1)
  on conflict (scope, key_hash) do update
    set window_started_at = case
          when limits.window_started_at <= now() - make_interval(secs => p_window_seconds) then now()
          else limits.window_started_at
        end,
        hits = case
          when limits.window_started_at <= now() - make_interval(secs => p_window_seconds) then 1
          else limits.hits + 1
        end
  returning hits into current_hits;

  return current_hits <= p_max_hits;
end;
$$;

revoke all on function public.consume_api_rate_limit(text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_api_rate_limit(text, text, integer, integer) to service_role;

commit;
