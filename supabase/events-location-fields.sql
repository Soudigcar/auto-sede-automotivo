alter table public.events add column if not exists state varchar(80);
alter table public.events add column if not exists city varchar(120);
alter table public.events add column if not exists sponsor_bank varchar(120);
alter table public.events add column if not exists live_url text;
alter table public.events add column if not exists event_notes text;

create index if not exists idx_events_state_city on public.events(state, city);
create index if not exists idx_events_sponsor_bank on public.events(sponsor_bank);
create index if not exists idx_events_status on public.events(status);

create policy if not exists "authenticated_delete_events"
  on public.events for delete
  to authenticated
  using (true);
