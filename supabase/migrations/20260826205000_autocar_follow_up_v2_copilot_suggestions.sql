-- Smart Follow-up V2 COPILOT suggestion queue.
-- Human-review only: this migration does NOT create a sender, scheduler, cron,
-- webhook executor, or enable create_follow_up / AUTOPILOT.

create table if not exists public.ai_follow_up_copilot_suggestions (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.ai_store_refs(store_id) on delete cascade,
  production_conversation_id uuid not null,
  production_lead_id uuid null,
  scenario_key text not null check (scenario_key in ('silent_lead','simulation_pending','vehicle_interest')),
  step_id text not null,
  due_at timestamptz not null,
  context_last_message_at timestamptz not null,
  suggested_message text not null check (char_length(suggested_message) between 1 and 4000),
  status text not null default 'pending' check (status in ('pending','dismissed','used','expired')),
  idempotency_key text not null unique,
  model text null,
  usage jsonb not null default '{}'::jsonb,
  generated_by_profile_id uuid null,
  resolved_by_profile_id uuid null,
  resolved_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ai_follow_up_copilot_suggestions_store_status_created_idx
  on public.ai_follow_up_copilot_suggestions(store_id, status, created_at desc);
create index if not exists ai_follow_up_copilot_suggestions_conversation_created_idx
  on public.ai_follow_up_copilot_suggestions(production_conversation_id, created_at desc);

alter table public.ai_follow_up_copilot_suggestions enable row level security;

drop policy if exists service_only_deny_client_access on public.ai_follow_up_copilot_suggestions;
create policy service_only_deny_client_access on public.ai_follow_up_copilot_suggestions
  for all to anon, authenticated using (false) with check (false);

comment on table public.ai_follow_up_copilot_suggestions is
  'Human-review Smart Follow-up V2 drafts. Service-only; no scheduler or external send path.';
