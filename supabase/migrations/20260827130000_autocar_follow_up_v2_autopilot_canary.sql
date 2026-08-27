-- Smart Follow-up V2 AUTOPILOT canary.
-- Scope is intentionally restricted to A4 Multimarcas at database level.
-- This migration does not configure Evolution/VPS and does not enable any store by itself.

alter table public.ai_follow_up_global_settings
  drop constraint if exists ai_follow_up_global_settings_mode_check;
alter table public.ai_follow_up_global_settings
  add constraint ai_follow_up_global_settings_mode_check
  check (mode in ('off','copilot','autopilot'));

alter table public.ai_follow_up_store_settings
  drop constraint if exists ai_follow_up_store_settings_mode_check;
alter table public.ai_follow_up_store_settings
  add constraint ai_follow_up_store_settings_mode_check
  check (mode in ('off','copilot','autopilot'));

alter table public.ai_follow_up_store_settings
  drop constraint if exists ai_follow_up_store_settings_autopilot_canary_check;
alter table public.ai_follow_up_store_settings
  add constraint ai_follow_up_store_settings_autopilot_canary_check
  check (
    mode <> 'autopilot'
    or store_id = '239755c3-a2d4-4cdd-9502-f1595031c924'::uuid
  );

alter table public.ai_follow_up_copilot_suggestions
  add column if not exists metadata jsonb not null default '{}'::jsonb;

create table if not exists public.ai_follow_up_autopilot_executions (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.ai_store_refs(store_id) on delete cascade,
  production_conversation_id uuid not null,
  production_lead_id uuid null,
  scenario_key text not null check (scenario_key in ('silent_lead','simulation_pending','vehicle_interest')),
  step_id text not null,
  due_at timestamptz not null,
  trigger_last_customer_message_at timestamptz not null,
  trigger_last_store_message_at timestamptz not null,
  idempotency_key text not null unique,
  status text not null default 'claimed' check (status in ('claimed','blocked','fallback_copilot','sent','failed')),
  planned_message text null check (planned_message is null or char_length(planned_message) between 1 and 4000),
  model text null,
  confidence numeric(4,3) null check (confidence is null or (confidence >= 0 and confidence <= 1)),
  reason text null,
  provider_message_id text null,
  production_outbound_message_id uuid null,
  metadata jsonb not null default '{}'::jsonb,
  claimed_at timestamptz not null default now(),
  completed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (store_id = '239755c3-a2d4-4cdd-9502-f1595031c924'::uuid)
);

create index if not exists ai_follow_up_autopilot_exec_store_status_created_idx
  on public.ai_follow_up_autopilot_executions(store_id, status, created_at desc);
create index if not exists ai_follow_up_autopilot_exec_conversation_created_idx
  on public.ai_follow_up_autopilot_executions(production_conversation_id, created_at desc);
create index if not exists ai_follow_up_autopilot_exec_lead_created_idx
  on public.ai_follow_up_autopilot_executions(production_lead_id, created_at desc)
  where production_lead_id is not null;

alter table public.ai_follow_up_autopilot_executions enable row level security;
drop policy if exists service_only_deny_client_access on public.ai_follow_up_autopilot_executions;
create policy service_only_deny_client_access on public.ai_follow_up_autopilot_executions
  for all to anon, authenticated using (false) with check (false);

comment on table public.ai_follow_up_autopilot_executions is
  'Fail-closed Smart Follow-up V2 AUTOPILOT canary execution ledger. A4-only, service-role only, idempotent.';
comment on constraint ai_follow_up_store_settings_autopilot_canary_check on public.ai_follow_up_store_settings is
  'AUTOPILOT do Smart Follow-up V2 permitido somente para a A4 durante o canario inicial.';
