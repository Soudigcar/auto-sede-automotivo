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
