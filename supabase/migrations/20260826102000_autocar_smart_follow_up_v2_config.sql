-- Smart Follow-up V2 configuration layer.
-- This migration only defines configuration/audit structures. It does not create
-- any scheduler, cron, outbound WhatsApp path, or enable create_follow_up.

create table if not exists public.ai_follow_up_global_settings (
  id text primary key default 'primary' check (id = 'primary'),
  enabled boolean not null default false,
  mode text not null default 'off' check (mode in ('off','copilot','autopilot')),
  allowed_start time not null default '08:00',
  allowed_end time not null default '20:00',
  max_per_lead_per_day integer not null default 2 check (max_per_lead_per_day between 1 and 5),
  max_per_sequence integer not null default 4 check (max_per_sequence between 1 and 10),
  max_sequence_days integer not null default 7 check (max_sequence_days between 1 and 30),
  min_interval_minutes integer not null default 30 check (min_interval_minutes >= 15),
  cancel_on_customer_reply boolean not null default true check (cancel_on_customer_reply = true),
  cancel_on_sale boolean not null default true check (cancel_on_sale = true),
  cancel_on_human_takeover boolean not null default true check (cancel_on_human_takeover = true),
  cancel_on_closed_conversation boolean not null default true check (cancel_on_closed_conversation = true),
  version integer not null default 1 check (version > 0),
  updated_by_profile_id uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_follow_up_store_settings (
  store_id uuid primary key references public.ai_store_refs(store_id) on delete cascade,
  enabled boolean not null default false,
  mode text not null default 'off' check (mode in ('off','copilot','autopilot')),
  allowed_start time not null default '08:00',
  allowed_end time not null default '20:00',
  max_per_lead_per_day integer not null default 1 check (max_per_lead_per_day between 1 and 5),
  max_per_sequence integer not null default 3 check (max_per_sequence between 1 and 10),
  max_sequence_days integer not null default 7 check (max_sequence_days between 1 and 30),
  min_interval_minutes integer not null default 60 check (min_interval_minutes >= 15),
  version integer not null default 1 check (version > 0),
  updated_by_profile_id uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_follow_up_scenarios (
  id uuid primary key default gen_random_uuid(),
  scope text not null check (scope in ('global','store')),
  store_id uuid null references public.ai_store_refs(store_id) on delete cascade,
  scenario_key text not null check (scenario_key in ('silent_lead','simulation_pending','vehicle_interest','visit_confirmation','post_visit','no_show','callback_requested')),
  title text not null,
  description text not null default '',
  enabled boolean not null default false,
  version integer not null default 1 check (version > 0),
  updated_by_profile_id uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((scope = 'global' and store_id is null) or (scope = 'store' and store_id is not null))
);

create unique index if not exists ai_follow_up_scenarios_global_key_uq
  on public.ai_follow_up_scenarios(scenario_key) where scope = 'global';
create unique index if not exists ai_follow_up_scenarios_store_key_uq
  on public.ai_follow_up_scenarios(store_id, scenario_key) where scope = 'store';

create table if not exists public.ai_follow_up_scenario_steps (
  id uuid primary key default gen_random_uuid(),
  scenario_id uuid not null references public.ai_follow_up_scenarios(id) on delete cascade,
  step_order integer not null check (step_order >= 1),
  delay_minutes integer not null,
  label text not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (scenario_id, step_order)
);

create table if not exists public.ai_follow_up_config_audit (
  id uuid primary key default gen_random_uuid(),
  scope text not null check (scope in ('global','store','scenario')),
  record_key text not null,
  previous_value jsonb null,
  new_value jsonb not null,
  actor_profile_id uuid null,
  created_at timestamptz not null default now()
);

alter table public.ai_follow_up_global_settings enable row level security;
alter table public.ai_follow_up_store_settings enable row level security;
alter table public.ai_follow_up_scenarios enable row level security;
alter table public.ai_follow_up_scenario_steps enable row level security;
alter table public.ai_follow_up_config_audit enable row level security;

comment on table public.ai_follow_up_global_settings is 'Master ceiling for Smart Follow-up V2. Does not enable outbound execution by itself.';
comment on table public.ai_follow_up_store_settings is 'Store preferences constrained by the Master Smart Follow-up ceiling.';
comment on table public.ai_follow_up_scenarios is 'Versionable Smart Follow-up V2 journeys. Disabled by default.';
comment on table public.ai_follow_up_scenario_steps is 'Delay steps for Smart Follow-up V2 journeys; no scheduler is created by this migration.';
comment on table public.ai_follow_up_config_audit is 'Append-only audit trail for Smart Follow-up V2 configuration changes.';

insert into public.ai_follow_up_global_settings (id)
values ('primary')
on conflict (id) do nothing;
