-- Phase 2E.1: landing pages linked to events, automatic inventory assignments and campaign assets.

alter table public.site_campaigns
  add column if not exists event_id uuid,
  add column if not exists logo_url text,
  add column if not exists hero_image_url text,
  add column if not exists mobile_hero_image_url text,
  add column if not exists sponsor_logo_urls text[] not null default '{}'::text[],
  add column if not exists hero_eyebrow text not null default 'Evento automotivo',
  add column if not exists cta_label text not null default 'Simular agora',
  add column if not exists primary_color text not null default '#DC2626',
  add column if not exists secondary_color text not null default '#071020',
  add column if not exists benefits jsonb not null default '[{"title":"Simulação rápida","description":"Faça uma estimativa inicial de financiamento."},{"title":"Estoque das lojas participantes","description":"Consulte veículos vinculados ao evento."},{"title":"Atendimento direto","description":"Seu interesse segue para a loja responsável pelo veículo."}]'::jsonb,
  add column if not exists terms_text text,
  add column if not exists published_at timestamptz,
  add column if not exists auto_sync_inventory boolean not null default true;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'site_campaigns_event_id_fkey'
      and conrelid = 'public.site_campaigns'::regclass
  ) then
    alter table public.site_campaigns
      add constraint site_campaigns_event_id_fkey
      foreign key (event_id) references public.events(id) on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'site_campaigns_benefits_array_check'
      and conrelid = 'public.site_campaigns'::regclass
  ) then
    alter table public.site_campaigns
      add constraint site_campaigns_benefits_array_check
      check (jsonb_typeof(benefits) = 'array');
  end if;
end $$;

create unique index if not exists site_campaigns_event_unique_idx
  on public.site_campaigns(event_id)
  where event_id is not null;

create index if not exists site_campaigns_active_event_idx
  on public.site_campaigns(is_active, event_id);

alter table public.store_event_participations
  add column if not exists auto_sync_inventory boolean not null default true;

create table if not exists public.event_vehicle_assignments (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  vehicle_id uuid not null references public.site_vehicles(id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'inactive')),
  show_on_landing boolean not null default true,
  is_featured boolean not null default false,
  display_order integer not null default 0,
  promotional_price numeric,
  source text not null default 'automatic' check (source in ('automatic', 'manual')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint event_vehicle_assignments_event_vehicle_unique unique (event_id, vehicle_id),
  constraint event_vehicle_assignments_price_check check (promotional_price is null or promotional_price >= 0),
  constraint event_vehicle_assignments_order_check check (display_order >= 0)
);

create index if not exists event_vehicle_assignments_event_visibility_idx
  on public.event_vehicle_assignments(event_id, status, show_on_landing, is_featured, display_order);
create index if not exists event_vehicle_assignments_store_idx
  on public.event_vehicle_assignments(store_id);
create index if not exists event_vehicle_assignments_vehicle_idx
  on public.event_vehicle_assignments(vehicle_id);

alter table public.event_vehicle_assignments enable row level security;

drop policy if exists event_vehicle_assignments_master_all on public.event_vehicle_assignments;
create policy event_vehicle_assignments_master_all
  on public.event_vehicle_assignments
  for all to authenticated
  using (is_master())
  with check (is_master());

drop policy if exists event_vehicle_assignments_store_select_own on public.event_vehicle_assignments;
create policy event_vehicle_assignments_store_select_own
  on public.event_vehicle_assignments
  for select to authenticated
  using (store_id = current_app_store_id());

drop policy if exists event_vehicle_assignments_public_select on public.event_vehicle_assignments;
create policy event_vehicle_assignments_public_select
  on public.event_vehicle_assignments
  for select to public
  using (status = 'active' and show_on_landing = true);

-- Link legacy campaigns only when there is one unambiguous event match.
with exact_matches as (
  select c.id as campaign_id, min(e.id::text)::uuid as event_id
  from public.site_campaigns c
  join public.events e
    on e.status <> 'deleted'
   and (
     lower(trim(c.slug)) = lower(trim(e.slug))
     or lower(trim(c.name)) = lower(trim(e.event_name))
   )
  where c.event_id is null
  group by c.id
  having count(*) = 1
)
update public.site_campaigns c
set event_id = m.event_id,
    updated_at = now()
from exact_matches m
where c.id = m.campaign_id
  and not exists (
    select 1 from public.site_campaigns existing
    where existing.event_id = m.event_id and existing.id <> c.id
  );

create or replace function public.sync_event_inventory(p_event_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_count integer := 0;
begin
  insert into public.event_vehicle_assignments (
    event_id, store_id, vehicle_id, status, show_on_landing, is_featured, display_order, source
  )
  select
    participation.event_id,
    participation.store_id,
    vehicle.id,
    'active',
    true,
    false,
    0,
    'automatic'
  from public.store_event_participations participation
  join public.stores store_row
    on store_row.id = participation.store_id
   and store_row.status = 'active'
  join public.site_vehicles vehicle
    on vehicle.store_id = participation.store_id
   and vehicle.status = 'disponivel'
  where participation.event_id = p_event_id
    and participation.status = 'active'
    and participation.auto_sync_inventory = true
  on conflict (event_id, vehicle_id) do nothing;

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

revoke all on function public.sync_event_inventory(uuid) from public, anon, authenticated;
grant execute on function public.sync_event_inventory(uuid) to service_role;

create or replace function public.sync_participation_inventory_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'active' and new.auto_sync_inventory = true then
    perform public.sync_event_inventory(new.event_id);
  end if;
  return new;
end;
$$;

drop trigger if exists store_event_participation_inventory_sync on public.store_event_participations;
create trigger store_event_participation_inventory_sync
after insert or update of status, auto_sync_inventory
on public.store_event_participations
for each row execute function public.sync_participation_inventory_trigger();

create or replace function public.sync_new_vehicle_to_events_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.store_id is null or new.status <> 'disponivel' then
    return new;
  end if;

  insert into public.event_vehicle_assignments (
    event_id, store_id, vehicle_id, status, show_on_landing, is_featured, display_order, source
  )
  select
    participation.event_id,
    new.store_id,
    new.id,
    'active',
    true,
    false,
    0,
    'automatic'
  from public.store_event_participations participation
  where participation.store_id = new.store_id
    and participation.status = 'active'
    and participation.auto_sync_inventory = true
  on conflict (event_id, vehicle_id) do nothing;

  return new;
end;
$$;

drop trigger if exists site_vehicle_event_assignment_sync on public.site_vehicles;
create trigger site_vehicle_event_assignment_sync
after insert or update of store_id, status
on public.site_vehicles
for each row execute function public.sync_new_vehicle_to_events_trigger();

-- Initial backfill for all active event participations.
select public.sync_event_inventory(event_row.id)
from public.events event_row
where event_row.status <> 'deleted';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'campaign-assets',
  'campaign-assets',
  true,
  10485760,
  array['image/jpeg','image/png','image/webp']::text[]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists campaign_assets_public_select on storage.objects;
create policy campaign_assets_public_select
  on storage.objects
  for select to public
  using (bucket_id = 'campaign-assets');

drop policy if exists campaign_assets_master_insert on storage.objects;
create policy campaign_assets_master_insert
  on storage.objects
  for insert to authenticated
  with check (bucket_id = 'campaign-assets' and is_master());

drop policy if exists campaign_assets_master_update on storage.objects;
create policy campaign_assets_master_update
  on storage.objects
  for update to authenticated
  using (bucket_id = 'campaign-assets' and is_master())
  with check (bucket_id = 'campaign-assets' and is_master());

drop policy if exists campaign_assets_master_delete on storage.objects;
create policy campaign_assets_master_delete
  on storage.objects
  for delete to authenticated
  using (bucket_id = 'campaign-assets' and is_master());

comment on table public.event_vehicle_assignments is 'Vínculo de veículos permanentes às vitrines temporárias de eventos, sem duplicar o cadastro do veículo.';
comment on column public.site_campaigns.event_id is 'Evento operacional ao qual esta landing page pertence.';
comment on column public.store_event_participations.auto_sync_inventory is 'Quando verdadeiro, novos veículos disponíveis da loja entram automaticamente no evento.';
