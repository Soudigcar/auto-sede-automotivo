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
