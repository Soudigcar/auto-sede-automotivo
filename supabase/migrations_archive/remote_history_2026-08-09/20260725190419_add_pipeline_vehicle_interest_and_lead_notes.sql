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

