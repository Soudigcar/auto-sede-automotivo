alter table public.events add column if not exists sponsor_bank varchar(120);
alter table public.events add column if not exists live_url text;
alter table public.events add column if not exists event_notes text;

create index if not exists idx_events_sponsor_bank on public.events(sponsor_bank);
create index if not exists idx_events_status on public.events(status);
