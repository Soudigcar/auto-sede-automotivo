create or replace function public.vehicle_catalog_normalize_text(input_text text)
returns text
language sql
immutable
set search_path = public
as $$
  select trim(
    regexp_replace(
      translate(
        lower(coalesce(input_text, '')),
        'áàâãäéèêëíìîïóòôõöúùûüçñ',
        'aaaaaeeeeiiiiooooouuuucn'
      ),
      '[^a-z0-9]+',
      ' ',
      'g'
    )
  );
$$;

create or replace function public.vehicle_catalog_touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.vehicle_catalog_brands (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 120),
  normalized_name text generated always as (public.vehicle_catalog_normalize_text(name)) stored,
  slug text not null check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  country text,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.users(id) on delete set null,
  updated_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vehicle_catalog_brands_normalized_name_key unique (normalized_name),
  constraint vehicle_catalog_brands_slug_key unique (slug)
);

create table if not exists public.vehicle_catalog_models (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.vehicle_catalog_brands(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 140),
  normalized_name text generated always as (public.vehicle_catalog_normalize_text(name)) stored,
  category text,
  start_year integer check (start_year is null or start_year between 1886 and 2200),
  end_year integer check (end_year is null or end_year between 1886 and 2200),
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.users(id) on delete set null,
  updated_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vehicle_catalog_models_year_range check (end_year is null or start_year is null or end_year >= start_year),
  constraint vehicle_catalog_models_brand_name_key unique (brand_id, normalized_name)
);

create table if not exists public.vehicle_catalog_versions (
  id uuid primary key default gen_random_uuid(),
  model_id uuid not null references public.vehicle_catalog_models(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 180),
  normalized_name text generated always as (public.vehicle_catalog_normalize_text(name)) stored,
  engine_name text,
  engine_displacement numeric(4,1) check (engine_displacement is null or engine_displacement between 0.1 and 20),
  body_type text,
  doors smallint check (doors is null or doors between 1 and 8),
  seats smallint check (seats is null or seats between 1 and 30),
  traction text,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.users(id) on delete set null,
  updated_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vehicle_catalog_versions_model_name_key unique (model_id, normalized_name)
);

create table if not exists public.vehicle_catalog_fuels (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 80),
  normalized_name text generated always as (public.vehicle_catalog_normalize_text(name)) stored,
  code text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.users(id) on delete set null,
  updated_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vehicle_catalog_fuels_normalized_name_key unique (normalized_name)
);

create unique index if not exists vehicle_catalog_fuels_code_key
  on public.vehicle_catalog_fuels (lower(code))
  where code is not null and btrim(code) <> '';

create table if not exists public.vehicle_catalog_transmissions (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 100),
  normalized_name text generated always as (public.vehicle_catalog_normalize_text(name)) stored,
  code text,
  gears smallint check (gears is null or gears between 1 and 20),
  notes text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.users(id) on delete set null,
  updated_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vehicle_catalog_transmissions_normalized_name_key unique (normalized_name)
);

create unique index if not exists vehicle_catalog_transmissions_code_key
  on public.vehicle_catalog_transmissions (lower(code))
  where code is not null and btrim(code) <> '';

create table if not exists public.vehicle_catalog_colors (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 100),
  normalized_name text generated always as (public.vehicle_catalog_normalize_text(name)) stored,
  base_color text,
  hex_code text check (hex_code is null or hex_code ~ '^#[0-9A-Fa-f]{6}$'),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.users(id) on delete set null,
  updated_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vehicle_catalog_colors_normalized_name_key unique (normalized_name)
);

create table if not exists public.vehicle_catalog_configurations (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references public.vehicle_catalog_versions(id) on delete cascade,
  manufacture_year integer not null check (manufacture_year between 1886 and 2200),
  model_year integer not null check (model_year between 1886 and 2200),
  fuel_id uuid references public.vehicle_catalog_fuels(id) on delete restrict,
  transmission_id uuid references public.vehicle_catalog_transmissions(id) on delete restrict,
  engine_name text,
  engine_displacement numeric(4,1) check (engine_displacement is null or engine_displacement between 0.1 and 20),
  body_type text,
  traction text,
  doors smallint check (doors is null or doors between 1 and 8),
  seats smallint check (seats is null or seats between 1 and 30),
  notes text,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.users(id) on delete set null,
  updated_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vehicle_catalog_configurations_year_order check (model_year between manufacture_year - 1 and manufacture_year + 2),
  constraint vehicle_catalog_configurations_unique unique nulls not distinct (
    version_id,
    manufacture_year,
    model_year,
    fuel_id,
    transmission_id
  )
);

create table if not exists public.vehicle_catalog_aliases (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (
    entity_type in ('brand', 'model', 'version', 'fuel', 'transmission', 'color')
  ),
  entity_id uuid not null,
  alias text not null check (char_length(trim(alias)) between 1 and 220),
  normalized_alias text generated always as (public.vehicle_catalog_normalize_text(alias)) stored,
  source text not null default 'master',
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.users(id) on delete set null,
  updated_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vehicle_catalog_aliases_type_alias_key unique (entity_type, normalized_alias)
);

create table if not exists public.vehicle_catalog_suggestions (
  id uuid primary key default gen_random_uuid(),
  proposed_entity_type text not null check (
    proposed_entity_type in ('brand', 'model', 'version', 'configuration', 'fuel', 'transmission', 'color', 'alias')
  ),
  suggested_name text not null check (char_length(trim(suggested_name)) between 1 and 240),
  normalized_name text generated always as (public.vehicle_catalog_normalize_text(suggested_name)) stored,
  parent_context jsonb not null default '{}'::jsonb,
  proposed_payload jsonb not null default '{}'::jsonb,
  source_type text not null default 'master' check (
    source_type in ('master', 'store', 'website_import', 'olx_import', 'system')
  ),
  source_store_id uuid references public.stores(id) on delete set null,
  submitted_by uuid references public.users(id) on delete set null,
  status text not null default 'pending' check (
    status in ('pending', 'reviewing', 'approved', 'rejected', 'merged')
  ),
  matched_entity_type text check (
    matched_entity_type is null or matched_entity_type in ('brand', 'model', 'version', 'configuration', 'fuel', 'transmission', 'color', 'alias')
  ),
  matched_entity_id uuid,
  reviewed_by uuid references public.users(id) on delete set null,
  review_notes text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vehicle_catalog_suggestions_match_pair check (
    (matched_entity_type is null and matched_entity_id is null)
    or (matched_entity_type is not null and matched_entity_id is not null)
  )
);

create or replace function public.vehicle_catalog_validate_alias_target()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  target_exists boolean := false;
begin
  case new.entity_type
    when 'brand' then
      select exists(select 1 from public.vehicle_catalog_brands where id = new.entity_id) into target_exists;
    when 'model' then
      select exists(select 1 from public.vehicle_catalog_models where id = new.entity_id) into target_exists;
    when 'version' then
      select exists(select 1 from public.vehicle_catalog_versions where id = new.entity_id) into target_exists;
    when 'fuel' then
      select exists(select 1 from public.vehicle_catalog_fuels where id = new.entity_id) into target_exists;
    when 'transmission' then
      select exists(select 1 from public.vehicle_catalog_transmissions where id = new.entity_id) into target_exists;
    when 'color' then
      select exists(select 1 from public.vehicle_catalog_colors where id = new.entity_id) into target_exists;
    else
      target_exists := false;
  end case;

  if not target_exists then
    raise exception 'Destino do apelido não existe para o tipo %.', new.entity_type
      using errcode = '23503';
  end if;

  return new;
end;
$$;

drop trigger if exists vehicle_catalog_aliases_validate_target on public.vehicle_catalog_aliases;
create trigger vehicle_catalog_aliases_validate_target
before insert or update of entity_type, entity_id
on public.vehicle_catalog_aliases
for each row execute function public.vehicle_catalog_validate_alias_target();

create or replace function public.vehicle_catalog_remove_target_aliases()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  delete from public.vehicle_catalog_aliases
  where entity_type = tg_argv[0] and entity_id = old.id;
  return old;
end;
$$;

do $$
declare
  table_item text;
begin
  foreach table_item in array array[
    'vehicle_catalog_brands',
    'vehicle_catalog_models',
    'vehicle_catalog_versions',
    'vehicle_catalog_fuels',
    'vehicle_catalog_transmissions',
    'vehicle_catalog_colors',
    'vehicle_catalog_configurations',
    'vehicle_catalog_aliases',
    'vehicle_catalog_suggestions'
  ]
  loop
    execute format('drop trigger if exists %I on public.%I', table_item || '_touch_updated_at', table_item);
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.vehicle_catalog_touch_updated_at()',
      table_item || '_touch_updated_at',
      table_item
    );
  end loop;
end;
$$;

drop trigger if exists vehicle_catalog_brands_remove_aliases on public.vehicle_catalog_brands;
create trigger vehicle_catalog_brands_remove_aliases after delete on public.vehicle_catalog_brands
for each row execute function public.vehicle_catalog_remove_target_aliases('brand');

drop trigger if exists vehicle_catalog_models_remove_aliases on public.vehicle_catalog_models;
create trigger vehicle_catalog_models_remove_aliases after delete on public.vehicle_catalog_models
for each row execute function public.vehicle_catalog_remove_target_aliases('model');

drop trigger if exists vehicle_catalog_versions_remove_aliases on public.vehicle_catalog_versions;
create trigger vehicle_catalog_versions_remove_aliases after delete on public.vehicle_catalog_versions
for each row execute function public.vehicle_catalog_remove_target_aliases('version');

drop trigger if exists vehicle_catalog_fuels_remove_aliases on public.vehicle_catalog_fuels;
create trigger vehicle_catalog_fuels_remove_aliases after delete on public.vehicle_catalog_fuels
for each row execute function public.vehicle_catalog_remove_target_aliases('fuel');

drop trigger if exists vehicle_catalog_transmissions_remove_aliases on public.vehicle_catalog_transmissions;
create trigger vehicle_catalog_transmissions_remove_aliases after delete on public.vehicle_catalog_transmissions
for each row execute function public.vehicle_catalog_remove_target_aliases('transmission');

drop trigger if exists vehicle_catalog_colors_remove_aliases on public.vehicle_catalog_colors;
create trigger vehicle_catalog_colors_remove_aliases after delete on public.vehicle_catalog_colors
for each row execute function public.vehicle_catalog_remove_target_aliases('color');

create index if not exists vehicle_catalog_models_brand_idx
  on public.vehicle_catalog_models (brand_id, is_active, name);
create index if not exists vehicle_catalog_versions_model_idx
  on public.vehicle_catalog_versions (model_id, is_active, name);
create index if not exists vehicle_catalog_configurations_version_idx
  on public.vehicle_catalog_configurations (version_id, manufacture_year desc, model_year desc);
create index if not exists vehicle_catalog_aliases_target_idx
  on public.vehicle_catalog_aliases (entity_type, entity_id);
create index if not exists vehicle_catalog_suggestions_status_idx
  on public.vehicle_catalog_suggestions (status, created_at desc);
create index if not exists vehicle_catalog_suggestions_source_store_idx
  on public.vehicle_catalog_suggestions (source_store_id, created_at desc);

alter table public.vehicle_catalog_brands enable row level security;
alter table public.vehicle_catalog_models enable row level security;
alter table public.vehicle_catalog_versions enable row level security;
alter table public.vehicle_catalog_fuels enable row level security;
alter table public.vehicle_catalog_transmissions enable row level security;
alter table public.vehicle_catalog_colors enable row level security;
alter table public.vehicle_catalog_configurations enable row level security;
alter table public.vehicle_catalog_aliases enable row level security;
alter table public.vehicle_catalog_suggestions enable row level security;

do $$
declare
  table_item text;
  policy_prefix text;
begin
  foreach table_item in array array[
    'vehicle_catalog_brands',
    'vehicle_catalog_models',
    'vehicle_catalog_versions',
    'vehicle_catalog_fuels',
    'vehicle_catalog_transmissions',
    'vehicle_catalog_colors',
    'vehicle_catalog_configurations',
    'vehicle_catalog_aliases',
    'vehicle_catalog_suggestions'
  ]
  loop
    policy_prefix := table_item;

    execute format('drop policy if exists %I on public.%I', policy_prefix || '_select_master', table_item);
    execute format(
      'create policy %I on public.%I for select to authenticated using (public.is_master())',
      policy_prefix || '_select_master',
      table_item
    );

    execute format('drop policy if exists %I on public.%I', policy_prefix || '_insert_master', table_item);
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (public.is_master())',
      policy_prefix || '_insert_master',
      table_item
    );

    execute format('drop policy if exists %I on public.%I', policy_prefix || '_update_master', table_item);
    execute format(
      'create policy %I on public.%I for update to authenticated using (public.is_master()) with check (public.is_master())',
      policy_prefix || '_update_master',
      table_item
    );

    execute format('drop policy if exists %I on public.%I', policy_prefix || '_delete_master', table_item);
    execute format(
      'create policy %I on public.%I for delete to authenticated using (public.is_master())',
      policy_prefix || '_delete_master',
      table_item
    );

    execute format('grant select, insert, update, delete on public.%I to authenticated', table_item);
  end loop;
end;
$$;

comment on table public.vehicle_catalog_brands is 'Marcas oficiais do catálogo mestre automotivo.';
comment on table public.vehicle_catalog_models is 'Modelos oficiais vinculados às marcas do catálogo mestre.';
comment on table public.vehicle_catalog_versions is 'Versões oficiais vinculadas aos modelos do catálogo mestre.';
comment on table public.vehicle_catalog_configurations is 'Configurações técnicas por versão, ano de fabricação e ano modelo.';
comment on table public.vehicle_catalog_aliases is 'Variações e apelidos usados para reconhecer entidades oficiais nas importações.';
comment on table public.vehicle_catalog_suggestions is 'Sugestões pendentes de revisão do Master para expansão ou correção do catálogo.';
