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

insert into public.banks (bank_name) values
  ('Bradesco'),
  ('Itaú'),
  ('Santander'),
  ('Caixa'),
  ('Banco do Brasil'),
  ('Nubank'),
  ('Outro')
on conflict (bank_name) do nothing;

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
