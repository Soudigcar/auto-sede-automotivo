-- Automotive Market Radar
-- Review-only migration. Do not apply without Master approval.

create table if not exists public.automotive_market_runs (
  id uuid primary key default gen_random_uuid(),
  collected_at timestamptz not null default now(),
  region_scope text[] not null default array['DF','GO']::text[],
  status text not null default 'pending' check (status in ('pending','running','completed','failed','partial')),
  source_count integer not null default 0,
  raw_listing_count integer not null default 0,
  valid_listing_count integer not null default 0,
  duplicate_count integer not null default 0,
  rejected_count integer not null default 0,
  fipe_reference_month text,
  notes text,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.automotive_market_listings (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.automotive_market_runs(id) on delete cascade,
  source_name text not null,
  source_url text not null,
  external_id text,
  municipality text,
  state_code text check (state_code is null or state_code in ('DF','GO')),
  title text not null,
  brand text,
  model text,
  version text,
  manufacture_year integer,
  model_year integer,
  fuel text,
  transmission text,
  mileage integer,
  price numeric(14,2),
  fipe_price numeric(14,2),
  listing_status text not null default 'valid' check (listing_status in ('valid','duplicate','invalid_price','promotional','auction','damaged','financing_entry','version_conflict','out_of_region','other_rejected')),
  rejection_reason text,
  normalized_key text,
  content_hash text,
  evidence jsonb not null default '{}'::jsonb,
  confidence numeric(5,2) check (confidence is null or (confidence >= 0 and confidence <= 100)),
  collected_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists public.automotive_market_segments (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.automotive_market_runs(id) on delete cascade,
  state_code text not null check (state_code in ('DF','GO','DF+GO')),
  brand text not null,
  model text not null,
  version text not null,
  manufacture_year integer,
  model_year integer not null,
  fuel text not null,
  transmission text not null,
  valid_listing_count integer not null default 0,
  minimum_price numeric(14,2),
  maximum_price numeric(14,2),
  median_price numeric(14,2),
  average_price numeric(14,2),
  fipe_price numeric(14,2),
  difference_to_fipe_amount numeric(14,2),
  difference_to_fipe_percent numeric(10,4),
  alternative_names text[] not null default '{}'::text[],
  divergences jsonb not null default '[]'::jsonb,
  interpretation_rules jsonb not null default '[]'::jsonb,
  evidence jsonb not null default '[]'::jsonb,
  confidence numeric(5,2) check (confidence is null or (confidence >= 0 and confidence <= 100)),
  created_at timestamptz not null default now(),
  unique nulls not distinct (run_id, state_code, brand, model, version, manufacture_year, model_year, fuel, transmission)
);

create table if not exists public.automotive_market_suggestions (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.automotive_market_runs(id) on delete cascade,
  segment_id uuid references public.automotive_market_segments(id) on delete cascade,
  suggestion_type text not null check (suggestion_type in ('catalog_alias','catalog_correction','interpretation_rule','fipe_mapping','price_review','data_quality','other')),
  title text not null,
  description text not null,
  proposed_payload jsonb not null default '{}'::jsonb,
  source_evidence jsonb not null default '[]'::jsonb,
  confidence numeric(5,2) not null check (confidence >= 0 and confidence <= 100),
  status text not null default 'pending_master' check (status in ('pending_master','approved','rejected','implemented')),
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists automotive_market_runs_collected_at_idx on public.automotive_market_runs(collected_at desc);
create index if not exists automotive_market_listings_run_idx on public.automotive_market_listings(run_id);
create index if not exists automotive_market_listings_source_url_idx on public.automotive_market_listings(run_id, source_name, source_url);
create index if not exists automotive_market_listings_segment_idx on public.automotive_market_listings(state_code, brand, model, version, manufacture_year, model_year, fuel, transmission);
create index if not exists automotive_market_listings_hash_idx on public.automotive_market_listings(content_hash);
create index if not exists automotive_market_segments_run_idx on public.automotive_market_segments(run_id, state_code);
create index if not exists automotive_market_suggestions_status_idx on public.automotive_market_suggestions(status, created_at desc);

alter table public.automotive_market_runs enable row level security;
alter table public.automotive_market_listings enable row level security;
alter table public.automotive_market_segments enable row level security;
alter table public.automotive_market_suggestions enable row level security;

create policy "Master manages market runs" on public.automotive_market_runs
  for all to authenticated using (public.is_master()) with check (public.is_master());
create policy "Master manages market listings" on public.automotive_market_listings
  for all to authenticated using (public.is_master()) with check (public.is_master());
create policy "Master manages market segments" on public.automotive_market_segments
  for all to authenticated using (public.is_master()) with check (public.is_master());
create policy "Master manages market suggestions" on public.automotive_market_suggestions
  for all to authenticated using (public.is_master()) with check (public.is_master());

revoke all on public.automotive_market_runs from anon;
revoke all on public.automotive_market_listings from anon;
revoke all on public.automotive_market_segments from anon;
revoke all on public.automotive_market_suggestions from anon;

grant select, insert, update, delete on public.automotive_market_runs to authenticated;
grant select, insert, update, delete on public.automotive_market_listings to authenticated;
grant select, insert, update, delete on public.automotive_market_segments to authenticated;
grant select, insert, update, delete on public.automotive_market_suggestions to authenticated;

grant all on public.automotive_market_runs to service_role;
grant all on public.automotive_market_listings to service_role;
grant all on public.automotive_market_segments to service_role;
grant all on public.automotive_market_suggestions to service_role;

comment on table public.automotive_market_runs is 'Daily market collection executions restricted to Distrito Federal and Goiás.';
comment on table public.automotive_market_listings is 'Public listing evidence, including rejected and duplicate records.';
comment on table public.automotive_market_segments is 'Aggregated market statistics by vehicle configuration and region.';
comment on table public.automotive_market_suggestions is 'Master approval queue. Never applies catalog or pricing changes automatically.';
