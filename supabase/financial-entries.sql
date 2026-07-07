create table if not exists public.financial_entries (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references public.events(id) on delete set null,
  event_name text not null,
  movement_type varchar(20) not null default 'income',
  source_type varchar(50) not null default 'bank_sponsorship',
  sponsor_bank varchar(120),
  supplier_name text,
  category varchar(120) not null default 'Patrocinio',
  amount numeric(12,2) not null default 0,
  discount numeric(12,2) not null default 0,
  payment_date date,
  payment_method varchar(80),
  document_number varchar(120),
  notes text,
  status varchar(30) not null default 'paid',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_financial_entries_event_id on public.financial_entries(event_id);
create index if not exists idx_financial_entries_source_type on public.financial_entries(source_type);
create index if not exists idx_financial_entries_sponsor_bank on public.financial_entries(sponsor_bank);
create index if not exists idx_financial_entries_payment_date on public.financial_entries(payment_date);

alter table public.financial_entries enable row level security;

drop policy if exists "MVP authenticated can read financial entries" on public.financial_entries;
drop policy if exists "MVP authenticated can insert financial entries" on public.financial_entries;
drop policy if exists "MVP authenticated can update financial entries" on public.financial_entries;

create policy "MVP authenticated can read financial entries"
  on public.financial_entries for select
  to authenticated
  using (true);

create policy "MVP authenticated can insert financial entries"
  on public.financial_entries for insert
  to authenticated
  with check (true);

create policy "MVP authenticated can update financial entries"
  on public.financial_entries for update
  to authenticated
  using (true)
  with check (true);
