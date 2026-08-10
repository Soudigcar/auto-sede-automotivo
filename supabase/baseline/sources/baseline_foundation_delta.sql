-- AUTO CONTROLE AUTOMOTIVO
-- SEGUNDA CAMADA DO CANDIDATO DE BASELINE - NAO APLICAR EM PRODUCAO
-- Gerado em modo somente leitura a partir do catalogo atual.
-- Aplicar apenas em replay descartavel, depois de baseline_foundation_candidate.sql
-- e antes de 20260721055140_create_store_calendar_tasks.

begin;

-- section 5: 000
create extension if not exists unaccent with schema public;

-- section 10: events.   9
alter table public.events add column if not exists sponsor_bank character varying(120);

-- section 10: events.  10
alter table public.events add column if not exists live_url text;

-- section 10: events.  11
alter table public.events add column if not exists event_notes text;

-- section 10: events.  15
alter table public.events add column if not exists store_registration_enabled boolean default true not null;

-- section 10: inventory.  16
alter table public.inventory add column if not exists vehicle_code character varying(100);

-- section 10: inventory.  17
alter table public.inventory add column if not exists location text;

-- section 10: inventory.  18
alter table public.inventory add column if not exists mileage integer;

-- section 10: inventory.  19
alter table public.inventory add column if not exists fuel character varying(50);

-- section 10: inventory.  20
alter table public.inventory add column if not exists fipe_price numeric(12,2);

-- section 10: inventory.  21
alter table public.inventory add column if not exists web_price numeric(12,2);

-- section 10: stores.  17
alter table public.stores add column if not exists portal_notes text;

-- section 10: stores.  18
alter table public.stores add column if not exists website_url text;

-- section 10: stores.  20
alter table public.stores add column if not exists registration_source text default 'master'::text;

-- section 20: financial_entries
create table if not exists public.financial_entries (
  id uuid default gen_random_uuid() not null,
  event_id uuid,
  event_name text not null,
  movement_type character varying(20) default 'income'::character varying not null,
  source_type character varying(50) default 'bank_sponsorship'::character varying not null,
  sponsor_bank character varying(120),
  supplier_name text,
  category character varying(120) default 'Patrocinio'::character varying not null,
  amount numeric(12,2) default 0 not null,
  discount numeric(12,2) default 0 not null,
  payment_date date,
  payment_method character varying(80),
  document_number character varying(120),
  notes text,
  status character varying(30) default 'paid'::character varying not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

-- section 20: marketing_integrations
create table if not exists public.marketing_integrations (
  id uuid default gen_random_uuid() not null,
  integration_type text not null,
  name text default 'Meta Pixel'::text not null,
  pixel_id text,
  is_active boolean default false not null,
  settings jsonb default '{}'::jsonb not null,
  updated_by uuid,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

-- section 20: store_registration_links
create table if not exists public.store_registration_links (
  id uuid default gen_random_uuid() not null,
  event_id uuid not null,
  public_token text default encode(gen_random_bytes(18), 'hex'::text) not null,
  title text,
  is_active boolean default true not null,
  expires_at timestamp with time zone,
  usage_count integer default 0 not null,
  created_by_user_id uuid,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

-- section 20: store_stock_imports
create table if not exists public.store_stock_imports (
  id uuid default gen_random_uuid() not null,
  event_id uuid,
  store_id uuid not null,
  submitted_by_user_id uuid,
  file_name text not null,
  file_path text not null,
  file_url text,
  mime_type text,
  file_size_bytes bigint,
  status text default 'pending'::text not null,
  notes text,
  metadata jsonb default '{}'::jsonb not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

-- section 20: vehicle_attribute_options
create table if not exists public.vehicle_attribute_options (
  id uuid default gen_random_uuid() not null,
  option_type text not null,
  option_value text not null,
  is_active boolean default true not null,
  usage_count integer default 1 not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

-- section 25: financial_entries
alter table public.financial_entries enable row level security;

-- section 25: marketing_integrations
alter table public.marketing_integrations enable row level security;

-- section 25: store_registration_links
alter table public.store_registration_links enable row level security;

-- section 25: store_stock_imports
alter table public.store_stock_imports enable row level security;

-- section 25: vehicle_attribute_options
alter table public.vehicle_attribute_options enable row level security;

-- section 30: financial_entries.financial_entries_event_id_fkey
alter table public.financial_entries add constraint financial_entries_event_id_fkey FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE SET NULL;

-- section 30: financial_entries.financial_entries_pkey
alter table public.financial_entries add constraint financial_entries_pkey PRIMARY KEY (id);

-- section 30: marketing_integrations.marketing_integrations_integration_type_key
alter table public.marketing_integrations add constraint marketing_integrations_integration_type_key UNIQUE (integration_type);

-- section 30: marketing_integrations.marketing_integrations_pkey
alter table public.marketing_integrations add constraint marketing_integrations_pkey PRIMARY KEY (id);

-- section 30: marketing_integrations.marketing_integrations_updated_by_fkey
alter table public.marketing_integrations add constraint marketing_integrations_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL;

-- section 30: store_registration_links.store_registration_links_created_by_user_id_fkey
alter table public.store_registration_links add constraint store_registration_links_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL;

-- section 30: store_registration_links.store_registration_links_event_id_fkey
alter table public.store_registration_links add constraint store_registration_links_event_id_fkey FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE;

-- section 30: store_registration_links.store_registration_links_pkey
alter table public.store_registration_links add constraint store_registration_links_pkey PRIMARY KEY (id);

-- section 30: store_registration_links.store_registration_links_public_token_key
alter table public.store_registration_links add constraint store_registration_links_public_token_key UNIQUE (public_token);

-- section 30: store_stock_imports.store_stock_imports_event_id_fkey
alter table public.store_stock_imports add constraint store_stock_imports_event_id_fkey FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE;

-- section 30: store_stock_imports.store_stock_imports_pkey
alter table public.store_stock_imports add constraint store_stock_imports_pkey PRIMARY KEY (id);

-- section 30: store_stock_imports.store_stock_imports_status_check
alter table public.store_stock_imports add constraint store_stock_imports_status_check CHECK (status = ANY (ARRAY['pending'::text, 'reviewing'::text, 'processed'::text, 'published'::text, 'rejected'::text, 'error'::text]));

-- section 30: store_stock_imports.store_stock_imports_store_id_fkey
alter table public.store_stock_imports add constraint store_stock_imports_store_id_fkey FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE;

-- section 30: store_stock_imports.store_stock_imports_submitted_by_user_id_fkey
alter table public.store_stock_imports add constraint store_stock_imports_submitted_by_user_id_fkey FOREIGN KEY (submitted_by_user_id) REFERENCES users(id) ON DELETE SET NULL;

-- section 30: vehicle_attribute_options.vehicle_attribute_options_option_type_check
alter table public.vehicle_attribute_options add constraint vehicle_attribute_options_option_type_check CHECK (option_type = ANY (ARRAY['brand'::text, 'model'::text, 'version'::text, 'transmission'::text, 'fuel'::text]));

-- section 30: vehicle_attribute_options.vehicle_attribute_options_pkey
alter table public.vehicle_attribute_options add constraint vehicle_attribute_options_pkey PRIMARY KEY (id);

-- section 40: idx_events_sponsor_bank
CREATE INDEX idx_events_sponsor_bank ON public.events USING btree (sponsor_bank);

-- section 40: idx_events_status
CREATE INDEX idx_events_status ON public.events USING btree (status);

-- section 40: idx_events_store_registration_enabled
CREATE INDEX idx_events_store_registration_enabled ON public.events USING btree (store_registration_enabled);

-- section 40: idx_financial_entries_event_id
CREATE INDEX idx_financial_entries_event_id ON public.financial_entries USING btree (event_id);

-- section 40: idx_financial_entries_payment_date
CREATE INDEX idx_financial_entries_payment_date ON public.financial_entries USING btree (payment_date);

-- section 40: idx_financial_entries_source_type
CREATE INDEX idx_financial_entries_source_type ON public.financial_entries USING btree (source_type);

-- section 40: idx_financial_entries_sponsor_bank
CREATE INDEX idx_financial_entries_sponsor_bank ON public.financial_entries USING btree (sponsor_bank);

-- section 40: idx_inventory_plate
CREATE INDEX idx_inventory_plate ON public.inventory USING btree (plate);

-- section 40: idx_inventory_vehicle_code
CREATE INDEX idx_inventory_vehicle_code ON public.inventory USING btree (vehicle_code);

-- section 40: idx_store_registration_links_active
CREATE INDEX idx_store_registration_links_active ON public.store_registration_links USING btree (is_active);

-- section 40: idx_store_registration_links_event_unique
CREATE UNIQUE INDEX idx_store_registration_links_event_unique ON public.store_registration_links USING btree (event_id);

-- section 40: idx_store_registration_links_token
CREATE INDEX idx_store_registration_links_token ON public.store_registration_links USING btree (public_token);

-- section 40: idx_store_stock_imports_event_id
CREATE INDEX idx_store_stock_imports_event_id ON public.store_stock_imports USING btree (event_id);

-- section 40: idx_store_stock_imports_status
CREATE INDEX idx_store_stock_imports_status ON public.store_stock_imports USING btree (status);

-- section 40: idx_store_stock_imports_store_id
CREATE INDEX idx_store_stock_imports_store_id ON public.store_stock_imports USING btree (store_id);

-- section 40: idx_stores_status
CREATE INDEX idx_stores_status ON public.stores USING btree (status);

-- section 40: idx_users_auth_user_id
CREATE INDEX idx_users_auth_user_id ON public.users USING btree (auth_user_id);

-- section 40: idx_users_email_lower
CREATE INDEX idx_users_email_lower ON public.users USING btree (lower((email)::text));

-- section 40: idx_vehicle_attribute_options_type
CREATE INDEX idx_vehicle_attribute_options_type ON public.vehicle_attribute_options USING btree (option_type);

-- section 40: idx_vehicle_attribute_options_unique_lower
CREATE UNIQUE INDEX idx_vehicle_attribute_options_unique_lower ON public.vehicle_attribute_options USING btree (option_type, lower(option_value));

-- section 50: current_app_user()
CREATE OR REPLACE FUNCTION public.current_app_user()
 RETURNS users
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  result public.users;
begin
  select *
  into result
  from public.users
  where
    auth_user_id = auth.uid()
    or lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  order by
    case when auth_user_id = auth.uid() then 0 else 1 end
  limit 1;

  return result;
end;
$function$;

-- section 50: is_commercial_team()
CREATE OR REPLACE FUNCTION public.is_commercial_team()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(public.current_app_role(), '') in ('prospector', 'pre_sales');
$function$;

-- section 50: is_store_user()
CREATE OR REPLACE FUNCTION public.is_store_user()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(public.current_app_role(), '') = 'store';
$function$;

-- section 50: rls_auto_enable()
CREATE OR REPLACE FUNCTION public.rls_auto_enable()
 RETURNS event_trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$function$;

-- section 50: slugify_store_name(input text)
CREATE OR REPLACE FUNCTION public.slugify_store_name(input text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select trim(both '-' from regexp_replace(lower(unaccent(coalesce(input, 'loja'))), '[^a-z0-9]+', '-', 'g'));
$function$;

-- section 50: slugify_text(input text)
CREATE OR REPLACE FUNCTION public.slugify_text(input text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select trim(
    both '-' from regexp_replace(
      lower(unaccent(coalesce(input, ''))),
      '[^a-z0-9]+',
      '-',
      'g'
    )
  );
$function$;

-- section 55: store_portal_audit
create or replace view public.store_portal_audit as  SELECT u.id AS user_id,
    u.full_name,
    u.email,
    u.role,
    u.status AS user_status,
    u.store_id,
    s.store_name,
    s.slug AS store_slug,
    s.portal_enabled,
        CASE
            WHEN u.role::text = 'store'::text AND u.store_id IS NULL THEN 'LOJA SEM STORE_ID'::text
            WHEN u.role::text = 'store'::text AND s.id IS NULL THEN 'STORE_ID INVALIDO'::text
            WHEN u.role::text = 'store'::text AND COALESCE(s.portal_enabled, false) = false THEN 'PORTAL DESATIVADO'::text
            WHEN u.role::text = 'store'::text THEN 'OK'::text
            ELSE 'NAO E USUARIO LOJA'::text
        END AS audit_status
   FROM users u
     LEFT JOIN stores s ON s.id = u.store_id
  ORDER BY u.role, u.full_name;;

-- section 60: appointments.authenticated_all_appointments
drop policy if exists authenticated_all_appointments on public.appointments;

-- section 60: audit_logs.authenticated_all_audit_logs
drop policy if exists authenticated_all_audit_logs on public.audit_logs;

-- section 60: banks.authenticated_read_banks
drop policy if exists authenticated_read_banks on public.banks;

-- section 60: events.authenticated_insert_events
drop policy if exists authenticated_insert_events on public.events;

-- section 60: events.authenticated_select_events
drop policy if exists authenticated_select_events on public.events;

-- section 60: events.authenticated_update_events
drop policy if exists authenticated_update_events on public.events;

-- section 60: inventory.authenticated_all_inventory
drop policy if exists authenticated_all_inventory on public.inventory;

-- section 60: lead_activities.authenticated_all_lead_activities
drop policy if exists authenticated_all_lead_activities on public.lead_activities;

-- section 60: leads.authenticated_all_leads
drop policy if exists authenticated_all_leads on public.leads;

-- section 60: losses.authenticated_all_losses
drop policy if exists authenticated_all_losses on public.losses;

-- section 60: prospectors.authenticated_all_prospectors
drop policy if exists authenticated_all_prospectors on public.prospectors;

-- section 60: sales.authenticated_all_sales
drop policy if exists authenticated_all_sales on public.sales;

-- section 60: stores.authenticated_all_stores
drop policy if exists authenticated_all_stores on public.stores;

-- section 60: street_surveys.authenticated_all_street_surveys
drop policy if exists authenticated_all_street_surveys on public.street_surveys;

-- section 60: users.authenticated_insert_users
drop policy if exists authenticated_insert_users on public.users;

-- section 60: users.authenticated_select_users
drop policy if exists authenticated_select_users on public.users;

-- section 60: users.authenticated_update_users
drop policy if exists authenticated_update_users on public.users;

-- section 70: audit_logs.secure_audit_logs_delete_master
create policy secure_audit_logs_delete_master on public.audit_logs as PERMISSIVE for DELETE to authenticated using (is_master());

-- section 70: audit_logs.secure_audit_logs_insert_authenticated
create policy secure_audit_logs_insert_authenticated on public.audit_logs as PERMISSIVE for INSERT to authenticated with check ((auth.uid() IS NOT NULL));

-- section 70: audit_logs.secure_audit_logs_select_master
create policy secure_audit_logs_select_master on public.audit_logs as PERMISSIVE for SELECT to authenticated using (is_master());

-- section 70: audit_logs.secure_audit_logs_update_master
create policy secure_audit_logs_update_master on public.audit_logs as PERMISSIVE for UPDATE to authenticated using (is_master()) with check (is_master());

-- section 70: banks.secure_banks_delete_master
create policy secure_banks_delete_master on public.banks as PERMISSIVE for DELETE to authenticated using (is_master());

-- section 70: banks.secure_banks_insert_master
create policy secure_banks_insert_master on public.banks as PERMISSIVE for INSERT to authenticated with check (is_master());

-- section 70: banks.secure_banks_select
create policy secure_banks_select on public.banks as PERMISSIVE for SELECT to authenticated using (true);

-- section 70: banks.secure_banks_update_master
create policy secure_banks_update_master on public.banks as PERMISSIVE for UPDATE to authenticated using (is_master()) with check (is_master());

-- section 70: events.secure_events_delete_master
create policy secure_events_delete_master on public.events as PERMISSIVE for DELETE to authenticated using (is_master());

-- section 70: events.secure_events_insert_master
create policy secure_events_insert_master on public.events as PERMISSIVE for INSERT to authenticated with check (is_master());

-- section 70: events.secure_events_update_master
create policy secure_events_update_master on public.events as PERMISSIVE for UPDATE to authenticated using (is_master()) with check (is_master());

-- section 70: financial_entries.MVP authenticated can insert financial entries
create policy "MVP authenticated can insert financial entries" on public.financial_entries as PERMISSIVE for INSERT to authenticated with check (true);

-- section 70: financial_entries.MVP authenticated can read financial entries
create policy "MVP authenticated can read financial entries" on public.financial_entries as PERMISSIVE for SELECT to authenticated using (true);

-- section 70: financial_entries.MVP authenticated can update financial entries
create policy "MVP authenticated can update financial entries" on public.financial_entries as PERMISSIVE for UPDATE to authenticated using (true) with check (true);

-- section 70: lead_activities.secure_lead_activities_delete_master
create policy secure_lead_activities_delete_master on public.lead_activities as PERMISSIVE for DELETE to authenticated using (is_master());

-- section 70: lead_activities.secure_lead_activities_update_master
create policy secure_lead_activities_update_master on public.lead_activities as PERMISSIVE for UPDATE to authenticated using (is_master()) with check (is_master());

-- section 70: leads_base.Public can create leads
create policy "Public can create leads" on public.leads_base as PERMISSIVE for INSERT to public with check (true);

-- section 70: store_registration_links.store_registration_links_master_delete
create policy store_registration_links_master_delete on public.store_registration_links as PERMISSIVE for DELETE to authenticated using (is_master());

-- section 70: store_registration_links.store_registration_links_master_insert
create policy store_registration_links_master_insert on public.store_registration_links as PERMISSIVE for INSERT to authenticated with check (is_master());

-- section 70: store_registration_links.store_registration_links_master_select
create policy store_registration_links_master_select on public.store_registration_links as PERMISSIVE for SELECT to authenticated using (is_master());

-- section 70: store_registration_links.store_registration_links_master_update
create policy store_registration_links_master_update on public.store_registration_links as PERMISSIVE for UPDATE to authenticated using (is_master()) with check (is_master());

-- section 70: store_stock_imports.store_stock_imports_delete_master
create policy store_stock_imports_delete_master on public.store_stock_imports as PERMISSIVE for DELETE to authenticated using (is_master());

-- section 70: store_stock_imports.store_stock_imports_insert
create policy store_stock_imports_insert on public.store_stock_imports as PERMISSIVE for INSERT to authenticated with check ((is_master() OR (store_id = current_app_store_id())));

-- section 70: store_stock_imports.store_stock_imports_select
create policy store_stock_imports_select on public.store_stock_imports as PERMISSIVE for SELECT to authenticated using ((is_master() OR (store_id = current_app_store_id())));

-- section 70: store_stock_imports.store_stock_imports_update
create policy store_stock_imports_update on public.store_stock_imports as PERMISSIVE for UPDATE to authenticated using ((is_master() OR (store_id = current_app_store_id()))) with check ((is_master() OR (store_id = current_app_store_id())));

-- section 70: stores.secure_stores_delete_master
create policy secure_stores_delete_master on public.stores as PERMISSIVE for DELETE to authenticated using (is_master());

-- section 70: stores.secure_stores_insert_master
create policy secure_stores_insert_master on public.stores as PERMISSIVE for INSERT to authenticated with check (is_master());

-- section 70: stores.secure_stores_update_master
create policy secure_stores_update_master on public.stores as PERMISSIVE for UPDATE to authenticated using (is_master()) with check (is_master());

-- section 70: users.secure_users_delete_master
create policy secure_users_delete_master on public.users as PERMISSIVE for DELETE to authenticated using (is_master());

-- section 70: users.secure_users_insert_master
create policy secure_users_insert_master on public.users as PERMISSIVE for INSERT to authenticated with check (is_master());

-- section 70: users.secure_users_update_master
create policy secure_users_update_master on public.users as PERMISSIVE for UPDATE to authenticated using (is_master()) with check (is_master());

-- section 70: vehicle_attribute_options.vehicle_attribute_options_delete_master
create policy vehicle_attribute_options_delete_master on public.vehicle_attribute_options as PERMISSIVE for DELETE to authenticated using (is_master());

-- section 70: vehicle_attribute_options.vehicle_attribute_options_insert_master
create policy vehicle_attribute_options_insert_master on public.vehicle_attribute_options as PERMISSIVE for INSERT to authenticated with check (is_master());

-- section 70: vehicle_attribute_options.vehicle_attribute_options_select_master
create policy vehicle_attribute_options_select_master on public.vehicle_attribute_options as PERMISSIVE for SELECT to authenticated using (is_master());

-- section 70: vehicle_attribute_options.vehicle_attribute_options_update_master
create policy vehicle_attribute_options_update_master on public.vehicle_attribute_options as PERMISSIVE for UPDATE to authenticated using (is_master()) with check (is_master());

-- section 80: tables
grant all privileges on table public.financial_entries, public.marketing_integrations, public.store_registration_links, public.store_stock_imports, public.vehicle_attribute_options, public.store_portal_audit to anon, authenticated, service_role;

-- section 81: functions
grant execute on function public.current_app_user(), public.is_commercial_team(), public.is_store_user(), public.rls_auto_enable(), public.slugify_store_name(text), public.slugify_text(text) to anon, authenticated, service_role;

-- section 90: ensure_rls
drop event trigger if exists ensure_rls;
create event trigger ensure_rls on ddl_command_end when tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO') execute function public.rls_auto_enable();

commit;
