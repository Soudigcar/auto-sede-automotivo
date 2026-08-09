-- AUTO CONTROLE AUTOMOTIVO
-- BASELINE CONSOLIDADO PARA REBUILD DE AMBIENTE VAZIO
--
-- IMPORTANTE: NAO APLICAR AO BANCO DE PRODUCAO EXISTENTE.
-- O banco atual ja contem estes objetos. O alinhamento futuro do historico
-- exige migration repair separado, revisado e explicitamente autorizado.
--
-- Composicao: 46 migrations registradas em producao, duas camadas de
-- fundacao, finalizacao de privilegios e camada de Storage.
-- O historico original permanece em supabase/migrations_archive/.

-- ==========================================================================
-- SOURCE: remote_history/20260706202055_initial_auto_controle_schema.sql
-- ==========================================================================

create extension if not exists pgcrypto;

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  event_name varchar(255) not null,
  start_date date,
  end_date date,
  location text,
  status varchar(50) not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid,
  full_name varchar(255) not null,
  email varchar(255) unique not null,
  phone varchar(50),
  role varchar(50) not null check (role in ('master','prospector','store','pre_sales')),
  photo_url text,
  status varchar(50) not null default 'active',
  must_change_password boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.stores (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references public.events(id) on delete cascade,
  store_name varchar(255) not null,
  responsible_name varchar(255) not null,
  responsible_phone varchar(50),
  responsible_email varchar(255),
  status varchar(50) not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.prospectors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete cascade,
  event_id uuid references public.events(id) on delete cascade,
  photo_url text,
  full_name varchar(255) not null,
  phone varchar(50),
  email varchar(255),
  status varchar(50) not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references public.events(id) on delete cascade,
  customer_name varchar(255) not null,
  customer_phone varchar(50),
  customer_bank varchar(100),
  interested_vehicle varchar(255),
  vehicle_category_interest varchar(100),
  origin varchar(50) not null check (origin in ('street_survey','quick_registration','manual')),
  prospector_id uuid references public.prospectors(id),
  assigned_store_id uuid references public.stores(id),
  status varchar(50) not null default 'new_lead',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.street_surveys (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references public.events(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete cascade,
  prospector_id uuid references public.prospectors(id),
  customer_name varchar(255) not null,
  customer_phone varchar(50),
  customer_bank varchar(100),
  purchase_intention varchar(100),
  vehicle_category_interest varchar(100),
  purchase_timeline varchar(100),
  has_trade_in_vehicle boolean,
  assigned_store_id uuid references public.stores(id),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.lead_activities (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references public.events(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete cascade,
  user_id uuid references public.users(id),
  activity_type varchar(100) not null,
  description text,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references public.events(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete cascade,
  store_id uuid references public.stores(id),
  scheduled_by uuid references public.users(id),
  appointment_date date not null,
  appointment_time time not null,
  status varchar(50) not null default 'scheduled',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.inventory (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references public.events(id) on delete cascade,
  store_id uuid references public.stores(id) on delete cascade,
  brand varchar(100) not null,
  model varchar(100) not null,
  version varchar(150),
  manufacture_year integer,
  model_year integer,
  vehicle_category varchar(100),
  plate varchar(20),
  color varchar(50),
  price numeric(12,2),
  status varchar(50) not null default 'available',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sales (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references public.events(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete cascade,
  store_id uuid references public.stores(id),
  vehicle_id uuid references public.inventory(id),
  prospector_id uuid references public.prospectors(id),
  seller_name varchar(255) not null,
  customer_bank varchar(100),
  financing_bank varchar(100) not null,
  payment_type varchar(100) not null,
  sale_value numeric(12,2),
  vehicle_category varchar(100),
  confirmed_by uuid references public.users(id),
  confirmed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.losses (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references public.events(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete cascade,
  store_id uuid references public.stores(id),
  reason varchar(100) not null,
  description text,
  lost_stage varchar(100),
  registered_by uuid references public.users(id),
  registered_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.banks (
  id uuid primary key default gen_random_uuid(),
  bank_name varchar(100) unique not null,
  status varchar(50) not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references public.events(id) on delete cascade,
  user_id uuid references public.users(id),
  user_role varchar(50),
  action_type varchar(100) not null,
  entity_type varchar(100),
  entity_id uuid,
  old_value jsonb,
  new_value jsonb,
  ip_address varchar(100),
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists idx_leads_event_id on public.leads(event_id);
create index if not exists idx_leads_assigned_store_id on public.leads(assigned_store_id);
create index if not exists idx_leads_prospector_id on public.leads(prospector_id);
create index if not exists idx_leads_status on public.leads(status);
create index if not exists idx_sales_event_id on public.sales(event_id);
create index if not exists idx_losses_event_id on public.losses(event_id);
create index if not exists idx_inventory_store_id on public.inventory(store_id);

alter table public.events enable row level security;
alter table public.users enable row level security;
alter table public.stores enable row level security;
alter table public.prospectors enable row level security;
alter table public.leads enable row level security;
alter table public.street_surveys enable row level security;
alter table public.lead_activities enable row level security;
alter table public.appointments enable row level security;
alter table public.inventory enable row level security;
alter table public.sales enable row level security;
alter table public.losses enable row level security;
alter table public.banks enable row level security;
alter table public.audit_logs enable row level security;

drop policy if exists authenticated_select_events on public.events;
create policy authenticated_select_events on public.events for select to authenticated using (true);
drop policy if exists authenticated_insert_events on public.events;
create policy authenticated_insert_events on public.events for insert to authenticated with check (true);
drop policy if exists authenticated_update_events on public.events;
create policy authenticated_update_events on public.events for update to authenticated using (true) with check (true);

drop policy if exists authenticated_select_users on public.users;
create policy authenticated_select_users on public.users for select to authenticated using (true);
drop policy if exists authenticated_insert_users on public.users;
create policy authenticated_insert_users on public.users for insert to authenticated with check (true);
drop policy if exists authenticated_update_users on public.users;
create policy authenticated_update_users on public.users for update to authenticated using (true) with check (true);

drop policy if exists authenticated_all_stores on public.stores;
create policy authenticated_all_stores on public.stores for all to authenticated using (true) with check (true);
drop policy if exists authenticated_all_prospectors on public.prospectors;
create policy authenticated_all_prospectors on public.prospectors for all to authenticated using (true) with check (true);
drop policy if exists authenticated_all_leads on public.leads;
create policy authenticated_all_leads on public.leads for all to authenticated using (true) with check (true);
drop policy if exists authenticated_all_street_surveys on public.street_surveys;
create policy authenticated_all_street_surveys on public.street_surveys for all to authenticated using (true) with check (true);
drop policy if exists authenticated_all_lead_activities on public.lead_activities;
create policy authenticated_all_lead_activities on public.lead_activities for all to authenticated using (true) with check (true);
drop policy if exists authenticated_all_appointments on public.appointments;
create policy authenticated_all_appointments on public.appointments for all to authenticated using (true) with check (true);
drop policy if exists authenticated_all_inventory on public.inventory;
create policy authenticated_all_inventory on public.inventory for all to authenticated using (true) with check (true);
drop policy if exists authenticated_all_sales on public.sales;
create policy authenticated_all_sales on public.sales for all to authenticated using (true) with check (true);
drop policy if exists authenticated_all_losses on public.losses;
create policy authenticated_all_losses on public.losses for all to authenticated using (true) with check (true);
drop policy if exists authenticated_read_banks on public.banks;
create policy authenticated_read_banks on public.banks for select to authenticated using (true);
drop policy if exists authenticated_all_audit_logs on public.audit_logs;
create policy authenticated_all_audit_logs on public.audit_logs for all to authenticated using (true) with check (true);

-- ==========================================================================
-- SOURCE: baseline/sources/baseline_foundation.sql
-- ==========================================================================

-- AUTO CONTROLE AUTOMOTIVO
-- CANDIDATO DE FUNDACAO PARA REBUILD - NAO APLICAR EM PRODUCAO
--
-- Posicao pretendida para teste descartavel:
--   1) 20260706202055_initial_auto_controle_schema
--   2) este arquivo
--   3) 20260721055140_create_store_calendar_tasks e migrations seguintes
--
-- Origem: catalogo estrutural atual do Supabase, consultado somente em leitura.
-- Este arquivo nao e um baseline completo e nao foi aplicado a banco algum.

begin;

-- ---------------------------------------------------------------------------
-- Colunas existentes hoje, mas ausentes de todo o historico registrado.
-- A migration inicial nao insere dados em stores/events, portanto os NOT NULL
-- de slug sao compativeis com um rebuild vazio.
-- ---------------------------------------------------------------------------

alter table public.users add column if not exists store_id uuid;

alter table public.leads add column if not exists scheduled_at timestamp with time zone;
alter table public.leads add column if not exists appointment_notes text;
alter table public.leads add column if not exists appointment_cancelled_at timestamp with time zone;
alter table public.leads add column if not exists appointment_cancelled_reason text;
alter table public.leads add column if not exists lost_reason text;

alter table public.stores add column if not exists event_name_snapshot text;
alter table public.stores add column if not exists event_start_date_snapshot date;
alter table public.stores add column if not exists event_end_date_snapshot date;
alter table public.stores add column if not exists event_state_snapshot character varying(80);
alter table public.stores add column if not exists event_city_snapshot character varying(120);
alter table public.stores add column if not exists slug text not null;
alter table public.stores add column if not exists portal_enabled boolean default true not null;
alter table public.stores add column if not exists self_registration_completed_at timestamp with time zone;

alter table public.events add column if not exists state character varying(80);
alter table public.events add column if not exists city character varying(120);
alter table public.events add column if not exists slug text not null;

alter table public.users
  add constraint users_store_id_fkey
  foreign key (store_id) references public.stores(id) on delete set null;

-- Indices atuais ligados a colunas que nao possuem criacao no historico.
create index if not exists idx_users_store_id on public.users using btree (store_id);
create index if not exists leads_store_status_scheduled_idx
  on public.leads using btree (assigned_store_id, status, scheduled_at);
create index if not exists idx_stores_event_snapshot
  on public.stores using btree (event_name_snapshot);
create index if not exists idx_stores_portal_enabled
  on public.stores using btree (portal_enabled);
create unique index if not exists idx_stores_slug_unique
  on public.stores using btree (slug);
create unique index if not exists idx_events_slug_unique
  on public.events using btree (slug);
create index if not exists idx_events_state_city
  on public.events using btree (state, city);

-- ---------------------------------------------------------------------------
-- Tabelas existentes hoje, mas sem CREATE TABLE em nenhuma das 44 migrations.
-- Colunas posteriores ja estao incluidas; os ADD COLUMN IF NOT EXISTS das
-- migrations seguintes tornam o replay idempotente para essas colunas.
-- ---------------------------------------------------------------------------

create table public.site_campaigns (
  id uuid default gen_random_uuid() not null,
  name text default 'Festival Seu Carro Agora'::text not null,
  slug text not null,
  title text default 'Simule seu financiamento e descubra suas chances de sair de carro hoje'::text not null,
  description text default 'Escolha um veículo disponível em nosso estoque, informe seus dados e receba uma simulação inicial com taxa referencial.'::text not null,
  interest_rate numeric(8,4) default 1.89 not null,
  whatsapp_number text,
  is_active boolean default true not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  event_id uuid,
  logo_url text,
  hero_image_url text,
  mobile_hero_image_url text,
  sponsor_logo_urls text[] default '{}'::text[] not null,
  hero_eyebrow text default 'Evento automotivo'::text not null,
  cta_label text default 'Simular agora'::text not null,
  primary_color text default '#DC2626'::text not null,
  secondary_color text default '#071020'::text not null,
  benefits jsonb default '[{"title": "Simulação rápida", "description": "Faça uma estimativa inicial de financiamento."}, {"title": "Estoque das lojas participantes", "description": "Consulte veículos vinculados ao evento."}, {"title": "Atendimento direto", "description": "Seu interesse segue para a loja responsável pelo veículo."}]'::jsonb not null,
  terms_text text,
  published_at timestamp with time zone,
  auto_sync_inventory boolean default true not null,
  editor_draft jsonb,
  published_layout jsonb,
  layout_version integer default 1 not null,
  draft_updated_at timestamp with time zone,
  published_by uuid
);

create table public.site_vehicles (
  id uuid default gen_random_uuid() not null,
  campaign_id uuid,
  brand text not null,
  model text not null,
  version text,
  year text,
  mileage text,
  color text,
  transmission text,
  fuel text,
  price numeric(14,2) default 0 not null,
  image_url text,
  store_name text,
  status text default 'disponivel'::text not null,
  show_on_landing boolean default true not null,
  is_featured boolean default false not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  image_urls text[] default '{}'::text[] not null,
  source_url text,
  store_id uuid,
  sold_at timestamp with time zone,
  sold_lead_id uuid,
  sold_by_user_id uuid,
  previous_status_before_sale text,
  previous_visibility_before_sale boolean,
  previous_featured_before_sale boolean,
  manufacture_year integer,
  model_year integer
);

create table public.leads_base (
  id uuid default gen_random_uuid() not null,
  name text not null,
  phone text not null,
  cpf text,
  email text,
  source text default 'Landing Page Simulador'::text not null,
  campaign_id uuid,
  campaign_name text,
  vehicle_id uuid,
  vehicle_name text,
  vehicle_price numeric(14,2) default 0,
  down_payment numeric(14,2) default 0,
  financed_amount numeric(14,2) default 0,
  installments integer,
  estimated_installment numeric(14,2) default 0,
  interest_rate numeric(8,4) default 1.89,
  status text default 'Novo lead'::text not null,
  assigned_store_id uuid,
  assigned_consultant_id uuid,
  notes text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  assigned_store_name text,
  assigned_at timestamp with time zone,
  routed_lead_id uuid,
  routing_strategy text,
  event_id uuid
);

create table public.lead_routing_state (
  routing_key text default 'default'::text not null,
  last_store_id uuid,
  last_position integer default '-1'::integer not null,
  last_routed_at timestamp with time zone,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

create table public.store_vehicle_link_submissions (
  id uuid default gen_random_uuid() not null,
  event_id uuid,
  store_id uuid not null,
  submitted_by_user_id uuid,
  "position" integer default 1 not null,
  vehicle_url text not null,
  status text default 'pending'::text not null,
  notes text,
  imported_vehicle_id uuid,
  metadata jsonb default '{}'::jsonb not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

-- Chaves primarias e unicidade.
alter table public.lead_routing_state
  add constraint lead_routing_state_pkey primary key (routing_key);
alter table public.leads_base
  add constraint leads_base_pkey primary key (id);
alter table public.site_campaigns
  add constraint site_campaigns_pkey primary key (id);
alter table public.site_vehicles
  add constraint site_vehicles_pkey primary key (id);
alter table public.store_vehicle_link_submissions
  add constraint store_vehicle_link_submissions_pkey primary key (id);
alter table public.site_campaigns
  add constraint site_campaigns_slug_key unique (slug);

-- Checks atuais.
alter table public.site_campaigns
  add constraint site_campaigns_benefits_array_check
  check (jsonb_typeof(benefits) = 'array'::text);
alter table public.site_vehicles
  add constraint site_vehicles_manufacture_year_check
  check (manufacture_year is null or manufacture_year between 1886 and 2200);
alter table public.site_vehicles
  add constraint site_vehicles_model_year_check
  check (model_year is null or model_year between 1886 and 2200);
alter table public.site_vehicles
  add constraint site_vehicles_year_order_check
  check (
    manufacture_year is null or model_year is null
    or model_year between manufacture_year - 1 and manufacture_year + 2
  );
alter table public.store_vehicle_link_submissions
  add constraint store_vehicle_link_submissions_position_check
  check ("position" between 1 and 6);
alter table public.store_vehicle_link_submissions
  add constraint store_vehicle_link_submissions_status_check
  check (status = any (array['pending','reviewing','imported','published','rejected','duplicate']::text[]));

-- Chaves estrangeiras adicionadas somente depois de todas as tabelas existirem.
alter table public.lead_routing_state
  add constraint lead_routing_state_last_store_id_fkey
  foreign key (last_store_id) references public.stores(id) on delete set null;
alter table public.leads_base
  add constraint leads_base_assigned_consultant_id_fkey
  foreign key (assigned_consultant_id) references public.users(id) on delete set null;
alter table public.leads_base
  add constraint leads_base_campaign_id_fkey
  foreign key (campaign_id) references public.site_campaigns(id) on delete set null;
alter table public.leads_base
  add constraint leads_base_event_id_fkey
  foreign key (event_id) references public.events(id) on delete set null;
alter table public.leads_base
  add constraint leads_base_routed_lead_id_fkey
  foreign key (routed_lead_id) references public.leads(id) on delete set null;
alter table public.leads_base
  add constraint leads_base_vehicle_id_fkey
  foreign key (vehicle_id) references public.site_vehicles(id) on delete set null;
alter table public.site_campaigns
  add constraint site_campaigns_event_id_fkey
  foreign key (event_id) references public.events(id) on delete set null;
alter table public.site_campaigns
  add constraint site_campaigns_published_by_fkey
  foreign key (published_by) references public.users(id) on delete set null;
alter table public.site_vehicles
  add constraint site_vehicles_campaign_id_fkey
  foreign key (campaign_id) references public.site_campaigns(id) on delete set null;
alter table public.site_vehicles
  add constraint site_vehicles_sold_by_user_id_fkey
  foreign key (sold_by_user_id) references public.users(id) on delete set null;
alter table public.site_vehicles
  add constraint site_vehicles_sold_lead_id_fkey
  foreign key (sold_lead_id) references public.leads(id) on delete set null;
alter table public.site_vehicles
  add constraint site_vehicles_store_id_fkey
  foreign key (store_id) references public.stores(id) on delete set null;
alter table public.store_vehicle_link_submissions
  add constraint store_vehicle_link_submissions_event_id_fkey
  foreign key (event_id) references public.events(id) on delete cascade;
alter table public.store_vehicle_link_submissions
  add constraint store_vehicle_link_submissions_imported_vehicle_id_fkey
  foreign key (imported_vehicle_id) references public.site_vehicles(id) on delete set null;
alter table public.store_vehicle_link_submissions
  add constraint store_vehicle_link_submissions_store_id_fkey
  foreign key (store_id) references public.stores(id) on delete cascade;
alter table public.store_vehicle_link_submissions
  add constraint store_vehicle_link_submissions_submitted_by_user_id_fkey
  foreign key (submitted_by_user_id) references public.users(id) on delete set null;

-- Indices atuais que nao sao criados automaticamente por constraints.
create index if not exists idx_leads_base_assigned_at
  on public.leads_base using btree (assigned_at);
create index if not exists idx_leads_base_assigned_store_id
  on public.leads_base using btree (assigned_store_id);
create index if not exists idx_leads_base_created_at
  on public.leads_base using btree (created_at desc);
create index if not exists idx_leads_base_event_created_at
  on public.leads_base using btree (event_id, created_at desc);
create index if not exists idx_leads_base_routed_lead_id
  on public.leads_base using btree (routed_lead_id);
create index if not exists idx_leads_base_source
  on public.leads_base using btree (source);
create index if not exists idx_leads_base_status
  on public.leads_base using btree (status);
create index if not exists leads_base_assigned_consultant_idx
  on public.leads_base using btree (assigned_consultant_id, created_at desc);
create index if not exists leads_base_event_campaign_vehicle_recent_idx
  on public.leads_base using btree (event_id, campaign_id, vehicle_id, created_at desc)
  where source = 'Landing Page Simulador'::text;

create index if not exists idx_site_campaigns_slug
  on public.site_campaigns using btree (slug);
create index if not exists site_campaigns_active_event_idx
  on public.site_campaigns using btree (is_active, event_id);
create unique index if not exists site_campaigns_event_unique_idx
  on public.site_campaigns using btree (event_id) where event_id is not null;

create index if not exists idx_site_vehicles_campaign_id
  on public.site_vehicles using btree (campaign_id);
create index if not exists idx_site_vehicles_image_urls
  on public.site_vehicles using gin (image_urls);
create index if not exists idx_site_vehicles_landing
  on public.site_vehicles using btree (status, show_on_landing);
create index if not exists idx_site_vehicles_marketplace_owner_status
  on public.site_vehicles using btree (store_id, status, show_on_landing);
create index if not exists idx_site_vehicles_sold_lead_id
  on public.site_vehicles using btree (sold_lead_id);
create index if not exists idx_site_vehicles_source_url
  on public.site_vehicles using btree (source_url);
create index if not exists idx_site_vehicles_store_id
  on public.site_vehicles using btree (store_id);
create index if not exists site_vehicles_manufacture_year_idx
  on public.site_vehicles using btree (manufacture_year) where manufacture_year is not null;
create index if not exists site_vehicles_model_year_idx
  on public.site_vehicles using btree (model_year) where model_year is not null;

create unique index if not exists idx_store_vehicle_link_one_active_owner
  on public.store_vehicle_link_submissions using btree (imported_vehicle_id)
  where imported_vehicle_id is not null
    and status <> all (array['rejected','duplicate']::text[])
    and coalesce(metadata ->> 'store_removed', 'false') <> 'true';
create index if not exists idx_store_vehicle_link_submissions_event_id
  on public.store_vehicle_link_submissions using btree (event_id);
create index if not exists idx_store_vehicle_link_submissions_status
  on public.store_vehicle_link_submissions using btree (status);
create index if not exists idx_store_vehicle_link_submissions_store_id
  on public.store_vehicle_link_submissions using btree (store_id);
create unique index if not exists idx_store_vehicle_link_submissions_unique_link
  on public.store_vehicle_link_submissions using btree (store_id, vehicle_url);

-- ---------------------------------------------------------------------------
-- Funcoes auxiliares usadas por policies antes de qualquer CREATE FUNCTION no
-- historico. As definicoes abaixo reproduzem o catalogo atual.
-- ATENCAO: todas sao SECURITY DEFINER e hoje possuem EXECUTE para PUBLIC.
-- Isso deve ser revisado separadamente antes de adotar um baseline definitivo.
-- ---------------------------------------------------------------------------

create or replace function public.current_app_role()
returns text
language sql
stable security definer
set search_path to 'public'
as $function$
  select role
  from public.users
  where
    auth_user_id = auth.uid()
    or lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  order by
    case when auth_user_id = auth.uid() then 0 else 1 end
  limit 1;
$function$;

create or replace function public.current_app_store_id()
returns uuid
language sql
stable security definer
set search_path to 'public'
as $function$
  select store_id
  from public.users
  where
    auth_user_id = auth.uid()
    or lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  order by
    case when auth_user_id = auth.uid() then 0 else 1 end
  limit 1;
$function$;

create or replace function public.current_app_user_id()
returns uuid
language sql
stable security definer
set search_path to 'public'
as $function$
  select id
  from public.users
  where
    auth_user_id = auth.uid()
    or lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  order by
    case when auth_user_id = auth.uid() then 0 else 1 end
  limit 1;
$function$;

create or replace function public.is_master()
returns boolean
language sql
stable security definer
set search_path to 'public'
as $function$
  select coalesce(public.current_app_role(), '') = 'master';
$function$;

-- RLS ja esta habilitada nestas cinco tabelas na producao atual. As policies
-- continuam sendo criadas pelas migrations posteriores.
alter table public.site_campaigns enable row level security;
alter table public.site_vehicles enable row level security;
alter table public.leads_base enable row level security;
alter table public.lead_routing_state enable row level security;
alter table public.store_vehicle_link_submissions enable row level security;

-- Grants DML explicitos para evitar dependencia dos defaults de exposicao da
-- Data API. Reproduzem o alcance geral atual; RLS continua controlando linhas.
grant select, insert, update, delete on table
  public.site_campaigns,
  public.site_vehicles,
  public.leads_base,
  public.lead_routing_state,
  public.store_vehicle_link_submissions
to anon, authenticated, service_role;

grant execute on function public.current_app_role() to anon, authenticated, service_role;
grant execute on function public.current_app_store_id() to anon, authenticated, service_role;
grant execute on function public.current_app_user_id() to anon, authenticated, service_role;
grant execute on function public.is_master() to anon, authenticated, service_role;

commit;

-- ==========================================================================
-- SOURCE: baseline/sources/baseline_foundation_delta.sql
-- ==========================================================================

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

-- ==========================================================================
-- SOURCE: remote_history/20260721055140_create_store_calendar_tasks.sql
-- ==========================================================================

create table if not exists public.store_calendar_tasks (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  title text not null,
  description text,
  task_type text not null default 'task',
  starts_at timestamptz not null,
  ends_at timestamptz,
  status text not null default 'pending',
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists store_calendar_tasks_store_starts_idx
on public.store_calendar_tasks (store_id, starts_at);

alter table public.store_calendar_tasks enable row level security;

drop policy if exists store_calendar_tasks_select on public.store_calendar_tasks;
drop policy if exists store_calendar_tasks_insert on public.store_calendar_tasks;
drop policy if exists store_calendar_tasks_update on public.store_calendar_tasks;
drop policy if exists store_calendar_tasks_delete on public.store_calendar_tasks;

create policy store_calendar_tasks_select
on public.store_calendar_tasks
for select
to authenticated
using (
  exists (
    select 1
    from public.users u
    where u.auth_user_id = auth.uid()
      and u.status = 'active'
      and (u.role = 'master' or u.store_id = store_calendar_tasks.store_id)
  )
);

create policy store_calendar_tasks_insert
on public.store_calendar_tasks
for insert
to authenticated
with check (
  exists (
    select 1
    from public.users u
    where u.auth_user_id = auth.uid()
      and u.status = 'active'
      and (u.role = 'master' or u.store_id = store_calendar_tasks.store_id)
  )
);

create policy store_calendar_tasks_update
on public.store_calendar_tasks
for update
to authenticated
using (
  exists (
    select 1
    from public.users u
    where u.auth_user_id = auth.uid()
      and u.status = 'active'
      and (u.role = 'master' or u.store_id = store_calendar_tasks.store_id)
  )
)
with check (
  exists (
    select 1
    from public.users u
    where u.auth_user_id = auth.uid()
      and u.status = 'active'
      and (u.role = 'master' or u.store_id = store_calendar_tasks.store_id)
  )
);

create policy store_calendar_tasks_delete
on public.store_calendar_tasks
for delete
to authenticated
using (
  exists (
    select 1
    from public.users u
    where u.auth_user_id = auth.uid()
      and u.status = 'active'
      and (u.role = 'master' or u.store_id = store_calendar_tasks.store_id)
  )
);

-- ==========================================================================
-- SOURCE: remote_history/20260723235218_create_whatsapp_cloud_crm.sql
-- ==========================================================================

create extension if not exists pgcrypto;

create table if not exists public.whatsapp_numbers (
  id uuid primary key default gen_random_uuid(),
  store_id uuid references public.stores(id) on delete set null,
  label text not null,
  phone_number text,
  phone_number_id text not null unique,
  waba_id text,
  access_token text,
  verify_token text not null,
  graph_version text not null default 'v20.0',
  routing_mode text not null default 'store_pipeline',
  is_active boolean not null default false,
  status text not null default 'pending',
  last_webhook_at timestamptz,
  last_error text,
  settings jsonb not null default '{}'::jsonb,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists whatsapp_numbers_store_idx on public.whatsapp_numbers(store_id);
create index if not exists whatsapp_numbers_active_idx on public.whatsapp_numbers(is_active, status);

create table if not exists public.whatsapp_contacts (
  id uuid primary key default gen_random_uuid(),
  store_id uuid references public.stores(id) on delete set null,
  lead_id uuid references public.leads(id) on delete set null,
  base_lead_id uuid references public.leads_base(id) on delete set null,
  whatsapp_number_id uuid references public.whatsapp_numbers(id) on delete cascade,
  wa_id text not null,
  phone text not null,
  profile_name text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  unique(whatsapp_number_id, wa_id)
);

create index if not exists whatsapp_contacts_store_idx on public.whatsapp_contacts(store_id);
create index if not exists whatsapp_contacts_phone_idx on public.whatsapp_contacts(phone);
create index if not exists whatsapp_contacts_lead_idx on public.whatsapp_contacts(lead_id);

create table if not exists public.whatsapp_conversations (
  id uuid primary key default gen_random_uuid(),
  store_id uuid references public.stores(id) on delete set null,
  whatsapp_number_id uuid references public.whatsapp_numbers(id) on delete cascade,
  contact_id uuid references public.whatsapp_contacts(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  base_lead_id uuid references public.leads_base(id) on delete set null,
  assigned_user_id uuid references public.users(id) on delete set null,
  status text not null default 'open',
  last_message text,
  last_message_at timestamptz,
  unread_count integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(whatsapp_number_id, contact_id)
);

create index if not exists whatsapp_conversations_store_idx on public.whatsapp_conversations(store_id, updated_at desc);
create index if not exists whatsapp_conversations_lead_idx on public.whatsapp_conversations(lead_id);

create table if not exists public.whatsapp_messages (
  id uuid primary key default gen_random_uuid(),
  store_id uuid references public.stores(id) on delete set null,
  whatsapp_number_id uuid references public.whatsapp_numbers(id) on delete cascade,
  conversation_id uuid references public.whatsapp_conversations(id) on delete cascade,
  contact_id uuid references public.whatsapp_contacts(id) on delete set null,
  lead_id uuid references public.leads(id) on delete set null,
  base_lead_id uuid references public.leads_base(id) on delete set null,
  wa_message_id text unique,
  direction text not null default 'inbound',
  message_type text not null default 'text',
  body text,
  media_id text,
  media_url text,
  status text not null default 'received',
  raw_payload jsonb not null default '{}'::jsonb,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists whatsapp_messages_conversation_idx on public.whatsapp_messages(conversation_id, created_at asc);
create index if not exists whatsapp_messages_store_idx on public.whatsapp_messages(store_id, created_at desc);
create index if not exists whatsapp_messages_lead_idx on public.whatsapp_messages(lead_id);

alter table public.whatsapp_numbers enable row level security;
alter table public.whatsapp_contacts enable row level security;
alter table public.whatsapp_conversations enable row level security;
alter table public.whatsapp_messages enable row level security;

drop policy if exists whatsapp_numbers_master_all on public.whatsapp_numbers;
create policy whatsapp_numbers_master_all on public.whatsapp_numbers
for all to authenticated
using (exists (select 1 from public.users u where u.auth_user_id = auth.uid() and u.role = 'master' and u.status = 'active'))
with check (exists (select 1 from public.users u where u.auth_user_id = auth.uid() and u.role = 'master' and u.status = 'active'));

drop policy if exists whatsapp_contacts_master_or_store_select on public.whatsapp_contacts;
create policy whatsapp_contacts_master_or_store_select on public.whatsapp_contacts
for select to authenticated
using (
  exists (select 1 from public.users u where u.auth_user_id = auth.uid() and u.role = 'master' and u.status = 'active')
  or exists (select 1 from public.users u where u.auth_user_id = auth.uid() and u.status = 'active' and u.store_id = whatsapp_contacts.store_id)
);

drop policy if exists whatsapp_conversations_master_or_store_select on public.whatsapp_conversations;
create policy whatsapp_conversations_master_or_store_select on public.whatsapp_conversations
for select to authenticated
using (
  exists (select 1 from public.users u where u.auth_user_id = auth.uid() and u.role = 'master' and u.status = 'active')
  or exists (select 1 from public.users u where u.auth_user_id = auth.uid() and u.status = 'active' and u.store_id = whatsapp_conversations.store_id)
);

drop policy if exists whatsapp_messages_master_or_store_select on public.whatsapp_messages;
create policy whatsapp_messages_master_or_store_select on public.whatsapp_messages
for select to authenticated
using (
  exists (select 1 from public.users u where u.auth_user_id = auth.uid() and u.role = 'master' and u.status = 'active')
  or exists (select 1 from public.users u where u.auth_user_id = auth.uid() and u.status = 'active' and u.store_id = whatsapp_messages.store_id)
);

-- ==========================================================================
-- SOURCE: remote_history/20260724014216_allow_marketing_lead_origins.sql
-- ==========================================================================

alter table public.leads
  drop constraint if exists leads_origin_check;

alter table public.leads
  add constraint leads_origin_check
  check (
    origin::text = any (
      array[
        'street_survey',
        'quick_registration',
        'manual',
        'Facebook Lead Ads',
        'facebook_lead_ads',
        'WhatsApp Oficial',
        'whatsapp_official'
      ]::text[]
    )
  );

-- ==========================================================================
-- SOURCE: remote_history/20260724200536_create_lead_activity_logs.sql
-- ==========================================================================

create table if not exists public.lead_activity_logs (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid,
  base_lead_id uuid,
  store_id uuid,
  store_name text,
  user_id uuid,
  user_name text,
  activity_type text not null,
  activity_label text not null,
  from_status text,
  to_status text,
  customer_name text,
  customer_phone text,
  vehicle_name text,
  notes text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

create index if not exists lead_activity_logs_lead_id_idx on public.lead_activity_logs (lead_id);
create index if not exists lead_activity_logs_base_lead_id_idx on public.lead_activity_logs (base_lead_id);
create index if not exists lead_activity_logs_store_id_idx on public.lead_activity_logs (store_id);
create index if not exists lead_activity_logs_created_at_idx on public.lead_activity_logs (created_at desc);
create index if not exists lead_activity_logs_activity_type_idx on public.lead_activity_logs (activity_type);

alter table public.lead_activity_logs enable row level security;

drop policy if exists lead_activity_logs_service_role_all on public.lead_activity_logs;
create policy lead_activity_logs_service_role_all
on public.lead_activity_logs
for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

-- ==========================================================================
-- SOURCE: remote_history/20260724200734_add_lead_activity_trigger.sql
-- ==========================================================================

create or replace function public.log_lead_activity_from_leads()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_store_name text;
  v_user_id uuid;
  v_user_name text;
  v_activity_type text;
  v_activity_label text;
  v_notes text;
begin
  if tg_op = 'DELETE' then
    select store_name into v_store_name from public.stores where id = old.assigned_store_id;

    insert into public.lead_activity_logs (
      lead_id, store_id, store_name, user_id, user_name, activity_type, activity_label,
      from_status, to_status, customer_name, customer_phone, vehicle_name, notes, metadata
    ) values (
      old.id, old.assigned_store_id, coalesce(v_store_name, ''), auth.uid(), null,
      'lead_deleted', 'Loja excluiu o lead', old.status, null, old.customer_name,
      old.customer_phone, old.interested_vehicle, old.notes, jsonb_build_object('operation', tg_op)
    );

    return old;
  end if;

  select store_name into v_store_name from public.stores where id = new.assigned_store_id;
  v_user_id := auth.uid();

  if v_user_id is not null then
    select name into v_user_name from public.users where auth_user_id = v_user_id limit 1;
  end if;

  if tg_op = 'INSERT' then
    v_activity_type := 'lead_created';
    v_activity_label := 'Lead criado no pipeline da loja';
  elsif tg_op = 'UPDATE' then
    if coalesce(old.status, '') is distinct from coalesce(new.status, '') then
      v_activity_type := case new.status
        when 'in_service' then 'status_changed'
        when 'scheduled' then 'schedule_created'
        when 'appointment_cancelled' then 'schedule_cancelled'
        when 'no_show' then 'no_show_marked'
        when 'showed_up' then 'showed_up_marked'
        when 'sale_confirmed' then 'sale_confirmed'
        when 'lost' then 'lost_registered'
        else 'status_changed'
      end;

      v_activity_label := case new.status
        when 'in_service' then 'Loja iniciou atendimento'
        when 'scheduled' then 'Loja agendou atendimento'
        when 'appointment_cancelled' then 'Loja cancelou agendamento'
        when 'no_show' then 'Loja marcou não compareceu'
        when 'showed_up' then 'Loja marcou compareceu'
        when 'sale_confirmed' then 'Loja confirmou venda'
        when 'lost' then 'Loja registrou perda'
        else 'Loja alterou etapa do lead'
      end;

      if old.status = 'sale_confirmed' and new.status <> 'sale_confirmed' then
        v_activity_type := 'sale_cancelled';
        v_activity_label := 'Loja cancelou/reabriu venda';
      elsif old.status = 'lost' and new.status <> 'lost' then
        v_activity_type := 'lead_reopened';
        v_activity_label := 'Loja reabriu lead perdido';
      end if;
    elsif old.customer_name is distinct from new.customer_name
       or old.customer_phone is distinct from new.customer_phone
       or old.interested_vehicle is distinct from new.interested_vehicle
       or old.origin is distinct from new.origin
       or old.notes is distinct from new.notes
       or old.scheduled_at is distinct from new.scheduled_at
       or old.appointment_notes is distinct from new.appointment_notes
       or old.lost_reason is distinct from new.lost_reason then
      v_activity_type := 'lead_edited';
      v_activity_label := 'Loja editou informações do lead';
    else
      return new;
    end if;
  end if;

  v_notes := case
    when v_activity_type = 'schedule_created' then coalesce(new.appointment_notes, '')
    when v_activity_type = 'schedule_cancelled' then coalesce(new.appointment_cancelled_reason, '')
    when v_activity_type = 'lost_registered' then coalesce(new.lost_reason, '')
    else coalesce(new.notes, '')
  end;

  insert into public.lead_activity_logs (
    lead_id, store_id, store_name, user_id, user_name, activity_type, activity_label,
    from_status, to_status, customer_name, customer_phone, vehicle_name, notes, metadata
  ) values (
    new.id, new.assigned_store_id, coalesce(v_store_name, ''), v_user_id, v_user_name,
    v_activity_type, v_activity_label, case when tg_op = 'UPDATE' then old.status else null end,
    new.status, new.customer_name, new.customer_phone, new.interested_vehicle, v_notes,
    jsonb_build_object('operation', tg_op, 'scheduled_at', new.scheduled_at, 'appointment_cancelled_at', new.appointment_cancelled_at, 'origin', new.origin)
  );

  return new;
end;
$$;

drop trigger if exists trg_log_lead_activity_from_leads on public.leads;
create trigger trg_log_lead_activity_from_leads
after insert or update or delete on public.leads
for each row execute function public.log_lead_activity_from_leads();

-- ==========================================================================
-- SOURCE: remote_history/20260724204528_allow_wati_click_to_whatsapp_origin.sql
-- ==========================================================================

alter table public.leads
  drop constraint if exists leads_origin_check;

alter table public.leads
  add constraint leads_origin_check
  check (
    origin::text = any (
      array[
        'street_survey'::text,
        'quick_registration'::text,
        'manual'::text,
        'Facebook Lead Ads'::text,
        'facebook_lead_ads'::text,
        'WhatsApp Oficial'::text,
        'whatsapp_official'::text,
        'WATI / Click-to-WhatsApp'::text,
        'wati_leads'::text,
        'WATI'::text
      ]
    )
  );

-- ==========================================================================
-- SOURCE: remote_history/20260724205949_add_lead_ingestion_locks.sql
-- ==========================================================================

create table if not exists public.lead_ingestion_locks (
  source text not null,
  dedup_key text not null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  attempts integer not null default 1,
  metadata jsonb not null default '{}'::jsonb,
  primary key (source, dedup_key)
);

create index if not exists lead_ingestion_locks_last_seen_idx
  on public.lead_ingestion_locks (last_seen_at desc);

create or replace function public.claim_lead_ingestion_lock(
  p_source text,
  p_dedup_key text,
  p_window_seconds integer default 120
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  affected_count integer := 0;
begin
  if coalesce(trim(p_source), '') = '' or coalesce(trim(p_dedup_key), '') = '' then
    return false;
  end if;

  insert into public.lead_ingestion_locks (source, dedup_key, first_seen_at, last_seen_at, attempts)
  values (trim(p_source), trim(p_dedup_key), now(), now(), 1)
  on conflict (source, dedup_key)
  do update set
    last_seen_at = now(),
    attempts = public.lead_ingestion_locks.attempts + 1
  where public.lead_ingestion_locks.last_seen_at < now() - make_interval(secs => greatest(coalesce(p_window_seconds, 120), 10));

  get diagnostics affected_count = row_count;
  return affected_count > 0;
end;
$$;

grant execute on function public.claim_lead_ingestion_lock(text, text, integer) to anon, authenticated, service_role;

-- ==========================================================================
-- SOURCE: remote_history/20260724215534_unify_lead_round_robin_across_sources.sql
-- ==========================================================================

create or replace function public.pick_next_lead_store(
  p_routing_key text default 'default'::text
)
returns table(
  store_id uuid,
  store_name text,
  event_id uuid,
  route_position integer
)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  effective_routing_key constant text := 'default';
  total_stores integer;
  current_position integer;
  next_position integer;
  selected_store_id uuid;
begin
  -- Todas as origens compartilham um único rodízio global.
  insert into public.lead_routing_state (routing_key, last_position)
  values (effective_routing_key, -1)
  on conflict (routing_key) do nothing;

  perform 1
  from public.lead_routing_state
  where routing_key = effective_routing_key
  for update;

  select count(*)
  into total_stores
  from public.stores s
  where s.status = 'active'
    and coalesce(s.portal_enabled, true) = true;

  if total_stores = 0 then
    return;
  end if;

  select last_position
  into current_position
  from public.lead_routing_state
  where routing_key = effective_routing_key;

  next_position := (coalesce(current_position, -1) + 1) % total_stores;

  select s.id
  into selected_store_id
  from public.stores s
  where s.status = 'active'
    and coalesce(s.portal_enabled, true) = true
  order by s.store_name asc, s.id asc
  offset next_position
  limit 1;

  update public.lead_routing_state
  set
    last_store_id = selected_store_id,
    last_position = next_position,
    last_routed_at = now(),
    updated_at = now()
  where routing_key = effective_routing_key;

  return query
  select
    s.id as store_id,
    s.store_name::text as store_name,
    s.event_id,
    next_position as route_position
  from public.stores s
  where s.id = selected_store_id;
end;
$function$;

-- Reposiciona o rodízio global na última loja que realmente recebeu um lead,
-- independentemente da origem, para que o próximo lead continue a sequência correta.
with eligible_stores as (
  select
    s.id,
    row_number() over (order by s.store_name asc, s.id asc)::integer - 1 as route_position
  from public.stores s
  where s.status = 'active'
    and coalesce(s.portal_enabled, true) = true
),
latest_assignment as (
  select
    lb.assigned_store_id,
    coalesce(lb.assigned_at, lb.created_at) as routed_at
  from public.leads_base lb
  join eligible_stores es on es.id = lb.assigned_store_id
  where lb.assigned_store_id is not null
  order by coalesce(lb.assigned_at, lb.created_at) desc, lb.created_at desc, lb.id desc
  limit 1
)
update public.lead_routing_state state
set
  last_store_id = latest.assigned_store_id,
  last_position = stores.route_position,
  last_routed_at = latest.routed_at,
  updated_at = now()
from latest_assignment latest
join eligible_stores stores on stores.id = latest.assigned_store_id
where state.routing_key = 'default';

-- ==========================================================================
-- SOURCE: remote_history/20260724215623_restrict_lead_routing_function_to_backend.sql
-- ==========================================================================

revoke all on function public.pick_next_lead_store(text) from public;
revoke all on function public.pick_next_lead_store(text) from anon;
revoke all on function public.pick_next_lead_store(text) from authenticated;
grant execute on function public.pick_next_lead_store(text) to service_role;

-- ==========================================================================
-- SOURCE: remote_history/20260725023224_enable_realtime_lead_monitoring.sql
-- ==========================================================================

alter table public.leads
  add column if not exists first_viewed_at timestamptz,
  add column if not exists first_viewed_by_user_id uuid,
  add column if not exists first_viewed_by_name text,
  add column if not exists last_viewed_at timestamptz,
  add column if not exists last_viewed_by_user_id uuid,
  add column if not exists last_viewed_by_name text,
  add column if not exists first_whatsapp_clicked_at timestamptz,
  add column if not exists last_whatsapp_clicked_at timestamptz,
  add column if not exists stage_entered_at timestamptz,
  add column if not exists last_activity_at timestamptz,
  add column if not exists last_activity_type text,
  add column if not exists last_activity_label text,
  add column if not exists last_activity_by_name text;

update public.leads
set
  stage_entered_at = coalesce(stage_entered_at, updated_at, created_at, now()),
  last_activity_at = coalesce(last_activity_at, updated_at, created_at, now()),
  last_activity_type = coalesce(last_activity_type, 'lead_created'),
  last_activity_label = coalesce(last_activity_label, 'Lead criado no pipeline da loja')
where stage_entered_at is null
   or last_activity_at is null
   or last_activity_type is null
   or last_activity_label is null;

create index if not exists idx_leads_first_viewed_at on public.leads(first_viewed_at);
create index if not exists idx_leads_last_activity_at on public.leads(last_activity_at desc);
create index if not exists idx_leads_stage_entered_at on public.leads(stage_entered_at);
create index if not exists idx_lead_activity_logs_lead_created on public.lead_activity_logs(lead_id, created_at desc);
create index if not exists idx_lead_activity_logs_store_created on public.lead_activity_logs(store_id, created_at desc);

alter table public.leads replica identity full;
alter table public.lead_activity_logs replica identity full;
alter table public.leads_base replica identity full;

alter table public.lead_activity_logs enable row level security;

drop policy if exists lead_activity_logs_select_master_or_store on public.lead_activity_logs;
create policy lead_activity_logs_select_master_or_store
on public.lead_activity_logs
for select
to authenticated
using (
  public.is_master()
  or store_id = public.current_app_store_id()
);

create or replace function public.log_lead_activity_from_leads()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_store_name text;
  v_user_id uuid;
  v_user_name text;
  v_activity_type text;
  v_activity_label text;
  v_notes text;
  v_base_status text;
begin
  if tg_op = 'DELETE' then
    select store_name into v_store_name
    from public.stores
    where id = old.assigned_store_id;

    select id, full_name into v_user_id, v_user_name
    from public.users
    where auth_user_id = auth.uid()
       or lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    order by case when auth_user_id = auth.uid() then 0 else 1 end
    limit 1;

    insert into public.lead_activity_logs (
      lead_id, store_id, store_name, user_id, user_name, activity_type, activity_label,
      from_status, to_status, customer_name, customer_phone, vehicle_name, notes, metadata
    ) values (
      old.id, old.assigned_store_id, coalesce(v_store_name, ''), v_user_id, v_user_name,
      'lead_deleted', 'Loja excluiu o lead', old.status, null, old.customer_name,
      old.customer_phone, old.interested_vehicle, old.notes,
      jsonb_build_object('operation', tg_op, 'origin', old.origin)
    );

    return old;
  end if;

  select store_name into v_store_name
  from public.stores
  where id = new.assigned_store_id;

  select id, full_name into v_user_id, v_user_name
  from public.users
  where auth_user_id = auth.uid()
     or lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  order by case when auth_user_id = auth.uid() then 0 else 1 end
  limit 1;

  if tg_op = 'INSERT' then
    v_activity_type := 'lead_created';
    v_activity_label := 'Lead criado no pipeline da loja';
  elsif tg_op = 'UPDATE' then
    if coalesce(old.status, '') is distinct from coalesce(new.status, '') then
      v_activity_type := case new.status
        when 'in_service' then 'status_changed'
        when 'scheduled' then 'schedule_created'
        when 'appointment_cancelled' then 'schedule_cancelled'
        when 'no_show' then 'no_show_marked'
        when 'showed_up' then 'showed_up_marked'
        when 'sale_confirmed' then 'sale_confirmed'
        when 'lost' then 'lost_registered'
        else 'status_changed'
      end;

      v_activity_label := case new.status
        when 'in_service' then 'Loja iniciou atendimento'
        when 'scheduled' then 'Loja agendou atendimento'
        when 'appointment_cancelled' then 'Loja cancelou agendamento'
        when 'no_show' then 'Loja marcou não compareceu'
        when 'showed_up' then 'Loja marcou compareceu'
        when 'sale_confirmed' then 'Loja confirmou venda'
        when 'lost' then 'Loja registrou perda'
        else 'Loja alterou etapa do lead'
      end;

      if old.status = 'sale_confirmed' and new.status <> 'sale_confirmed' then
        v_activity_type := 'sale_cancelled';
        v_activity_label := 'Loja cancelou/reabriu venda';
      elsif old.status = 'lost' and new.status <> 'lost' then
        v_activity_type := 'lead_reopened';
        v_activity_label := 'Loja reabriu lead perdido';
      end if;
    elsif old.customer_name is distinct from new.customer_name
       or old.customer_phone is distinct from new.customer_phone
       or old.interested_vehicle is distinct from new.interested_vehicle
       or old.origin is distinct from new.origin
       or old.notes is distinct from new.notes
       or old.scheduled_at is distinct from new.scheduled_at
       or old.appointment_notes is distinct from new.appointment_notes
       or old.lost_reason is distinct from new.lost_reason then
      v_activity_type := 'lead_edited';
      v_activity_label := 'Loja editou informações do lead';
    else
      return new;
    end if;
  end if;

  v_notes := case
    when v_activity_type = 'schedule_created' then coalesce(new.appointment_notes, '')
    when v_activity_type = 'schedule_cancelled' then coalesce(new.appointment_cancelled_reason, '')
    when v_activity_type = 'lost_registered' then coalesce(new.lost_reason, '')
    else coalesce(new.notes, '')
  end;

  insert into public.lead_activity_logs (
    lead_id, store_id, store_name, user_id, user_name, activity_type, activity_label,
    from_status, to_status, customer_name, customer_phone, vehicle_name, notes, metadata
  ) values (
    new.id, new.assigned_store_id, coalesce(v_store_name, ''), v_user_id, v_user_name,
    v_activity_type, v_activity_label,
    case when tg_op = 'UPDATE' then old.status else null end,
    new.status, new.customer_name, new.customer_phone, new.interested_vehicle, v_notes,
    jsonb_build_object(
      'operation', tg_op,
      'scheduled_at', new.scheduled_at,
      'appointment_cancelled_at', new.appointment_cancelled_at,
      'origin', new.origin
    )
  );

  update public.leads
  set
    stage_entered_at = case
      when tg_op = 'INSERT' or coalesce(old.status, '') is distinct from coalesce(new.status, '') then now()
      else stage_entered_at
    end,
    last_activity_at = now(),
    last_activity_type = v_activity_type,
    last_activity_label = v_activity_label,
    last_activity_by_name = v_user_name
  where id = new.id;

  if tg_op = 'INSERT' or coalesce(old.status, '') is distinct from coalesce(new.status, '') then
    v_base_status := case new.status
      when 'new_lead' then 'Novo lead'
      when 'sale_confirmed' then 'Venda concluída'
      when 'lost' then 'Perdido'
      else 'Em atendimento'
    end;

    update public.leads_base
    set status = v_base_status, updated_at = now()
    where routed_lead_id = new.id;
  end if;

  return new;
end;
$function$;

do $do$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'leads'
  ) then
    alter publication supabase_realtime add table public.leads;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'lead_activity_logs'
  ) then
    alter publication supabase_realtime add table public.lead_activity_logs;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'leads_base'
  ) then
    alter publication supabase_realtime add table public.leads_base;
  end if;
end
$do$;

-- ==========================================================================
-- SOURCE: remote_history/20260725023901_harden_lead_activity_trigger.sql
-- ==========================================================================

create or replace function public.log_lead_activity_from_leads()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_store_name text;
  v_user_id uuid;
  v_user_name text;
  v_activity_type text;
  v_activity_label text;
  v_notes text;
  v_base_status text;
  v_status_changed boolean := false;
begin
  if tg_op = 'DELETE' then
    select store_name into v_store_name
    from public.stores
    where id = old.assigned_store_id;

    select id, full_name into v_user_id, v_user_name
    from public.users
    where auth_user_id = auth.uid()
       or lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    order by case when auth_user_id = auth.uid() then 0 else 1 end
    limit 1;

    insert into public.lead_activity_logs (
      lead_id, store_id, store_name, user_id, user_name, activity_type, activity_label,
      from_status, to_status, customer_name, customer_phone, vehicle_name, notes, metadata
    ) values (
      old.id, old.assigned_store_id, coalesce(v_store_name, ''), v_user_id, v_user_name,
      'lead_deleted', 'Loja excluiu o lead', old.status, null, old.customer_name,
      old.customer_phone, old.interested_vehicle, old.notes,
      jsonb_build_object('operation', tg_op, 'origin', old.origin)
    );

    return old;
  end if;

  select store_name into v_store_name
  from public.stores
  where id = new.assigned_store_id;

  select id, full_name into v_user_id, v_user_name
  from public.users
  where auth_user_id = auth.uid()
     or lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  order by case when auth_user_id = auth.uid() then 0 else 1 end
  limit 1;

  if tg_op = 'INSERT' then
    v_status_changed := true;
    v_activity_type := 'lead_created';
    v_activity_label := 'Lead criado no pipeline da loja';
  elsif tg_op = 'UPDATE' then
    if coalesce(old.status, '') is distinct from coalesce(new.status, '') then
      v_status_changed := true;
      v_activity_type := case new.status
        when 'in_service' then 'status_changed'
        when 'scheduled' then 'schedule_created'
        when 'appointment_cancelled' then 'schedule_cancelled'
        when 'no_show' then 'no_show_marked'
        when 'showed_up' then 'showed_up_marked'
        when 'sale_confirmed' then 'sale_confirmed'
        when 'lost' then 'lost_registered'
        else 'status_changed'
      end;

      v_activity_label := case new.status
        when 'in_service' then 'Loja iniciou atendimento'
        when 'scheduled' then 'Loja agendou atendimento'
        when 'appointment_cancelled' then 'Loja cancelou agendamento'
        when 'no_show' then 'Loja marcou não compareceu'
        when 'showed_up' then 'Loja marcou compareceu'
        when 'sale_confirmed' then 'Loja confirmou venda'
        when 'lost' then 'Loja registrou perda'
        else 'Loja alterou etapa do lead'
      end;

      if old.status = 'sale_confirmed' and new.status <> 'sale_confirmed' then
        v_activity_type := 'sale_cancelled';
        v_activity_label := 'Loja cancelou/reabriu venda';
      elsif old.status = 'lost' and new.status <> 'lost' then
        v_activity_type := 'lead_reopened';
        v_activity_label := 'Loja reabriu lead perdido';
      end if;
    elsif old.customer_name is distinct from new.customer_name
       or old.customer_phone is distinct from new.customer_phone
       or old.interested_vehicle is distinct from new.interested_vehicle
       or old.origin is distinct from new.origin
       or old.notes is distinct from new.notes
       or old.scheduled_at is distinct from new.scheduled_at
       or old.appointment_notes is distinct from new.appointment_notes
       or old.lost_reason is distinct from new.lost_reason then
      v_activity_type := 'lead_edited';
      v_activity_label := 'Loja editou informações do lead';
    else
      return new;
    end if;
  end if;

  v_notes := case
    when v_activity_type = 'schedule_created' then coalesce(new.appointment_notes, '')
    when v_activity_type = 'schedule_cancelled' then coalesce(new.appointment_cancelled_reason, '')
    when v_activity_type = 'lost_registered' then coalesce(new.lost_reason, '')
    else coalesce(new.notes, '')
  end;

  insert into public.lead_activity_logs (
    lead_id, store_id, store_name, user_id, user_name, activity_type, activity_label,
    from_status, to_status, customer_name, customer_phone, vehicle_name, notes, metadata
  ) values (
    new.id, new.assigned_store_id, coalesce(v_store_name, ''), v_user_id, v_user_name,
    v_activity_type, v_activity_label,
    case when tg_op = 'UPDATE' then old.status else null end,
    new.status, new.customer_name, new.customer_phone, new.interested_vehicle, v_notes,
    jsonb_build_object(
      'operation', tg_op,
      'scheduled_at', new.scheduled_at,
      'appointment_cancelled_at', new.appointment_cancelled_at,
      'origin', new.origin
    )
  );

  update public.leads
  set
    stage_entered_at = case when v_status_changed then now() else stage_entered_at end,
    last_activity_at = now(),
    last_activity_type = v_activity_type,
    last_activity_label = v_activity_label,
    last_activity_by_name = v_user_name
  where id = new.id;

  if v_status_changed then
    v_base_status := case new.status
      when 'new_lead' then 'Novo lead'
      when 'sale_confirmed' then 'Venda concluída'
      when 'lost' then 'Perdido'
      else 'Em atendimento'
    end;

    update public.leads_base
    set status = v_base_status, updated_at = now()
    where routed_lead_id = new.id;
  end if;

  return new;
end;
$function$;

-- ==========================================================================
-- SOURCE: remote_history/20260725035320_add_store_team_roles_routing_and_rls.sql
-- ==========================================================================

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

alter table public.users
  drop constraint if exists users_role_check;

alter table public.users
  add constraint users_role_check
  check (role::text = any (array['master','store','pre_sales','seller','prospector']::text[]));

alter table public.users
  add column if not exists receives_leads boolean not null default false,
  add column if not exists routing_order integer not null default 0,
  add column if not exists max_open_leads integer;

alter table public.users
  drop constraint if exists users_max_open_leads_check;
alter table public.users
  add constraint users_max_open_leads_check
  check (max_open_leads is null or max_open_leads >= 0);

alter table public.users
  drop constraint if exists users_store_role_requires_store;
alter table public.users
  add constraint users_store_role_requires_store
  check (role = 'master' or store_id is not null);

alter table public.prospectors
  add column if not exists store_id uuid references public.stores(id) on delete set null;

update public.prospectors p
set store_id = u.store_id
from public.users u
where p.user_id = u.id
  and p.store_id is null
  and u.store_id is not null;

alter table public.leads
  add column if not exists captured_by_user_id uuid,
  add column if not exists pre_sales_user_id uuid,
  add column if not exists pre_sales_assigned_at timestamptz,
  add column if not exists seller_user_id uuid,
  add column if not exists seller_assigned_at timestamptz,
  add column if not exists assigned_user_id uuid,
  add column if not exists assigned_user_role text,
  add column if not exists assigned_user_at timestamptz,
  add column if not exists assignment_source text;

alter table public.leads
  drop constraint if exists leads_captured_by_user_id_fkey,
  drop constraint if exists leads_pre_sales_user_id_fkey,
  drop constraint if exists leads_seller_user_id_fkey,
  drop constraint if exists leads_assigned_user_id_fkey,
  drop constraint if exists leads_assigned_user_role_check;

alter table public.leads
  add constraint leads_captured_by_user_id_fkey foreign key (captured_by_user_id) references public.users(id) on delete set null,
  add constraint leads_pre_sales_user_id_fkey foreign key (pre_sales_user_id) references public.users(id) on delete set null,
  add constraint leads_seller_user_id_fkey foreign key (seller_user_id) references public.users(id) on delete set null,
  add constraint leads_assigned_user_id_fkey foreign key (assigned_user_id) references public.users(id) on delete set null,
  add constraint leads_assigned_user_role_check check (assigned_user_role is null or assigned_user_role in ('pre_sales','seller','prospector'));

alter table public.leads_base
  drop constraint if exists leads_base_assigned_consultant_id_fkey;
alter table public.leads_base
  add constraint leads_base_assigned_consultant_id_fkey
  foreign key (assigned_consultant_id) references public.users(id) on delete set null;

create index if not exists users_store_role_distribution_idx
  on public.users (store_id, role, status, receives_leads, routing_order, full_name, id);
create index if not exists prospectors_store_user_idx
  on public.prospectors (store_id, user_id);
create index if not exists leads_captured_by_user_idx
  on public.leads (captured_by_user_id, created_at desc);
create index if not exists leads_pre_sales_user_idx
  on public.leads (pre_sales_user_id, status, created_at desc);
create index if not exists leads_seller_user_idx
  on public.leads (seller_user_id, status, created_at desc);
create index if not exists leads_assigned_user_idx
  on public.leads (assigned_user_id, status, created_at desc);
create index if not exists leads_store_assigned_user_idx
  on public.leads (assigned_store_id, assigned_user_id, status, created_at desc);
create index if not exists leads_base_assigned_consultant_idx
  on public.leads_base (assigned_consultant_id, created_at desc);

create table if not exists public.store_team_routing_state (
  store_id uuid not null references public.stores(id) on delete cascade,
  role text not null check (role in ('pre_sales','seller')),
  last_user_id uuid references public.users(id) on delete set null,
  last_position integer not null default -1,
  last_routed_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (store_id, role)
);

create table if not exists public.lead_assignment_logs (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  assignment_role text not null check (assignment_role in ('pre_sales','seller','prospector')),
  from_user_id uuid references public.users(id) on delete set null,
  to_user_id uuid references public.users(id) on delete set null,
  assignment_mode text not null default 'round_robin' check (assignment_mode in ('round_robin','manual','system')),
  assigned_by_user_id uuid references public.users(id) on delete set null,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists lead_assignment_logs_lead_created_idx
  on public.lead_assignment_logs (lead_id, created_at desc);
create index if not exists lead_assignment_logs_store_created_idx
  on public.lead_assignment_logs (store_id, created_at desc);
create index if not exists lead_assignment_logs_to_user_created_idx
  on public.lead_assignment_logs (to_user_id, created_at desc);

alter table public.store_team_routing_state enable row level security;
alter table public.lead_assignment_logs enable row level security;

create or replace function private.can_manage_store(p_store_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, private
as $$
  select coalesce(public.is_master(), false)
    or (
      coalesce(public.current_app_role(), '') = 'store'
      and public.current_app_store_id() = p_store_id
    );
$$;

create or replace function private.can_access_lead(p_lead_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, private
as $$
  select exists (
    select 1
    from public.leads l
    where l.id = p_lead_id
      and (
        coalesce(public.is_master(), false)
        or (
          public.current_app_role() = 'store'
          and l.assigned_store_id = public.current_app_store_id()
        )
        or (
          public.current_app_role() = 'pre_sales'
          and l.assigned_store_id = public.current_app_store_id()
          and (
            l.pre_sales_user_id = public.current_app_user_id()
            or l.assigned_user_id = public.current_app_user_id()
          )
        )
        or (
          public.current_app_role() = 'seller'
          and l.assigned_store_id = public.current_app_store_id()
          and (
            l.seller_user_id = public.current_app_user_id()
            or l.assigned_user_id = public.current_app_user_id()
          )
        )
        or (
          public.current_app_role() = 'prospector'
          and l.assigned_store_id = public.current_app_store_id()
          and (
            l.captured_by_user_id = public.current_app_user_id()
            or l.assigned_user_id = public.current_app_user_id()
          )
        )
      )
  );
$$;

create or replace function private.is_own_prospector(p_prospector_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, private
as $$
  select exists (
    select 1
    from public.prospectors p
    where p.id = p_prospector_id
      and p.user_id = public.current_app_user_id()
  );
$$;

revoke all on function private.can_manage_store(uuid) from public, anon;
revoke all on function private.can_access_lead(uuid) from public, anon;
revoke all on function private.is_own_prospector(uuid) from public, anon;
grant execute on function private.can_manage_store(uuid) to authenticated, service_role;
grant execute on function private.can_access_lead(uuid) to authenticated, service_role;
grant execute on function private.is_own_prospector(uuid) to authenticated, service_role;

create or replace function public.validate_lead_team_assignment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_store_id uuid;
  v_status text;
  v_changed boolean;
  v_assignment_changed boolean := false;
begin
  if tg_op = 'UPDATE' then
    v_assignment_changed :=
      new.captured_by_user_id is distinct from old.captured_by_user_id
      or new.pre_sales_user_id is distinct from old.pre_sales_user_id
      or new.seller_user_id is distinct from old.seller_user_id
      or new.assigned_user_id is distinct from old.assigned_user_id
      or new.assigned_user_role is distinct from old.assigned_user_role
      or new.assigned_store_id is distinct from old.assigned_store_id;

    if v_assignment_changed
       and coalesce(auth.role(), '') <> 'service_role'
       and not coalesce(public.is_master(), false)
       and not (
         public.current_app_role() = 'store'
         and public.current_app_store_id() = new.assigned_store_id
       ) then
      raise exception 'Somente o gestor da loja pode alterar a atribuição do lead.';
    end if;
  end if;

  if new.assigned_store_id is null and (
    new.captured_by_user_id is not null
    or new.pre_sales_user_id is not null
    or new.seller_user_id is not null
    or new.assigned_user_id is not null
  ) then
    raise exception 'Não é possível atribuir colaborador sem loja responsável.';
  end if;

  if new.captured_by_user_id is not null then
    select u.role, u.store_id, u.status into v_role, v_store_id, v_status
    from public.users u where u.id = new.captured_by_user_id;
    if not found or v_role <> 'prospector' or v_store_id is distinct from new.assigned_store_id then
      raise exception 'Prospectador inválido para esta loja.';
    end if;
    v_changed := tg_op = 'INSERT';
    if tg_op = 'UPDATE' then
      v_changed := new.captured_by_user_id is distinct from old.captured_by_user_id;
    end if;
    if v_changed and v_status <> 'active' then
      raise exception 'O prospectador selecionado não está ativo.';
    end if;
  end if;

  if new.pre_sales_user_id is not null then
    select u.role, u.store_id, u.status into v_role, v_store_id, v_status
    from public.users u where u.id = new.pre_sales_user_id;
    if not found or v_role <> 'pre_sales' or v_store_id is distinct from new.assigned_store_id then
      raise exception 'Pré-vendas inválido para esta loja.';
    end if;
    v_changed := tg_op = 'INSERT';
    if tg_op = 'UPDATE' then
      v_changed := new.pre_sales_user_id is distinct from old.pre_sales_user_id;
    end if;
    if v_changed and v_status <> 'active' then
      raise exception 'O pré-vendas selecionado não está ativo.';
    end if;
  end if;

  if new.seller_user_id is not null then
    select u.role, u.store_id, u.status into v_role, v_store_id, v_status
    from public.users u where u.id = new.seller_user_id;
    if not found or v_role <> 'seller' or v_store_id is distinct from new.assigned_store_id then
      raise exception 'Vendedor inválido para esta loja.';
    end if;
    v_changed := tg_op = 'INSERT';
    if tg_op = 'UPDATE' then
      v_changed := new.seller_user_id is distinct from old.seller_user_id;
    end if;
    if v_changed and v_status <> 'active' then
      raise exception 'O vendedor selecionado não está ativo.';
    end if;
  end if;

  if (new.assigned_user_id is null) is distinct from (new.assigned_user_role is null) then
    raise exception 'Responsável e cargo da atribuição devem ser informados juntos.';
  end if;

  if new.assigned_user_id is not null then
    select u.role, u.store_id, u.status into v_role, v_store_id, v_status
    from public.users u where u.id = new.assigned_user_id;
    if not found
       or v_role <> new.assigned_user_role
       or v_store_id is distinct from new.assigned_store_id then
      raise exception 'Responsável atual inválido para esta loja ou cargo.';
    end if;

    if new.assigned_user_role = 'pre_sales' and new.assigned_user_id is distinct from new.pre_sales_user_id then
      raise exception 'O responsável atual deve ser o pré-vendas informado.';
    elsif new.assigned_user_role = 'seller' and new.assigned_user_id is distinct from new.seller_user_id then
      raise exception 'O responsável atual deve ser o vendedor informado.';
    elsif new.assigned_user_role = 'prospector' and new.assigned_user_id is distinct from new.captured_by_user_id then
      raise exception 'O responsável atual deve ser o prospectador informado.';
    end if;

    v_changed := tg_op = 'INSERT';
    if tg_op = 'UPDATE' then
      v_changed := new.assigned_user_id is distinct from old.assigned_user_id;
    end if;
    if v_changed and v_status <> 'active' then
      raise exception 'O responsável selecionado não está ativo.';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.validate_lead_team_assignment() from public, anon, authenticated;

drop trigger if exists trg_validate_lead_team_assignment on public.leads;
create trigger trg_validate_lead_team_assignment
before insert or update on public.leads
for each row execute function public.validate_lead_team_assignment();

create or replace function public.assign_lead_to_store_team(
  p_lead_id uuid,
  p_role text,
  p_requested_user_id uuid default null,
  p_assignment_mode text default 'round_robin',
  p_assigned_by_user_id uuid default null,
  p_notes text default null
)
returns table(
  lead_id uuid,
  store_id uuid,
  user_id uuid,
  user_name text,
  assigned_role text,
  assignment_mode text,
  route_position integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead public.leads%rowtype;
  v_selected_user_id uuid;
  v_selected_user_name text;
  v_previous_user_id uuid;
  v_last_user_id uuid;
  v_total integer;
  v_last_position integer;
  v_next_position integer;
  v_mode text;
  v_actor_name text;
  v_store_name text;
begin
  v_mode := lower(coalesce(nullif(trim(p_assignment_mode), ''), 'round_robin'));

  if p_role not in ('pre_sales','seller') then
    raise exception 'Cargo de distribuição inválido.';
  end if;

  if v_mode not in ('round_robin','manual','system') then
    raise exception 'Modo de distribuição inválido.';
  end if;

  select l.* into v_lead
  from public.leads l
  where l.id = p_lead_id
  for update;

  if not found then
    raise exception 'Lead não encontrado.';
  end if;

  if v_lead.assigned_store_id is null then
    raise exception 'Lead sem loja responsável.';
  end if;

  if p_requested_user_id is not null then
    select u.id, u.full_name
      into v_selected_user_id, v_selected_user_name
    from public.users u
    where u.id = p_requested_user_id
      and u.store_id = v_lead.assigned_store_id
      and u.role = p_role
      and u.status = 'active';

    if not found then
      raise exception 'Colaborador solicitado não está ativo, não pertence à loja ou possui cargo diferente.';
    end if;

    if v_mode = 'round_robin' then
      v_mode := 'manual';
    end if;
  else
    insert into public.store_team_routing_state (store_id, role, last_position)
    values (v_lead.assigned_store_id, p_role, -1)
    on conflict (store_id, role) do nothing;

    select s.last_user_id
      into v_last_user_id
    from public.store_team_routing_state s
    where s.store_id = v_lead.assigned_store_id
      and s.role = p_role
    for update;

    with eligible as (
      select
        u.id,
        row_number() over (order by u.routing_order asc, u.full_name asc, u.id asc)::integer - 1 as route_position
      from public.users u
      where u.store_id = v_lead.assigned_store_id
        and u.role = p_role
        and u.status = 'active'
        and u.receives_leads = true
        and (
          u.max_open_leads is null
          or (
            select count(*)
            from public.leads open_lead
            where open_lead.assigned_user_id = u.id
              and open_lead.status not in ('sale_confirmed','lost')
          ) < u.max_open_leads
        )
    )
    select count(*) into v_total from eligible;

    if v_total = 0 then
      return;
    end if;

    with eligible as (
      select
        u.id,
        row_number() over (order by u.routing_order asc, u.full_name asc, u.id asc)::integer - 1 as route_position
      from public.users u
      where u.store_id = v_lead.assigned_store_id
        and u.role = p_role
        and u.status = 'active'
        and u.receives_leads = true
        and (
          u.max_open_leads is null
          or (
            select count(*)
            from public.leads open_lead
            where open_lead.assigned_user_id = u.id
              and open_lead.status not in ('sale_confirmed','lost')
          ) < u.max_open_leads
        )
    )
    select e.route_position into v_last_position
    from eligible e
    where e.id = v_last_user_id;

    if v_last_position is null then
      v_next_position := 0;
    else
      v_next_position := (v_last_position + 1) % v_total;
    end if;

    with eligible as (
      select
        u.id,
        u.full_name,
        row_number() over (order by u.routing_order asc, u.full_name asc, u.id asc)::integer - 1 as route_position
      from public.users u
      where u.store_id = v_lead.assigned_store_id
        and u.role = p_role
        and u.status = 'active'
        and u.receives_leads = true
        and (
          u.max_open_leads is null
          or (
            select count(*)
            from public.leads open_lead
            where open_lead.assigned_user_id = u.id
              and open_lead.status not in ('sale_confirmed','lost')
          ) < u.max_open_leads
        )
    )
    select e.id, e.full_name
      into v_selected_user_id, v_selected_user_name
    from eligible e
    where e.route_position = v_next_position;

    update public.store_team_routing_state s
    set last_user_id = v_selected_user_id,
        last_position = v_next_position,
        last_routed_at = now(),
        updated_at = now()
    where s.store_id = v_lead.assigned_store_id
      and s.role = p_role;
  end if;

  if p_role = 'pre_sales' then
    v_previous_user_id := v_lead.pre_sales_user_id;

    update public.leads l
    set pre_sales_user_id = v_selected_user_id,
        pre_sales_assigned_at = now(),
        assigned_user_id = v_selected_user_id,
        assigned_user_role = 'pre_sales',
        assigned_user_at = now(),
        assignment_source = v_mode,
        updated_at = now()
    where l.id = v_lead.id;
  else
    v_previous_user_id := v_lead.seller_user_id;

    update public.leads l
    set seller_user_id = v_selected_user_id,
        seller_assigned_at = now(),
        assigned_user_id = v_selected_user_id,
        assigned_user_role = 'seller',
        assigned_user_at = now(),
        assignment_source = v_mode,
        updated_at = now()
    where l.id = v_lead.id;
  end if;

  update public.leads_base lb
  set assigned_consultant_id = v_selected_user_id,
      updated_at = now()
  where lb.routed_lead_id = v_lead.id;

  insert into public.lead_assignment_logs (
    lead_id,
    store_id,
    assignment_role,
    from_user_id,
    to_user_id,
    assignment_mode,
    assigned_by_user_id,
    notes,
    metadata
  ) values (
    v_lead.id,
    v_lead.assigned_store_id,
    p_role,
    v_previous_user_id,
    v_selected_user_id,
    v_mode,
    p_assigned_by_user_id,
    p_notes,
    jsonb_build_object('route_position', v_next_position)
  );

  select u.full_name into v_actor_name
  from public.users u where u.id = p_assigned_by_user_id;

  select s.store_name into v_store_name
  from public.stores s where s.id = v_lead.assigned_store_id;

  insert into public.lead_activity_logs (
    lead_id,
    store_id,
    store_name,
    user_id,
    user_name,
    activity_type,
    activity_label,
    from_status,
    to_status,
    customer_name,
    customer_phone,
    vehicle_name,
    notes,
    metadata
  ) values (
    v_lead.id,
    v_lead.assigned_store_id,
    v_store_name,
    p_assigned_by_user_id,
    v_actor_name,
    case when p_role = 'pre_sales' then 'lead_assigned_pre_sales' else 'lead_assigned_seller' end,
    case when p_role = 'pre_sales' then 'Lead distribuído para pré-vendas' else 'Lead direcionado para vendedor' end,
    v_lead.status,
    v_lead.status,
    v_lead.customer_name,
    v_lead.customer_phone,
    v_lead.interested_vehicle,
    coalesce(p_notes, 'Responsável: ' || v_selected_user_name),
    jsonb_build_object(
      'assigned_user_id', v_selected_user_id,
      'assigned_user_name', v_selected_user_name,
      'assigned_role', p_role,
      'assignment_mode', v_mode,
      'route_position', v_next_position
    )
  );

  return query
  select
    v_lead.id,
    v_lead.assigned_store_id,
    v_selected_user_id,
    v_selected_user_name,
    p_role,
    v_mode,
    v_next_position;
end;
$$;

revoke all on function public.assign_lead_to_store_team(uuid,text,uuid,text,uuid,text) from public, anon, authenticated;
grant execute on function public.assign_lead_to_store_team(uuid,text,uuid,text,uuid,text) to service_role;

-- Usuários: Master vê tudo; demais veem a si mesmos e a equipe da própria loja.
drop policy if exists secure_users_select on public.users;
create policy secure_users_select
on public.users for select to authenticated
using (
  public.is_master()
  or auth_user_id = auth.uid()
  or lower(email::text) = lower(coalesce(auth.jwt() ->> 'email', ''))
  or (
    store_id = public.current_app_store_id()
    and public.current_app_role() in ('store','pre_sales','seller','prospector')
  )
);

-- Leads: acesso por loja para gestor e por responsabilidade individual para a equipe.
drop policy if exists secure_leads_select on public.leads;
drop policy if exists secure_leads_insert on public.leads;
drop policy if exists secure_leads_update on public.leads;
drop policy if exists secure_leads_delete_master on public.leads;

create policy secure_leads_select
on public.leads for select to authenticated
using (private.can_access_lead(id));

create policy secure_leads_insert
on public.leads for insert to authenticated
with check (
  public.is_master()
  or (
    public.current_app_role() = 'store'
    and assigned_store_id = public.current_app_store_id()
  )
  or (
    public.current_app_role() = 'prospector'
    and assigned_store_id = public.current_app_store_id()
    and captured_by_user_id = public.current_app_user_id()
    and (assigned_user_id is null or assigned_user_id = public.current_app_user_id())
  )
);

create policy secure_leads_update
on public.leads for update to authenticated
using (private.can_access_lead(id))
with check (
  public.is_master()
  or (
    public.current_app_role() = 'store'
    and assigned_store_id = public.current_app_store_id()
  )
  or (
    public.current_app_role() = 'pre_sales'
    and assigned_store_id = public.current_app_store_id()
    and (pre_sales_user_id = public.current_app_user_id() or assigned_user_id = public.current_app_user_id())
  )
  or (
    public.current_app_role() = 'seller'
    and assigned_store_id = public.current_app_store_id()
    and (seller_user_id = public.current_app_user_id() or assigned_user_id = public.current_app_user_id())
  )
  or (
    public.current_app_role() = 'prospector'
    and assigned_store_id = public.current_app_store_id()
    and (captured_by_user_id = public.current_app_user_id() or assigned_user_id = public.current_app_user_id())
  )
);

create policy secure_leads_delete_manager
on public.leads for delete to authenticated
using (public.is_master() or private.can_manage_store(assigned_store_id));

-- Base central: somente Master lê ou altera. A política pública de captação permanece.
drop policy if exists "Authenticated can read leads" on public.leads_base;
drop policy if exists "Authenticated can update leads" on public.leads_base;
create policy leads_base_master_select
on public.leads_base for select to authenticated
using (public.is_master());
create policy leads_base_master_update
on public.leads_base for update to authenticated
using (public.is_master())
with check (public.is_master());

-- Histórico e atividades seguem a mesma visibilidade do lead.
drop policy if exists secure_lead_activities_select on public.lead_activities;
drop policy if exists secure_lead_activities_insert on public.lead_activities;
create policy secure_lead_activities_select
on public.lead_activities for select to authenticated
using (private.can_access_lead(lead_id));
create policy secure_lead_activities_insert
on public.lead_activities for insert to authenticated
with check (private.can_access_lead(lead_id));

drop policy if exists lead_activity_logs_select_master_or_store on public.lead_activity_logs;
create policy lead_activity_logs_select_by_lead_access
on public.lead_activity_logs for select to authenticated
using (
  public.is_master()
  or private.can_manage_store(store_id)
  or (lead_id is not null and private.can_access_lead(lead_id))
);

-- Estado do rodízio e histórico de atribuições.
drop policy if exists store_team_routing_state_select_manager on public.store_team_routing_state;
drop policy if exists store_team_routing_state_service_all on public.store_team_routing_state;
create policy store_team_routing_state_select_manager
on public.store_team_routing_state for select to authenticated
using (private.can_manage_store(store_id));
create policy store_team_routing_state_service_all
on public.store_team_routing_state for all to service_role
using (true) with check (true);

drop policy if exists lead_assignment_logs_select on public.lead_assignment_logs;
drop policy if exists lead_assignment_logs_service_all on public.lead_assignment_logs;
create policy lead_assignment_logs_select
on public.lead_assignment_logs for select to authenticated
using (
  private.can_manage_store(store_id)
  or private.can_access_lead(lead_id)
);
create policy lead_assignment_logs_service_all
on public.lead_assignment_logs for all to service_role
using (true) with check (true);

-- Agenda individual e da loja.
drop policy if exists secure_appointments_select on public.appointments;
drop policy if exists secure_appointments_insert on public.appointments;
drop policy if exists secure_appointments_update on public.appointments;
drop policy if exists secure_appointments_delete_master on public.appointments;
create policy secure_appointments_select
on public.appointments for select to authenticated
using (
  public.is_master()
  or private.can_manage_store(store_id)
  or (
    store_id = public.current_app_store_id()
    and (
      scheduled_by = public.current_app_user_id()
      or (lead_id is not null and private.can_access_lead(lead_id))
    )
  )
);
create policy secure_appointments_insert
on public.appointments for insert to authenticated
with check (
  public.is_master()
  or private.can_manage_store(store_id)
  or (
    store_id = public.current_app_store_id()
    and (
      scheduled_by = public.current_app_user_id()
      or (lead_id is not null and private.can_access_lead(lead_id))
    )
  )
);
create policy secure_appointments_update
on public.appointments for update to authenticated
using (
  public.is_master()
  or private.can_manage_store(store_id)
  or scheduled_by = public.current_app_user_id()
  or (lead_id is not null and private.can_access_lead(lead_id))
)
with check (
  public.is_master()
  or private.can_manage_store(store_id)
  or (
    store_id = public.current_app_store_id()
    and (
      scheduled_by = public.current_app_user_id()
      or (lead_id is not null and private.can_access_lead(lead_id))
    )
  )
);
create policy secure_appointments_delete
on public.appointments for delete to authenticated
using (
  public.is_master()
  or private.can_manage_store(store_id)
  or scheduled_by = public.current_app_user_id()
);

drop policy if exists store_calendar_tasks_select on public.store_calendar_tasks;
drop policy if exists store_calendar_tasks_insert on public.store_calendar_tasks;
drop policy if exists store_calendar_tasks_update on public.store_calendar_tasks;
drop policy if exists store_calendar_tasks_delete on public.store_calendar_tasks;
create policy store_calendar_tasks_select
on public.store_calendar_tasks for select to authenticated
using (
  public.is_master()
  or private.can_manage_store(store_id)
  or created_by = public.current_app_user_id()
  or (lead_id is not null and private.can_access_lead(lead_id))
);
create policy store_calendar_tasks_insert
on public.store_calendar_tasks for insert to authenticated
with check (
  public.is_master()
  or private.can_manage_store(store_id)
  or (
    store_id = public.current_app_store_id()
    and (
      created_by = public.current_app_user_id()
      or (lead_id is not null and private.can_access_lead(lead_id))
    )
  )
);
create policy store_calendar_tasks_update
on public.store_calendar_tasks for update to authenticated
using (
  public.is_master()
  or private.can_manage_store(store_id)
  or created_by = public.current_app_user_id()
  or (lead_id is not null and private.can_access_lead(lead_id))
)
with check (
  public.is_master()
  or private.can_manage_store(store_id)
  or (
    store_id = public.current_app_store_id()
    and (
      created_by = public.current_app_user_id()
      or (lead_id is not null and private.can_access_lead(lead_id))
    )
  )
);
create policy store_calendar_tasks_delete
on public.store_calendar_tasks for delete to authenticated
using (
  public.is_master()
  or private.can_manage_store(store_id)
  or created_by = public.current_app_user_id()
);

-- Loja, evento e estoque ficam limitados à própria loja para a equipe.
drop policy if exists secure_stores_select on public.stores;
create policy secure_stores_select
on public.stores for select to authenticated
using (public.is_master() or id = public.current_app_store_id());

drop policy if exists secure_events_select on public.events;
drop policy if exists authenticated_delete_events on public.events;
create policy secure_events_select
on public.events for select to authenticated
using (
  public.is_master()
  or exists (
    select 1 from public.stores s
    where s.event_id = events.id
      and s.id = public.current_app_store_id()
  )
);

drop policy if exists secure_inventory_select on public.inventory;
drop policy if exists secure_inventory_insert on public.inventory;
drop policy if exists secure_inventory_update on public.inventory;
drop policy if exists secure_inventory_delete_master on public.inventory;
create policy secure_inventory_select
on public.inventory for select to authenticated
using (public.is_master() or store_id = public.current_app_store_id());
create policy secure_inventory_insert
on public.inventory for insert to authenticated
with check (public.is_master() or private.can_manage_store(store_id));
create policy secure_inventory_update
on public.inventory for update to authenticated
using (public.is_master() or private.can_manage_store(store_id))
with check (public.is_master() or private.can_manage_store(store_id));
create policy secure_inventory_delete
on public.inventory for delete to authenticated
using (public.is_master() or private.can_manage_store(store_id));

-- Vendas e perdas somente da própria carteira, exceto gestor da loja e Master.
drop policy if exists secure_sales_select on public.sales;
drop policy if exists secure_sales_insert on public.sales;
drop policy if exists secure_sales_update on public.sales;
drop policy if exists secure_sales_delete_master on public.sales;
create policy secure_sales_select
on public.sales for select to authenticated
using (
  public.is_master()
  or private.can_manage_store(store_id)
  or (lead_id is not null and private.can_access_lead(lead_id))
);
create policy secure_sales_insert
on public.sales for insert to authenticated
with check (
  public.is_master()
  or private.can_manage_store(store_id)
  or (
    store_id = public.current_app_store_id()
    and lead_id is not null
    and private.can_access_lead(lead_id)
  )
);
create policy secure_sales_update
on public.sales for update to authenticated
using (
  public.is_master()
  or private.can_manage_store(store_id)
  or (lead_id is not null and private.can_access_lead(lead_id))
)
with check (
  public.is_master()
  or private.can_manage_store(store_id)
  or (
    store_id = public.current_app_store_id()
    and lead_id is not null
    and private.can_access_lead(lead_id)
  )
);
create policy secure_sales_delete
on public.sales for delete to authenticated
using (public.is_master() or private.can_manage_store(store_id));

drop policy if exists secure_losses_select on public.losses;
drop policy if exists secure_losses_insert on public.losses;
drop policy if exists secure_losses_update on public.losses;
drop policy if exists secure_losses_delete_master on public.losses;
create policy secure_losses_select
on public.losses for select to authenticated
using (
  public.is_master()
  or private.can_manage_store(store_id)
  or (lead_id is not null and private.can_access_lead(lead_id))
);
create policy secure_losses_insert
on public.losses for insert to authenticated
with check (
  public.is_master()
  or private.can_manage_store(store_id)
  or (
    store_id = public.current_app_store_id()
    and lead_id is not null
    and private.can_access_lead(lead_id)
  )
);
create policy secure_losses_update
on public.losses for update to authenticated
using (
  public.is_master()
  or private.can_manage_store(store_id)
  or (lead_id is not null and private.can_access_lead(lead_id))
)
with check (
  public.is_master()
  or private.can_manage_store(store_id)
  or (
    store_id = public.current_app_store_id()
    and lead_id is not null
    and private.can_access_lead(lead_id)
  )
);
create policy secure_losses_delete
on public.losses for delete to authenticated
using (public.is_master() or private.can_manage_store(store_id));

-- Captações e cadastro legado de prospectadores também ficam vinculados à loja.
drop policy if exists secure_prospectors_select on public.prospectors;
drop policy if exists secure_prospectors_insert_master on public.prospectors;
drop policy if exists secure_prospectors_update_master on public.prospectors;
drop policy if exists secure_prospectors_delete_master on public.prospectors;
create policy secure_prospectors_select
on public.prospectors for select to authenticated
using (
  public.is_master()
  or user_id = public.current_app_user_id()
  or private.can_manage_store(store_id)
);
create policy secure_prospectors_insert
on public.prospectors for insert to authenticated
with check (
  public.is_master()
  or private.can_manage_store(store_id)
  or (
    public.current_app_role() = 'prospector'
    and user_id = public.current_app_user_id()
    and store_id = public.current_app_store_id()
  )
);
create policy secure_prospectors_update
on public.prospectors for update to authenticated
using (
  public.is_master()
  or user_id = public.current_app_user_id()
  or private.can_manage_store(store_id)
)
with check (
  public.is_master()
  or private.can_manage_store(store_id)
  or (
    public.current_app_role() = 'prospector'
    and user_id = public.current_app_user_id()
    and store_id = public.current_app_store_id()
  )
);
create policy secure_prospectors_delete
on public.prospectors for delete to authenticated
using (public.is_master() or private.can_manage_store(store_id));

drop policy if exists secure_street_surveys_select on public.street_surveys;
drop policy if exists secure_street_surveys_insert on public.street_surveys;
drop policy if exists secure_street_surveys_update on public.street_surveys;
drop policy if exists secure_street_surveys_delete_master on public.street_surveys;
create policy secure_street_surveys_select
on public.street_surveys for select to authenticated
using (
  public.is_master()
  or private.can_manage_store(assigned_store_id)
  or private.is_own_prospector(prospector_id)
  or (lead_id is not null and private.can_access_lead(lead_id))
);
create policy secure_street_surveys_insert
on public.street_surveys for insert to authenticated
with check (
  public.is_master()
  or private.can_manage_store(assigned_store_id)
  or (
    public.current_app_role() = 'prospector'
    and private.is_own_prospector(prospector_id)
    and (assigned_store_id is null or assigned_store_id = public.current_app_store_id())
  )
);
create policy secure_street_surveys_update
on public.street_surveys for update to authenticated
using (
  public.is_master()
  or private.can_manage_store(assigned_store_id)
  or private.is_own_prospector(prospector_id)
  or (lead_id is not null and private.can_access_lead(lead_id))
)
with check (
  public.is_master()
  or private.can_manage_store(assigned_store_id)
  or (
    public.current_app_role() = 'prospector'
    and private.is_own_prospector(prospector_id)
    and (assigned_store_id is null or assigned_store_id = public.current_app_store_id())
  )
  or (lead_id is not null and private.can_access_lead(lead_id))
);
create policy secure_street_surveys_delete
on public.street_surveys for delete to authenticated
using (
  public.is_master()
  or private.can_manage_store(assigned_store_id)
  or private.is_own_prospector(prospector_id)
);

-- ==========================================================================
-- SOURCE: remote_history/20260725035516_optimize_store_team_routing_security_policies.sql
-- ==========================================================================

create index if not exists lead_assignment_logs_from_user_idx
  on public.lead_assignment_logs (from_user_id);
create index if not exists lead_assignment_logs_assigned_by_user_idx
  on public.lead_assignment_logs (assigned_by_user_id);
create index if not exists store_team_routing_state_last_user_idx
  on public.store_team_routing_state (last_user_id);
create index if not exists prospectors_user_id_idx
  on public.prospectors (user_id);

-- Evita que a política de serviço seja considerada permissiva para todos os papéis.
drop policy if exists lead_activity_logs_service_role_all on public.lead_activity_logs;
create policy lead_activity_logs_service_role_all
on public.lead_activity_logs for all to service_role
using (true) with check (true);

-- Avalia os dados de autenticação uma única vez por consulta.
drop policy if exists secure_users_select on public.users;
create policy secure_users_select
on public.users for select to authenticated
using (
  public.is_master()
  or auth_user_id = (select auth.uid())
  or lower(email::text) = lower(coalesce((select auth.jwt() ->> 'email'), ''))
  or (
    store_id = public.current_app_store_id()
    and public.current_app_role() in ('store','pre_sales','seller','prospector')
  )
);

-- ==========================================================================
-- SOURCE: remote_history/20260725120046_add_store_team_registration_links.sql
-- ==========================================================================

create table if not exists public.store_team_registration_links (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  role text not null check (role in ('pre_sales', 'seller', 'prospector')),
  token text not null unique,
  status text not null default 'active' check (status in ('active', 'revoked', 'expired')),
  expires_at timestamptz,
  max_uses integer check (max_uses is null or max_uses > 0),
  usage_count integer not null default 0 check (usage_count >= 0),
  created_by_user_id uuid references public.users(id) on delete set null,
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists store_team_registration_links_one_active_role_idx
  on public.store_team_registration_links(store_id, role)
  where status = 'active';

create index if not exists store_team_registration_links_store_created_idx
  on public.store_team_registration_links(store_id, created_at desc);

create index if not exists store_team_registration_links_token_idx
  on public.store_team_registration_links(token);

alter table public.store_team_registration_links enable row level security;

drop policy if exists store_team_registration_links_service_role_all on public.store_team_registration_links;
create policy store_team_registration_links_service_role_all
  on public.store_team_registration_links
  for all
  to service_role
  using (true)
  with check (true);

revoke all on table public.store_team_registration_links from anon, authenticated;
grant all on table public.store_team_registration_links to service_role;

comment on table public.store_team_registration_links is 'Links privados e revogáveis para cadastro de colaboradores vinculados a uma loja e cargo.';
comment on column public.store_team_registration_links.token is 'Token secreto utilizado somente pelas APIs de cadastro de equipe.';

-- ==========================================================================
-- SOURCE: remote_history/20260725124440_add_store_team_registration_links.sql
-- ==========================================================================

create table if not exists public.store_team_registration_links (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  role text not null check (role in ('pre_sales','seller','prospector')),
  token_hash text not null unique,
  status text not null default 'active' check (status in ('active','revoked','expired')),
  expires_at timestamptz,
  max_uses integer not null default 50 check (max_uses > 0),
  use_count integer not null default 0 check (use_count >= 0),
  created_by_user_id uuid references public.users(id) on delete set null,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists store_team_registration_links_store_role_idx
  on public.store_team_registration_links(store_id, role, status, created_at desc);
create index if not exists store_team_registration_links_created_by_idx
  on public.store_team_registration_links(created_by_user_id);

alter table public.store_team_registration_links enable row level security;

drop policy if exists store_team_registration_links_select_manager on public.store_team_registration_links;
create policy store_team_registration_links_select_manager
on public.store_team_registration_links
for select
to authenticated
using (private.can_manage_store(store_id));

drop policy if exists store_team_registration_links_service_role_all on public.store_team_registration_links;
create policy store_team_registration_links_service_role_all
on public.store_team_registration_links
for all
to service_role
using (true)
with check (true);

create or replace function public.touch_store_team_registration_links_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_touch_store_team_registration_links_updated_at on public.store_team_registration_links;
create trigger trg_touch_store_team_registration_links_updated_at
before update on public.store_team_registration_links
for each row execute function public.touch_store_team_registration_links_updated_at();

revoke all on public.store_team_registration_links from anon, authenticated;
grant select on public.store_team_registration_links to authenticated;
grant all on public.store_team_registration_links to service_role;

-- ==========================================================================
-- SOURCE: remote_history/20260725190419_add_pipeline_vehicle_interest_and_lead_notes.sql
-- ==========================================================================

alter table public.leads
  add column if not exists interested_vehicle_id uuid null references public.site_vehicles(id) on delete set null,
  add column if not exists interested_vehicle_price numeric(14,2) null;

alter table public.leads
  drop constraint if exists leads_interested_vehicle_price_nonnegative;

alter table public.leads
  add constraint leads_interested_vehicle_price_nonnegative
  check (interested_vehicle_price is null or interested_vehicle_price >= 0);

create index if not exists idx_leads_interested_vehicle_id
  on public.leads(interested_vehicle_id);

create table if not exists public.lead_notes (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  author_user_id uuid null references public.users(id) on delete set null,
  author_name text null,
  note_type text not null default 'service',
  content text not null,
  created_at timestamptz not null default now(),
  constraint lead_notes_type_check check (note_type in ('general','service','appointment')),
  constraint lead_notes_content_check check (char_length(trim(content)) > 0)
);

create index if not exists idx_lead_notes_lead_created
  on public.lead_notes(lead_id, created_at desc);

create index if not exists idx_lead_notes_store_created
  on public.lead_notes(store_id, created_at desc);

alter table public.lead_notes enable row level security;

revoke all on table public.lead_notes from anon, authenticated;
grant all on table public.lead_notes to service_role;

comment on column public.leads.interested_vehicle_id is 'Veículo selecionado no estoque da loja no momento do atendimento.';
comment on column public.leads.interested_vehicle_price is 'Preço do veículo capturado no momento da seleção, preservado como fotografia comercial.';
comment on table public.lead_notes is 'Histórico imutável de observações comerciais registradas no atendimento do lead.';

-- ==========================================================================
-- SOURCE: remote_history/20260725193736_track_phone_views_on_leads.sql
-- ==========================================================================

alter table public.leads
  add column if not exists first_phone_viewed_at timestamptz,
  add column if not exists first_phone_viewed_by_user_id uuid,
  add column if not exists first_phone_viewed_by_name text,
  add column if not exists last_phone_viewed_at timestamptz,
  add column if not exists last_phone_viewed_by_user_id uuid,
  add column if not exists last_phone_viewed_by_name text;

create index if not exists idx_leads_first_phone_viewed_at
  on public.leads(first_phone_viewed_at);

comment on column public.leads.first_phone_viewed_at is 'Primeira vez em que um usuário autorizado revelou o telefone do lead no pipeline.';
comment on column public.leads.last_phone_viewed_at is 'Última vez em que um usuário autorizado revelou o telefone do lead no pipeline.';

-- ==========================================================================
-- SOURCE: remote_history/20260725224551_enable_realtime_store_calendar_tasks.sql
-- ==========================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'store_calendar_tasks'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.store_calendar_tasks;
  END IF;
END
$$;

ALTER TABLE public.store_calendar_tasks REPLICA IDENTITY FULL;

-- ==========================================================================
-- SOURCE: remote_history/20260726123632_complete_store_sale_confirmation_flow.sql
-- ==========================================================================

alter table public.sales add column if not exists seller_user_id uuid;
alter table public.sales add column if not exists pre_sales_user_id uuid;
alter table public.sales add column if not exists captured_by_user_id uuid;
alter table public.sales add column if not exists has_trade_in boolean;
alter table public.sales add column if not exists sale_vehicle_name varchar(300);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'sales_seller_user_id_fkey') then
    alter table public.sales add constraint sales_seller_user_id_fkey foreign key (seller_user_id) references public.users(id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'sales_pre_sales_user_id_fkey') then
    alter table public.sales add constraint sales_pre_sales_user_id_fkey foreign key (pre_sales_user_id) references public.users(id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'sales_captured_by_user_id_fkey') then
    alter table public.sales add constraint sales_captured_by_user_id_fkey foreign key (captured_by_user_id) references public.users(id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'sales_lead_id_key') then
    alter table public.sales add constraint sales_lead_id_key unique (lead_id);
  end if;
end $$;

create index if not exists idx_sales_store_confirmed_at on public.sales(store_id, confirmed_at desc);
create index if not exists idx_sales_seller_user_id on public.sales(seller_user_id);
create index if not exists idx_sales_pre_sales_user_id on public.sales(pre_sales_user_id);
create index if not exists idx_sales_captured_by_user_id on public.sales(captured_by_user_id);

create or replace function public.confirm_lead_sale_record(
  p_lead_id uuid,
  p_store_id uuid,
  p_seller_user_id uuid,
  p_payment_type text,
  p_financing_bank text,
  p_has_trade_in boolean,
  p_sale_value numeric,
  p_confirmed_by uuid,
  p_actor_name text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead public.leads%rowtype;
  v_seller public.users%rowtype;
  v_sale_id uuid;
  v_now timestamptz := now();
begin
  if p_payment_type not in ('cash', 'financed') then
    raise exception 'Forma de pagamento inválida.';
  end if;

  if p_has_trade_in is null then
    raise exception 'Informe se houve veículo na troca.';
  end if;

  if p_payment_type = 'financed' and nullif(trim(coalesce(p_financing_bank, '')), '') is null then
    raise exception 'Informe o banco do financiamento.';
  end if;

  if p_sale_value is not null and p_sale_value < 0 then
    raise exception 'O valor da venda não pode ser negativo.';
  end if;

  select * into v_lead
  from public.leads
  where id = p_lead_id and assigned_store_id = p_store_id
  for update;

  if not found then
    raise exception 'Lead não encontrado nesta loja.';
  end if;

  select * into v_seller
  from public.users
  where id = p_seller_user_id
    and role = 'seller'
    and status = 'active'
    and store_id = p_store_id;

  if not found then
    raise exception 'Vendedor ativo não encontrado nesta loja.';
  end if;

  update public.leads
  set status = 'sale_confirmed',
      seller_user_id = v_seller.id,
      seller_assigned_at = v_now,
      assigned_user_id = v_seller.id,
      assigned_user_role = 'seller',
      updated_at = v_now,
      last_activity_at = v_now,
      last_activity_type = 'sale_confirmed',
      last_activity_label = 'Venda confirmada',
      last_activity_by_name = nullif(trim(coalesce(p_actor_name, '')), '')
  where id = v_lead.id;

  insert into public.sales (
    event_id,
    lead_id,
    store_id,
    vehicle_id,
    prospector_id,
    seller_name,
    seller_user_id,
    pre_sales_user_id,
    captured_by_user_id,
    customer_bank,
    financing_bank,
    payment_type,
    sale_value,
    vehicle_category,
    sale_vehicle_name,
    has_trade_in,
    confirmed_by,
    confirmed_at
  ) values (
    v_lead.event_id,
    v_lead.id,
    v_lead.assigned_store_id,
    null,
    v_lead.prospector_id,
    coalesce(nullif(trim(v_seller.full_name), ''), v_seller.email, 'Vendedor não informado'),
    v_seller.id,
    v_lead.pre_sales_user_id,
    v_lead.captured_by_user_id,
    nullif(trim(coalesce(v_lead.customer_bank, '')), ''),
    case when p_payment_type = 'cash' then 'Não se aplica' else trim(p_financing_bank) end,
    p_payment_type,
    p_sale_value,
    v_lead.vehicle_category_interest,
    v_lead.interested_vehicle,
    p_has_trade_in,
    p_confirmed_by,
    v_now
  )
  on conflict (lead_id) do update set
    event_id = excluded.event_id,
    store_id = excluded.store_id,
    prospector_id = excluded.prospector_id,
    seller_name = excluded.seller_name,
    seller_user_id = excluded.seller_user_id,
    pre_sales_user_id = excluded.pre_sales_user_id,
    captured_by_user_id = excluded.captured_by_user_id,
    customer_bank = excluded.customer_bank,
    financing_bank = excluded.financing_bank,
    payment_type = excluded.payment_type,
    sale_value = excluded.sale_value,
    vehicle_category = excluded.vehicle_category,
    sale_vehicle_name = excluded.sale_vehicle_name,
    has_trade_in = excluded.has_trade_in,
    confirmed_by = excluded.confirmed_by,
    confirmed_at = excluded.confirmed_at
  returning id into v_sale_id;

  return v_sale_id;
end;
$$;

revoke all on function public.confirm_lead_sale_record(uuid, uuid, uuid, text, text, boolean, numeric, uuid, text) from public;
grant execute on function public.confirm_lead_sale_record(uuid, uuid, uuid, text, text, boolean, numeric, uuid, text) to service_role;

insert into public.sales (
  event_id,
  lead_id,
  store_id,
  vehicle_id,
  prospector_id,
  seller_name,
  seller_user_id,
  pre_sales_user_id,
  captured_by_user_id,
  customer_bank,
  financing_bank,
  payment_type,
  sale_value,
  vehicle_category,
  sale_vehicle_name,
  has_trade_in,
  confirmed_by,
  confirmed_at
)
select
  l.event_id,
  l.id,
  l.assigned_store_id,
  null,
  l.prospector_id,
  coalesce(nullif(trim(u.full_name), ''), u.email, 'Não informado'),
  l.seller_user_id,
  l.pre_sales_user_id,
  l.captured_by_user_id,
  nullif(trim(coalesce(l.customer_bank, '')), ''),
  'Não informado',
  'not_informed',
  l.interested_vehicle_price,
  l.vehicle_category_interest,
  l.interested_vehicle,
  null,
  null,
  coalesce(l.updated_at, l.created_at, now())
from public.leads l
left join public.users u on u.id = l.seller_user_id
where l.status = 'sale_confirmed'
  and l.assigned_store_id is not null
on conflict (lead_id) do nothing;

-- ==========================================================================
-- SOURCE: remote_history/20260726173230_add_sale_financing_details.sql
-- ==========================================================================

alter table public.sales
  add column if not exists installment_count integer,
  add column if not exists has_down_payment boolean,
  add column if not exists down_payment_value numeric(14,2),
  add column if not exists financed_amount numeric(14,2),
  add column if not exists installment_value numeric(14,2);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'sales_installment_count_check' and conrelid = 'public.sales'::regclass) then
    alter table public.sales add constraint sales_installment_count_check check (installment_count is null or (installment_count between 1 and 120));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'sales_down_payment_value_check' and conrelid = 'public.sales'::regclass) then
    alter table public.sales add constraint sales_down_payment_value_check check (down_payment_value is null or down_payment_value >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'sales_financed_amount_check' and conrelid = 'public.sales'::regclass) then
    alter table public.sales add constraint sales_financed_amount_check check (financed_amount is null or financed_amount >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'sales_installment_value_check' and conrelid = 'public.sales'::regclass) then
    alter table public.sales add constraint sales_installment_value_check check (installment_value is null or installment_value >= 0);
  end if;
end $$;

create or replace function public.confirm_lead_sale_record(
  p_lead_id uuid,
  p_store_id uuid,
  p_seller_user_id uuid,
  p_payment_type text,
  p_financing_bank text,
  p_has_trade_in boolean,
  p_sale_value numeric,
  p_installment_count integer,
  p_has_down_payment boolean,
  p_down_payment_value numeric,
  p_financed_amount numeric,
  p_installment_value numeric,
  p_confirmed_by uuid,
  p_actor_name text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead public.leads%rowtype;
  v_seller public.users%rowtype;
  v_sale_id uuid;
  v_now timestamptz := now();
  v_bank text;
  v_installment_count integer;
  v_has_down_payment boolean;
  v_down_payment_value numeric(14,2);
  v_financed_amount numeric(14,2);
  v_installment_value numeric(14,2);
begin
  if p_payment_type not in ('cash', 'financed', 'consortium', 'other') then
    raise exception 'Forma de pagamento inválida.';
  end if;

  if p_has_trade_in is null then
    raise exception 'Informe se houve veículo na troca.';
  end if;

  if p_sale_value is not null and p_sale_value < 0 then
    raise exception 'O valor da venda não pode ser negativo.';
  end if;

  if p_payment_type = 'financed' and nullif(trim(coalesce(p_financing_bank, '')), '') is null then
    raise exception 'Informe o banco do financiamento.';
  end if;

  if p_payment_type in ('financed', 'consortium') and (p_installment_count is null or p_installment_count < 1 or p_installment_count > 120) then
    raise exception 'Informe uma quantidade de parcelas entre 1 e 120.';
  end if;

  if p_payment_type <> 'cash' and p_has_down_payment is null then
    raise exception 'Informe se houve entrada.';
  end if;

  if coalesce(p_has_down_payment, false) and (p_down_payment_value is null or p_down_payment_value <= 0) then
    raise exception 'Informe um valor de entrada maior que zero.';
  end if;

  if p_sale_value is not null and p_down_payment_value is not null and p_down_payment_value > p_sale_value then
    raise exception 'O valor da entrada não pode ser maior que o valor da venda.';
  end if;

  if p_financed_amount is not null and p_financed_amount < 0 then
    raise exception 'O valor financiado não pode ser negativo.';
  end if;

  if p_installment_value is not null and p_installment_value < 0 then
    raise exception 'O valor da parcela não pode ser negativo.';
  end if;

  select * into v_lead
  from public.leads
  where id = p_lead_id and assigned_store_id = p_store_id
  for update;

  if not found then
    raise exception 'Lead não encontrado nesta loja.';
  end if;

  select * into v_seller
  from public.users
  where id = p_seller_user_id
    and role = 'seller'
    and status = 'active'
    and store_id = p_store_id;

  if not found then
    raise exception 'Vendedor ativo não encontrado nesta loja.';
  end if;

  v_bank := case
    when p_payment_type = 'cash' then 'Não se aplica'
    when p_payment_type = 'financed' then trim(p_financing_bank)
    when p_payment_type = 'consortium' then coalesce(nullif(trim(coalesce(p_financing_bank, '')), ''), 'Consórcio')
    else coalesce(nullif(trim(coalesce(p_financing_bank, '')), ''), 'Outro')
  end;

  v_installment_count := case when p_payment_type = 'cash' then null else p_installment_count end;
  v_has_down_payment := case when p_payment_type = 'cash' then false else p_has_down_payment end;
  v_down_payment_value := case when v_has_down_payment then p_down_payment_value else null end;

  v_financed_amount := case
    when p_payment_type in ('financed', 'consortium') then
      coalesce(
        p_financed_amount,
        case when p_sale_value is not null then greatest(p_sale_value - coalesce(v_down_payment_value, 0), 0) else null end
      )
    else p_financed_amount
  end;

  v_installment_value := coalesce(
    p_installment_value,
    case when v_financed_amount is not null and v_installment_count is not null and v_installment_count > 0
      then round(v_financed_amount / v_installment_count, 2)
      else null
    end
  );

  update public.leads
  set status = 'sale_confirmed',
      seller_user_id = v_seller.id,
      seller_assigned_at = v_now,
      assigned_user_id = v_seller.id,
      assigned_user_role = 'seller',
      updated_at = v_now,
      last_activity_at = v_now,
      last_activity_type = 'sale_confirmed',
      last_activity_label = 'Venda confirmada',
      last_activity_by_name = nullif(trim(coalesce(p_actor_name, '')), '')
  where id = v_lead.id;

  insert into public.sales (
    event_id, lead_id, store_id, vehicle_id, prospector_id,
    seller_name, seller_user_id, pre_sales_user_id, captured_by_user_id,
    customer_bank, financing_bank, payment_type, sale_value, vehicle_category,
    sale_vehicle_name, has_trade_in, installment_count, has_down_payment,
    down_payment_value, financed_amount, installment_value, confirmed_by, confirmed_at
  ) values (
    v_lead.event_id, v_lead.id, v_lead.assigned_store_id, null, v_lead.prospector_id,
    coalesce(nullif(trim(v_seller.full_name), ''), v_seller.email, 'Vendedor não informado'),
    v_seller.id, v_lead.pre_sales_user_id, v_lead.captured_by_user_id,
    nullif(trim(coalesce(v_lead.customer_bank, '')), ''), v_bank, p_payment_type,
    p_sale_value, v_lead.vehicle_category_interest, v_lead.interested_vehicle,
    p_has_trade_in, v_installment_count, v_has_down_payment, v_down_payment_value,
    v_financed_amount, v_installment_value, p_confirmed_by, v_now
  )
  on conflict (lead_id) do update set
    event_id = excluded.event_id,
    store_id = excluded.store_id,
    prospector_id = excluded.prospector_id,
    seller_name = excluded.seller_name,
    seller_user_id = excluded.seller_user_id,
    pre_sales_user_id = excluded.pre_sales_user_id,
    captured_by_user_id = excluded.captured_by_user_id,
    customer_bank = excluded.customer_bank,
    financing_bank = excluded.financing_bank,
    payment_type = excluded.payment_type,
    sale_value = excluded.sale_value,
    vehicle_category = excluded.vehicle_category,
    sale_vehicle_name = excluded.sale_vehicle_name,
    has_trade_in = excluded.has_trade_in,
    installment_count = excluded.installment_count,
    has_down_payment = excluded.has_down_payment,
    down_payment_value = excluded.down_payment_value,
    financed_amount = excluded.financed_amount,
    installment_value = excluded.installment_value,
    confirmed_by = excluded.confirmed_by,
    confirmed_at = excluded.confirmed_at
  returning id into v_sale_id;

  return v_sale_id;
end;
$$;

-- ==========================================================================
-- SOURCE: remote_history/20260727103548_create_lead_commercial_details.sql
-- ==========================================================================

create table if not exists public.lead_commercial_details (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null unique references public.leads(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  payment_type varchar(30),
  financing_bank varchar(160),
  negotiated_value numeric(14,2),
  installment_count integer,
  has_down_payment boolean,
  down_payment_value numeric(14,2),
  financed_amount numeric(14,2),
  installment_value numeric(14,2),
  has_trade_in boolean,
  updated_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lead_commercial_payment_type_check check (
    payment_type is null or payment_type in ('cash', 'financed', 'consortium', 'other')
  ),
  constraint lead_commercial_installments_check check (
    installment_count is null or installment_count between 1 and 120
  ),
  constraint lead_commercial_negotiated_value_check check (
    negotiated_value is null or negotiated_value >= 0
  ),
  constraint lead_commercial_down_payment_value_check check (
    down_payment_value is null or down_payment_value >= 0
  ),
  constraint lead_commercial_financed_amount_check check (
    financed_amount is null or financed_amount >= 0
  ),
  constraint lead_commercial_installment_value_check check (
    installment_value is null or installment_value >= 0
  ),
  constraint lead_commercial_entry_not_above_total_check check (
    negotiated_value is null or down_payment_value is null or down_payment_value <= negotiated_value
  )
);

create index if not exists idx_lead_commercial_details_store_id
  on public.lead_commercial_details(store_id);

create index if not exists idx_lead_commercial_details_updated_at
  on public.lead_commercial_details(updated_at desc);

alter table public.lead_commercial_details enable row level security;

create or replace function public.confirm_lead_sale_record(
  p_lead_id uuid,
  p_store_id uuid,
  p_seller_user_id uuid,
  p_payment_type text,
  p_financing_bank text,
  p_has_trade_in boolean,
  p_sale_value numeric,
  p_installment_count integer,
  p_has_down_payment boolean,
  p_down_payment_value numeric,
  p_financed_amount numeric,
  p_installment_value numeric,
  p_confirmed_by uuid,
  p_actor_name text
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_lead public.leads%rowtype;
  v_seller public.users%rowtype;
  v_sale_id uuid;
  v_now timestamptz := now();
  v_bank text;
  v_installment_count integer;
  v_has_down_payment boolean;
  v_down_payment_value numeric(14,2);
  v_financed_amount numeric(14,2);
  v_installment_value numeric(14,2);
begin
  if p_payment_type not in ('cash', 'financed', 'consortium', 'other') then
    raise exception 'Forma de pagamento inválida.';
  end if;

  if p_has_trade_in is null then
    raise exception 'Informe se houve veículo na troca.';
  end if;

  if p_sale_value is not null and p_sale_value < 0 then
    raise exception 'O valor da venda não pode ser negativo.';
  end if;

  if p_payment_type = 'financed' and nullif(trim(coalesce(p_financing_bank, '')), '') is null then
    raise exception 'Informe o banco do financiamento.';
  end if;

  if p_payment_type in ('financed', 'consortium') and (p_installment_count is null or p_installment_count < 1 or p_installment_count > 120) then
    raise exception 'Informe uma quantidade de parcelas entre 1 e 120.';
  end if;

  if p_payment_type <> 'cash' and p_has_down_payment is null then
    raise exception 'Informe se houve entrada.';
  end if;

  if coalesce(p_has_down_payment, false) and (p_down_payment_value is null or p_down_payment_value <= 0) then
    raise exception 'Informe um valor de entrada maior que zero.';
  end if;

  if p_sale_value is not null and p_down_payment_value is not null and p_down_payment_value > p_sale_value then
    raise exception 'O valor da entrada não pode ser maior que o valor da venda.';
  end if;

  if p_financed_amount is not null and p_financed_amount < 0 then
    raise exception 'O valor financiado não pode ser negativo.';
  end if;

  if p_installment_value is not null and p_installment_value < 0 then
    raise exception 'O valor da parcela não pode ser negativo.';
  end if;

  select * into v_lead
  from public.leads
  where id = p_lead_id and assigned_store_id = p_store_id
  for update;

  if not found then
    raise exception 'Lead não encontrado nesta loja.';
  end if;

  select * into v_seller
  from public.users
  where id = p_seller_user_id
    and role = 'seller'
    and status = 'active'
    and store_id = p_store_id;

  if not found then
    raise exception 'Vendedor ativo não encontrado nesta loja.';
  end if;

  v_bank := case
    when p_payment_type = 'cash' then 'Não se aplica'
    when p_payment_type = 'financed' then trim(p_financing_bank)
    when p_payment_type = 'consortium' then coalesce(nullif(trim(coalesce(p_financing_bank, '')), ''), 'Consórcio')
    else coalesce(nullif(trim(coalesce(p_financing_bank, '')), ''), 'Outro')
  end;

  v_installment_count := case when p_payment_type = 'cash' then null else p_installment_count end;
  v_has_down_payment := case when p_payment_type = 'cash' then false else p_has_down_payment end;
  v_down_payment_value := case when v_has_down_payment then p_down_payment_value else null end;

  v_financed_amount := case
    when p_payment_type in ('financed', 'consortium') then
      coalesce(
        p_financed_amount,
        case when p_sale_value is not null then greatest(p_sale_value - coalesce(v_down_payment_value, 0), 0) else null end
      )
    else p_financed_amount
  end;

  v_installment_value := coalesce(
    p_installment_value,
    case when v_financed_amount is not null and v_installment_count is not null and v_installment_count > 0
      then round(v_financed_amount / v_installment_count, 2)
      else null
    end
  );

  update public.leads
  set status = 'sale_confirmed',
      seller_user_id = v_seller.id,
      seller_assigned_at = v_now,
      assigned_user_id = v_seller.id,
      assigned_user_role = 'seller',
      updated_at = v_now,
      last_activity_at = v_now,
      last_activity_type = 'sale_confirmed',
      last_activity_label = 'Venda confirmada',
      last_activity_by_name = nullif(trim(coalesce(p_actor_name, '')), '')
  where id = v_lead.id;

  insert into public.sales (
    event_id, lead_id, store_id, vehicle_id, prospector_id,
    seller_name, seller_user_id, pre_sales_user_id, captured_by_user_id,
    customer_bank, financing_bank, payment_type, sale_value, vehicle_category,
    sale_vehicle_name, has_trade_in, installment_count, has_down_payment,
    down_payment_value, financed_amount, installment_value, confirmed_by, confirmed_at
  ) values (
    v_lead.event_id, v_lead.id, v_lead.assigned_store_id, null, v_lead.prospector_id,
    coalesce(nullif(trim(v_seller.full_name), ''), v_seller.email, 'Vendedor não informado'),
    v_seller.id, v_lead.pre_sales_user_id, v_lead.captured_by_user_id,
    nullif(trim(coalesce(v_lead.customer_bank, '')), ''), v_bank, p_payment_type,
    p_sale_value, v_lead.vehicle_category_interest, v_lead.interested_vehicle,
    p_has_trade_in, v_installment_count, v_has_down_payment, v_down_payment_value,
    v_financed_amount, v_installment_value, p_confirmed_by, v_now
  )
  on conflict (lead_id) do update set
    event_id = excluded.event_id,
    store_id = excluded.store_id,
    prospector_id = excluded.prospector_id,
    seller_name = excluded.seller_name,
    seller_user_id = excluded.seller_user_id,
    pre_sales_user_id = excluded.pre_sales_user_id,
    captured_by_user_id = excluded.captured_by_user_id,
    customer_bank = excluded.customer_bank,
    financing_bank = excluded.financing_bank,
    payment_type = excluded.payment_type,
    sale_value = excluded.sale_value,
    vehicle_category = excluded.vehicle_category,
    sale_vehicle_name = excluded.sale_vehicle_name,
    has_trade_in = excluded.has_trade_in,
    installment_count = excluded.installment_count,
    has_down_payment = excluded.has_down_payment,
    down_payment_value = excluded.down_payment_value,
    financed_amount = excluded.financed_amount,
    installment_value = excluded.installment_value,
    confirmed_by = excluded.confirmed_by,
    confirmed_at = excluded.confirmed_at
  returning id into v_sale_id;

  insert into public.lead_commercial_details (
    lead_id, store_id, payment_type, financing_bank, negotiated_value,
    installment_count, has_down_payment, down_payment_value, financed_amount,
    installment_value, has_trade_in, updated_by, updated_at
  ) values (
    v_lead.id, v_lead.assigned_store_id, p_payment_type, v_bank, p_sale_value,
    v_installment_count, v_has_down_payment, v_down_payment_value, v_financed_amount,
    v_installment_value, p_has_trade_in, p_confirmed_by, v_now
  )
  on conflict (lead_id) do update set
    store_id = excluded.store_id,
    payment_type = excluded.payment_type,
    financing_bank = excluded.financing_bank,
    negotiated_value = excluded.negotiated_value,
    installment_count = excluded.installment_count,
    has_down_payment = excluded.has_down_payment,
    down_payment_value = excluded.down_payment_value,
    financed_amount = excluded.financed_amount,
    installment_value = excluded.installment_value,
    has_trade_in = excluded.has_trade_in,
    updated_by = excluded.updated_by,
    updated_at = excluded.updated_at;

  return v_sale_id;
end;
$function$;

-- ==========================================================================
-- SOURCE: remote_history/20260727131520_secure_marketplace_lead_creation.sql
-- ==========================================================================

alter table public.leads
  drop constraint if exists leads_origin_check;

alter table public.leads
  add constraint leads_origin_check
  check (
    origin::text = any (
      array[
        'street_survey',
        'quick_registration',
        'manual',
        'Facebook Lead Ads',
        'facebook_lead_ads',
        'WhatsApp Oficial',
        'whatsapp_official',
        'WATI / Click-to-WhatsApp',
        'wati_leads',
        'WATI',
        'marketplace_site'
      ]::text[]
    )
  );

create index if not exists leads_marketplace_vehicle_phone_recent_idx
  on public.leads (interested_vehicle_id, created_at desc)
  where origin = 'marketplace_site';

create or replace function public.create_marketplace_lead(
  p_name text,
  p_phone text,
  p_cpf text,
  p_email text,
  p_vehicle_id uuid,
  p_down_payment numeric,
  p_installments integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_vehicle public.site_vehicles%rowtype;
  v_store_id uuid;
  v_store_name text;
  v_store_slug text;
  v_owner_count integer;
  v_existing_lead_id uuid;
  v_lead_id uuid;
  v_vehicle_name text;
  v_phone_digits text;
  v_now timestamptz := now();
  v_interest_rate numeric := 1.89;
  v_monthly_rate numeric := 0.0189;
  v_down_payment numeric;
  v_financed_amount numeric;
  v_estimated_installment numeric;
  v_notes text;
  v_metadata jsonb;
begin
  if nullif(btrim(p_name), '') is null then
    raise exception 'Nome é obrigatório.' using errcode = '22023';
  end if;

  v_phone_digits := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
  if length(v_phone_digits) not in (10, 11) then
    raise exception 'Telefone inválido.' using errcode = '22023';
  end if;

  if p_installments not in (12, 24, 36, 48, 60) then
    raise exception 'Quantidade de parcelas inválida.' using errcode = '22023';
  end if;

  select *
  into v_vehicle
  from public.site_vehicles
  where id = p_vehicle_id
    and status = 'disponivel'
    and show_on_landing = true
    and coalesce(price, 0) > 0
  for share;

  if not found then
    raise exception 'Este veículo não está disponível no marketplace.' using errcode = 'P0002';
  end if;

  select
    count(distinct s.id),
    min(s.id),
    min(s.store_name),
    min(s.slug)
  into
    v_owner_count,
    v_store_id,
    v_store_name,
    v_store_slug
  from public.store_vehicle_link_submissions l
  join public.stores s on s.id = l.store_id
  where l.imported_vehicle_id = v_vehicle.id
    and l.store_id is not null
    and coalesce(l.metadata ->> 'store_removed', 'false') <> 'true'
    and lower(coalesce(l.status, '')) not in ('rejected', 'duplicate', 'deleted', 'excluido')
    and s.status = 'active'
    and coalesce(s.portal_enabled, true) = true;

  if v_owner_count <> 1 or v_store_id is null then
    raise exception 'Não foi possível confirmar uma única loja responsável por este veículo.' using errcode = 'P0003';
  end if;

  select l.id
  into v_existing_lead_id
  from public.leads l
  where l.origin = 'marketplace_site'
    and l.interested_vehicle_id = v_vehicle.id
    and l.assigned_store_id = v_store_id
    and regexp_replace(coalesce(l.customer_phone, ''), '[^0-9]', '', 'g') = v_phone_digits
    and l.created_at >= v_now - interval '20 minutes'
  order by l.created_at desc
  limit 1;

  if v_existing_lead_id is not null then
    return jsonb_build_object(
      'success', true,
      'duplicate', true,
      'lead_id', v_existing_lead_id,
      'assigned_store_name', v_store_name,
      'routing_strategy', 'vehicle_owner'
    );
  end if;

  v_down_payment := greatest(coalesce(p_down_payment, 0), 0);
  if v_down_payment > coalesce(v_vehicle.price, 0) then
    raise exception 'A entrada não pode ser maior que o valor do veículo.' using errcode = '22023';
  end if;

  v_financed_amount := greatest(coalesce(v_vehicle.price, 0) - v_down_payment, 0);
  v_estimated_installment := case
    when v_financed_amount <= 0 then 0
    else v_financed_amount * v_monthly_rate / (1 - power(1 + v_monthly_rate, -p_installments))
  end;

  v_vehicle_name := btrim(concat_ws(' ',
    nullif(v_vehicle.brand, ''),
    nullif(v_vehicle.model, ''),
    nullif(v_vehicle.version, ''),
    nullif(v_vehicle.year, '')
  ));

  v_notes := concat_ws(' ',
    'Lead criado pelo marketplace permanente.',
    'Veículo selecionado: ' || v_vehicle_name || '.',
    case
      when v_down_payment > 0 then 'Entrada simulada: R$ ' || to_char(v_down_payment, 'FM999G999G999G990D00') || '.'
      else 'Simulação sem entrada informada.'
    end,
    'Prazo simulado: ' || p_installments || ' parcela(s).',
    'Parcela estimada: R$ ' || to_char(v_estimated_installment, 'FM999G999G999G990D00') || '.'
  );

  insert into public.leads (
    event_id,
    customer_name,
    customer_phone,
    customer_bank,
    interested_vehicle,
    interested_vehicle_id,
    interested_vehicle_price,
    vehicle_category_interest,
    origin,
    assigned_store_id,
    assigned_user_id,
    assigned_user_role,
    assignment_source,
    status,
    notes,
    last_activity_at,
    last_activity_type,
    last_activity_label,
    last_activity_by_name
  ) values (
    null,
    btrim(p_name),
    btrim(p_phone),
    '',
    v_vehicle_name,
    v_vehicle.id,
    v_vehicle.price,
    '',
    'marketplace_site',
    v_store_id,
    null,
    null,
    'marketplace_vehicle_owner',
    'new_lead',
    v_notes,
    v_now,
    'marketplace_lead_created',
    'Lead recebido pelo marketplace',
    'Marketplace público'
  )
  returning id into v_lead_id;

  v_metadata := jsonb_build_object(
    'source', 'marketplace_permanente',
    'page', '/',
    'official_domain', 'autosede.com.br',
    'vehicle_owner', jsonb_build_object(
      'store_id', v_store_id,
      'store_name', v_store_name,
      'store_slug', v_store_slug
    ),
    'routing', jsonb_build_object(
      'strategy', 'vehicle_owner',
      'assigned_store_id', v_store_id,
      'assigned_store_name', v_store_name,
      'assigned_at', v_now,
      'routed_lead_id', v_lead_id
    )
  );

  insert into public.leads_base (
    name,
    phone,
    cpf,
    email,
    source,
    campaign_id,
    campaign_name,
    vehicle_id,
    vehicle_name,
    vehicle_price,
    down_payment,
    financed_amount,
    installments,
    estimated_installment,
    interest_rate,
    status,
    assigned_store_id,
    assigned_store_name,
    assigned_at,
    routed_lead_id,
    routing_strategy,
    notes,
    metadata,
    created_at,
    updated_at
  ) values (
    btrim(p_name),
    btrim(p_phone),
    nullif(btrim(p_cpf), ''),
    nullif(lower(btrim(p_email)), ''),
    'Marketplace permanente',
    null,
    null,
    v_vehicle.id,
    v_vehicle_name,
    v_vehicle.price,
    v_down_payment,
    v_financed_amount,
    p_installments,
    v_estimated_installment,
    v_interest_rate,
    'Novo lead',
    v_store_id,
    v_store_name,
    v_now,
    v_lead_id,
    'vehicle_owner',
    v_notes,
    v_metadata,
    v_now,
    v_now
  );

  insert into public.lead_activity_logs (
    lead_id,
    store_id,
    store_name,
    user_name,
    activity_type,
    activity_label,
    customer_name,
    customer_phone,
    vehicle_name,
    notes,
    metadata
  ) values (
    v_lead_id,
    v_store_id,
    v_store_name,
    'Marketplace público',
    'marketplace_lead_created',
    'Lead recebido pelo marketplace',
    btrim(p_name),
    btrim(p_phone),
    v_vehicle_name,
    v_notes,
    v_metadata
  );

  insert into public.lead_activities (
    event_id,
    lead_id,
    user_id,
    activity_type,
    description,
    metadata
  ) values (
    null,
    v_lead_id,
    null,
    'marketplace_lead_created',
    'Lead do marketplace direcionado para ' || v_store_name || '.',
    v_metadata
  );

  return jsonb_build_object(
    'success', true,
    'duplicate', false,
    'lead_id', v_lead_id,
    'assigned_store_name', v_store_name,
    'routing_strategy', 'vehicle_owner'
  );
end;
$$;

revoke all on function public.create_marketplace_lead(text, text, text, text, uuid, numeric, integer) from public;
revoke all on function public.create_marketplace_lead(text, text, text, text, uuid, numeric, integer) from anon;
revoke all on function public.create_marketplace_lead(text, text, text, text, uuid, numeric, integer) from authenticated;
grant execute on function public.create_marketplace_lead(text, text, text, text, uuid, numeric, integer) to service_role;

-- ==========================================================================
-- SOURCE: remote_history/20260727132325_fix_marketplace_owner_selection.sql
-- ==========================================================================

create or replace function public.create_marketplace_lead(
  p_name text,
  p_phone text,
  p_cpf text,
  p_email text,
  p_vehicle_id uuid,
  p_down_payment numeric,
  p_installments integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_vehicle public.site_vehicles%rowtype;
  v_store_id uuid;
  v_store_name text;
  v_store_slug text;
  v_owner_count integer;
  v_existing_lead_id uuid;
  v_lead_id uuid;
  v_vehicle_name text;
  v_phone_digits text;
  v_now timestamptz := now();
  v_interest_rate numeric := 1.89;
  v_monthly_rate numeric := 0.0189;
  v_down_payment numeric;
  v_financed_amount numeric;
  v_estimated_installment numeric;
  v_notes text;
  v_metadata jsonb;
begin
  if nullif(btrim(p_name), '') is null then
    raise exception 'Nome é obrigatório.' using errcode = '22023';
  end if;

  v_phone_digits := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
  if length(v_phone_digits) not in (10, 11) then
    raise exception 'Telefone inválido.' using errcode = '22023';
  end if;

  if p_installments not in (12, 24, 36, 48, 60) then
    raise exception 'Quantidade de parcelas inválida.' using errcode = '22023';
  end if;

  select *
  into v_vehicle
  from public.site_vehicles
  where id = p_vehicle_id
    and status = 'disponivel'
    and show_on_landing = true
    and coalesce(price, 0) > 0
  for share;

  if not found then
    raise exception 'Este veículo não está disponível no marketplace.' using errcode = 'P0002';
  end if;

  select count(distinct s.id)
  into v_owner_count
  from public.store_vehicle_link_submissions l
  join public.stores s on s.id = l.store_id
  where l.imported_vehicle_id = v_vehicle.id
    and l.store_id is not null
    and coalesce(l.metadata ->> 'store_removed', 'false') <> 'true'
    and lower(coalesce(l.status, '')) not in ('rejected', 'duplicate', 'deleted', 'excluido')
    and s.status = 'active'
    and coalesce(s.portal_enabled, true) = true;

  if v_owner_count <> 1 then
    raise exception 'Não foi possível confirmar uma única loja responsável por este veículo.' using errcode = 'P0003';
  end if;

  select s.id, s.store_name, s.slug
  into v_store_id, v_store_name, v_store_slug
  from public.store_vehicle_link_submissions l
  join public.stores s on s.id = l.store_id
  where l.imported_vehicle_id = v_vehicle.id
    and l.store_id is not null
    and coalesce(l.metadata ->> 'store_removed', 'false') <> 'true'
    and lower(coalesce(l.status, '')) not in ('rejected', 'duplicate', 'deleted', 'excluido')
    and s.status = 'active'
    and coalesce(s.portal_enabled, true) = true
  order by s.id
  limit 1;

  if v_store_id is null then
    raise exception 'Não foi possível confirmar a loja responsável por este veículo.' using errcode = 'P0003';
  end if;

  select l.id
  into v_existing_lead_id
  from public.leads l
  where l.origin = 'marketplace_site'
    and l.interested_vehicle_id = v_vehicle.id
    and l.assigned_store_id = v_store_id
    and regexp_replace(coalesce(l.customer_phone, ''), '[^0-9]', '', 'g') = v_phone_digits
    and l.created_at >= v_now - interval '20 minutes'
  order by l.created_at desc
  limit 1;

  if v_existing_lead_id is not null then
    return jsonb_build_object(
      'success', true,
      'duplicate', true,
      'lead_id', v_existing_lead_id,
      'assigned_store_name', v_store_name,
      'routing_strategy', 'vehicle_owner'
    );
  end if;

  v_down_payment := greatest(coalesce(p_down_payment, 0), 0);
  if v_down_payment > coalesce(v_vehicle.price, 0) then
    raise exception 'A entrada não pode ser maior que o valor do veículo.' using errcode = '22023';
  end if;

  v_financed_amount := greatest(coalesce(v_vehicle.price, 0) - v_down_payment, 0);
  v_estimated_installment := case
    when v_financed_amount <= 0 then 0
    else v_financed_amount * v_monthly_rate / (1 - power(1 + v_monthly_rate, -p_installments))
  end;

  v_vehicle_name := btrim(concat_ws(' ',
    nullif(v_vehicle.brand, ''),
    nullif(v_vehicle.model, ''),
    nullif(v_vehicle.version, ''),
    nullif(v_vehicle.year, '')
  ));

  v_notes := concat_ws(' ',
    'Lead criado pelo marketplace permanente.',
    'Veículo selecionado: ' || v_vehicle_name || '.',
    case
      when v_down_payment > 0 then 'Entrada simulada: R$ ' || to_char(v_down_payment, 'FM999G999G999G990D00') || '.'
      else 'Simulação sem entrada informada.'
    end,
    'Prazo simulado: ' || p_installments || ' parcela(s).',
    'Parcela estimada: R$ ' || to_char(v_estimated_installment, 'FM999G999G999G990D00') || '.'
  );

  insert into public.leads (
    event_id,
    customer_name,
    customer_phone,
    customer_bank,
    interested_vehicle,
    interested_vehicle_id,
    interested_vehicle_price,
    vehicle_category_interest,
    origin,
    assigned_store_id,
    assigned_user_id,
    assigned_user_role,
    assignment_source,
    status,
    notes,
    last_activity_at,
    last_activity_type,
    last_activity_label,
    last_activity_by_name
  ) values (
    null,
    btrim(p_name),
    btrim(p_phone),
    '',
    v_vehicle_name,
    v_vehicle.id,
    v_vehicle.price,
    '',
    'marketplace_site',
    v_store_id,
    null,
    null,
    'marketplace_vehicle_owner',
    'new_lead',
    v_notes,
    v_now,
    'marketplace_lead_created',
    'Lead recebido pelo marketplace',
    'Marketplace público'
  )
  returning id into v_lead_id;

  v_metadata := jsonb_build_object(
    'source', 'marketplace_permanente',
    'page', '/',
    'official_domain', 'autosede.com.br',
    'vehicle_owner', jsonb_build_object(
      'store_id', v_store_id,
      'store_name', v_store_name,
      'store_slug', v_store_slug
    ),
    'routing', jsonb_build_object(
      'strategy', 'vehicle_owner',
      'assigned_store_id', v_store_id,
      'assigned_store_name', v_store_name,
      'assigned_at', v_now,
      'routed_lead_id', v_lead_id
    )
  );

  insert into public.leads_base (
    name,
    phone,
    cpf,
    email,
    source,
    campaign_id,
    campaign_name,
    vehicle_id,
    vehicle_name,
    vehicle_price,
    down_payment,
    financed_amount,
    installments,
    estimated_installment,
    interest_rate,
    status,
    assigned_store_id,
    assigned_store_name,
    assigned_at,
    routed_lead_id,
    routing_strategy,
    notes,
    metadata,
    created_at,
    updated_at
  ) values (
    btrim(p_name),
    btrim(p_phone),
    nullif(btrim(p_cpf), ''),
    nullif(lower(btrim(p_email)), ''),
    'Marketplace permanente',
    null,
    null,
    v_vehicle.id,
    v_vehicle_name,
    v_vehicle.price,
    v_down_payment,
    v_financed_amount,
    p_installments,
    v_estimated_installment,
    v_interest_rate,
    'Novo lead',
    v_store_id,
    v_store_name,
    v_now,
    v_lead_id,
    'vehicle_owner',
    v_notes,
    v_metadata,
    v_now,
    v_now
  );

  insert into public.lead_activity_logs (
    lead_id,
    store_id,
    store_name,
    user_name,
    activity_type,
    activity_label,
    customer_name,
    customer_phone,
    vehicle_name,
    notes,
    metadata
  ) values (
    v_lead_id,
    v_store_id,
    v_store_name,
    'Marketplace público',
    'marketplace_lead_created',
    'Lead recebido pelo marketplace',
    btrim(p_name),
    btrim(p_phone),
    v_vehicle_name,
    v_notes,
    v_metadata
  );

  insert into public.lead_activities (
    event_id,
    lead_id,
    user_id,
    activity_type,
    description,
    metadata
  ) values (
    null,
    v_lead_id,
    null,
    'marketplace_lead_created',
    'Lead do marketplace direcionado para ' || v_store_name || '.',
    v_metadata
  );

  return jsonb_build_object(
    'success', true,
    'duplicate', false,
    'lead_id', v_lead_id,
    'assigned_store_name', v_store_name,
    'routing_strategy', 'vehicle_owner'
  );
end;
$$;

revoke all on function public.create_marketplace_lead(text, text, text, text, uuid, numeric, integer) from public;
revoke all on function public.create_marketplace_lead(text, text, text, text, uuid, numeric, integer) from anon;
revoke all on function public.create_marketplace_lead(text, text, text, text, uuid, numeric, integer) from authenticated;
grant execute on function public.create_marketplace_lead(text, text, text, text, uuid, numeric, integer) to service_role;

-- ==========================================================================
-- SOURCE: remote_history/20260728081731_secure_vehicle_sales_and_listing_lifecycle.sql
-- ==========================================================================

begin;

alter table public.site_vehicles
  add column if not exists store_id uuid,
  add column if not exists sold_at timestamptz,
  add column if not exists sold_lead_id uuid,
  add column if not exists sold_by_user_id uuid,
  add column if not exists previous_status_before_sale text,
  add column if not exists previous_visibility_before_sale boolean,
  add column if not exists previous_featured_before_sale boolean;

alter table public.site_vehicles drop constraint if exists site_vehicles_campaign_id_fkey;
alter table public.site_vehicles
  add constraint site_vehicles_campaign_id_fkey
  foreign key (campaign_id) references public.site_campaigns(id) on delete set null;

alter table public.site_vehicles drop constraint if exists site_vehicles_store_id_fkey;
alter table public.site_vehicles
  add constraint site_vehicles_store_id_fkey
  foreign key (store_id) references public.stores(id) on delete set null;

alter table public.site_vehicles drop constraint if exists site_vehicles_sold_lead_id_fkey;
alter table public.site_vehicles
  add constraint site_vehicles_sold_lead_id_fkey
  foreign key (sold_lead_id) references public.leads(id) on delete set null;

alter table public.site_vehicles drop constraint if exists site_vehicles_sold_by_user_id_fkey;
alter table public.site_vehicles
  add constraint site_vehicles_sold_by_user_id_fkey
  foreign key (sold_by_user_id) references public.users(id) on delete set null;

create index if not exists idx_site_vehicles_store_id on public.site_vehicles(store_id);
create index if not exists idx_site_vehicles_sold_lead_id on public.site_vehicles(sold_lead_id);
create index if not exists idx_site_vehicles_marketplace_owner_status
  on public.site_vehicles(store_id, status, show_on_landing);

with unique_active_owners as (
  select
    l.imported_vehicle_id as vehicle_id,
    (array_agg(distinct l.store_id))[1] as store_id
  from public.store_vehicle_link_submissions l
  join public.stores s on s.id = l.store_id
  where l.imported_vehicle_id is not null
    and l.store_id is not null
    and l.status not in ('rejected', 'duplicate')
    and coalesce(l.metadata ->> 'store_removed', 'false') <> 'true'
    and s.status = 'active'
    and s.portal_enabled = true
  group by l.imported_vehicle_id
  having count(distinct l.store_id) = 1
)
update public.site_vehicles v
set
  store_id = o.store_id,
  store_name = s.store_name,
  updated_at = now()
from unique_active_owners o
join public.stores s on s.id = o.store_id
where v.id = o.vehicle_id
  and v.store_id is null;

create unique index if not exists idx_store_vehicle_link_one_active_owner
  on public.store_vehicle_link_submissions(imported_vehicle_id)
  where imported_vehicle_id is not null
    and status not in ('rejected', 'duplicate')
    and coalesce(metadata ->> 'store_removed', 'false') <> 'true';

alter table public.sales
  add column if not exists status text not null default 'confirmed',
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancelled_by uuid,
  add column if not exists cancellation_reason text;

alter table public.sales drop constraint if exists sales_status_check;
alter table public.sales
  add constraint sales_status_check check (status in ('confirmed', 'cancelled'));

alter table public.sales drop constraint if exists sales_cancelled_by_fkey;
alter table public.sales
  add constraint sales_cancelled_by_fkey
  foreign key (cancelled_by) references public.users(id) on delete set null;

create index if not exists idx_sales_status on public.sales(status);
create index if not exists idx_sales_vehicle_status on public.sales(vehicle_id, status);

-- Reaponta sales.vehicle_id para o estoque público somente quando os dados existentes são compatíveis.
do $$
declare
  v_fk record;
begin
  if exists (
    select 1
    from public.sales s
    where s.vehicle_id is not null
      and not exists (
        select 1 from public.site_vehicles v where v.id = s.vehicle_id
      )
  ) then
    raise exception 'Existem vendas com vehicle_id legado que não correspondem a site_vehicles. Migração cancelada para preservar o histórico.';
  end if;

  for v_fk in
    select conname
    from pg_constraint
    where conrelid = 'public.sales'::regclass
      and contype = 'f'
      and pg_get_constraintdef(oid) like 'FOREIGN KEY (vehicle_id)%'
  loop
    execute format('alter table public.sales drop constraint %I', v_fk.conname);
  end loop;

  alter table public.sales
    add constraint sales_vehicle_id_fkey
    foreign key (vehicle_id) references public.site_vehicles(id) on delete set null;
end $$;

create unique index if not exists idx_sales_one_confirmed_per_vehicle
  on public.sales(vehicle_id)
  where vehicle_id is not null and status = 'confirmed';

-- Preenche o veículo da venda quando o lead possui vínculo técnico seguro.
update public.sales s
set vehicle_id = l.interested_vehicle_id
from public.leads l
join public.site_vehicles v on v.id = l.interested_vehicle_id
where s.lead_id = l.id
  and s.vehicle_id is null
  and l.status = 'sale_confirmed'
  and (v.store_id is null or v.store_id = l.assigned_store_id);

-- Corrige retroativamente somente veículos ligados a um único lead confirmado.
with single_confirmed_vehicle as (
  select l.interested_vehicle_id as vehicle_id
  from public.leads l
  join public.site_vehicles v on v.id = l.interested_vehicle_id
  where l.status = 'sale_confirmed'
    and l.interested_vehicle_id is not null
    and (v.store_id is null or v.store_id = l.assigned_store_id)
  group by l.interested_vehicle_id
  having count(*) = 1
), confirmed_rows as (
  select
    l.id as lead_id,
    l.interested_vehicle_id as vehicle_id,
    coalesce(s.confirmed_by, l.seller_user_id, l.assigned_user_id) as actor_id,
    coalesce(s.confirmed_at, l.updated_at, now()) as confirmed_at
  from public.leads l
  join single_confirmed_vehicle c on c.vehicle_id = l.interested_vehicle_id
  left join public.sales s on s.lead_id = l.id
  where l.status = 'sale_confirmed'
)
update public.site_vehicles v
set
  previous_status_before_sale = case when v.sold_lead_id is null then v.status else v.previous_status_before_sale end,
  previous_visibility_before_sale = case when v.sold_lead_id is null then v.show_on_landing else v.previous_visibility_before_sale end,
  previous_featured_before_sale = case when v.sold_lead_id is null then v.is_featured else v.previous_featured_before_sale end,
  status = 'vendido',
  show_on_landing = false,
  is_featured = false,
  sold_at = coalesce(v.sold_at, c.confirmed_at),
  sold_lead_id = c.lead_id,
  sold_by_user_id = coalesce(c.actor_id, v.sold_by_user_id),
  updated_at = now()
from confirmed_rows c
where v.id = c.vehicle_id
  and (v.sold_lead_id is null or v.sold_lead_id = c.lead_id);

update public.sales s
set
  status = 'confirmed',
  cancelled_at = null,
  cancelled_by = null,
  cancellation_reason = null
from public.leads l
where s.lead_id = l.id
  and l.status = 'sale_confirmed';

update public.store_vehicle_link_submissions l
set
  metadata = coalesce(l.metadata, '{}'::jsonb) || jsonb_build_object(
    'publication_status', 'vendido',
    'sold_at', v.sold_at,
    'sold_lead_id', v.sold_lead_id,
    'sold_by_user_id', v.sold_by_user_id
  ),
  updated_at = now()
from public.site_vehicles v
where l.imported_vehicle_id = v.id
  and v.status = 'vendido'
  and v.sold_lead_id is not null;

create or replace function public.sync_site_vehicle_sale_lifecycle()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_vehicle public.site_vehicles%rowtype;
  v_actor_id uuid;
  v_should_sell boolean := false;
begin
  if tg_op = 'UPDATE'
     and old.status is not distinct from new.status
     and old.interested_vehicle_id is not distinct from new.interested_vehicle_id
     and old.assigned_store_id is not distinct from new.assigned_store_id then
    return new;
  end if;

  select u.id into v_actor_id
  from public.users u
  where u.auth_user_id = auth.uid()
     or lower(u.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  order by case when u.auth_user_id = auth.uid() then 0 else 1 end
  limit 1;

  if tg_op = 'UPDATE'
     and old.status = 'sale_confirmed'
     and new.status is distinct from 'sale_confirmed' then
    update public.sales
    set
      status = 'cancelled',
      cancelled_at = now(),
      cancelled_by = v_actor_id,
      cancellation_reason = coalesce(cancellation_reason, 'Venda cancelada ou lead reaberto no pipeline')
    where lead_id = old.id
      and status = 'confirmed';
  end if;

  if tg_op = 'UPDATE'
     and old.status = 'sale_confirmed'
     and old.interested_vehicle_id is not null
     and (
       new.status is distinct from 'sale_confirmed'
       or old.interested_vehicle_id is distinct from new.interested_vehicle_id
     ) then
    if not exists (
      select 1
      from public.leads other_lead
      where other_lead.id <> old.id
        and other_lead.interested_vehicle_id = old.interested_vehicle_id
        and other_lead.status = 'sale_confirmed'
    ) then
      update public.site_vehicles
      set
        status = coalesce(previous_status_before_sale, 'disponivel'),
        show_on_landing = coalesce(previous_visibility_before_sale, false),
        is_featured = coalesce(previous_featured_before_sale, false),
        sold_at = null,
        sold_lead_id = null,
        sold_by_user_id = null,
        previous_status_before_sale = null,
        previous_visibility_before_sale = null,
        previous_featured_before_sale = null,
        updated_at = now()
      where id = old.interested_vehicle_id
        and sold_lead_id = old.id;

      update public.store_vehicle_link_submissions
      set
        metadata = (coalesce(metadata, '{}'::jsonb)
          - 'sold_at'
          - 'sold_lead_id'
          - 'sold_by_user_id') || jsonb_build_object(
            'publication_status', 'venda_cancelada',
            'sale_reverted_at', now()
          ),
        updated_at = now()
      where imported_vehicle_id = old.interested_vehicle_id;
    end if;
  end if;

  if tg_op = 'INSERT' then
    v_should_sell := new.status = 'sale_confirmed' and new.interested_vehicle_id is not null;
  else
    v_should_sell := new.status = 'sale_confirmed'
      and new.interested_vehicle_id is not null
      and (
        old.status is distinct from 'sale_confirmed'
        or old.interested_vehicle_id is distinct from new.interested_vehicle_id
      );
  end if;

  if v_should_sell then
    select * into v_vehicle
    from public.site_vehicles
    where id = new.interested_vehicle_id
    for update;

    if not found then
      raise exception 'Veículo vinculado ao lead não foi encontrado.';
    end if;

    if v_vehicle.store_id is not null
       and new.assigned_store_id is not null
       and v_vehicle.store_id <> new.assigned_store_id then
      raise exception 'O veículo vendido pertence a outra loja.';
    end if;

    if v_vehicle.sold_lead_id is not null and v_vehicle.sold_lead_id <> new.id then
      raise exception 'Este veículo já está vinculado a outra venda confirmada.';
    end if;

    if v_vehicle.status = 'vendido' and v_vehicle.sold_lead_id is null then
      raise exception 'Este veículo já está marcado como vendido.';
    end if;

    if exists (
      select 1
      from public.leads other_lead
      where other_lead.id <> new.id
        and other_lead.interested_vehicle_id = new.interested_vehicle_id
        and other_lead.status = 'sale_confirmed'
    ) then
      raise exception 'Este veículo já possui outra venda confirmada.';
    end if;

    update public.site_vehicles
    set
      previous_status_before_sale = case when sold_lead_id is null then status else previous_status_before_sale end,
      previous_visibility_before_sale = case when sold_lead_id is null then show_on_landing else previous_visibility_before_sale end,
      previous_featured_before_sale = case when sold_lead_id is null then is_featured else previous_featured_before_sale end,
      status = 'vendido',
      show_on_landing = false,
      is_featured = false,
      sold_at = coalesce(sold_at, now()),
      sold_lead_id = new.id,
      sold_by_user_id = coalesce(v_actor_id, new.seller_user_id, new.assigned_user_id, sold_by_user_id),
      updated_at = now()
    where id = new.interested_vehicle_id;

    update public.sales
    set
      vehicle_id = new.interested_vehicle_id,
      status = 'confirmed',
      cancelled_at = null,
      cancelled_by = null,
      cancellation_reason = null
    where lead_id = new.id;

    update public.store_vehicle_link_submissions
    set
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'publication_status', 'vendido',
        'sold_at', now(),
        'sold_lead_id', new.id,
        'sold_by_user_id', coalesce(v_actor_id, new.seller_user_id, new.assigned_user_id)
      ),
      updated_at = now()
    where imported_vehicle_id = new.interested_vehicle_id;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_sync_site_vehicle_sale_lifecycle on public.leads;
create trigger trg_sync_site_vehicle_sale_lifecycle
after insert or update of status, interested_vehicle_id, assigned_store_id
on public.leads
for each row execute function public.sync_site_vehicle_sale_lifecycle();

create or replace function public.sync_sale_vehicle_from_lead()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead_vehicle_id uuid;
  v_lead_store_id uuid;
  v_lead_status text;
  v_vehicle_store_id uuid;
begin
  if new.lead_id is not null then
    select interested_vehicle_id, assigned_store_id, status
      into v_lead_vehicle_id, v_lead_store_id, v_lead_status
    from public.leads
    where id = new.lead_id;

    if new.vehicle_id is null then
      new.vehicle_id := v_lead_vehicle_id;
    end if;

    if v_lead_status = 'sale_confirmed' then
      new.status := 'confirmed';
      new.cancelled_at := null;
      new.cancelled_by := null;
      new.cancellation_reason := null;
    end if;
  end if;

  if new.vehicle_id is not null then
    select store_id into v_vehicle_store_id
    from public.site_vehicles
    where id = new.vehicle_id;

    if not found then
      raise exception 'O veículo informado na venda não existe no estoque público.';
    end if;

    if v_vehicle_store_id is not null
       and coalesce(new.store_id, v_lead_store_id) is not null
       and v_vehicle_store_id <> coalesce(new.store_id, v_lead_store_id) then
      raise exception 'O veículo informado pertence a outra loja.';
    end if;

    if new.status = 'confirmed' then
      update public.site_vehicles
      set
        status = 'vendido',
        show_on_landing = false,
        is_featured = false,
        sold_at = coalesce(new.confirmed_at, sold_at, now()),
        sold_lead_id = coalesce(new.lead_id, sold_lead_id),
        sold_by_user_id = coalesce(new.confirmed_by, sold_by_user_id),
        updated_at = now()
      where id = new.vehicle_id;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_sync_sale_vehicle_from_lead on public.sales;
create trigger trg_sync_sale_vehicle_from_lead
before insert or update on public.sales
for each row execute function public.sync_sale_vehicle_from_lead();

-- RLS de veículos: público somente publicados; Master administra tudo; loja administra apenas o próprio estoque.
drop policy if exists "Authenticated can manage site vehicles" on public.site_vehicles;
drop policy if exists "Public can read landing vehicles" on public.site_vehicles;
drop policy if exists site_vehicles_public_select on public.site_vehicles;
drop policy if exists site_vehicles_master_all on public.site_vehicles;
drop policy if exists site_vehicles_store_select_own on public.site_vehicles;
drop policy if exists site_vehicles_store_insert_own on public.site_vehicles;
drop policy if exists site_vehicles_store_update_own on public.site_vehicles;

create policy site_vehicles_public_select
on public.site_vehicles
for select
to public
using (show_on_landing = true and status = 'disponivel' and price > 0);

create policy site_vehicles_master_all
on public.site_vehicles
for all
to authenticated
using (public.is_master())
with check (public.is_master());

create policy site_vehicles_store_select_own
on public.site_vehicles
for select
to authenticated
using (
  public.current_app_role() = 'store'
  and store_id = public.current_app_store_id()
);

create policy site_vehicles_store_insert_own
on public.site_vehicles
for insert
to authenticated
with check (
  public.current_app_role() = 'store'
  and store_id = public.current_app_store_id()
);

create policy site_vehicles_store_update_own
on public.site_vehicles
for update
to authenticated
using (
  public.current_app_role() = 'store'
  and store_id = public.current_app_store_id()
)
with check (
  public.current_app_role() = 'store'
  and store_id = public.current_app_store_id()
);

-- Campanhas: somente Master administra; o público lê apenas campanha ativa.
drop policy if exists "Authenticated can manage site campaigns" on public.site_campaigns;
drop policy if exists "Public can read active site campaigns" on public.site_campaigns;
drop policy if exists site_campaigns_public_select on public.site_campaigns;
drop policy if exists site_campaigns_master_all on public.site_campaigns;

create policy site_campaigns_public_select
on public.site_campaigns
for select
to public
using (is_active = true);

create policy site_campaigns_master_all
on public.site_campaigns
for all
to authenticated
using (public.is_master())
with check (public.is_master());

-- Somente Master ou o gestor da própria loja gerencia a fila de estoque.
drop policy if exists store_vehicle_link_submissions_delete_master on public.store_vehicle_link_submissions;
drop policy if exists store_vehicle_link_submissions_insert on public.store_vehicle_link_submissions;
drop policy if exists store_vehicle_link_submissions_select on public.store_vehicle_link_submissions;
drop policy if exists store_vehicle_link_submissions_update on public.store_vehicle_link_submissions;

create policy store_vehicle_link_submissions_delete_master
on public.store_vehicle_link_submissions
for delete
to authenticated
using (public.is_master());

create policy store_vehicle_link_submissions_insert
on public.store_vehicle_link_submissions
for insert
to authenticated
with check (
  public.is_master()
  or (
    public.current_app_role() = 'store'
    and store_id = public.current_app_store_id()
  )
);

create policy store_vehicle_link_submissions_select
on public.store_vehicle_link_submissions
for select
to authenticated
using (
  public.is_master()
  or (
    public.current_app_role() = 'store'
    and store_id = public.current_app_store_id()
  )
);

create policy store_vehicle_link_submissions_update
on public.store_vehicle_link_submissions
for update
to authenticated
using (
  public.is_master()
  or (
    public.current_app_role() = 'store'
    and store_id = public.current_app_store_id()
  )
)
with check (
  public.is_master()
  or (
    public.current_app_role() = 'store'
    and store_id = public.current_app_store_id()
  )
);

commit;

-- ==========================================================================
-- SOURCE: remote_history/20260730051110_phase_2c3a_01_secure_audit_trigger.sql
-- ==========================================================================

-- Fase 2C.3A — transações comerciais seguras.
-- Esta migration deve ser aplicada somente após validação e autorização explícita.

begin;

-- As assinaturas legadas serão removidas somente no último passo, após a criação dos novos RPCs.

-- O trigger continua responsável por sincronizar leads_base e por registrar
-- alterações legadas. Quando o chamador já fornece auditoria explícita, ele não
-- duplica lead_activity_logs nem sobrescreve a identidade do ator.
create or replace function public.log_lead_activity_from_leads()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_store_name text;
  v_user_id uuid;
  v_user_name text;
  v_activity_type text;
  v_activity_label text;
  v_notes text;
  v_base_status text;
  v_status_changed boolean := false;
  v_caller_managed_audit boolean := false;
begin
  if tg_op = 'DELETE' then
    select store_name into v_store_name
    from public.stores
    where id = old.assigned_store_id;

    select id, full_name into v_user_id, v_user_name
    from public.users
    where auth_user_id = auth.uid()
       or lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    order by case when auth_user_id = auth.uid() then 0 else 1 end
    limit 1;

    insert into public.lead_activity_logs (
      lead_id, store_id, store_name, user_id, user_name, activity_type, activity_label,
      from_status, to_status, customer_name, customer_phone, vehicle_name, notes, metadata
    ) values (
      old.id, old.assigned_store_id, coalesce(v_store_name, ''), v_user_id, v_user_name,
      'lead_deleted', 'Loja excluiu o lead', old.status, null, old.customer_name,
      old.customer_phone, old.interested_vehicle, old.notes,
      jsonb_build_object('operation', tg_op, 'origin', old.origin)
    );

    return old;
  end if;

  select store_name into v_store_name
  from public.stores
  where id = new.assigned_store_id;

  select id, coalesce(nullif(full_name, ''), email) into v_user_id, v_user_name
  from public.users
  where auth_user_id = auth.uid()
     or lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  order by case when auth_user_id = auth.uid() then 0 else 1 end
  limit 1;

  if v_user_id is null and nullif(trim(coalesce(new.last_activity_by_name, '')), '') is not null then
    select id, coalesce(nullif(full_name, ''), email) into v_user_id, v_user_name
    from public.users
    where (new.assigned_store_id is null or store_id = new.assigned_store_id or role = 'master')
      and (
        lower(coalesce(full_name, '')) = lower(new.last_activity_by_name)
        or lower(coalesce(email, '')) = lower(new.last_activity_by_name)
      )
    order by case when role = 'master' then 1 else 0 end
    limit 1;
  end if;

  if tg_op = 'INSERT' then
    v_status_changed := true;
    v_activity_type := 'lead_created';
    v_activity_label := 'Lead criado no pipeline da loja';
  elsif tg_op = 'UPDATE' then
    v_caller_managed_audit :=
      old.last_activity_at is distinct from new.last_activity_at
      and nullif(trim(coalesce(new.last_activity_type, '')), '') is not null
      and nullif(trim(coalesce(new.last_activity_label, '')), '') is not null;

    if coalesce(old.status, '') is distinct from coalesce(new.status, '') then
      v_status_changed := true;
      v_activity_type := case new.status
        when 'in_service' then 'status_changed'
        when 'scheduled' then 'schedule_created'
        when 'appointment_cancelled' then 'schedule_cancelled'
        when 'no_show' then 'no_show_marked'
        when 'showed_up' then 'showed_up_marked'
        when 'sale_confirmed' then 'sale_confirmed'
        when 'lost' then 'lost_registered'
        else 'status_changed'
      end;

      v_activity_label := case new.status
        when 'in_service' then 'Loja iniciou atendimento'
        when 'scheduled' then 'Loja agendou atendimento'
        when 'appointment_cancelled' then 'Loja cancelou agendamento'
        when 'no_show' then 'Loja marcou não compareceu'
        when 'showed_up' then 'Loja marcou compareceu'
        when 'sale_confirmed' then 'Loja confirmou venda'
        when 'lost' then 'Loja registrou perda'
        else 'Loja alterou etapa do lead'
      end;

      if old.status = 'sale_confirmed' and new.status <> 'sale_confirmed' then
        v_activity_type := 'sale_cancelled';
        v_activity_label := 'Loja cancelou/reabriu venda';
      elsif old.status = 'lost' and new.status <> 'lost' then
        v_activity_type := 'lead_reopened';
        v_activity_label := 'Loja reabriu lead perdido';
      end if;
    elsif old.customer_name is distinct from new.customer_name
       or old.customer_phone is distinct from new.customer_phone
       or old.interested_vehicle is distinct from new.interested_vehicle
       or old.origin is distinct from new.origin
       or old.notes is distinct from new.notes
       or old.scheduled_at is distinct from new.scheduled_at
       or old.appointment_notes is distinct from new.appointment_notes
       or old.lost_reason is distinct from new.lost_reason then
      v_activity_type := 'lead_edited';
      v_activity_label := 'Loja editou informações do lead';
    else
      return new;
    end if;
  end if;

  v_notes := case
    when v_activity_type = 'schedule_created' then coalesce(new.appointment_notes, '')
    when v_activity_type = 'schedule_cancelled' then coalesce(new.appointment_cancelled_reason, '')
    when v_activity_type = 'lost_registered' then coalesce(new.lost_reason, '')
    else coalesce(new.notes, '')
  end;

  -- Proteção de compatibilidade: qualquer transição legada para perdido também
  -- ganha um registro estruturado. O RPC transacional sinaliza quando já inseriu.
  if tg_op = 'UPDATE'
     and old.status is distinct from 'lost'
     and new.status = 'lost'
     and coalesce(current_setting('app.loss_recorded', true), '') <> 'on' then
    insert into public.losses (
      event_id, lead_id, store_id, reason, description, lost_stage, registered_by, registered_at
    ) values (
      new.event_id,
      new.id,
      new.assigned_store_id,
      'other',
      nullif(trim(coalesce(new.lost_reason, '')), ''),
      old.status,
      v_user_id,
      now()
    );
  end if;

  if not v_caller_managed_audit then
    insert into public.lead_activity_logs (
      lead_id, store_id, store_name, user_id, user_name, activity_type, activity_label,
      from_status, to_status, customer_name, customer_phone, vehicle_name, notes, metadata
    ) values (
      new.id, new.assigned_store_id, coalesce(v_store_name, ''), v_user_id, v_user_name,
      v_activity_type, v_activity_label,
      case when tg_op = 'UPDATE' then old.status else null end,
      new.status, new.customer_name, new.customer_phone, new.interested_vehicle, v_notes,
      jsonb_build_object(
        'operation', tg_op,
        'scheduled_at', new.scheduled_at,
        'appointment_cancelled_at', new.appointment_cancelled_at,
        'origin', new.origin
      )
    );
  end if;

  update public.leads
  set
    stage_entered_at = case when v_status_changed then now() else stage_entered_at end,
    last_activity_at = case when v_caller_managed_audit then new.last_activity_at else now() end,
    last_activity_type = case when v_caller_managed_audit then new.last_activity_type else v_activity_type end,
    last_activity_label = case when v_caller_managed_audit then new.last_activity_label else v_activity_label end,
    last_activity_by_name = case when v_caller_managed_audit then new.last_activity_by_name else v_user_name end
  where id = new.id;

  if v_status_changed then
    v_base_status := case new.status
      when 'new_lead' then 'Novo lead'
      when 'sale_confirmed' then 'Venda concluída'
      when 'lost' then 'Perdido'
      else 'Em atendimento'
    end;

    update public.leads_base
    set status = v_base_status, updated_at = now()
    where routed_lead_id = new.id;
  end if;

  return new;
end;
$function$;


-- Funções de trigger não são endpoints públicos.
revoke execute on function public.log_lead_activity_from_leads() from public, anon, authenticated;
revoke execute on function public.sync_sale_vehicle_from_lead() from public, anon, authenticated;
revoke execute on function public.sync_site_vehicle_sale_lifecycle() from public, anon, authenticated;
revoke execute on function public.validate_lead_team_assignment() from public, anon, authenticated;

commit;

-- ==========================================================================
-- SOURCE: remote_history/20260730051249_phase_2c3a_02_sale_transaction.sql
-- ==========================================================================

-- Fase 2C.3A — confirmação transacional de venda.
-- Aplicar após phase-2c3a-01 e somente com autorização explícita.

begin;

create or replace function public.store_confirm_sale_transaction(
  p_lead_id uuid,
  p_store_id uuid,
  p_seller_user_id uuid,
  p_vehicle_mode text,
  p_vehicle_id uuid,
  p_vehicle_name text,
  p_payment_type text,
  p_financing_bank text,
  p_has_trade_in boolean,
  p_sale_value numeric,
  p_installment_count integer,
  p_has_down_payment boolean,
  p_down_payment_value numeric,
  p_financed_amount numeric,
  p_installment_value numeric,
  p_actor_user_id uuid,
  p_actor_name text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_actor public.users%rowtype;
  v_lead public.leads%rowtype;
  v_seller public.users%rowtype;
  v_vehicle public.site_vehicles%rowtype;
  v_sale_id uuid;
  v_now timestamptz := now();
  v_vehicle_name text;
  v_vehicle_price numeric;
  v_bank text;
  v_installment_count integer;
  v_has_down_payment boolean;
  v_down_payment_value numeric(14,2);
  v_financed_amount numeric(14,2);
  v_installment_value numeric(14,2);
  v_actor_name text;
begin
  select * into v_actor
  from public.users
  where id = p_actor_user_id and status = 'active';

  if not found then
    raise exception 'Usuário responsável não possui perfil ativo.';
  end if;

  if v_actor.role not in ('master', 'store', 'seller') then
    raise exception 'Este perfil não pode confirmar vendas.';
  end if;

  if v_actor.role <> 'master' and v_actor.store_id is distinct from p_store_id then
    raise exception 'O usuário responsável não pertence a esta loja.';
  end if;

  select * into v_lead
  from public.leads
  where id = p_lead_id and assigned_store_id = p_store_id
  for update;

  if not found then
    raise exception 'Lead não encontrado nesta loja.';
  end if;

  if v_lead.status in ('sale_confirmed', 'lost', 'deleted') then
    raise exception 'O estado atual do lead não permite confirmar uma venda.';
  end if;

  select * into v_seller
  from public.users
  where id = p_seller_user_id
    and role = 'seller'
    and status = 'active'
    and store_id = p_store_id;

  if not found then
    raise exception 'Vendedor ativo não encontrado nesta loja.';
  end if;

  if v_actor.role = 'seller' then
    if v_actor.id <> v_seller.id then
      raise exception 'O vendedor só pode confirmar a própria venda.';
    end if;
    if v_lead.seller_user_id is distinct from v_actor.id
       and v_lead.assigned_user_id is distinct from v_actor.id then
      raise exception 'Este lead não pertence à carteira do vendedor.';
    end if;
  end if;

  if p_vehicle_mode not in ('portal', 'outside_portal') then
    raise exception 'Origem do veículo vendido inválida.';
  end if;

  if p_vehicle_mode = 'portal' then
    if p_vehicle_id is null then
      raise exception 'Selecione o veículo vendido no estoque da loja.';
    end if;

    select * into v_vehicle
    from public.site_vehicles
    where id = p_vehicle_id and store_id = p_store_id
    for update;

    if not found then
      raise exception 'O veículo selecionado não pertence ao estoque desta loja.';
    end if;

    if v_vehicle.status = 'excluido' then
      raise exception 'O veículo selecionado está excluído do estoque.';
    end if;

    if v_vehicle.sold_lead_id is not null and v_vehicle.sold_lead_id <> v_lead.id then
      raise exception 'Este veículo já está vinculado a outra venda.';
    end if;

    if v_vehicle.status = 'vendido' and v_vehicle.sold_lead_id is null then
      raise exception 'Este veículo já está marcado como vendido.';
    end if;

    v_vehicle_name := trim(concat_ws(' ', v_vehicle.brand, v_vehicle.model, v_vehicle.version, v_vehicle.year));
    v_vehicle_price := nullif(v_vehicle.price, 0);
  else
    v_vehicle_name := nullif(trim(coalesce(p_vehicle_name, '')), '');
    v_vehicle_price := v_lead.interested_vehicle_price;
    if v_vehicle_name is null then
      raise exception 'Informe o veículo vendido fora do portal.';
    end if;
  end if;

  if p_payment_type not in ('cash', 'financed', 'consortium', 'other') then
    raise exception 'Forma de pagamento inválida.';
  end if;

  if p_has_trade_in is null then
    raise exception 'Informe se houve veículo na troca.';
  end if;

  if p_sale_value is not null and p_sale_value < 0 then
    raise exception 'O valor da venda não pode ser negativo.';
  end if;

  if p_payment_type = 'financed' and nullif(trim(coalesce(p_financing_bank, '')), '') is null then
    raise exception 'Informe o banco do financiamento.';
  end if;

  if p_payment_type in ('financed', 'consortium')
     and (p_installment_count is null or p_installment_count < 1 or p_installment_count > 120) then
    raise exception 'Informe uma quantidade de parcelas entre 1 e 120.';
  end if;

  if p_payment_type <> 'cash' and p_has_down_payment is null then
    raise exception 'Informe se houve entrada.';
  end if;

  if coalesce(p_has_down_payment, false)
     and (p_down_payment_value is null or p_down_payment_value <= 0) then
    raise exception 'Informe um valor de entrada maior que zero.';
  end if;

  if p_sale_value is not null
     and p_down_payment_value is not null
     and p_down_payment_value > p_sale_value then
    raise exception 'O valor da entrada não pode ser maior que o valor da venda.';
  end if;

  if p_financed_amount is not null and p_financed_amount < 0 then
    raise exception 'O valor financiado não pode ser negativo.';
  end if;

  if p_installment_value is not null and p_installment_value < 0 then
    raise exception 'O valor da parcela não pode ser negativo.';
  end if;

  v_bank := case
    when p_payment_type = 'cash' then 'Não se aplica'
    when p_payment_type = 'financed' then trim(p_financing_bank)
    when p_payment_type = 'consortium' then coalesce(nullif(trim(coalesce(p_financing_bank, '')), ''), 'Consórcio')
    else coalesce(nullif(trim(coalesce(p_financing_bank, '')), ''), 'Outro')
  end;

  v_installment_count := case when p_payment_type = 'cash' then null else p_installment_count end;
  v_has_down_payment := case when p_payment_type = 'cash' then false else p_has_down_payment end;
  v_down_payment_value := case when v_has_down_payment then p_down_payment_value else null end;
  v_financed_amount := case
    when p_payment_type in ('financed', 'consortium') then
      coalesce(
        p_financed_amount,
        case when p_sale_value is not null then greatest(p_sale_value - coalesce(v_down_payment_value, 0), 0) else null end
      )
    else p_financed_amount
  end;
  v_installment_value := coalesce(
    p_installment_value,
    case when v_financed_amount is not null and v_installment_count is not null and v_installment_count > 0
      then round(v_financed_amount / v_installment_count, 2)
      else null
    end
  );
  v_actor_name := coalesce(nullif(trim(p_actor_name), ''), nullif(trim(v_actor.full_name), ''), v_actor.email, 'Usuário');

  update public.leads
  set interested_vehicle_id = case when p_vehicle_mode = 'portal' then v_vehicle.id else null end,
      interested_vehicle = v_vehicle_name,
      interested_vehicle_price = v_vehicle_price,
      status = 'sale_confirmed',
      seller_user_id = v_seller.id,
      seller_assigned_at = v_now,
      assigned_user_id = v_seller.id,
      assigned_user_role = 'seller',
      lost_reason = null,
      updated_at = v_now,
      last_activity_at = v_now,
      last_activity_type = 'sale_confirmed',
      last_activity_label = 'Venda confirmada',
      last_activity_by_name = v_actor_name
  where id = v_lead.id;

  insert into public.sales (
    event_id, lead_id, store_id, vehicle_id, prospector_id,
    seller_name, seller_user_id, pre_sales_user_id, captured_by_user_id,
    customer_bank, financing_bank, payment_type, sale_value, vehicle_category,
    sale_vehicle_name, has_trade_in, installment_count, has_down_payment,
    down_payment_value, financed_amount, installment_value, confirmed_by, confirmed_at,
    status, cancelled_at, cancelled_by, cancellation_reason
  ) values (
    v_lead.event_id, v_lead.id, v_lead.assigned_store_id,
    case when p_vehicle_mode = 'portal' then v_vehicle.id else null end,
    v_lead.prospector_id,
    coalesce(nullif(trim(v_seller.full_name), ''), v_seller.email, 'Vendedor não informado'),
    v_seller.id, v_lead.pre_sales_user_id, v_lead.captured_by_user_id,
    nullif(trim(coalesce(v_lead.customer_bank, '')), ''), v_bank, p_payment_type,
    p_sale_value, v_lead.vehicle_category_interest, v_vehicle_name,
    p_has_trade_in, v_installment_count, v_has_down_payment, v_down_payment_value,
    v_financed_amount, v_installment_value, v_actor.id, v_now,
    'confirmed', null, null, null
  )
  on conflict (lead_id) do update set
    event_id = excluded.event_id,
    store_id = excluded.store_id,
    vehicle_id = excluded.vehicle_id,
    prospector_id = excluded.prospector_id,
    seller_name = excluded.seller_name,
    seller_user_id = excluded.seller_user_id,
    pre_sales_user_id = excluded.pre_sales_user_id,
    captured_by_user_id = excluded.captured_by_user_id,
    customer_bank = excluded.customer_bank,
    financing_bank = excluded.financing_bank,
    payment_type = excluded.payment_type,
    sale_value = excluded.sale_value,
    vehicle_category = excluded.vehicle_category,
    sale_vehicle_name = excluded.sale_vehicle_name,
    has_trade_in = excluded.has_trade_in,
    installment_count = excluded.installment_count,
    has_down_payment = excluded.has_down_payment,
    down_payment_value = excluded.down_payment_value,
    financed_amount = excluded.financed_amount,
    installment_value = excluded.installment_value,
    confirmed_by = excluded.confirmed_by,
    confirmed_at = excluded.confirmed_at,
    status = 'confirmed',
    cancelled_at = null,
    cancelled_by = null,
    cancellation_reason = null
  returning id into v_sale_id;

  insert into public.lead_commercial_details (
    lead_id, store_id, payment_type, financing_bank, negotiated_value,
    installment_count, has_down_payment, down_payment_value, financed_amount,
    installment_value, has_trade_in, updated_by, updated_at
  ) values (
    v_lead.id, v_lead.assigned_store_id, p_payment_type, v_bank, p_sale_value,
    v_installment_count, v_has_down_payment, v_down_payment_value, v_financed_amount,
    v_installment_value, p_has_trade_in, v_actor.id, v_now
  )
  on conflict (lead_id) do update set
    store_id = excluded.store_id,
    payment_type = excluded.payment_type,
    financing_bank = excluded.financing_bank,
    negotiated_value = excluded.negotiated_value,
    installment_count = excluded.installment_count,
    has_down_payment = excluded.has_down_payment,
    down_payment_value = excluded.down_payment_value,
    financed_amount = excluded.financed_amount,
    installment_value = excluded.installment_value,
    has_trade_in = excluded.has_trade_in,
    updated_by = excluded.updated_by,
    updated_at = excluded.updated_at;

  insert into public.lead_activity_logs (
    lead_id, store_id, store_name, user_id, user_name, activity_type, activity_label,
    from_status, to_status, customer_name, customer_phone, vehicle_name, notes, metadata
  ) values (
    v_lead.id, v_lead.assigned_store_id,
    (select store_name from public.stores where id = v_lead.assigned_store_id),
    v_actor.id, v_actor_name, 'sale_confirmed',
    'Venda confirmada por ' || coalesce(nullif(trim(v_seller.full_name), ''), v_seller.email, 'Vendedor'),
    v_lead.status, 'sale_confirmed', v_lead.customer_name, v_lead.customer_phone,
    v_vehicle_name,
    concat_ws('. ',
      case p_payment_type when 'cash' then 'À vista' when 'financed' then 'Financiado por ' || v_bank when 'consortium' then 'Consórcio' else 'Outra forma' end,
      case when v_installment_count is null then 'Sem parcelamento' else v_installment_count || ' parcela(s)' end,
      case when v_has_down_payment then 'Com entrada' else 'Sem entrada' end,
      case when p_has_trade_in then 'Com veículo na troca' else 'Sem veículo na troca' end
    ),
    jsonb_build_object(
      'sale_id', v_sale_id,
      'vehicle_id', case when p_vehicle_mode = 'portal' then v_vehicle.id else null end,
      'vehicle_mode', p_vehicle_mode,
      'seller_user_id', v_seller.id,
      'payment_type', p_payment_type,
      'financing_bank', v_bank,
      'sale_value', p_sale_value,
      'confirmed_by_role', v_actor.role,
      'transaction', 'store_confirm_sale_transaction'
    )
  );

  insert into public.lead_activities (
    event_id, lead_id, user_id, activity_type, description, metadata
  ) values (
    v_lead.event_id, v_lead.id, v_actor.id, 'sale_confirmed',
    v_actor_name || ' confirmou a venda de ' || v_vehicle_name || '.',
    jsonb_build_object('sale_id', v_sale_id, 'vehicle_mode', p_vehicle_mode)
  );

  insert into public.audit_logs (
    event_id, user_id, user_role, action_type, entity_type, entity_id, old_value, new_value
  ) values (
    v_lead.event_id, v_actor.id, v_actor.role, 'sale_confirmed', 'sales', v_sale_id,
    jsonb_build_object('lead_status', v_lead.status),
    jsonb_build_object(
      'lead_id', v_lead.id,
      'store_id', v_lead.assigned_store_id,
      'vehicle_id', case when p_vehicle_mode = 'portal' then v_vehicle.id else null end,
      'seller_user_id', v_seller.id,
      'payment_type', p_payment_type,
      'sale_value', p_sale_value,
      'confirmed_by', v_actor.id
    )
  );

  return v_sale_id;
end;
$function$;


revoke all on function public.store_confirm_sale_transaction(
  uuid, uuid, uuid, text, uuid, text, text, text, boolean, numeric, integer,
  boolean, numeric, numeric, numeric, uuid, text
) from public, anon, authenticated;
grant execute on function public.store_confirm_sale_transaction(
  uuid, uuid, uuid, text, uuid, text, text, text, boolean, numeric, integer,
  boolean, numeric, numeric, numeric, uuid, text
) to service_role;

commit;

-- ==========================================================================
-- SOURCE: remote_history/20260730051342_phase_2c3a_03_cancel_loss_transactions.sql
-- ==========================================================================

-- Fase 2C.3A — cancelamento e perda transacionais.
-- Aplicar após phase-2c3a-02 e somente com autorização explícita.

begin;

create or replace function public.store_cancel_sale_transaction(
  p_lead_id uuid,
  p_store_id uuid,
  p_reason text,
  p_actor_user_id uuid,
  p_actor_name text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_actor public.users%rowtype;
  v_lead public.leads%rowtype;
  v_sale public.sales%rowtype;
  v_now timestamptz := now();
  v_reason text;
  v_actor_name text;
begin
  v_reason := nullif(trim(coalesce(p_reason, '')), '');
  if v_reason is null or length(v_reason) < 3 then
    raise exception 'Informe o motivo do cancelamento da venda.';
  end if;

  select * into v_actor
  from public.users
  where id = p_actor_user_id and status = 'active';
  if not found or v_actor.role not in ('master', 'store') then
    raise exception 'Somente Gestor da Loja ou Master pode cancelar vendas.';
  end if;
  if v_actor.role <> 'master' and v_actor.store_id is distinct from p_store_id then
    raise exception 'O usuário responsável não pertence a esta loja.';
  end if;

  select * into v_lead
  from public.leads
  where id = p_lead_id and assigned_store_id = p_store_id
  for update;
  if not found then
    raise exception 'Lead não encontrado nesta loja.';
  end if;
  if v_lead.status <> 'sale_confirmed' then
    raise exception 'Este lead não possui uma venda confirmada ativa.';
  end if;

  select * into v_sale
  from public.sales
  where lead_id = v_lead.id and store_id = p_store_id and status = 'confirmed'
  for update;
  if not found then
    raise exception 'Registro ativo da venda não foi encontrado.';
  end if;

  v_actor_name := coalesce(nullif(trim(p_actor_name), ''), nullif(trim(v_actor.full_name), ''), v_actor.email, 'Usuário');

  update public.leads
  set status = 'showed_up',
      updated_at = v_now,
      last_activity_at = v_now,
      last_activity_type = 'sale_cancelled',
      last_activity_label = 'Venda cancelada',
      last_activity_by_name = v_actor_name
  where id = v_lead.id;

  update public.sales
  set status = 'cancelled',
      cancelled_at = v_now,
      cancelled_by = v_actor.id,
      cancellation_reason = v_reason
  where id = v_sale.id;

  insert into public.lead_activity_logs (
    lead_id, store_id, store_name, user_id, user_name, activity_type, activity_label,
    from_status, to_status, customer_name, customer_phone, vehicle_name, notes, metadata
  ) values (
    v_lead.id, v_lead.assigned_store_id,
    (select store_name from public.stores where id = v_lead.assigned_store_id),
    v_actor.id, v_actor_name, 'sale_cancelled', 'Venda cancelada',
    'sale_confirmed', 'showed_up', v_lead.customer_name, v_lead.customer_phone,
    v_lead.interested_vehicle, v_reason,
    jsonb_build_object('sale_id', v_sale.id, 'vehicle_id', v_sale.vehicle_id, 'transaction', 'store_cancel_sale_transaction')
  );

  insert into public.lead_activities (
    event_id, lead_id, user_id, activity_type, description, metadata
  ) values (
    v_lead.event_id, v_lead.id, v_actor.id, 'sale_cancelled',
    v_actor_name || ' cancelou a venda. Motivo: ' || v_reason || '.',
    jsonb_build_object('sale_id', v_sale.id)
  );

  insert into public.audit_logs (
    event_id, user_id, user_role, action_type, entity_type, entity_id, old_value, new_value
  ) values (
    v_lead.event_id, v_actor.id, v_actor.role, 'sale_cancelled', 'sales', v_sale.id,
    jsonb_build_object('lead_status', 'sale_confirmed', 'sale_status', 'confirmed'),
    jsonb_build_object('lead_status', 'showed_up', 'sale_status', 'cancelled', 'cancellation_reason', v_reason)
  );

  return v_sale.id;
end;
$function$;

create or replace function public.store_register_loss_transaction(
  p_lead_id uuid,
  p_store_id uuid,
  p_reason text,
  p_description text,
  p_actor_user_id uuid,
  p_actor_name text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_actor public.users%rowtype;
  v_lead public.leads%rowtype;
  v_loss_id uuid;
  v_now timestamptz := now();
  v_reason text;
  v_description text;
  v_actor_name text;
  v_has_access boolean := false;
begin
  v_reason := coalesce(nullif(trim(coalesce(p_reason, '')), ''), 'other');
  v_description := nullif(trim(coalesce(p_description, '')), '');
  if v_description is null or length(v_description) < 3 then
    raise exception 'Informe o motivo da perda.';
  end if;

  select * into v_actor
  from public.users
  where id = p_actor_user_id and status = 'active';
  if not found or v_actor.role not in ('master', 'store', 'pre_sales', 'seller', 'prospector') then
    raise exception 'Usuário responsável não possui acesso comercial ativo.';
  end if;
  if v_actor.role <> 'master' and v_actor.store_id is distinct from p_store_id then
    raise exception 'O usuário responsável não pertence a esta loja.';
  end if;

  select * into v_lead
  from public.leads
  where id = p_lead_id and assigned_store_id = p_store_id
  for update;
  if not found then
    raise exception 'Lead não encontrado nesta loja.';
  end if;

  v_has_access := v_actor.role in ('master', 'store')
    or (v_actor.role = 'pre_sales' and (v_lead.pre_sales_user_id = v_actor.id or v_lead.assigned_user_id = v_actor.id))
    or (v_actor.role = 'seller' and (v_lead.seller_user_id = v_actor.id or v_lead.assigned_user_id = v_actor.id))
    or (v_actor.role = 'prospector' and (v_lead.captured_by_user_id = v_actor.id or v_lead.assigned_user_id = v_actor.id));
  if not v_has_access then
    raise exception 'Este lead não pertence à carteira do usuário.';
  end if;

  if v_lead.status in ('sale_confirmed', 'lost', 'deleted') then
    raise exception 'O estado atual do lead não permite registrar perda.';
  end if;

  if exists (
    select 1 from public.sales
    where lead_id = v_lead.id and store_id = p_store_id and status = 'confirmed'
  ) then
    raise exception 'Não é possível registrar perda para um lead com venda ativa.';
  end if;

  v_actor_name := coalesce(nullif(trim(p_actor_name), ''), nullif(trim(v_actor.full_name), ''), v_actor.email, 'Usuário');

  insert into public.losses (
    event_id, lead_id, store_id, reason, description, lost_stage, registered_by, registered_at
  ) values (
    v_lead.event_id, v_lead.id, v_lead.assigned_store_id,
    v_reason, v_description, v_lead.status, v_actor.id, v_now
  ) returning id into v_loss_id;

  perform set_config('app.loss_recorded', 'on', true);

  update public.leads
  set status = 'lost',
      lost_reason = v_description,
      updated_at = v_now,
      last_activity_at = v_now,
      last_activity_type = 'lost_registered',
      last_activity_label = 'Perda registrada',
      last_activity_by_name = v_actor_name
  where id = v_lead.id;

  insert into public.lead_activity_logs (
    lead_id, store_id, store_name, user_id, user_name, activity_type, activity_label,
    from_status, to_status, customer_name, customer_phone, vehicle_name, notes, metadata
  ) values (
    v_lead.id, v_lead.assigned_store_id,
    (select store_name from public.stores where id = v_lead.assigned_store_id),
    v_actor.id, v_actor_name, 'lost_registered', 'Perda registrada',
    v_lead.status, 'lost', v_lead.customer_name, v_lead.customer_phone,
    v_lead.interested_vehicle, v_description,
    jsonb_build_object('loss_id', v_loss_id, 'reason', v_reason, 'transaction', 'store_register_loss_transaction')
  );

  insert into public.lead_activities (
    event_id, lead_id, user_id, activity_type, description, metadata
  ) values (
    v_lead.event_id, v_lead.id, v_actor.id, 'lost_registered',
    v_actor_name || ' registrou a perda. Motivo: ' || v_description || '.',
    jsonb_build_object('loss_id', v_loss_id, 'reason', v_reason, 'lost_stage', v_lead.status)
  );

  insert into public.audit_logs (
    event_id, user_id, user_role, action_type, entity_type, entity_id, old_value, new_value
  ) values (
    v_lead.event_id, v_actor.id, v_actor.role, 'lost_registered', 'losses', v_loss_id,
    jsonb_build_object('lead_status', v_lead.status),
    jsonb_build_object('lead_status', 'lost', 'lead_id', v_lead.id, 'store_id', v_lead.assigned_store_id, 'reason', v_reason, 'description', v_description)
  );

  return v_loss_id;
end;
$function$;


revoke all on function public.store_cancel_sale_transaction(uuid, uuid, text, uuid, text)
  from public, anon, authenticated;
grant execute on function public.store_cancel_sale_transaction(uuid, uuid, text, uuid, text)
  to service_role;

revoke all on function public.store_register_loss_transaction(uuid, uuid, text, text, uuid, text)
  from public, anon, authenticated;
grant execute on function public.store_register_loss_transaction(uuid, uuid, text, text, uuid, text)
  to service_role;

commit;

-- ==========================================================================
-- SOURCE: remote_history/20260730051447_phase_2c3a_04_commercial_transaction.sql
-- ==========================================================================

-- Fase 2C.3A — atualização transacional das condições comerciais.
-- Aplicar após phase-2c3a-03 e somente com autorização explícita.

begin;

create or replace function public.store_update_commercial_transaction(
  p_lead_id uuid,
  p_store_id uuid,
  p_payment_type text,
  p_financing_bank text,
  p_sale_value numeric,
  p_installment_count integer,
  p_has_down_payment boolean,
  p_down_payment_value numeric,
  p_financed_amount numeric,
  p_installment_value numeric,
  p_has_trade_in boolean,
  p_actor_user_id uuid,
  p_actor_name text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_actor public.users%rowtype;
  v_lead public.leads%rowtype;
  v_sale public.sales%rowtype;
  v_commercial_id uuid;
  v_now timestamptz := now();
  v_bank text;
  v_installment_count integer;
  v_has_down_payment boolean;
  v_down_payment_value numeric(14,2);
  v_financed_amount numeric(14,2);
  v_installment_value numeric(14,2);
  v_actor_name text;
  v_has_access boolean := false;
begin
  select * into v_actor
  from public.users
  where id = p_actor_user_id and status = 'active';
  if not found or v_actor.role not in ('master', 'store', 'pre_sales', 'seller') then
    raise exception 'Este perfil não pode editar condições comerciais.';
  end if;
  if v_actor.role <> 'master' and v_actor.store_id is distinct from p_store_id then
    raise exception 'O usuário responsável não pertence a esta loja.';
  end if;

  select * into v_lead
  from public.leads
  where id = p_lead_id and assigned_store_id = p_store_id
  for update;
  if not found then
    raise exception 'Lead não encontrado nesta loja.';
  end if;

  v_has_access := v_actor.role in ('master', 'store')
    or (v_actor.role = 'pre_sales' and (v_lead.pre_sales_user_id = v_actor.id or v_lead.assigned_user_id = v_actor.id))
    or (v_actor.role = 'seller' and (v_lead.seller_user_id = v_actor.id or v_lead.assigned_user_id = v_actor.id));
  if not v_has_access then
    raise exception 'Este lead não pertence à carteira do usuário.';
  end if;

  select * into v_sale
  from public.sales
  where lead_id = v_lead.id and store_id = p_store_id
  for update;

  if found and v_sale.status = 'confirmed' then
    if v_actor.role = 'pre_sales' then
      raise exception 'Pré-vendas não pode alterar uma venda já confirmada.';
    end if;
    if v_actor.role = 'seller' and v_sale.seller_user_id is distinct from v_actor.id then
      raise exception 'O vendedor só pode alterar a própria venda.';
    end if;
  end if;

  if p_payment_type not in ('cash', 'financed', 'consortium', 'other') then
    raise exception 'Forma de pagamento inválida.';
  end if;
  if p_sale_value is not null and p_sale_value < 0 then
    raise exception 'O valor negociado não pode ser negativo.';
  end if;
  if p_payment_type = 'financed' and nullif(trim(coalesce(p_financing_bank, '')), '') is null then
    raise exception 'Informe o banco do financiamento.';
  end if;
  if p_payment_type in ('financed', 'consortium')
     and (p_installment_count is null or p_installment_count < 1 or p_installment_count > 120) then
    raise exception 'Informe uma quantidade de parcelas entre 1 e 120.';
  end if;
  if p_payment_type <> 'cash' and p_has_down_payment is null then
    raise exception 'Informe se houve entrada.';
  end if;
  if coalesce(p_has_down_payment, false)
     and (p_down_payment_value is null or p_down_payment_value <= 0) then
    raise exception 'Informe um valor de entrada maior que zero.';
  end if;
  if p_sale_value is not null and p_down_payment_value is not null and p_down_payment_value > p_sale_value then
    raise exception 'O valor da entrada não pode ser maior que o valor negociado.';
  end if;
  if p_financed_amount is not null and p_financed_amount < 0 then
    raise exception 'O valor financiado não pode ser negativo.';
  end if;
  if p_installment_value is not null and p_installment_value < 0 then
    raise exception 'O valor da parcela não pode ser negativo.';
  end if;
  if p_has_trade_in is null then
    raise exception 'Informe se haverá veículo na troca.';
  end if;

  v_bank := case
    when p_payment_type = 'cash' then 'Não se aplica'
    when p_payment_type = 'financed' then trim(p_financing_bank)
    when p_payment_type = 'consortium' then coalesce(nullif(trim(coalesce(p_financing_bank, '')), ''), 'Consórcio')
    else coalesce(nullif(trim(coalesce(p_financing_bank, '')), ''), 'Outro')
  end;
  v_installment_count := case when p_payment_type = 'cash' then null else p_installment_count end;
  v_has_down_payment := case when p_payment_type = 'cash' then false else p_has_down_payment end;
  v_down_payment_value := case when v_has_down_payment then p_down_payment_value else null end;
  v_financed_amount := case
    when p_payment_type in ('financed', 'consortium') then
      coalesce(p_financed_amount, case when p_sale_value is not null then greatest(p_sale_value - coalesce(v_down_payment_value, 0), 0) else null end)
    else p_financed_amount
  end;
  v_installment_value := coalesce(
    p_installment_value,
    case when v_financed_amount is not null and v_installment_count is not null and v_installment_count > 0
      then round(v_financed_amount / v_installment_count, 2)
      else null
    end
  );
  v_actor_name := coalesce(nullif(trim(p_actor_name), ''), nullif(trim(v_actor.full_name), ''), v_actor.email, 'Usuário');

  insert into public.lead_commercial_details (
    lead_id, store_id, payment_type, financing_bank, negotiated_value,
    installment_count, has_down_payment, down_payment_value, financed_amount,
    installment_value, has_trade_in, updated_by, updated_at
  ) values (
    v_lead.id, v_lead.assigned_store_id, p_payment_type, v_bank, p_sale_value,
    v_installment_count, v_has_down_payment, v_down_payment_value, v_financed_amount,
    v_installment_value, p_has_trade_in, v_actor.id, v_now
  )
  on conflict (lead_id) do update set
    store_id = excluded.store_id,
    payment_type = excluded.payment_type,
    financing_bank = excluded.financing_bank,
    negotiated_value = excluded.negotiated_value,
    installment_count = excluded.installment_count,
    has_down_payment = excluded.has_down_payment,
    down_payment_value = excluded.down_payment_value,
    financed_amount = excluded.financed_amount,
    installment_value = excluded.installment_value,
    has_trade_in = excluded.has_trade_in,
    updated_by = excluded.updated_by,
    updated_at = excluded.updated_at
  returning id into v_commercial_id;

  if v_sale.id is not null and v_sale.status = 'confirmed' then
    update public.sales
    set payment_type = p_payment_type,
        financing_bank = v_bank,
        sale_value = p_sale_value,
        has_trade_in = p_has_trade_in,
        installment_count = v_installment_count,
        has_down_payment = v_has_down_payment,
        down_payment_value = v_down_payment_value,
        financed_amount = v_financed_amount,
        installment_value = v_installment_value
    where id = v_sale.id;
  end if;

  update public.leads
  set last_activity_at = v_now,
      last_activity_type = case when v_sale.id is not null and v_sale.status = 'confirmed' then 'sale_details_updated' else 'lead_commercial_updated' end,
      last_activity_label = case when v_sale.id is not null and v_sale.status = 'confirmed' then 'Dados comerciais da venda atualizados' else 'Condições da negociação atualizadas' end,
      last_activity_by_name = v_actor_name,
      updated_at = v_now
  where id = v_lead.id;

  insert into public.lead_activity_logs (
    lead_id, store_id, store_name, user_id, user_name, activity_type, activity_label,
    from_status, to_status, customer_name, customer_phone, vehicle_name, notes, metadata
  ) values (
    v_lead.id, v_lead.assigned_store_id,
    (select store_name from public.stores where id = v_lead.assigned_store_id),
    v_actor.id, v_actor_name,
    case when v_sale.id is not null and v_sale.status = 'confirmed' then 'sale_details_updated' else 'lead_commercial_updated' end,
    case when v_sale.id is not null and v_sale.status = 'confirmed' then 'Dados comerciais da venda atualizados' else 'Condições da negociação atualizadas' end,
    v_lead.status, v_lead.status, v_lead.customer_name, v_lead.customer_phone,
    v_lead.interested_vehicle, null,
    jsonb_build_object('commercial_id', v_commercial_id, 'sale_id', v_sale.id, 'transaction', 'store_update_commercial_transaction')
  );

  insert into public.lead_activities (
    event_id, lead_id, user_id, activity_type, description, metadata
  ) values (
    v_lead.event_id, v_lead.id, v_actor.id,
    case when v_sale.id is not null and v_sale.status = 'confirmed' then 'sale_details_updated' else 'lead_commercial_updated' end,
    v_actor_name || ' atualizou as condições comerciais.',
    jsonb_build_object('commercial_id', v_commercial_id, 'sale_id', v_sale.id)
  );

  insert into public.audit_logs (
    event_id, user_id, user_role, action_type, entity_type, entity_id, old_value, new_value
  ) values (
    v_lead.event_id, v_actor.id, v_actor.role,
    case when v_sale.id is not null and v_sale.status = 'confirmed' then 'sale_details_updated' else 'lead_commercial_updated' end,
    'lead_commercial_details', v_commercial_id,
    null,
    jsonb_build_object(
      'lead_id', v_lead.id,
      'sale_id', v_sale.id,
      'payment_type', p_payment_type,
      'financing_bank', v_bank,
      'sale_value', p_sale_value,
      'updated_by', v_actor.id
    )
  );

  return v_commercial_id;
end;
$function$;


revoke all on function public.store_update_commercial_transaction(
  uuid, uuid, text, text, numeric, integer, boolean, numeric, numeric, numeric,
  boolean, uuid, text
) from public, anon, authenticated;
grant execute on function public.store_update_commercial_transaction(
  uuid, uuid, text, text, numeric, integer, boolean, numeric, numeric, numeric,
  boolean, uuid, text
) to service_role;

-- Remove as assinaturas legadas somente depois que todos os novos RPCs existem.
drop function if exists public.confirm_lead_sale_record(
  uuid, uuid, uuid, text, text, boolean, numeric, uuid, text
);
drop function if exists public.confirm_lead_sale_record(
  uuid, uuid, uuid, text, text, boolean, numeric, integer, boolean,
  numeric, numeric, numeric, uuid, text
);

commit;

-- ==========================================================================
-- SOURCE: remote_history/20260730222436_phase_2c4b_01_portal_settings.sql
-- ==========================================================================

create table if not exists public.portal_settings (
  id uuid primary key default gen_random_uuid(),
  key text not null unique default 'official',
  brand_name text not null default 'Auto Sede',
  brand_tagline text not null default 'Portal Automotivo',
  logo_url text not null default '',
  hero_eyebrow text not null default 'Auto Sede • veículos de lojas parceiras',
  hero_title text not null default 'Encontre seu próximo carro em um só lugar.',
  hero_description text not null default 'Compare veículos disponíveis, faça uma simulação inicial e fale diretamente com a loja responsável pelo anúncio.',
  primary_cta_label text not null default 'Ver veículos disponíveis',
  secondary_cta_label text not null default 'Entenda o atendimento',
  trust_title text not null default 'Cada veículo permanece ligado à sua loja.',
  trust_description text not null default 'A vitrine publica somente anúncios com proprietário único e loja ativa. Veículos sem vínculo confiável ficam fora do catálogo até a revisão.',
  benefits jsonb not null default '[{"title":"Estoque validado","description":"Somente veículos disponíveis e vinculados a lojas habilitadas."},{"title":"Atendimento direto","description":"Seu interesse segue para a loja responsável pelo anúncio escolhido."},{"title":"Simulação inicial","description":"Visualize uma estimativa antes de solicitar o atendimento comercial."}]'::jsonb,
  whatsapp_number text not null default '',
  phone text not null default '',
  email text not null default '',
  instagram_url text not null default '',
  address_text text not null default '',
  seo_title text not null default 'Auto Sede | Veículos de lojas parceiras em um só lugar',
  seo_description text not null default 'Encontre veículos disponíveis, compare opções, simule seu financiamento e fale diretamente com a loja responsável pelo anúncio.',
  og_image_url text not null default '',
  is_published boolean not null default true,
  updated_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint portal_settings_singleton_key check (key = 'official'),
  constraint portal_settings_benefits_array check (jsonb_typeof(benefits) = 'array')
);

alter table public.portal_settings enable row level security;

revoke all on table public.portal_settings from anon, authenticated;
grant select, insert, update on table public.portal_settings to service_role;

insert into public.portal_settings (key)
values ('official')
on conflict (key) do nothing;

create or replace function public.save_portal_settings_transaction(
  p_actor_user_id uuid,
  p_settings jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor public.users%rowtype;
  v_old public.portal_settings%rowtype;
  v_new public.portal_settings%rowtype;
begin
  select *
  into v_actor
  from public.users
  where id = p_actor_user_id
    and status = 'active'
    and role = 'master';

  if not found then
    raise exception 'Acesso exclusivo para usuários Master.' using errcode = '42501';
  end if;

  if p_settings is null or jsonb_typeof(p_settings) <> 'object' then
    raise exception 'Configuração do portal inválida.' using errcode = '22023';
  end if;

  select *
  into v_old
  from public.portal_settings
  where key = 'official'
  for update;

  insert into public.portal_settings (
    key,
    brand_name,
    brand_tagline,
    logo_url,
    hero_eyebrow,
    hero_title,
    hero_description,
    primary_cta_label,
    secondary_cta_label,
    trust_title,
    trust_description,
    benefits,
    whatsapp_number,
    phone,
    email,
    instagram_url,
    address_text,
    seo_title,
    seo_description,
    og_image_url,
    is_published,
    updated_by,
    updated_at
  ) values (
    'official',
    coalesce(nullif(btrim(p_settings ->> 'brand_name'), ''), 'Auto Sede'),
    coalesce(nullif(btrim(p_settings ->> 'brand_tagline'), ''), 'Portal Automotivo'),
    coalesce(btrim(p_settings ->> 'logo_url'), ''),
    coalesce(nullif(btrim(p_settings ->> 'hero_eyebrow'), ''), 'Auto Sede • veículos de lojas parceiras'),
    coalesce(nullif(btrim(p_settings ->> 'hero_title'), ''), 'Encontre seu próximo carro em um só lugar.'),
    coalesce(nullif(btrim(p_settings ->> 'hero_description'), ''), 'Compare veículos disponíveis, faça uma simulação inicial e fale diretamente com a loja responsável pelo anúncio.'),
    coalesce(nullif(btrim(p_settings ->> 'primary_cta_label'), ''), 'Ver veículos disponíveis'),
    coalesce(nullif(btrim(p_settings ->> 'secondary_cta_label'), ''), 'Entenda o atendimento'),
    coalesce(nullif(btrim(p_settings ->> 'trust_title'), ''), 'Cada veículo permanece ligado à sua loja.'),
    coalesce(nullif(btrim(p_settings ->> 'trust_description'), ''), 'A vitrine publica somente anúncios com proprietário único e loja ativa. Veículos sem vínculo confiável ficam fora do catálogo até a revisão.'),
    case when jsonb_typeof(p_settings -> 'benefits') = 'array' then p_settings -> 'benefits' else '[]'::jsonb end,
    coalesce(btrim(p_settings ->> 'whatsapp_number'), ''),
    coalesce(btrim(p_settings ->> 'phone'), ''),
    lower(coalesce(btrim(p_settings ->> 'email'), '')),
    coalesce(btrim(p_settings ->> 'instagram_url'), ''),
    coalesce(btrim(p_settings ->> 'address_text'), ''),
    coalesce(nullif(btrim(p_settings ->> 'seo_title'), ''), 'Auto Sede | Veículos de lojas parceiras em um só lugar'),
    coalesce(nullif(btrim(p_settings ->> 'seo_description'), ''), 'Encontre veículos disponíveis, compare opções, simule seu financiamento e fale diretamente com a loja responsável pelo anúncio.'),
    coalesce(btrim(p_settings ->> 'og_image_url'), ''),
    coalesce((p_settings ->> 'is_published')::boolean, true),
    v_actor.id,
    now()
  )
  on conflict (key) do update set
    brand_name = excluded.brand_name,
    brand_tagline = excluded.brand_tagline,
    logo_url = excluded.logo_url,
    hero_eyebrow = excluded.hero_eyebrow,
    hero_title = excluded.hero_title,
    hero_description = excluded.hero_description,
    primary_cta_label = excluded.primary_cta_label,
    secondary_cta_label = excluded.secondary_cta_label,
    trust_title = excluded.trust_title,
    trust_description = excluded.trust_description,
    benefits = excluded.benefits,
    whatsapp_number = excluded.whatsapp_number,
    phone = excluded.phone,
    email = excluded.email,
    instagram_url = excluded.instagram_url,
    address_text = excluded.address_text,
    seo_title = excluded.seo_title,
    seo_description = excluded.seo_description,
    og_image_url = excluded.og_image_url,
    is_published = excluded.is_published,
    updated_by = excluded.updated_by,
    updated_at = excluded.updated_at
  returning * into v_new;

  insert into public.audit_logs (
    user_id,
    user_role,
    action_type,
    entity_type,
    entity_id,
    old_value,
    new_value
  ) values (
    v_actor.id,
    v_actor.role,
    case when v_new.is_published then 'portal_settings_published' else 'portal_settings_saved_draft' end,
    'portal_settings',
    v_new.id,
    case when v_old.id is null then null else to_jsonb(v_old) end,
    to_jsonb(v_new)
  );

  return to_jsonb(v_new);
end;
$$;

revoke all on function public.save_portal_settings_transaction(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.save_portal_settings_transaction(uuid, jsonb) to service_role;

comment on table public.portal_settings is 'Configuração singleton do portal público oficial Auto Sede. Acesso somente pelo servidor com service_role.';
comment on column public.portal_settings.is_published is 'Quando falso, o portal público usa a configuração padrão segura até uma nova publicação.';
comment on function public.save_portal_settings_transaction(uuid, jsonb) is 'Salva o CMS do portal e registra auditoria na mesma transação. Execução exclusiva do service_role.';

-- ==========================================================================
-- SOURCE: remote_history/20260731033021_phase_2d_01_permanent_stores.sql
-- ==========================================================================

begin;

alter table public.stores
  add column if not exists legal_name text,
  add column if not exists cnpj text,
  add column if not exists state text,
  add column if not exists city text,
  add column if not exists address_text text,
  add column if not exists instagram_url text;

comment on column public.stores.event_id is
  'LEGADO: evento original da loja. Novos vínculos devem usar public.store_event_participations.';

create unique index if not exists stores_active_email_unique
  on public.stores (lower(btrim(responsible_email)))
  where responsible_email is not null
    and btrim(responsible_email) <> ''
    and lower(status) not in ('deleted', 'excluido');

create unique index if not exists stores_active_cnpj_unique
  on public.stores (regexp_replace(cnpj, '\D', '', 'g'))
  where cnpj is not null
    and regexp_replace(cnpj, '\D', '', 'g') <> ''
    and lower(status) not in ('deleted', 'excluido');

create table if not exists public.store_event_participations (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  status text not null default 'active'
    check (status in ('invited', 'pending', 'active', 'inactive', 'declined', 'removed')),
  source text not null default 'master'
    check (source in ('migration', 'master', 'event_link', 'portal_application', 'store_portal')),
  joined_at timestamptz,
  ended_at timestamptz,
  event_name_snapshot text,
  event_start_date_snapshot date,
  event_end_date_snapshot date,
  event_state_snapshot text,
  event_city_snapshot text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, event_id)
);

comment on table public.store_event_participations is
  'Vínculo histórico entre uma loja permanente e cada evento em que ela participa.';

create index if not exists store_event_participations_event_status_idx
  on public.store_event_participations (event_id, status);

create index if not exists store_event_participations_store_status_idx
  on public.store_event_participations (store_id, status);

alter table public.store_event_participations enable row level security;

drop policy if exists store_event_participations_select on public.store_event_participations;
create policy store_event_participations_select
  on public.store_event_participations
  for select
  to authenticated
  using (is_master() or store_id = current_app_store_id());

drop policy if exists store_event_participations_insert_master on public.store_event_participations;
create policy store_event_participations_insert_master
  on public.store_event_participations
  for insert
  to authenticated
  with check (is_master());

drop policy if exists store_event_participations_update_master on public.store_event_participations;
create policy store_event_participations_update_master
  on public.store_event_participations
  for update
  to authenticated
  using (is_master())
  with check (is_master());

drop policy if exists store_event_participations_delete_master on public.store_event_participations;
create policy store_event_participations_delete_master
  on public.store_event_participations
  for delete
  to authenticated
  using (is_master());

grant select, insert, update, delete on public.store_event_participations to authenticated;
grant all on public.store_event_participations to service_role;

insert into public.store_event_participations (
  store_id,
  event_id,
  status,
  source,
  joined_at,
  ended_at,
  event_name_snapshot,
  event_start_date_snapshot,
  event_end_date_snapshot,
  event_state_snapshot,
  event_city_snapshot,
  metadata,
  created_at,
  updated_at
)
select
  s.id,
  s.event_id,
  case
    when lower(coalesce(s.status, 'active')) in ('deleted', 'excluido', 'inactive', 'inativo') then 'removed'
    else 'active'
  end,
  'migration',
  coalesce(s.self_registration_completed_at, s.created_at),
  case
    when lower(coalesce(s.status, 'active')) in ('deleted', 'excluido', 'inactive', 'inativo') then s.updated_at
    else null
  end,
  coalesce(s.event_name_snapshot, e.event_name),
  coalesce(s.event_start_date_snapshot, e.start_date),
  coalesce(s.event_end_date_snapshot, e.end_date),
  coalesce(s.event_state_snapshot, e.state),
  coalesce(s.event_city_snapshot, e.city),
  jsonb_build_object('legacy_store_event_id', true),
  s.created_at,
  s.updated_at
from public.stores s
join public.events e on e.id = s.event_id
where s.event_id is not null
on conflict (store_id, event_id) do update set
  event_name_snapshot = excluded.event_name_snapshot,
  event_start_date_snapshot = excluded.event_start_date_snapshot,
  event_end_date_snapshot = excluded.event_end_date_snapshot,
  event_state_snapshot = excluded.event_state_snapshot,
  event_city_snapshot = excluded.event_city_snapshot,
  updated_at = now();

drop policy if exists secure_events_select on public.events;
create policy secure_events_select
  on public.events
  for select
  to authenticated
  using (
    is_master()
    or exists (
      select 1
      from public.store_event_participations participation
      where participation.event_id = events.id
        and participation.store_id = current_app_store_id()
        and participation.status in ('invited', 'pending', 'active', 'inactive')
    )
    or exists (
      select 1
      from public.stores legacy_store
      where legacy_store.event_id = events.id
        and legacy_store.id = current_app_store_id()
    )
  );

create table if not exists public.store_portal_applications (
  id uuid primary key default gen_random_uuid(),
  store_name text not null,
  legal_name text,
  cnpj text,
  responsible_name text not null,
  responsible_phone text not null,
  responsible_email text not null,
  state text,
  city text,
  address_text text,
  website_url text,
  instagram_url text,
  approximate_vehicle_count integer
    check (approximate_vehicle_count is null or approximate_vehicle_count >= 0),
  interested_in_events boolean not null default true,
  notes text,
  status text not null default 'pending'
    check (status in ('pending', 'reviewing', 'approved', 'rejected')),
  review_notes text,
  approved_store_id uuid references public.stores(id) on delete set null,
  reviewed_by uuid references public.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.store_portal_applications is
  'Solicitações públicas de revendas que desejam entrar no Portal Auto Sede. Aprovação obrigatória do Master.';

create index if not exists store_portal_applications_status_created_idx
  on public.store_portal_applications (status, created_at desc);

create unique index if not exists store_portal_applications_open_email_unique
  on public.store_portal_applications (lower(btrim(responsible_email)))
  where status in ('pending', 'reviewing');

alter table public.store_portal_applications enable row level security;

drop policy if exists store_portal_applications_select_master on public.store_portal_applications;
create policy store_portal_applications_select_master
  on public.store_portal_applications
  for select
  to authenticated
  using (is_master());

drop policy if exists store_portal_applications_update_master on public.store_portal_applications;
create policy store_portal_applications_update_master
  on public.store_portal_applications
  for update
  to authenticated
  using (is_master())
  with check (is_master());

drop policy if exists store_portal_applications_delete_master on public.store_portal_applications;
create policy store_portal_applications_delete_master
  on public.store_portal_applications
  for delete
  to authenticated
  using (is_master());

grant select, update, delete on public.store_portal_applications to authenticated;
grant all on public.store_portal_applications to service_role;

commit;

-- ==========================================================================
-- SOURCE: remote_history/20260731034922_phase_2d_02_store_application_indexes.sql
-- ==========================================================================

begin;

create index if not exists store_portal_applications_approved_store_idx
  on public.store_portal_applications (approved_store_id)
  where approved_store_id is not null;

create index if not exists store_portal_applications_reviewed_by_idx
  on public.store_portal_applications (reviewed_by)
  where reviewed_by is not null;

commit;

-- ==========================================================================
-- SOURCE: remote_history/20260731050518_phase_2e_01_event_linked_landings.sql
-- ==========================================================================

-- Phase 2E.1: landing pages linked to events, automatic inventory assignments and campaign assets.

alter table public.site_campaigns
  add column if not exists event_id uuid,
  add column if not exists logo_url text,
  add column if not exists hero_image_url text,
  add column if not exists mobile_hero_image_url text,
  add column if not exists sponsor_logo_urls text[] not null default '{}'::text[],
  add column if not exists hero_eyebrow text not null default 'Evento automotivo',
  add column if not exists cta_label text not null default 'Simular agora',
  add column if not exists primary_color text not null default '#DC2626',
  add column if not exists secondary_color text not null default '#071020',
  add column if not exists benefits jsonb not null default '[{"title":"Simulação rápida","description":"Faça uma estimativa inicial de financiamento."},{"title":"Estoque das lojas participantes","description":"Consulte veículos vinculados ao evento."},{"title":"Atendimento direto","description":"Seu interesse segue para a loja responsável pelo veículo."}]'::jsonb,
  add column if not exists terms_text text,
  add column if not exists published_at timestamptz,
  add column if not exists auto_sync_inventory boolean not null default true;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'site_campaigns_event_id_fkey'
      and conrelid = 'public.site_campaigns'::regclass
  ) then
    alter table public.site_campaigns
      add constraint site_campaigns_event_id_fkey
      foreign key (event_id) references public.events(id) on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'site_campaigns_benefits_array_check'
      and conrelid = 'public.site_campaigns'::regclass
  ) then
    alter table public.site_campaigns
      add constraint site_campaigns_benefits_array_check
      check (jsonb_typeof(benefits) = 'array');
  end if;
end $$;

create unique index if not exists site_campaigns_event_unique_idx
  on public.site_campaigns(event_id)
  where event_id is not null;

create index if not exists site_campaigns_active_event_idx
  on public.site_campaigns(is_active, event_id);

alter table public.store_event_participations
  add column if not exists auto_sync_inventory boolean not null default true;

create table if not exists public.event_vehicle_assignments (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  vehicle_id uuid not null references public.site_vehicles(id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'inactive')),
  show_on_landing boolean not null default true,
  is_featured boolean not null default false,
  display_order integer not null default 0,
  promotional_price numeric,
  source text not null default 'automatic' check (source in ('automatic', 'manual')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint event_vehicle_assignments_event_vehicle_unique unique (event_id, vehicle_id),
  constraint event_vehicle_assignments_price_check check (promotional_price is null or promotional_price >= 0),
  constraint event_vehicle_assignments_order_check check (display_order >= 0)
);

create index if not exists event_vehicle_assignments_event_visibility_idx
  on public.event_vehicle_assignments(event_id, status, show_on_landing, is_featured, display_order);
create index if not exists event_vehicle_assignments_store_idx
  on public.event_vehicle_assignments(store_id);
create index if not exists event_vehicle_assignments_vehicle_idx
  on public.event_vehicle_assignments(vehicle_id);

alter table public.event_vehicle_assignments enable row level security;

drop policy if exists event_vehicle_assignments_master_all on public.event_vehicle_assignments;
create policy event_vehicle_assignments_master_all
  on public.event_vehicle_assignments
  for all to authenticated
  using (is_master())
  with check (is_master());

drop policy if exists event_vehicle_assignments_store_select_own on public.event_vehicle_assignments;
create policy event_vehicle_assignments_store_select_own
  on public.event_vehicle_assignments
  for select to authenticated
  using (store_id = current_app_store_id());

drop policy if exists event_vehicle_assignments_public_select on public.event_vehicle_assignments;
create policy event_vehicle_assignments_public_select
  on public.event_vehicle_assignments
  for select to public
  using (status = 'active' and show_on_landing = true);

with exact_matches as (
  select c.id as campaign_id, min(e.id::text)::uuid as event_id
  from public.site_campaigns c
  join public.events e
    on e.status <> 'deleted'
   and (
     lower(trim(c.slug)) = lower(trim(e.slug))
     or lower(trim(c.name)) = lower(trim(e.event_name))
   )
  where c.event_id is null
  group by c.id
  having count(*) = 1
)
update public.site_campaigns c
set event_id = m.event_id,
    updated_at = now()
from exact_matches m
where c.id = m.campaign_id
  and not exists (
    select 1 from public.site_campaigns existing
    where existing.event_id = m.event_id and existing.id <> c.id
  );

create or replace function public.sync_event_inventory(p_event_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_count integer := 0;
begin
  insert into public.event_vehicle_assignments (
    event_id, store_id, vehicle_id, status, show_on_landing, is_featured, display_order, source
  )
  select
    participation.event_id,
    participation.store_id,
    vehicle.id,
    'active',
    true,
    false,
    0,
    'automatic'
  from public.store_event_participations participation
  join public.stores store_row
    on store_row.id = participation.store_id
   and store_row.status = 'active'
  join public.site_vehicles vehicle
    on vehicle.store_id = participation.store_id
   and vehicle.status = 'disponivel'
  where participation.event_id = p_event_id
    and participation.status = 'active'
    and participation.auto_sync_inventory = true
  on conflict (event_id, vehicle_id) do nothing;

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

revoke all on function public.sync_event_inventory(uuid) from public, anon, authenticated;
grant execute on function public.sync_event_inventory(uuid) to service_role;

create or replace function public.sync_participation_inventory_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'active' and new.auto_sync_inventory = true then
    perform public.sync_event_inventory(new.event_id);
  end if;
  return new;
end;
$$;

drop trigger if exists store_event_participation_inventory_sync on public.store_event_participations;
create trigger store_event_participation_inventory_sync
after insert or update of status, auto_sync_inventory
on public.store_event_participations
for each row execute function public.sync_participation_inventory_trigger();

create or replace function public.sync_new_vehicle_to_events_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.store_id is null or new.status <> 'disponivel' then
    return new;
  end if;

  insert into public.event_vehicle_assignments (
    event_id, store_id, vehicle_id, status, show_on_landing, is_featured, display_order, source
  )
  select
    participation.event_id,
    new.store_id,
    new.id,
    'active',
    true,
    false,
    0,
    'automatic'
  from public.store_event_participations participation
  where participation.store_id = new.store_id
    and participation.status = 'active'
    and participation.auto_sync_inventory = true
  on conflict (event_id, vehicle_id) do nothing;

  return new;
end;
$$;

drop trigger if exists site_vehicle_event_assignment_sync on public.site_vehicles;
create trigger site_vehicle_event_assignment_sync
after insert or update of store_id, status
on public.site_vehicles
for each row execute function public.sync_new_vehicle_to_events_trigger();

select public.sync_event_inventory(event_row.id)
from public.events event_row
where event_row.status <> 'deleted';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'campaign-assets',
  'campaign-assets',
  true,
  10485760,
  array['image/jpeg','image/png','image/webp']::text[]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists campaign_assets_public_select on storage.objects;
create policy campaign_assets_public_select
  on storage.objects
  for select to public
  using (bucket_id = 'campaign-assets');

drop policy if exists campaign_assets_master_insert on storage.objects;
create policy campaign_assets_master_insert
  on storage.objects
  for insert to authenticated
  with check (bucket_id = 'campaign-assets' and is_master());

drop policy if exists campaign_assets_master_update on storage.objects;
create policy campaign_assets_master_update
  on storage.objects
  for update to authenticated
  using (bucket_id = 'campaign-assets' and is_master())
  with check (bucket_id = 'campaign-assets' and is_master());

drop policy if exists campaign_assets_master_delete on storage.objects;
create policy campaign_assets_master_delete
  on storage.objects
  for delete to authenticated
  using (bucket_id = 'campaign-assets' and is_master());

comment on table public.event_vehicle_assignments is 'Vínculo de veículos permanentes às vitrines temporárias de eventos, sem duplicar o cadastro do veículo.';
comment on column public.site_campaigns.event_id is 'Evento operacional ao qual esta landing page pertence.';
comment on column public.store_event_participations.auto_sync_inventory is 'Quando verdadeiro, novos veículos disponíveis da loja entram automaticamente no evento.';

-- ==========================================================================
-- SOURCE: remote_history/20260731051740_phase_2e_02_event_landing_security.sql
-- ==========================================================================

drop policy if exists campaign_assets_public_select on storage.objects;
revoke all on function public.sync_participation_inventory_trigger() from public, anon, authenticated;
revoke all on function public.sync_new_vehicle_to_events_trigger() from public, anon, authenticated;

-- ==========================================================================
-- SOURCE: remote_history/20260731051859_phase_2e_03_event_assignment_rls.sql
-- ==========================================================================

drop policy if exists event_vehicle_assignments_public_select on public.event_vehicle_assignments;

-- ==========================================================================
-- SOURCE: remote_history/20260731064024_phase_2f_01_lead_event_scope.sql
-- ==========================================================================

begin;

alter table public.leads_base
  add column if not exists event_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'leads_base_event_id_fkey'
      and conrelid = 'public.leads_base'::regclass
  ) then
    alter table public.leads_base
      add constraint leads_base_event_id_fkey
      foreign key (event_id)
      references public.events(id)
      on delete set null;
  end if;
end
$$;

create index if not exists idx_leads_base_event_created_at
  on public.leads_base(event_id, created_at desc);

update public.leads_base as base
set event_id = operational.event_id
from public.leads as operational
where base.event_id is null
  and base.routed_lead_id = operational.id
  and operational.event_id is not null;

update public.leads_base as base
set event_id = campaign.event_id
from public.site_campaigns as campaign
where base.event_id is null
  and base.campaign_id = campaign.id
  and campaign.event_id is not null;

create or replace function public.sync_leads_base_event_scope()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  resolved_event_id uuid;
  metadata_event_id text;
begin
  resolved_event_id := null;

  if new.routed_lead_id is not null then
    select lead.event_id
      into resolved_event_id
    from public.leads as lead
    where lead.id = new.routed_lead_id;
  end if;

  if resolved_event_id is null and new.campaign_id is not null then
    select campaign.event_id
      into resolved_event_id
    from public.site_campaigns as campaign
    where campaign.id = new.campaign_id;
  end if;

  if resolved_event_id is null and new.metadata is not null then
    metadata_event_id := new.metadata ->> 'event_id';

    if metadata_event_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      select event.id
        into resolved_event_id
      from public.events as event
      where event.id = metadata_event_id::uuid;
    end if;
  end if;

  if resolved_event_id is not null then
    new.event_id := resolved_event_id;
  end if;

  return new;
end;
$$;

revoke all on function public.sync_leads_base_event_scope() from public, anon, authenticated;

drop trigger if exists trg_sync_leads_base_event_scope on public.leads_base;
create trigger trg_sync_leads_base_event_scope
before insert or update of routed_lead_id, campaign_id, metadata, event_id
on public.leads_base
for each row
execute function public.sync_leads_base_event_scope();

comment on column public.leads_base.event_id is
  'Evento operacional do lead. Nulo representa campanhas gerais ou histórico sem vínculo confiável.';

commit;

-- ==========================================================================
-- SOURCE: remote_history/20260731070843_backfill_master_auth_user_ids.sql
-- ==========================================================================

update public.users u
set auth_user_id = au.id,
    updated_at = now()
from auth.users au
where u.auth_user_id is null
  and u.email is not null
  and au.email is not null
  and lower(trim(u.email)) = lower(trim(au.email))
  and lower(coalesce(u.role, '')) = 'master'
  and lower(coalesce(u.status, '')) = 'active';

-- ==========================================================================
-- SOURCE: remote_history/20260801014939_add_campaign_editor_draft_and_published_layout.sql
-- ==========================================================================

alter table public.site_campaigns
  add column if not exists editor_draft jsonb,
  add column if not exists published_layout jsonb,
  add column if not exists layout_version integer not null default 1,
  add column if not exists draft_updated_at timestamptz,
  add column if not exists published_by uuid references public.users(id) on delete set null;

comment on column public.site_campaigns.editor_draft is 'Rascunho completo do editor visual. Não é exibido publicamente até a publicação.';
comment on column public.site_campaigns.published_layout is 'Snapshot do editor visual utilizado pela landing pública.';
comment on column public.site_campaigns.layout_version is 'Versão do schema JSON do editor visual.';
comment on column public.site_campaigns.draft_updated_at is 'Data da última gravação do rascunho visual.';
comment on column public.site_campaigns.published_by is 'Usuário master que publicou a versão visual atual.';

-- ==========================================================================
-- SOURCE: remote_history/20260801020254_create_private_campaign_visual_layouts.sql
-- ==========================================================================

create table if not exists public.site_campaign_layouts (
  campaign_id uuid primary key references public.site_campaigns(id) on delete cascade,
  editor_draft jsonb,
  published_layout jsonb,
  layout_version integer not null default 2,
  draft_updated_at timestamptz,
  published_at timestamptz,
  published_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.site_campaign_layouts enable row level security;

comment on table public.site_campaign_layouts is 'Layouts visuais privados das landings. Acesso somente por APIs de servidor com service_role.';
comment on column public.site_campaign_layouts.editor_draft is 'Rascunho privado do editor visual.';
comment on column public.site_campaign_layouts.published_layout is 'Snapshot visual liberado para a landing pública.';

-- ==========================================================================
-- SOURCE: remote_history/20260802013537_vehicle_catalog_master.sql
-- ==========================================================================

create or replace function public.vehicle_catalog_normalize_text(input_text text)
returns text
language sql
immutable
set search_path = public
as $$
  select trim(
    regexp_replace(
      translate(
        lower(coalesce(input_text, '')),
        'áàâãäéèêëíìîïóòôõöúùûüçñ',
        'aaaaaeeeeiiiiooooouuuucn'
      ),
      '[^a-z0-9]+',
      ' ',
      'g'
    )
  );
$$;

create or replace function public.vehicle_catalog_touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.vehicle_catalog_brands (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 120),
  normalized_name text generated always as (public.vehicle_catalog_normalize_text(name)) stored,
  slug text not null check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  country text,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.users(id) on delete set null,
  updated_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vehicle_catalog_brands_normalized_name_key unique (normalized_name),
  constraint vehicle_catalog_brands_slug_key unique (slug)
);

create table if not exists public.vehicle_catalog_models (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.vehicle_catalog_brands(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 140),
  normalized_name text generated always as (public.vehicle_catalog_normalize_text(name)) stored,
  category text,
  start_year integer check (start_year is null or start_year between 1886 and 2200),
  end_year integer check (end_year is null or end_year between 1886 and 2200),
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.users(id) on delete set null,
  updated_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vehicle_catalog_models_year_range check (end_year is null or start_year is null or end_year >= start_year),
  constraint vehicle_catalog_models_brand_name_key unique (brand_id, normalized_name)
);

create table if not exists public.vehicle_catalog_versions (
  id uuid primary key default gen_random_uuid(),
  model_id uuid not null references public.vehicle_catalog_models(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 180),
  normalized_name text generated always as (public.vehicle_catalog_normalize_text(name)) stored,
  engine_name text,
  engine_displacement numeric(4,1) check (engine_displacement is null or engine_displacement between 0.1 and 20),
  body_type text,
  doors smallint check (doors is null or doors between 1 and 8),
  seats smallint check (seats is null or seats between 1 and 30),
  traction text,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.users(id) on delete set null,
  updated_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vehicle_catalog_versions_model_name_key unique (model_id, normalized_name)
);

create table if not exists public.vehicle_catalog_fuels (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 80),
  normalized_name text generated always as (public.vehicle_catalog_normalize_text(name)) stored,
  code text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.users(id) on delete set null,
  updated_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vehicle_catalog_fuels_normalized_name_key unique (normalized_name)
);

create unique index if not exists vehicle_catalog_fuels_code_key
  on public.vehicle_catalog_fuels (lower(code))
  where code is not null and btrim(code) <> '';

create table if not exists public.vehicle_catalog_transmissions (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 100),
  normalized_name text generated always as (public.vehicle_catalog_normalize_text(name)) stored,
  code text,
  gears smallint check (gears is null or gears between 1 and 20),
  notes text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.users(id) on delete set null,
  updated_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vehicle_catalog_transmissions_normalized_name_key unique (normalized_name)
);

create unique index if not exists vehicle_catalog_transmissions_code_key
  on public.vehicle_catalog_transmissions (lower(code))
  where code is not null and btrim(code) <> '';

create table if not exists public.vehicle_catalog_colors (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 100),
  normalized_name text generated always as (public.vehicle_catalog_normalize_text(name)) stored,
  base_color text,
  hex_code text check (hex_code is null or hex_code ~ '^#[0-9A-Fa-f]{6}$'),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.users(id) on delete set null,
  updated_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vehicle_catalog_colors_normalized_name_key unique (normalized_name)
);

create table if not exists public.vehicle_catalog_configurations (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references public.vehicle_catalog_versions(id) on delete cascade,
  manufacture_year integer not null check (manufacture_year between 1886 and 2200),
  model_year integer not null check (model_year between 1886 and 2200),
  fuel_id uuid references public.vehicle_catalog_fuels(id) on delete restrict,
  transmission_id uuid references public.vehicle_catalog_transmissions(id) on delete restrict,
  engine_name text,
  engine_displacement numeric(4,1) check (engine_displacement is null or engine_displacement between 0.1 and 20),
  body_type text,
  traction text,
  doors smallint check (doors is null or doors between 1 and 8),
  seats smallint check (seats is null or seats between 1 and 30),
  notes text,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.users(id) on delete set null,
  updated_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vehicle_catalog_configurations_year_order check (model_year between manufacture_year - 1 and manufacture_year + 2),
  constraint vehicle_catalog_configurations_unique unique nulls not distinct (
    version_id,
    manufacture_year,
    model_year,
    fuel_id,
    transmission_id
  )
);

create table if not exists public.vehicle_catalog_aliases (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (
    entity_type in ('brand', 'model', 'version', 'fuel', 'transmission', 'color')
  ),
  entity_id uuid not null,
  alias text not null check (char_length(trim(alias)) between 1 and 220),
  normalized_alias text generated always as (public.vehicle_catalog_normalize_text(alias)) stored,
  source text not null default 'master',
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.users(id) on delete set null,
  updated_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vehicle_catalog_aliases_type_alias_key unique (entity_type, normalized_alias)
);

create table if not exists public.vehicle_catalog_suggestions (
  id uuid primary key default gen_random_uuid(),
  proposed_entity_type text not null check (
    proposed_entity_type in ('brand', 'model', 'version', 'configuration', 'fuel', 'transmission', 'color', 'alias')
  ),
  suggested_name text not null check (char_length(trim(suggested_name)) between 1 and 240),
  normalized_name text generated always as (public.vehicle_catalog_normalize_text(suggested_name)) stored,
  parent_context jsonb not null default '{}'::jsonb,
  proposed_payload jsonb not null default '{}'::jsonb,
  source_type text not null default 'master' check (
    source_type in ('master', 'store', 'website_import', 'olx_import', 'system')
  ),
  source_store_id uuid references public.stores(id) on delete set null,
  submitted_by uuid references public.users(id) on delete set null,
  status text not null default 'pending' check (
    status in ('pending', 'reviewing', 'approved', 'rejected', 'merged')
  ),
  matched_entity_type text check (
    matched_entity_type is null or matched_entity_type in ('brand', 'model', 'version', 'configuration', 'fuel', 'transmission', 'color', 'alias')
  ),
  matched_entity_id uuid,
  reviewed_by uuid references public.users(id) on delete set null,
  review_notes text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vehicle_catalog_suggestions_match_pair check (
    (matched_entity_type is null and matched_entity_id is null)
    or (matched_entity_type is not null and matched_entity_id is not null)
  )
);

create or replace function public.vehicle_catalog_validate_alias_target()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  target_exists boolean := false;
begin
  case new.entity_type
    when 'brand' then
      select exists(select 1 from public.vehicle_catalog_brands where id = new.entity_id) into target_exists;
    when 'model' then
      select exists(select 1 from public.vehicle_catalog_models where id = new.entity_id) into target_exists;
    when 'version' then
      select exists(select 1 from public.vehicle_catalog_versions where id = new.entity_id) into target_exists;
    when 'fuel' then
      select exists(select 1 from public.vehicle_catalog_fuels where id = new.entity_id) into target_exists;
    when 'transmission' then
      select exists(select 1 from public.vehicle_catalog_transmissions where id = new.entity_id) into target_exists;
    when 'color' then
      select exists(select 1 from public.vehicle_catalog_colors where id = new.entity_id) into target_exists;
    else
      target_exists := false;
  end case;

  if not target_exists then
    raise exception 'Destino do apelido não existe para o tipo %.', new.entity_type
      using errcode = '23503';
  end if;

  return new;
end;
$$;

drop trigger if exists vehicle_catalog_aliases_validate_target on public.vehicle_catalog_aliases;
create trigger vehicle_catalog_aliases_validate_target
before insert or update of entity_type, entity_id
on public.vehicle_catalog_aliases
for each row execute function public.vehicle_catalog_validate_alias_target();

create or replace function public.vehicle_catalog_remove_target_aliases()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  delete from public.vehicle_catalog_aliases
  where entity_type = tg_argv[0] and entity_id = old.id;
  return old;
end;
$$;

do $$
declare
  table_item text;
begin
  foreach table_item in array array[
    'vehicle_catalog_brands',
    'vehicle_catalog_models',
    'vehicle_catalog_versions',
    'vehicle_catalog_fuels',
    'vehicle_catalog_transmissions',
    'vehicle_catalog_colors',
    'vehicle_catalog_configurations',
    'vehicle_catalog_aliases',
    'vehicle_catalog_suggestions'
  ]
  loop
    execute format('drop trigger if exists %I on public.%I', table_item || '_touch_updated_at', table_item);
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.vehicle_catalog_touch_updated_at()',
      table_item || '_touch_updated_at',
      table_item
    );
  end loop;
end;
$$;

drop trigger if exists vehicle_catalog_brands_remove_aliases on public.vehicle_catalog_brands;
create trigger vehicle_catalog_brands_remove_aliases after delete on public.vehicle_catalog_brands
for each row execute function public.vehicle_catalog_remove_target_aliases('brand');

drop trigger if exists vehicle_catalog_models_remove_aliases on public.vehicle_catalog_models;
create trigger vehicle_catalog_models_remove_aliases after delete on public.vehicle_catalog_models
for each row execute function public.vehicle_catalog_remove_target_aliases('model');

drop trigger if exists vehicle_catalog_versions_remove_aliases on public.vehicle_catalog_versions;
create trigger vehicle_catalog_versions_remove_aliases after delete on public.vehicle_catalog_versions
for each row execute function public.vehicle_catalog_remove_target_aliases('version');

drop trigger if exists vehicle_catalog_fuels_remove_aliases on public.vehicle_catalog_fuels;
create trigger vehicle_catalog_fuels_remove_aliases after delete on public.vehicle_catalog_fuels
for each row execute function public.vehicle_catalog_remove_target_aliases('fuel');

drop trigger if exists vehicle_catalog_transmissions_remove_aliases on public.vehicle_catalog_transmissions;
create trigger vehicle_catalog_transmissions_remove_aliases after delete on public.vehicle_catalog_transmissions
for each row execute function public.vehicle_catalog_remove_target_aliases('transmission');

drop trigger if exists vehicle_catalog_colors_remove_aliases on public.vehicle_catalog_colors;
create trigger vehicle_catalog_colors_remove_aliases after delete on public.vehicle_catalog_colors
for each row execute function public.vehicle_catalog_remove_target_aliases('color');

create index if not exists vehicle_catalog_models_brand_idx
  on public.vehicle_catalog_models (brand_id, is_active, name);
create index if not exists vehicle_catalog_versions_model_idx
  on public.vehicle_catalog_versions (model_id, is_active, name);
create index if not exists vehicle_catalog_configurations_version_idx
  on public.vehicle_catalog_configurations (version_id, manufacture_year desc, model_year desc);
create index if not exists vehicle_catalog_aliases_target_idx
  on public.vehicle_catalog_aliases (entity_type, entity_id);
create index if not exists vehicle_catalog_suggestions_status_idx
  on public.vehicle_catalog_suggestions (status, created_at desc);
create index if not exists vehicle_catalog_suggestions_source_store_idx
  on public.vehicle_catalog_suggestions (source_store_id, created_at desc);

alter table public.vehicle_catalog_brands enable row level security;
alter table public.vehicle_catalog_models enable row level security;
alter table public.vehicle_catalog_versions enable row level security;
alter table public.vehicle_catalog_fuels enable row level security;
alter table public.vehicle_catalog_transmissions enable row level security;
alter table public.vehicle_catalog_colors enable row level security;
alter table public.vehicle_catalog_configurations enable row level security;
alter table public.vehicle_catalog_aliases enable row level security;
alter table public.vehicle_catalog_suggestions enable row level security;

do $$
declare
  table_item text;
  policy_prefix text;
begin
  foreach table_item in array array[
    'vehicle_catalog_brands',
    'vehicle_catalog_models',
    'vehicle_catalog_versions',
    'vehicle_catalog_fuels',
    'vehicle_catalog_transmissions',
    'vehicle_catalog_colors',
    'vehicle_catalog_configurations',
    'vehicle_catalog_aliases',
    'vehicle_catalog_suggestions'
  ]
  loop
    policy_prefix := table_item;

    execute format('drop policy if exists %I on public.%I', policy_prefix || '_select_master', table_item);
    execute format(
      'create policy %I on public.%I for select to authenticated using (public.is_master())',
      policy_prefix || '_select_master',
      table_item
    );

    execute format('drop policy if exists %I on public.%I', policy_prefix || '_insert_master', table_item);
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (public.is_master())',
      policy_prefix || '_insert_master',
      table_item
    );

    execute format('drop policy if exists %I on public.%I', policy_prefix || '_update_master', table_item);
    execute format(
      'create policy %I on public.%I for update to authenticated using (public.is_master()) with check (public.is_master())',
      policy_prefix || '_update_master',
      table_item
    );

    execute format('drop policy if exists %I on public.%I', policy_prefix || '_delete_master', table_item);
    execute format(
      'create policy %I on public.%I for delete to authenticated using (public.is_master())',
      policy_prefix || '_delete_master',
      table_item
    );

    execute format('grant select, insert, update, delete on public.%I to authenticated', table_item);
  end loop;
end;
$$;

comment on table public.vehicle_catalog_brands is 'Marcas oficiais do catálogo mestre automotivo.';
comment on table public.vehicle_catalog_models is 'Modelos oficiais vinculados às marcas do catálogo mestre.';
comment on table public.vehicle_catalog_versions is 'Versões oficiais vinculadas aos modelos do catálogo mestre.';
comment on table public.vehicle_catalog_configurations is 'Configurações técnicas por versão, ano de fabricação e ano modelo.';
comment on table public.vehicle_catalog_aliases is 'Variações e apelidos usados para reconhecer entidades oficiais nas importações.';
comment on table public.vehicle_catalog_suggestions is 'Sugestões pendentes de revisão do Master para expansão ou correção do catálogo.';

-- ==========================================================================
-- SOURCE: remote_history/20260802031055_enable_http_for_vehicle_catalog_import.sql
-- ==========================================================================

create extension if not exists http with schema extensions;

-- ==========================================================================
-- SOURCE: remote_history/20260802050315_phase_2f_02_event_lead_round_robin.sql
-- ==========================================================================

begin;

create table if not exists public.event_lead_routing_state (
  event_id uuid primary key references public.events(id) on delete cascade,
  last_store_id uuid references public.stores(id) on delete set null,
  routed_count bigint not null default 0 check (routed_count >= 0),
  last_routed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.event_lead_routing_state is
  'Estado independente do rodízio de leads de cada evento.';

alter table public.event_lead_routing_state enable row level security;

revoke all on table public.event_lead_routing_state from anon, authenticated;
grant select, insert, update, delete on table public.event_lead_routing_state to service_role;

create index if not exists leads_base_event_campaign_vehicle_recent_idx
  on public.leads_base(event_id, campaign_id, vehicle_id, created_at desc)
  where source = 'Landing Page Simulador';

alter table public.leads
  drop constraint if exists leads_origin_check;

alter table public.leads
  add constraint leads_origin_check
  check (origin in (
    'street_survey',
    'quick_registration',
    'manual',
    'event_landing',
    'Facebook Lead Ads',
    'facebook_lead_ads',
    'WhatsApp Oficial',
    'whatsapp_official',
    'WATI / Click-to-WhatsApp',
    'wati_leads',
    'WATI',
    'marketplace_site'
  ));

create or replace function public.create_event_landing_lead(
  p_name text,
  p_phone text,
  p_cpf text,
  p_email text,
  p_campaign_id uuid,
  p_vehicle_id uuid,
  p_down_payment numeric,
  p_financed_amount numeric,
  p_installments integer,
  p_estimated_installment numeric,
  p_interest_rate numeric,
  p_notes text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_now timestamptz := now();
  v_phone_digits text;
  v_campaign public.site_campaigns%rowtype;
  v_vehicle public.site_vehicles%rowtype;
  v_vehicle_owner_store_id uuid;
  v_state public.event_lead_routing_state%rowtype;
  v_last_store_sort text;
  v_selected_store_id uuid;
  v_selected_store_name text;
  v_existing_base_lead_id uuid;
  v_existing_routed_lead_id uuid;
  v_existing_store_id uuid;
  v_existing_store_name text;
  v_routed_lead_id uuid;
  v_base_lead_id uuid;
  v_next_position bigint;
  v_vehicle_name text;
  v_notes text;
  v_metadata jsonb;
begin
  if length(btrim(coalesce(p_name, ''))) < 3 then
    raise exception 'Nome é obrigatório.' using errcode = '22023';
  end if;

  v_phone_digits := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
  if length(v_phone_digits) not in (10, 11) then
    raise exception 'Telefone inválido.' using errcode = '22023';
  end if;

  if p_campaign_id is null or p_vehicle_id is null then
    raise exception 'Campanha e veículo são obrigatórios.' using errcode = '22023';
  end if;

  select campaign.*
    into v_campaign
  from public.site_campaigns as campaign
  join public.events as event on event.id = campaign.event_id
  where campaign.id = p_campaign_id
    and campaign.is_active = true
    and campaign.event_id is not null
    and lower(coalesce(event.status, 'active')) not in ('deleted', 'excluido')
  for share of campaign;

  if not found then
    raise exception 'Esta campanha de evento não está disponível.' using errcode = 'P0002';
  end if;

  select vehicle.*
    into v_vehicle
  from public.site_vehicles as vehicle
  where vehicle.id = p_vehicle_id
    and vehicle.status = 'disponivel'
    and vehicle.show_on_landing = true
    and coalesce(vehicle.price, 0) > 0
  for share;

  if not found then
    raise exception 'Este veículo não está disponível no evento.' using errcode = 'P0002';
  end if;

  select assignment.store_id
    into v_vehicle_owner_store_id
  from public.event_vehicle_assignments as assignment
  join public.stores as owner_store
    on owner_store.id = assignment.store_id
   and owner_store.status = 'active'
  join public.store_event_participations as owner_participation
    on owner_participation.event_id = assignment.event_id
   and owner_participation.store_id = assignment.store_id
   and owner_participation.status = 'active'
  where assignment.event_id = v_campaign.event_id
    and assignment.vehicle_id = v_vehicle.id
    and assignment.status = 'active'
    and assignment.show_on_landing = true;

  if not found then
    raise exception 'Este veículo não está vinculado à landing do evento.' using errcode = 'P0003';
  end if;

  insert into public.event_lead_routing_state(event_id)
  values (v_campaign.event_id)
  on conflict (event_id) do nothing;

  select state.*
    into v_state
  from public.event_lead_routing_state as state
  where state.event_id = v_campaign.event_id
  for update;

  -- A trava do evento também serializa esta verificação. Assim, dois envios
  -- simultâneos do mesmo cliente não avançam o rodízio duas vezes.
  select base.id, base.routed_lead_id, base.assigned_store_id, base.assigned_store_name
    into v_existing_base_lead_id, v_existing_routed_lead_id, v_existing_store_id, v_existing_store_name
  from public.leads_base as base
  where base.event_id = v_campaign.event_id
    and base.campaign_id = v_campaign.id
    and base.vehicle_id = v_vehicle.id
    and regexp_replace(coalesce(base.phone, ''), '[^0-9]', '', 'g') = v_phone_digits
    and base.created_at >= v_now - interval '20 minutes'
  order by base.created_at desc
  limit 1;

  if v_existing_base_lead_id is not null then
    return jsonb_build_object(
      'success', true,
      'duplicate', true,
      'queued_for_manual_assignment', v_existing_store_id is null,
      'event_id', v_campaign.event_id,
      'base_lead_id', v_existing_base_lead_id,
      'routed_lead_id', v_existing_routed_lead_id,
      'assigned_store_id', v_existing_store_id,
      'assigned_store_name', coalesce(v_existing_store_name, ''),
      'vehicle_owner_store_id', v_vehicle_owner_store_id,
      'routing_strategy', case
        when v_existing_store_id is null then 'event_round_robin_unassigned'
        else 'event_round_robin'
      end
    );
  end if;

  if v_state.last_store_id is not null then
    select lower(coalesce(store.store_name, ''))
      into v_last_store_sort
    from public.stores as store
    where store.id = v_state.last_store_id;
  end if;

  if v_last_store_sort is not null then
    select store.id, store.store_name
      into v_selected_store_id, v_selected_store_name
    from public.store_event_participations as participation
    join public.stores as store on store.id = participation.store_id
    where participation.event_id = v_campaign.event_id
      and participation.status = 'active'
      and store.status = 'active'
      and coalesce(store.portal_enabled, true) = true
      and (lower(coalesce(store.store_name, '')), store.id) > (v_last_store_sort, v_state.last_store_id)
    order by lower(coalesce(store.store_name, '')), store.id
    limit 1;
  end if;

  if v_selected_store_id is null then
    select store.id, store.store_name
      into v_selected_store_id, v_selected_store_name
    from public.store_event_participations as participation
    join public.stores as store on store.id = participation.store_id
    where participation.event_id = v_campaign.event_id
      and participation.status = 'active'
      and store.status = 'active'
      and coalesce(store.portal_enabled, true) = true
    order by lower(coalesce(store.store_name, '')), store.id
    limit 1;
  end if;

  v_vehicle_name := btrim(concat_ws(' ',
    nullif(v_vehicle.brand, ''),
    nullif(v_vehicle.model, ''),
    nullif(v_vehicle.version, ''),
    nullif(v_vehicle.year, '')
  ));

  v_notes := concat_ws(' ',
    nullif(btrim(coalesce(p_notes, '')), ''),
    'Lead captado pelo simulador da landing do evento.',
    'Campanha: ' || coalesce(v_campaign.name, 'Evento') || '.',
    'Veículo de interesse: ' || coalesce(nullif(v_vehicle_name, ''), 'não informado') || '.',
    'Distribuição: rodízio entre lojas participantes do evento.'
  );

  if v_selected_store_id is null then
    v_metadata := coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object(
      'event_id', v_campaign.event_id,
      'campaign_slug', v_campaign.slug,
      'vehicle_owner_store_id', v_vehicle_owner_store_id,
      'routing', jsonb_build_object(
        'strategy', 'event_round_robin_unassigned',
        'assigned_store_id', null,
        'assigned_store_name', null,
        'assigned_at', null,
        'routed_lead_id', null
      )
    );

    insert into public.leads_base (
      event_id, name, phone, cpf, email, source, campaign_id, campaign_name,
      vehicle_id, vehicle_name, vehicle_price, down_payment, financed_amount,
      installments, estimated_installment, interest_rate, status,
      assigned_store_id, assigned_store_name, assigned_at, routed_lead_id,
      routing_strategy, notes, metadata, created_at, updated_at
    ) values (
      v_campaign.event_id, btrim(p_name), btrim(p_phone), nullif(btrim(coalesce(p_cpf, '')), ''),
      nullif(lower(btrim(coalesce(p_email, ''))), ''), 'Landing Page Simulador',
      v_campaign.id, v_campaign.name, v_vehicle.id, v_vehicle_name, v_vehicle.price,
      greatest(coalesce(p_down_payment, 0), 0), greatest(coalesce(p_financed_amount, 0), 0),
      p_installments, greatest(coalesce(p_estimated_installment, 0), 0),
      greatest(coalesce(p_interest_rate, v_campaign.interest_rate, 0), 0),
      'Aguardando distribuição', null, null, null, null,
      'event_round_robin_unassigned', v_notes, v_metadata, v_now, v_now
    )
    returning id into v_base_lead_id;

    return jsonb_build_object(
      'success', true,
      'duplicate', false,
      'queued_for_manual_assignment', true,
      'event_id', v_campaign.event_id,
      'base_lead_id', v_base_lead_id,
      'routed_lead_id', null,
      'assigned_store_id', null,
      'assigned_store_name', '',
      'vehicle_owner_store_id', v_vehicle_owner_store_id,
      'routing_strategy', 'event_round_robin_unassigned'
    );
  end if;

  v_next_position := v_state.routed_count + 1;

  insert into public.leads (
    event_id, customer_name, customer_phone, customer_bank, interested_vehicle,
    interested_vehicle_id, interested_vehicle_price, vehicle_category_interest,
    origin, assigned_store_id, assigned_user_id, assigned_user_role,
    assignment_source, status, notes, created_at, updated_at
  ) values (
    v_campaign.event_id, btrim(p_name), btrim(p_phone), '', v_vehicle_name,
    v_vehicle.id, v_vehicle.price, '', 'event_landing', v_selected_store_id,
    null, null, 'event_round_robin', 'new_lead', v_notes, v_now, v_now
  )
  returning id into v_routed_lead_id;

  v_metadata := coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object(
    'event_id', v_campaign.event_id,
    'campaign_slug', v_campaign.slug,
    'vehicle_owner_store_id', v_vehicle_owner_store_id,
    'routing', jsonb_build_object(
      'strategy', 'event_round_robin',
      'position', v_next_position,
      'assigned_store_id', v_selected_store_id,
      'assigned_store_name', v_selected_store_name,
      'assigned_at', v_now,
      'routed_lead_id', v_routed_lead_id
    )
  );

  insert into public.leads_base (
    event_id, name, phone, cpf, email, source, campaign_id, campaign_name,
    vehicle_id, vehicle_name, vehicle_price, down_payment, financed_amount,
    installments, estimated_installment, interest_rate, status,
    assigned_store_id, assigned_store_name, assigned_at, routed_lead_id,
    routing_strategy, notes, metadata, created_at, updated_at
  ) values (
    v_campaign.event_id, btrim(p_name), btrim(p_phone), nullif(btrim(coalesce(p_cpf, '')), ''),
    nullif(lower(btrim(coalesce(p_email, ''))), ''), 'Landing Page Simulador',
    v_campaign.id, v_campaign.name, v_vehicle.id, v_vehicle_name, v_vehicle.price,
    greatest(coalesce(p_down_payment, 0), 0), greatest(coalesce(p_financed_amount, 0), 0),
    p_installments, greatest(coalesce(p_estimated_installment, 0), 0),
    greatest(coalesce(p_interest_rate, v_campaign.interest_rate, 0), 0),
    'Novo lead', v_selected_store_id, v_selected_store_name, v_now, v_routed_lead_id,
    'event_round_robin', v_notes, v_metadata, v_now, v_now
  )
  returning id into v_base_lead_id;

  insert into public.lead_activities (
    event_id, lead_id, user_id, activity_type, description, metadata
  ) values (
    v_campaign.event_id,
    v_routed_lead_id,
    null,
    'event_round_robin_assigned',
    'Lead da landing distribuído para ' || v_selected_store_name || '.',
    v_metadata
  );

  update public.event_lead_routing_state
  set
    last_store_id = v_selected_store_id,
    routed_count = v_next_position,
    last_routed_at = v_now,
    updated_at = v_now
  where event_id = v_campaign.event_id;

  return jsonb_build_object(
    'success', true,
    'duplicate', false,
    'queued_for_manual_assignment', false,
    'event_id', v_campaign.event_id,
    'base_lead_id', v_base_lead_id,
    'routed_lead_id', v_routed_lead_id,
    'assigned_store_id', v_selected_store_id,
    'assigned_store_name', v_selected_store_name,
    'vehicle_owner_store_id', v_vehicle_owner_store_id,
    'route_position', v_next_position,
    'routing_strategy', 'event_round_robin'
  );
end;
$$;

revoke all on function public.create_event_landing_lead(
  text, text, text, text, uuid, uuid, numeric, numeric, integer, numeric, numeric, text, jsonb
) from public, anon, authenticated;

grant execute on function public.create_event_landing_lead(
  text, text, text, text, uuid, uuid, numeric, numeric, integer, numeric, numeric, text, jsonb
) to service_role;

commit;

-- ==========================================================================
-- SOURCE: remote_history/20260803043712_separate_site_vehicle_years.sql
-- ==========================================================================

begin;

alter table public.site_vehicles
  add column if not exists manufacture_year integer,
  add column if not exists model_year integer;

alter table public.site_vehicles
  drop constraint if exists site_vehicles_manufacture_year_check,
  drop constraint if exists site_vehicles_model_year_check,
  drop constraint if exists site_vehicles_year_order_check;

alter table public.site_vehicles
  add constraint site_vehicles_manufacture_year_check
    check (manufacture_year is null or manufacture_year between 1886 and 2200),
  add constraint site_vehicles_model_year_check
    check (model_year is null or model_year between 1886 and 2200),
  add constraint site_vehicles_year_order_check
    check (
      manufacture_year is null
      or model_year is null
      or model_year between manufacture_year - 1 and manufacture_year + 2
    );

with parsed as (
  select
    id,
    case
      when btrim(coalesce(year, '')) ~ '([12][0-9]{3})[[:space:]]*[/|_-][[:space:]]*([12][0-9]{3})'
        then ((regexp_match(btrim(year), '([12][0-9]{3})[[:space:]]*[/|_-][[:space:]]*([12][0-9]{3})'))[1])::integer
      else null
    end as parsed_manufacture_year,
    case
      when btrim(coalesce(year, '')) ~ '([12][0-9]{3})[[:space:]]*[/|_-][[:space:]]*([12][0-9]{3})'
        then ((regexp_match(btrim(year), '([12][0-9]{3})[[:space:]]*[/|_-][[:space:]]*([12][0-9]{3})'))[2])::integer
      when btrim(coalesce(year, '')) ~ '([12][0-9]{3})'
        then ((regexp_match(btrim(year), '([12][0-9]{3})'))[1])::integer
      else null
    end as parsed_model_year
  from public.site_vehicles
)
update public.site_vehicles as vehicle
set
  manufacture_year = coalesce(vehicle.manufacture_year, parsed.parsed_manufacture_year),
  model_year = coalesce(vehicle.model_year, parsed.parsed_model_year)
from parsed
where parsed.id = vehicle.id
  and (vehicle.manufacture_year is null or vehicle.model_year is null);

create or replace function public.sync_site_vehicle_year_fields()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  legacy_year text := btrim(coalesce(new.year, ''));
  pair_parts text[];
  single_part text[];
  legacy_changed boolean := false;
begin
  if tg_op = 'UPDATE' then
    legacy_changed := new.year is distinct from old.year
      and new.manufacture_year is not distinct from old.manufacture_year
      and new.model_year is not distinct from old.model_year;
  end if;

  if legacy_changed then
    new.manufacture_year := null;
    new.model_year := null;
  end if;

  if new.manufacture_year is null and new.model_year is null and legacy_year <> '' then
    pair_parts := regexp_match(
      legacy_year,
      '([12][0-9]{3})[[:space:]]*[/|_-][[:space:]]*([12][0-9]{3})'
    );

    if pair_parts is not null then
      new.manufacture_year := pair_parts[1]::integer;
      new.model_year := pair_parts[2]::integer;
    else
      single_part := regexp_match(legacy_year, '([12][0-9]{3})');
      if single_part is not null then
        new.model_year := single_part[1]::integer;
      end if;
    end if;
  end if;

  if new.manufacture_year is not null and new.model_year is not null then
    new.year := case
      when new.manufacture_year = new.model_year then new.model_year::text
      else new.manufacture_year::text || '/' || new.model_year::text
    end;
  elsif new.model_year is not null then
    new.year := new.model_year::text;
  elsif new.manufacture_year is not null then
    new.year := new.manufacture_year::text;
  else
    new.year := nullif(legacy_year, '');
  end if;

  return new;
end;
$$;

drop trigger if exists site_vehicles_sync_year_fields on public.site_vehicles;
create trigger site_vehicles_sync_year_fields
before insert or update of year, manufacture_year, model_year
on public.site_vehicles
for each row
execute function public.sync_site_vehicle_year_fields();

create index if not exists site_vehicles_manufacture_year_idx
  on public.site_vehicles (manufacture_year)
  where manufacture_year is not null;

create index if not exists site_vehicles_model_year_idx
  on public.site_vehicles (model_year)
  where model_year is not null;

comment on column public.site_vehicles.manufacture_year is
  'Ano de fabricação do veículo. Pode permanecer nulo quando o anúncio informa apenas o ano-modelo.';
comment on column public.site_vehicles.model_year is
  'Ano-modelo do veículo.';
comment on column public.site_vehicles.year is
  'Campo legado de exibição, mantido sincronizado com manufacture_year e model_year.';

commit;

-- ==========================================================================
-- SOURCE: remote_history/20260803200909_expand_lead_commercial_details.sql
-- ==========================================================================

alter table public.lead_commercial_details
  add column if not exists has_driver_license boolean,
  add column if not exists cpf text,
  add column if not exists birth_date date,
  add column if not exists trade_vehicle_configuration_id uuid,
  add column if not exists trade_vehicle_name text,
  add column if not exists trade_vehicle_manufacture_year integer,
  add column if not exists trade_vehicle_model_year integer;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'lead_commercial_details_trade_vehicle_configuration_id_fkey'
      and conrelid = 'public.lead_commercial_details'::regclass
  ) then
    alter table public.lead_commercial_details
      add constraint lead_commercial_details_trade_vehicle_configuration_id_fkey
      foreign key (trade_vehicle_configuration_id)
      references public.vehicle_catalog_configurations(id)
      on delete set null;
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'lead_commercial_details_cpf_format_check'
      and conrelid = 'public.lead_commercial_details'::regclass
  ) then
    alter table public.lead_commercial_details
      add constraint lead_commercial_details_cpf_format_check
      check (cpf is null or cpf ~ '^[0-9]{11}$');
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'lead_commercial_details_birth_date_check'
      and conrelid = 'public.lead_commercial_details'::regclass
  ) then
    alter table public.lead_commercial_details
      add constraint lead_commercial_details_birth_date_check
      check (birth_date is null or (birth_date >= date '1900-01-01' and birth_date <= current_date));
  end if;
end
$$;

create index if not exists idx_lead_commercial_details_trade_vehicle_configuration_id
  on public.lead_commercial_details (trade_vehicle_configuration_id);

comment on column public.lead_commercial_details.has_driver_license is
  'Indica se o cliente declarou possuir CNH.';
comment on column public.lead_commercial_details.cpf is
  'CPF do cliente normalizado com 11 dígitos. A API deve restringir acesso e não registrar o valor em logs.';
comment on column public.lead_commercial_details.birth_date is
  'Data de nascimento declarada pelo cliente.';
comment on column public.lead_commercial_details.trade_vehicle_configuration_id is
  'Configuração do catálogo Master selecionada para o veículo recebido na troca.';
comment on column public.lead_commercial_details.trade_vehicle_name is
  'Snapshot legível do veículo selecionado para troca.';

-- ==========================================================================
-- SOURCE: remote_history/20260805001416_allow_umbler_talk_origin.sql
-- ==========================================================================

alter table public.leads
  drop constraint if exists leads_origin_check;

alter table public.leads
  add constraint leads_origin_check
  check (
    origin::text = any (
      array[
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
        'umbler_talk'::text
      ]
    )
  );

-- ==========================================================================
-- SOURCE: baseline/sources/baseline_privileges_finalization.sql
-- ==========================================================================

-- AUTO CONTROLE AUTOMOTIVO
-- FINALIZACAO DE PRIVILEGIOS PARA REPLAY DESCARTAVEL - NAO APLICAR EM PRODUCAO
-- Executar somente depois das 45 migrations no ambiente de teste.

begin;

-- section 10: public.appointments|anon
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.appointments to anon;

-- section 10: public.appointments|authenticated
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.appointments to authenticated;

-- section 10: public.appointments|service_role
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.appointments to service_role;

-- section 10: public.audit_logs|anon
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.audit_logs to anon;

-- section 10: public.audit_logs|authenticated
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.audit_logs to authenticated;

-- section 10: public.audit_logs|service_role
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.audit_logs to service_role;

-- section 10: public.banks|anon
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.banks to anon;

-- section 10: public.banks|authenticated
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.banks to authenticated;

-- section 10: public.banks|service_role
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.banks to service_role;

-- section 10: public.event_lead_routing_state|service_role
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.event_lead_routing_state to service_role;

-- section 10: public.event_vehicle_assignments|anon
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.event_vehicle_assignments to anon;

-- section 10: public.event_vehicle_assignments|authenticated
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.event_vehicle_assignments to authenticated;

-- section 10: public.event_vehicle_assignments|service_role
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.event_vehicle_assignments to service_role;

-- section 10: public.events|anon
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.events to anon;

-- section 10: public.events|authenticated
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.events to authenticated;

-- section 10: public.events|service_role
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.events to service_role;

-- section 10: public.financial_entries|anon
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.financial_entries to anon;

-- section 10: public.financial_entries|authenticated
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.financial_entries to authenticated;

-- section 10: public.financial_entries|service_role
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.financial_entries to service_role;

-- section 10: public.inventory|anon
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.inventory to anon;

-- section 10: public.inventory|authenticated
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.inventory to authenticated;

-- section 10: public.inventory|service_role
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.inventory to service_role;

-- section 10: public.lead_activities|anon
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.lead_activities to anon;

-- section 10: public.lead_activities|authenticated
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.lead_activities to authenticated;

-- section 10: public.lead_activities|service_role
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.lead_activities to service_role;

-- section 10: public.lead_activity_logs|anon
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.lead_activity_logs to anon;

-- section 10: public.lead_activity_logs|authenticated
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.lead_activity_logs to authenticated;

-- section 10: public.lead_activity_logs|service_role
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.lead_activity_logs to service_role;

-- section 10: public.lead_assignment_logs|anon
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.lead_assignment_logs to anon;

-- section 10: public.lead_assignment_logs|authenticated
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.lead_assignment_logs to authenticated;

-- section 10: public.lead_assignment_logs|service_role
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.lead_assignment_logs to service_role;

-- section 10: public.lead_commercial_details|anon
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.lead_commercial_details to anon;

-- section 10: public.lead_commercial_details|authenticated
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.lead_commercial_details to authenticated;

-- section 10: public.lead_commercial_details|service_role
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.lead_commercial_details to service_role;

-- section 10: public.lead_ingestion_locks|anon
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.lead_ingestion_locks to anon;

-- section 10: public.lead_ingestion_locks|authenticated
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.lead_ingestion_locks to authenticated;

-- section 10: public.lead_ingestion_locks|service_role
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.lead_ingestion_locks to service_role;

-- section 10: public.lead_notes|service_role
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.lead_notes to service_role;

-- section 10: public.lead_routing_state|anon
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.lead_routing_state to anon;

-- section 10: public.lead_routing_state|authenticated
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.lead_routing_state to authenticated;

-- section 10: public.lead_routing_state|service_role
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.lead_routing_state to service_role;

-- section 10: public.leads_base|anon
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.leads_base to anon;

-- section 10: public.leads_base|authenticated
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.leads_base to authenticated;

-- section 10: public.leads_base|service_role
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.leads_base to service_role;

-- section 10: public.leads|anon
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.leads to anon;

-- section 10: public.leads|authenticated
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.leads to authenticated;

-- section 10: public.leads|service_role
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.leads to service_role;

-- section 10: public.losses|anon
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.losses to anon;

-- section 10: public.losses|authenticated
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.losses to authenticated;

-- section 10: public.losses|service_role
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.losses to service_role;

-- section 10: public.marketing_integrations|anon
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.marketing_integrations to anon;

-- section 10: public.marketing_integrations|authenticated
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.marketing_integrations to authenticated;

-- section 10: public.marketing_integrations|service_role
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.marketing_integrations to service_role;

-- section 10: public.portal_settings|service_role
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.portal_settings to service_role;

-- section 10: public.prospectors|anon
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.prospectors to anon;

-- section 10: public.prospectors|authenticated
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.prospectors to authenticated;

-- section 10: public.prospectors|service_role
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.prospectors to service_role;

-- section 10: public.sales|anon
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.sales to anon;

-- section 10: public.sales|authenticated
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.sales to authenticated;

-- section 10: public.sales|service_role
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.sales to service_role;

-- section 10: public.site_campaign_layouts|anon
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.site_campaign_layouts to anon;

-- section 10: public.site_campaign_layouts|authenticated
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.site_campaign_layouts to authenticated;

-- section 10: public.site_campaign_layouts|service_role
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.site_campaign_layouts to service_role;

-- section 10: public.site_campaigns|anon
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.site_campaigns to anon;

-- section 10: public.site_campaigns|authenticated
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.site_campaigns to authenticated;

-- section 10: public.site_campaigns|service_role
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.site_campaigns to service_role;

-- section 10: public.site_vehicles|anon
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.site_vehicles to anon;

-- section 10: public.site_vehicles|authenticated
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.site_vehicles to authenticated;

-- section 10: public.site_vehicles|service_role
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.site_vehicles to service_role;

-- section 10: public.store_calendar_tasks|anon
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.store_calendar_tasks to anon;

-- section 10: public.store_calendar_tasks|authenticated
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.store_calendar_tasks to authenticated;

-- section 10: public.store_calendar_tasks|service_role
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.store_calendar_tasks to service_role;

-- section 10: public.store_event_participations|anon
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.store_event_participations to anon;

-- section 10: public.store_event_participations|authenticated
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.store_event_participations to authenticated;

-- section 10: public.store_event_participations|service_role
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.store_event_participations to service_role;

-- section 10: public.store_portal_applications|anon
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.store_portal_applications to anon;

-- section 10: public.store_portal_applications|authenticated
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.store_portal_applications to authenticated;

-- section 10: public.store_portal_applications|service_role
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.store_portal_applications to service_role;

-- section 10: public.store_portal_audit|anon
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.store_portal_audit to anon;

-- section 10: public.store_portal_audit|authenticated
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.store_portal_audit to authenticated;

-- section 10: public.store_portal_audit|service_role
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.store_portal_audit to service_role;

-- section 10: public.store_registration_links|anon
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.store_registration_links to anon;

-- section 10: public.store_registration_links|authenticated
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.store_registration_links to authenticated;

-- section 10: public.store_registration_links|service_role
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.store_registration_links to service_role;

-- section 10: public.store_stock_imports|anon
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.store_stock_imports to anon;

-- section 10: public.store_stock_imports|authenticated
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.store_stock_imports to authenticated;

-- section 10: public.store_stock_imports|service_role
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.store_stock_imports to service_role;

-- section 10: public.store_team_registration_links|authenticated
grant SELECT on table public.store_team_registration_links to authenticated;

-- section 10: public.store_team_registration_links|service_role
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.store_team_registration_links to service_role;

-- section 10: public.store_team_routing_state|anon
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.store_team_routing_state to anon;

-- section 10: public.store_team_routing_state|authenticated
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.store_team_routing_state to authenticated;

-- section 10: public.store_team_routing_state|service_role
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.store_team_routing_state to service_role;

-- section 10: public.store_vehicle_link_submissions|anon
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.store_vehicle_link_submissions to anon;

-- section 10: public.store_vehicle_link_submissions|authenticated
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.store_vehicle_link_submissions to authenticated;

-- section 10: public.store_vehicle_link_submissions|service_role
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.store_vehicle_link_submissions to service_role;

-- section 10: public.stores|anon
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.stores to anon;

-- section 10: public.stores|authenticated
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.stores to authenticated;

-- section 10: public.stores|service_role
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.stores to service_role;

-- section 10: public.street_surveys|anon
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.street_surveys to anon;

-- section 10: public.street_surveys|authenticated
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.street_surveys to authenticated;

-- section 10: public.street_surveys|service_role
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.street_surveys to service_role;

-- section 10: public.users|anon
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.users to anon;

-- section 10: public.users|authenticated
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.users to authenticated;

-- section 10: public.users|service_role
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.users to service_role;

-- section 10: public.vehicle_attribute_options|anon
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.vehicle_attribute_options to anon;

-- section 10: public.vehicle_attribute_options|authenticated
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.vehicle_attribute_options to authenticated;

-- section 10: public.vehicle_attribute_options|service_role
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.vehicle_attribute_options to service_role;

-- section 10: public.vehicle_catalog_aliases|anon
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.vehicle_catalog_aliases to anon;

-- section 10: public.vehicle_catalog_aliases|authenticated
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.vehicle_catalog_aliases to authenticated;

-- section 10: public.vehicle_catalog_aliases|service_role
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.vehicle_catalog_aliases to service_role;

-- section 10: public.vehicle_catalog_brands|anon
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.vehicle_catalog_brands to anon;

-- section 10: public.vehicle_catalog_brands|authenticated
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.vehicle_catalog_brands to authenticated;

-- section 10: public.vehicle_catalog_brands|service_role
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.vehicle_catalog_brands to service_role;

-- section 10: public.vehicle_catalog_colors|anon
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.vehicle_catalog_colors to anon;

-- section 10: public.vehicle_catalog_colors|authenticated
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.vehicle_catalog_colors to authenticated;

-- section 10: public.vehicle_catalog_colors|service_role
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.vehicle_catalog_colors to service_role;

-- section 10: public.vehicle_catalog_configurations|anon
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.vehicle_catalog_configurations to anon;

-- section 10: public.vehicle_catalog_configurations|authenticated
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.vehicle_catalog_configurations to authenticated;

-- section 10: public.vehicle_catalog_configurations|service_role
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.vehicle_catalog_configurations to service_role;

-- section 10: public.vehicle_catalog_fuels|anon
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.vehicle_catalog_fuels to anon;

-- section 10: public.vehicle_catalog_fuels|authenticated
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.vehicle_catalog_fuels to authenticated;

-- section 10: public.vehicle_catalog_fuels|service_role
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.vehicle_catalog_fuels to service_role;

-- section 10: public.vehicle_catalog_models|anon
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.vehicle_catalog_models to anon;

-- section 10: public.vehicle_catalog_models|authenticated
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.vehicle_catalog_models to authenticated;

-- section 10: public.vehicle_catalog_models|service_role
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.vehicle_catalog_models to service_role;

-- section 10: public.vehicle_catalog_suggestions|anon
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.vehicle_catalog_suggestions to anon;

-- section 10: public.vehicle_catalog_suggestions|authenticated
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.vehicle_catalog_suggestions to authenticated;

-- section 10: public.vehicle_catalog_suggestions|service_role
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.vehicle_catalog_suggestions to service_role;

-- section 10: public.vehicle_catalog_transmissions|anon
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.vehicle_catalog_transmissions to anon;

-- section 10: public.vehicle_catalog_transmissions|authenticated
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.vehicle_catalog_transmissions to authenticated;

-- section 10: public.vehicle_catalog_transmissions|service_role
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.vehicle_catalog_transmissions to service_role;

-- section 10: public.vehicle_catalog_versions|anon
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.vehicle_catalog_versions to anon;

-- section 10: public.vehicle_catalog_versions|authenticated
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.vehicle_catalog_versions to authenticated;

-- section 10: public.vehicle_catalog_versions|service_role
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.vehicle_catalog_versions to service_role;

-- section 10: public.whatsapp_contacts|anon
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.whatsapp_contacts to anon;

-- section 10: public.whatsapp_contacts|authenticated
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.whatsapp_contacts to authenticated;

-- section 10: public.whatsapp_contacts|service_role
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.whatsapp_contacts to service_role;

-- section 10: public.whatsapp_conversations|anon
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.whatsapp_conversations to anon;

-- section 10: public.whatsapp_conversations|authenticated
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.whatsapp_conversations to authenticated;

-- section 10: public.whatsapp_conversations|service_role
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.whatsapp_conversations to service_role;

-- section 10: public.whatsapp_messages|anon
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.whatsapp_messages to anon;

-- section 10: public.whatsapp_messages|authenticated
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.whatsapp_messages to authenticated;

-- section 10: public.whatsapp_messages|service_role
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.whatsapp_messages to service_role;

-- section 10: public.whatsapp_numbers|anon
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.whatsapp_numbers to anon;

-- section 10: public.whatsapp_numbers|authenticated
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.whatsapp_numbers to authenticated;

-- section 10: public.whatsapp_numbers|service_role
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.whatsapp_numbers to service_role;

-- section 20: private.can_access_lead(p_lead_id uuid)|authenticated
grant execute on function private.can_access_lead(p_lead_id uuid) to authenticated;

-- section 20: private.can_access_lead(p_lead_id uuid)|service_role
grant execute on function private.can_access_lead(p_lead_id uuid) to service_role;

-- section 20: private.can_manage_store(p_store_id uuid)|authenticated
grant execute on function private.can_manage_store(p_store_id uuid) to authenticated;

-- section 20: private.can_manage_store(p_store_id uuid)|service_role
grant execute on function private.can_manage_store(p_store_id uuid) to service_role;

-- section 20: private.is_own_prospector(p_prospector_id uuid)|authenticated
grant execute on function private.is_own_prospector(p_prospector_id uuid) to authenticated;

-- section 20: private.is_own_prospector(p_prospector_id uuid)|service_role
grant execute on function private.is_own_prospector(p_prospector_id uuid) to service_role;

-- section 20: public.assign_lead_to_store_team(p_lead_id uuid, p_role text, p_requested_user_id uuid, p_assignment_mode text, p_assigned_by_user_id uuid, p_notes text)|service_role
grant execute on function public.assign_lead_to_store_team(p_lead_id uuid, p_role text, p_requested_user_id uuid, p_assignment_mode text, p_assigned_by_user_id uuid, p_notes text) to service_role;

-- section 20: public.claim_lead_ingestion_lock(p_source text, p_dedup_key text, p_window_seconds integer)|anon
grant execute on function public.claim_lead_ingestion_lock(p_source text, p_dedup_key text, p_window_seconds integer) to anon;

-- section 20: public.claim_lead_ingestion_lock(p_source text, p_dedup_key text, p_window_seconds integer)|authenticated
grant execute on function public.claim_lead_ingestion_lock(p_source text, p_dedup_key text, p_window_seconds integer) to authenticated;

-- section 20: public.claim_lead_ingestion_lock(p_source text, p_dedup_key text, p_window_seconds integer)|service_role
grant execute on function public.claim_lead_ingestion_lock(p_source text, p_dedup_key text, p_window_seconds integer) to service_role;

-- section 20: public.create_event_landing_lead(p_name text, p_phone text, p_cpf text, p_email text, p_campaign_id uuid, p_vehicle_id uuid, p_down_payment numeric, p_financed_amount numeric, p_installments integer, p_estimated_installment numeric, p_interest_rate numeric, p_notes text, p_metadata jsonb)|service_role
grant execute on function public.create_event_landing_lead(p_name text, p_phone text, p_cpf text, p_email text, p_campaign_id uuid, p_vehicle_id uuid, p_down_payment numeric, p_financed_amount numeric, p_installments integer, p_estimated_installment numeric, p_interest_rate numeric, p_notes text, p_metadata jsonb) to service_role;

-- section 20: public.create_marketplace_lead(p_name text, p_phone text, p_cpf text, p_email text, p_vehicle_id uuid, p_down_payment numeric, p_installments integer)|service_role
grant execute on function public.create_marketplace_lead(p_name text, p_phone text, p_cpf text, p_email text, p_vehicle_id uuid, p_down_payment numeric, p_installments integer) to service_role;

-- section 20: public.current_app_role()|anon
grant execute on function public.current_app_role() to anon;

-- section 20: public.current_app_role()|authenticated
grant execute on function public.current_app_role() to authenticated;

-- section 20: public.current_app_role()|service_role
grant execute on function public.current_app_role() to service_role;

-- section 20: public.current_app_store_id()|anon
grant execute on function public.current_app_store_id() to anon;

-- section 20: public.current_app_store_id()|authenticated
grant execute on function public.current_app_store_id() to authenticated;

-- section 20: public.current_app_store_id()|service_role
grant execute on function public.current_app_store_id() to service_role;

-- section 20: public.current_app_user()|anon
grant execute on function public.current_app_user() to anon;

-- section 20: public.current_app_user()|authenticated
grant execute on function public.current_app_user() to authenticated;

-- section 20: public.current_app_user()|service_role
grant execute on function public.current_app_user() to service_role;

-- section 20: public.current_app_user_id()|anon
grant execute on function public.current_app_user_id() to anon;

-- section 20: public.current_app_user_id()|authenticated
grant execute on function public.current_app_user_id() to authenticated;

-- section 20: public.current_app_user_id()|service_role
grant execute on function public.current_app_user_id() to service_role;

-- section 20: public.is_commercial_team()|anon
grant execute on function public.is_commercial_team() to anon;

-- section 20: public.is_commercial_team()|authenticated
grant execute on function public.is_commercial_team() to authenticated;

-- section 20: public.is_commercial_team()|service_role
grant execute on function public.is_commercial_team() to service_role;

-- section 20: public.is_master()|anon
grant execute on function public.is_master() to anon;

-- section 20: public.is_master()|authenticated
grant execute on function public.is_master() to authenticated;

-- section 20: public.is_master()|service_role
grant execute on function public.is_master() to service_role;

-- section 20: public.is_store_user()|anon
grant execute on function public.is_store_user() to anon;

-- section 20: public.is_store_user()|authenticated
grant execute on function public.is_store_user() to authenticated;

-- section 20: public.is_store_user()|service_role
grant execute on function public.is_store_user() to service_role;

-- section 20: public.log_lead_activity_from_leads()|service_role
grant execute on function public.log_lead_activity_from_leads() to service_role;

-- section 20: public.pick_next_lead_store(p_routing_key text)|service_role
grant execute on function public.pick_next_lead_store(p_routing_key text) to service_role;

-- section 20: public.rls_auto_enable()|anon
grant execute on function public.rls_auto_enable() to anon;

-- section 20: public.rls_auto_enable()|authenticated
grant execute on function public.rls_auto_enable() to authenticated;

-- section 20: public.rls_auto_enable()|service_role
grant execute on function public.rls_auto_enable() to service_role;

-- section 20: public.save_portal_settings_transaction(p_actor_user_id uuid, p_settings jsonb)|service_role
grant execute on function public.save_portal_settings_transaction(p_actor_user_id uuid, p_settings jsonb) to service_role;

-- section 20: public.slugify_store_name(input text)|anon
grant execute on function public.slugify_store_name(input text) to anon;

-- section 20: public.slugify_store_name(input text)|authenticated
grant execute on function public.slugify_store_name(input text) to authenticated;

-- section 20: public.slugify_store_name(input text)|service_role
grant execute on function public.slugify_store_name(input text) to service_role;

-- section 20: public.slugify_text(input text)|anon
grant execute on function public.slugify_text(input text) to anon;

-- section 20: public.slugify_text(input text)|authenticated
grant execute on function public.slugify_text(input text) to authenticated;

-- section 20: public.slugify_text(input text)|service_role
grant execute on function public.slugify_text(input text) to service_role;

-- section 20: public.store_cancel_sale_transaction(p_lead_id uuid, p_store_id uuid, p_reason text, p_actor_user_id uuid, p_actor_name text)|service_role
grant execute on function public.store_cancel_sale_transaction(p_lead_id uuid, p_store_id uuid, p_reason text, p_actor_user_id uuid, p_actor_name text) to service_role;

-- section 20: public.store_confirm_sale_transaction(p_lead_id uuid, p_store_id uuid, p_seller_user_id uuid, p_vehicle_mode text, p_vehicle_id uuid, p_vehicle_name text, p_payment_type text, p_financing_bank text, p_has_trade_in boolean, p_sale_value numeric, p_installment_count integer, p_has_down_payment boolean, p_down_payment_value numeric, p_financed_amount numeric, p_installment_value numeric, p_actor_user_id uuid, p_actor_name text)|service_role
grant execute on function public.store_confirm_sale_transaction(p_lead_id uuid, p_store_id uuid, p_seller_user_id uuid, p_vehicle_mode text, p_vehicle_id uuid, p_vehicle_name text, p_payment_type text, p_financing_bank text, p_has_trade_in boolean, p_sale_value numeric, p_installment_count integer, p_has_down_payment boolean, p_down_payment_value numeric, p_financed_amount numeric, p_installment_value numeric, p_actor_user_id uuid, p_actor_name text) to service_role;

-- section 20: public.store_register_loss_transaction(p_lead_id uuid, p_store_id uuid, p_reason text, p_description text, p_actor_user_id uuid, p_actor_name text)|service_role
grant execute on function public.store_register_loss_transaction(p_lead_id uuid, p_store_id uuid, p_reason text, p_description text, p_actor_user_id uuid, p_actor_name text) to service_role;

-- section 20: public.store_update_commercial_transaction(p_lead_id uuid, p_store_id uuid, p_payment_type text, p_financing_bank text, p_sale_value numeric, p_installment_count integer, p_has_down_payment boolean, p_down_payment_value numeric, p_financed_amount numeric, p_installment_value numeric, p_has_trade_in boolean, p_actor_user_id uuid, p_actor_name text)|service_role
grant execute on function public.store_update_commercial_transaction(p_lead_id uuid, p_store_id uuid, p_payment_type text, p_financing_bank text, p_sale_value numeric, p_installment_count integer, p_has_down_payment boolean, p_down_payment_value numeric, p_financed_amount numeric, p_installment_value numeric, p_has_trade_in boolean, p_actor_user_id uuid, p_actor_name text) to service_role;

-- section 20: public.sync_event_inventory(p_event_id uuid)|service_role
grant execute on function public.sync_event_inventory(p_event_id uuid) to service_role;

-- section 20: public.sync_leads_base_event_scope()|service_role
grant execute on function public.sync_leads_base_event_scope() to service_role;

-- section 20: public.sync_new_vehicle_to_events_trigger()|service_role
grant execute on function public.sync_new_vehicle_to_events_trigger() to service_role;

-- section 20: public.sync_participation_inventory_trigger()|service_role
grant execute on function public.sync_participation_inventory_trigger() to service_role;

-- section 20: public.sync_sale_vehicle_from_lead()|service_role
grant execute on function public.sync_sale_vehicle_from_lead() to service_role;

-- section 20: public.sync_site_vehicle_sale_lifecycle()|service_role
grant execute on function public.sync_site_vehicle_sale_lifecycle() to service_role;

-- section 20: public.sync_site_vehicle_year_fields()|anon
grant execute on function public.sync_site_vehicle_year_fields() to anon;

-- section 20: public.sync_site_vehicle_year_fields()|authenticated
grant execute on function public.sync_site_vehicle_year_fields() to authenticated;

-- section 20: public.sync_site_vehicle_year_fields()|service_role
grant execute on function public.sync_site_vehicle_year_fields() to service_role;

-- section 20: public.touch_store_team_registration_links_updated_at()|anon
grant execute on function public.touch_store_team_registration_links_updated_at() to anon;

-- section 20: public.touch_store_team_registration_links_updated_at()|authenticated
grant execute on function public.touch_store_team_registration_links_updated_at() to authenticated;

-- section 20: public.touch_store_team_registration_links_updated_at()|service_role
grant execute on function public.touch_store_team_registration_links_updated_at() to service_role;

-- section 20: public.unaccent(regdictionary, text)|anon
grant execute on function public.unaccent(regdictionary, text) to anon;

-- section 20: public.unaccent(regdictionary, text)|authenticated
grant execute on function public.unaccent(regdictionary, text) to authenticated;

-- section 20: public.unaccent(regdictionary, text)|service_role
grant execute on function public.unaccent(regdictionary, text) to service_role;

-- section 20: public.unaccent(text)|anon
grant execute on function public.unaccent(text) to anon;

-- section 20: public.unaccent(text)|authenticated
grant execute on function public.unaccent(text) to authenticated;

-- section 20: public.unaccent(text)|service_role
grant execute on function public.unaccent(text) to service_role;

-- section 20: public.unaccent_init(internal)|anon
grant execute on function public.unaccent_init(internal) to anon;

-- section 20: public.unaccent_init(internal)|authenticated
grant execute on function public.unaccent_init(internal) to authenticated;

-- section 20: public.unaccent_init(internal)|service_role
grant execute on function public.unaccent_init(internal) to service_role;

-- section 20: public.unaccent_lexize(internal, internal, internal, internal)|anon
grant execute on function public.unaccent_lexize(internal, internal, internal, internal) to anon;

-- section 20: public.unaccent_lexize(internal, internal, internal, internal)|authenticated
grant execute on function public.unaccent_lexize(internal, internal, internal, internal) to authenticated;

-- section 20: public.unaccent_lexize(internal, internal, internal, internal)|service_role
grant execute on function public.unaccent_lexize(internal, internal, internal, internal) to service_role;

-- section 20: public.validate_lead_team_assignment()|service_role
grant execute on function public.validate_lead_team_assignment() to service_role;

-- section 20: public.vehicle_catalog_normalize_text(input_text text)|anon
grant execute on function public.vehicle_catalog_normalize_text(input_text text) to anon;

-- section 20: public.vehicle_catalog_normalize_text(input_text text)|authenticated
grant execute on function public.vehicle_catalog_normalize_text(input_text text) to authenticated;

-- section 20: public.vehicle_catalog_normalize_text(input_text text)|service_role
grant execute on function public.vehicle_catalog_normalize_text(input_text text) to service_role;

-- section 20: public.vehicle_catalog_remove_target_aliases()|anon
grant execute on function public.vehicle_catalog_remove_target_aliases() to anon;

-- section 20: public.vehicle_catalog_remove_target_aliases()|authenticated
grant execute on function public.vehicle_catalog_remove_target_aliases() to authenticated;

-- section 20: public.vehicle_catalog_remove_target_aliases()|service_role
grant execute on function public.vehicle_catalog_remove_target_aliases() to service_role;

-- section 20: public.vehicle_catalog_touch_updated_at()|anon
grant execute on function public.vehicle_catalog_touch_updated_at() to anon;

-- section 20: public.vehicle_catalog_touch_updated_at()|authenticated
grant execute on function public.vehicle_catalog_touch_updated_at() to authenticated;

-- section 20: public.vehicle_catalog_touch_updated_at()|service_role
grant execute on function public.vehicle_catalog_touch_updated_at() to service_role;

-- section 20: public.vehicle_catalog_validate_alias_target()|anon
grant execute on function public.vehicle_catalog_validate_alias_target() to anon;

-- section 20: public.vehicle_catalog_validate_alias_target()|authenticated
grant execute on function public.vehicle_catalog_validate_alias_target() to authenticated;

-- section 20: public.vehicle_catalog_validate_alias_target()|service_role
grant execute on function public.vehicle_catalog_validate_alias_target() to service_role;

commit;

-- ==========================================================================
-- SOURCE: baseline/sources/baseline_storage.sql
-- ==========================================================================

-- AUTO CONTROLE AUTOMOTIVO
-- CAMADA DE STORAGE DO CANDIDATO DE BASELINE - NAO APLICAR EM PRODUCAO
-- Definicoes reproduzidas do catalogo atual exclusivamente para replay descartavel.
-- Aplicar como camada final do replay, depois das 45 migrations historicas e
-- de baseline_privileges_finalization_candidate.sql.

begin;

-- Buckets ausentes do historico versionado.
insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types,
  type,
  avif_autodetection
)
values
  (
    'vehicle-images',
    'vehicle-images',
    true,
    null,
    null,
    'STANDARD',
    false
  ),
  (
    'stock-imports',
    'stock-imports',
    false,
    20971520,
    array[
      'text/csv',
      'text/plain',
      'text/xml',
      'application/xml',
      'application/vnd.ms-excel',
      'application/octet-stream'
    ]::text[],
    'STANDARD',
    false
  )
on conflict (id) do update
set name = excluded.name,
    public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types,
    type = excluded.type,
    avif_autodetection = excluded.avif_autodetection;

-- vehicle-images: quatro policies existentes no catalogo atual.
drop policy if exists "Authenticated can delete vehicle images" on storage.objects;
create policy "Authenticated can delete vehicle images"
on storage.objects as permissive
for delete to authenticated
using (bucket_id = 'vehicle-images'::text);

drop policy if exists "Authenticated can update vehicle images" on storage.objects;
create policy "Authenticated can update vehicle images"
on storage.objects as permissive
for update to authenticated
using (bucket_id = 'vehicle-images'::text)
with check (bucket_id = 'vehicle-images'::text);

drop policy if exists "Authenticated can upload vehicle images" on storage.objects;
create policy "Authenticated can upload vehicle images"
on storage.objects as permissive
for insert to authenticated
with check (bucket_id = 'vehicle-images'::text);

drop policy if exists "Public can read vehicle images" on storage.objects;
create policy "Public can read vehicle images"
on storage.objects as permissive
for select to public
using (bucket_id = 'vehicle-images'::text);

-- stock-imports: sete policies existentes no catalogo atual.
drop policy if exists stock_imports_master_delete on storage.objects;
create policy stock_imports_master_delete
on storage.objects as permissive
for delete to authenticated
using ((bucket_id = 'stock-imports'::text) and is_master());

drop policy if exists stock_imports_master_insert on storage.objects;
create policy stock_imports_master_insert
on storage.objects as permissive
for insert to authenticated
with check ((bucket_id = 'stock-imports'::text) and is_master());

drop policy if exists stock_imports_master_select on storage.objects;
create policy stock_imports_master_select
on storage.objects as permissive
for select to authenticated
using ((bucket_id = 'stock-imports'::text) and is_master());

drop policy if exists stock_imports_master_update on storage.objects;
create policy stock_imports_master_update
on storage.objects as permissive
for update to authenticated
using ((bucket_id = 'stock-imports'::text) and is_master())
with check ((bucket_id = 'stock-imports'::text) and is_master());

drop policy if exists stock_imports_store_insert_own on storage.objects;
create policy stock_imports_store_insert_own
on storage.objects as permissive
for insert to authenticated
with check (
  (bucket_id = 'stock-imports'::text)
  and ((storage.foldername(name))[1] = (current_app_store_id())::text)
);

drop policy if exists stock_imports_store_select_own on storage.objects;
create policy stock_imports_store_select_own
on storage.objects as permissive
for select to authenticated
using (
  (bucket_id = 'stock-imports'::text)
  and ((storage.foldername(name))[1] = (current_app_store_id())::text)
);

drop policy if exists stock_imports_store_update_own on storage.objects;
create policy stock_imports_store_update_own
on storage.objects as permissive
for update to authenticated
using (
  (bucket_id = 'stock-imports'::text)
  and ((storage.foldername(name))[1] = (current_app_store_id())::text)
)
with check (
  (bucket_id = 'stock-imports'::text)
  and ((storage.foldername(name))[1] = (current_app_store_id())::text)
);

commit;

-- ==========================================================================
-- SOURCE: remote_history/20260805173249_apply_pick_next_lead_store_by_event.sql
-- ==========================================================================

create or replace function public.pick_next_lead_store_by_event(
  p_event_id uuid,
  p_routing_key text default 'umbler_talk'
)
returns table(
  store_id uuid,
  store_name text,
  event_id uuid,
  route_position integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  effective_routing_key text := concat(coalesce(nullif(p_routing_key, ''), 'umbler_talk'), ':event:', p_event_id::text);
  total_stores integer;
  current_position integer;
  next_position integer;
  selected_store_id uuid;
begin
  if p_event_id is null then
    return;
  end if;

  insert into public.lead_routing_state (routing_key, last_position)
  values (effective_routing_key, -1)
  on conflict (routing_key) do nothing;

  perform 1
  from public.lead_routing_state
  where routing_key = effective_routing_key
  for update;

  select count(*)
  into total_stores
  from public.stores s
  where s.event_id = p_event_id
    and s.status = 'active'
    and coalesce(s.portal_enabled, true) = true;

  if total_stores = 0 then
    return;
  end if;

  select last_position
  into current_position
  from public.lead_routing_state
  where routing_key = effective_routing_key;

  next_position := (coalesce(current_position, -1) + 1) % total_stores;

  select s.id
  into selected_store_id
  from public.stores s
  where s.event_id = p_event_id
    and s.status = 'active'
    and coalesce(s.portal_enabled, true) = true
  order by s.store_name asc, s.id asc
  offset next_position
  limit 1;

  update public.lead_routing_state
  set
    last_store_id = selected_store_id,
    last_position = next_position,
    last_routed_at = now(),
    updated_at = now()
  where routing_key = effective_routing_key;

  return query
  select
    s.id,
    s.store_name::text,
    s.event_id,
    next_position
  from public.stores s
  where s.id = selected_store_id;
end;
$$;

grant execute on function public.pick_next_lead_store_by_event(uuid, text) to service_role;
