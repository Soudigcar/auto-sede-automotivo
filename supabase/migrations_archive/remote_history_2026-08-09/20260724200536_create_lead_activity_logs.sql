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

