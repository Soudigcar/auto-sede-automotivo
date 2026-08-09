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

