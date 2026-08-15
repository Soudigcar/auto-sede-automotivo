create table public.ai_store_operational_profiles (
  store_id uuid primary key references public.stores(id) on delete cascade,
  timezone text not null default 'America/Sao_Paulo',
  address_text text,
  city text,
  state text,
  postal_code text,
  location_label text,
  latitude numeric(10,7),
  longitude numeric(10,7),
  maps_url text,
  waze_url text,
  weekly_hours jsonb not null default '{"monday":[],"tuesday":[],"wednesday":[],"thursday":[],"friday":[],"saturday":[],"sunday":[]}'::jsonb,
  special_hours jsonb not null default '[]'::jsonb,
  default_visit_duration_minutes integer not null default 60 check (default_visit_duration_minutes between 15 and 480),
  is_active boolean not null default true,
  updated_by_profile_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_store_operational_profiles_weekly_hours_object check (jsonb_typeof(weekly_hours) = 'object'),
  constraint ai_store_operational_profiles_special_hours_array check (jsonb_typeof(special_hours) = 'array'),
  constraint ai_store_operational_profiles_latitude_check check (latitude is null or latitude between -90 and 90),
  constraint ai_store_operational_profiles_longitude_check check (longitude is null or longitude between -180 and 180)
);

alter table public.ai_store_operational_profiles enable row level security;
revoke all on table public.ai_store_operational_profiles from anon, authenticated;
grant all on table public.ai_store_operational_profiles to service_role;

comment on table public.ai_store_operational_profiles is 'Operational source of truth used by AUTOCAR Preview for store hours and location. Stored only in the isolated AUTOCAR environment.';
comment on column public.ai_store_operational_profiles.weekly_hours is 'Object keyed by weekday. Each value is an array of {open, close} HH:MM intervals.';
comment on column public.ai_store_operational_profiles.special_hours is 'Array of date-specific overrides such as {date, closed, open, close, label}.';
comment on column public.ai_store_operational_profiles.updated_by_profile_id is 'External Production profile UUID for audit only. No cross-database foreign key by design.';
