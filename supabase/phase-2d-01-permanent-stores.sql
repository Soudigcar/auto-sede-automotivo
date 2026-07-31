begin;

alter table public.stores
  add column if not exists legal_name text,
  add column if not exists cnpj text,
  add column if not exists state text,
  add column if not exists city text,
  add column if not exists address_text text,
  add column if not exists instagram_url text;

comment on column public.stores.event_id is
  'LEGADO: evento original da loja. Novos vínculos devem usar public.store_event_participations.';

create unique index if not exists stores_active_email_unique
  on public.stores (lower(btrim(responsible_email)))
  where responsible_email is not null
    and btrim(responsible_email) <> ''
    and lower(status) not in ('deleted', 'excluido');

create unique index if not exists stores_active_cnpj_unique
  on public.stores (regexp_replace(cnpj, '\D', '', 'g'))
  where cnpj is not null
    and regexp_replace(cnpj, '\D', '', 'g') <> ''
    and lower(status) not in ('deleted', 'excluido');

create table if not exists public.store_event_participations (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  status text not null default 'active'
    check (status in ('invited', 'pending', 'active', 'inactive', 'declined', 'removed')),
  source text not null default 'master'
    check (source in ('migration', 'master', 'event_link', 'portal_application', 'store_portal')),
  joined_at timestamptz,
  ended_at timestamptz,
  event_name_snapshot text,
  event_start_date_snapshot date,
  event_end_date_snapshot date,
  event_state_snapshot text,
  event_city_snapshot text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, event_id)
);

comment on table public.store_event_participations is
  'Vínculo histórico entre uma loja permanente e cada evento em que ela participa.';

create index if not exists store_event_participations_event_status_idx
  on public.store_event_participations (event_id, status);

create index if not exists store_event_participations_store_status_idx
  on public.store_event_participations (store_id, status);

alter table public.store_event_participations enable row level security;

drop policy if exists store_event_participations_select on public.store_event_participations;
create policy store_event_participations_select
  on public.store_event_participations
  for select
  to authenticated
  using (is_master() or store_id = current_app_store_id());

drop policy if exists store_event_participations_insert_master on public.store_event_participations;
create policy store_event_participations_insert_master
  on public.store_event_participations
  for insert
  to authenticated
  with check (is_master());

drop policy if exists store_event_participations_update_master on public.store_event_participations;
create policy store_event_participations_update_master
  on public.store_event_participations
  for update
  to authenticated
  using (is_master())
  with check (is_master());

drop policy if exists store_event_participations_delete_master on public.store_event_participations;
create policy store_event_participations_delete_master
  on public.store_event_participations
  for delete
  to authenticated
  using (is_master());

grant select, insert, update, delete on public.store_event_participations to authenticated;
grant all on public.store_event_participations to service_role;

insert into public.store_event_participations (
  store_id,
  event_id,
  status,
  source,
  joined_at,
  ended_at,
  event_name_snapshot,
  event_start_date_snapshot,
  event_end_date_snapshot,
  event_state_snapshot,
  event_city_snapshot,
  metadata,
  created_at,
  updated_at
)
select
  s.id,
  s.event_id,
  case
    when lower(coalesce(s.status, 'active')) in ('deleted', 'excluido', 'inactive', 'inativo') then 'removed'
    else 'active'
  end,
  'migration',
  coalesce(s.self_registration_completed_at, s.created_at),
  case
    when lower(coalesce(s.status, 'active')) in ('deleted', 'excluido', 'inactive', 'inativo') then s.updated_at
    else null
  end,
  coalesce(s.event_name_snapshot, e.event_name),
  coalesce(s.event_start_date_snapshot, e.start_date),
  coalesce(s.event_end_date_snapshot, e.end_date),
  coalesce(s.event_state_snapshot, e.state),
  coalesce(s.event_city_snapshot, e.city),
  jsonb_build_object('legacy_store_event_id', true),
  s.created_at,
  s.updated_at
from public.stores s
join public.events e on e.id = s.event_id
where s.event_id is not null
on conflict (store_id, event_id) do update set
  event_name_snapshot = excluded.event_name_snapshot,
  event_start_date_snapshot = excluded.event_start_date_snapshot,
  event_end_date_snapshot = excluded.event_end_date_snapshot,
  event_state_snapshot = excluded.event_state_snapshot,
  event_city_snapshot = excluded.event_city_snapshot,
  updated_at = now();

drop policy if exists secure_events_select on public.events;
create policy secure_events_select
  on public.events
  for select
  to authenticated
  using (
    is_master()
    or exists (
      select 1
      from public.store_event_participations participation
      where participation.event_id = events.id
        and participation.store_id = current_app_store_id()
        and participation.status in ('invited', 'pending', 'active', 'inactive')
    )
    or exists (
      select 1
      from public.stores legacy_store
      where legacy_store.event_id = events.id
        and legacy_store.id = current_app_store_id()
    )
  );

create table if not exists public.store_portal_applications (
  id uuid primary key default gen_random_uuid(),
  store_name text not null,
  legal_name text,
  cnpj text,
  responsible_name text not null,
  responsible_phone text not null,
  responsible_email text not null,
  state text,
  city text,
  address_text text,
  website_url text,
  instagram_url text,
  approximate_vehicle_count integer
    check (approximate_vehicle_count is null or approximate_vehicle_count >= 0),
  interested_in_events boolean not null default true,
  notes text,
  status text not null default 'pending'
    check (status in ('pending', 'reviewing', 'approved', 'rejected')),
  review_notes text,
  approved_store_id uuid references public.stores(id) on delete set null,
  reviewed_by uuid references public.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.store_portal_applications is
  'Solicitações públicas de revendas que desejam entrar no Portal Auto Sede. Aprovação obrigatória do Master.';

create index if not exists store_portal_applications_status_created_idx
  on public.store_portal_applications (status, created_at desc);

create unique index if not exists store_portal_applications_open_email_unique
  on public.store_portal_applications (lower(btrim(responsible_email)))
  where status in ('pending', 'reviewing');

alter table public.store_portal_applications enable row level security;

drop policy if exists store_portal_applications_select_master on public.store_portal_applications;
create policy store_portal_applications_select_master
  on public.store_portal_applications
  for select
  to authenticated
  using (is_master());

drop policy if exists store_portal_applications_update_master on public.store_portal_applications;
create policy store_portal_applications_update_master
  on public.store_portal_applications
  for update
  to authenticated
  using (is_master())
  with check (is_master());

drop policy if exists store_portal_applications_delete_master on public.store_portal_applications;
create policy store_portal_applications_delete_master
  on public.store_portal_applications
  for delete
  to authenticated
  using (is_master());

grant select, update, delete on public.store_portal_applications to authenticated;
grant all on public.store_portal_applications to service_role;

commit;
