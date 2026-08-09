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

