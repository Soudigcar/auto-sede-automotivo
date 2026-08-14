create table public.ai_store_agents (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  name text not null default 'AUTOCAR',
  status text not null default 'inactive' check (status in ('active', 'inactive')),
  mode text not null default 'off' check (mode in ('off', 'copilot', 'autopilot')),
  tone text not null default 'consultivo',
  language text not null default 'pt-BR',
  capabilities jsonb not null default '{}'::jsonb,
  model_routing jsonb not null default '{}'::jsonb,
  version integer not null default 1 check (version > 0),
  created_by uuid references public.users(id) on delete set null,
  updated_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_store_agents_store_unique unique (store_id)
);

create table public.ai_store_knowledge (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  category text not null,
  title text not null,
  content text not null,
  structured_data jsonb not null default '{}'::jsonb,
  status text not null default 'draft' check (status in ('draft', 'active', 'archived')),
  version integer not null default 1 check (version > 0),
  created_by uuid references public.users(id) on delete set null,
  updated_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_store_knowledge_identity_unique unique (store_id, category, title)
);

create table public.ai_store_policies (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  policy_key text not null,
  effect text not null check (effect in ('allow', 'deny', 'approval', 'handoff')),
  priority integer not null default 100,
  configuration jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  version integer not null default 1 check (version > 0),
  created_by uuid references public.users(id) on delete set null,
  updated_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_store_policies_store_key_unique unique (store_id, policy_key)
);

create table public.ai_conversation_memory (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  conversation_id uuid not null references public.whatsapp_conversations(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  rolling_summary text,
  communication_preference text not null default 'unknown' check (communication_preference in ('unknown', 'text', 'audio')),
  temperature text not null default 'unknown' check (temperature in ('unknown', 'cold', 'warm', 'hot')),
  qualification_score smallint check (qualification_score between 0 and 100),
  score_breakdown jsonb not null default '{}'::jsonb,
  active_objections jsonb not null default '[]'::jsonb,
  open_questions jsonb not null default '[]'::jsonb,
  next_best_action text,
  human_state text not null default 'paused' check (human_state in ('autocar_active', 'copilot', 'waiting_approval', 'human_required', 'human_active', 'paused')),
  last_processed_message_id uuid references public.whatsapp_messages(id) on delete set null,
  memory_version integer not null default 1 check (memory_version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_conversation_memory_store_conversation_unique unique (store_id, conversation_id)
);

create table public.ai_agent_runs (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  agent_id uuid not null references public.ai_store_agents(id) on delete restrict,
  conversation_id uuid not null references public.whatsapp_conversations(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  trigger_message_id uuid references public.whatsapp_messages(id) on delete set null,
  mode text not null check (mode in ('off', 'copilot', 'autopilot')),
  status text not null default 'queued' check (status in ('queued', 'running', 'waiting_approval', 'completed', 'failed', 'skipped', 'cancelled')),
  idempotency_key text not null,
  primary_model text,
  models_used jsonb not null default '[]'::jsonb,
  input_tokens integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  cached_tokens integer not null default 0 check (cached_tokens >= 0),
  audio_usage jsonb not null default '{}'::jsonb,
  image_usage jsonb not null default '{}'::jsonb,
  estimated_cost numeric(16, 6) check (estimated_cost is null or estimated_cost >= 0),
  started_at timestamptz,
  completed_at timestamptz,
  error_code text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_agent_runs_store_idempotency_unique unique (store_id, idempotency_key)
);

create table public.ai_agent_events (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  agent_id uuid not null references public.ai_store_agents(id) on delete restrict,
  run_id uuid not null references public.ai_agent_runs(id) on delete cascade,
  conversation_id uuid not null references public.whatsapp_conversations(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  event_type text not null,
  tool_name text,
  action text,
  status text,
  request_summary jsonb not null default '{}'::jsonb,
  result_summary jsonb not null default '{}'::jsonb,
  model text,
  duration_ms integer check (duration_ms is null or duration_ms >= 0),
  error text,
  created_at timestamptz not null default now()
);

create table public.ai_agent_approvals (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  agent_id uuid not null references public.ai_store_agents(id) on delete restrict,
  run_id uuid not null references public.ai_agent_runs(id) on delete cascade,
  conversation_id uuid not null references public.whatsapp_conversations(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  approval_type text not null,
  requested_action text not null,
  reason text not null,
  safe_payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled', 'expired')),
  requested_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index ai_store_knowledge_store_status_idx on public.ai_store_knowledge(store_id, status);
create index ai_store_policies_store_active_idx on public.ai_store_policies(store_id, is_active, priority);
create index ai_conversation_memory_lead_idx on public.ai_conversation_memory(store_id, lead_id) where lead_id is not null;
create index ai_agent_runs_conversation_created_idx on public.ai_agent_runs(store_id, conversation_id, created_at desc);
create index ai_agent_runs_lead_created_idx on public.ai_agent_runs(store_id, lead_id, created_at desc) where lead_id is not null;
create index ai_agent_events_run_created_idx on public.ai_agent_events(run_id, created_at);
create index ai_agent_events_conversation_created_idx on public.ai_agent_events(store_id, conversation_id, created_at desc);
create index ai_agent_approvals_pending_idx on public.ai_agent_approvals(store_id, status, requested_at desc);

create or replace function private.enforce_autocar_store_scope()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
declare
  payload jsonb := to_jsonb(new);
  scoped_store_id uuid;
  scoped_conversation_id uuid;
  scoped_lead_id uuid;
  scoped_agent_id uuid;
  scoped_run_id uuid;
  scoped_message_id uuid;
begin
  scoped_store_id := nullif(payload ->> 'store_id', '')::uuid;
  if scoped_store_id is null then
    raise exception 'AUTOCAR requires store_id';
  end if;

  scoped_conversation_id := nullif(payload ->> 'conversation_id', '')::uuid;
  if scoped_conversation_id is not null and not exists (
    select 1 from public.whatsapp_conversations c
    where c.id = scoped_conversation_id and c.store_id = scoped_store_id
  ) then
    raise exception 'AUTOCAR conversation does not belong to store';
  end if;

  scoped_lead_id := nullif(payload ->> 'lead_id', '')::uuid;
  if scoped_lead_id is not null and not exists (
    select 1 from public.leads l
    where l.id = scoped_lead_id and l.assigned_store_id = scoped_store_id
  ) then
    raise exception 'AUTOCAR lead does not belong to store';
  end if;

  scoped_agent_id := nullif(payload ->> 'agent_id', '')::uuid;
  if scoped_agent_id is not null and not exists (
    select 1 from public.ai_store_agents a
    where a.id = scoped_agent_id and a.store_id = scoped_store_id
  ) then
    raise exception 'AUTOCAR agent does not belong to store';
  end if;

  scoped_run_id := nullif(payload ->> 'run_id', '')::uuid;
  if scoped_run_id is not null and not exists (
    select 1 from public.ai_agent_runs r
    where r.id = scoped_run_id and r.store_id = scoped_store_id
  ) then
    raise exception 'AUTOCAR run does not belong to store';
  end if;

  scoped_message_id := coalesce(
    nullif(payload ->> 'trigger_message_id', '')::uuid,
    nullif(payload ->> 'last_processed_message_id', '')::uuid
  );
  if scoped_message_id is not null and not exists (
    select 1 from public.whatsapp_messages m
    where m.id = scoped_message_id and m.store_id = scoped_store_id
  ) then
    raise exception 'AUTOCAR message does not belong to store';
  end if;

  return new;
end;
$$;

create trigger ai_conversation_memory_store_scope
before insert or update on public.ai_conversation_memory
for each row execute function private.enforce_autocar_store_scope();

create trigger ai_agent_runs_store_scope
before insert or update on public.ai_agent_runs
for each row execute function private.enforce_autocar_store_scope();

create trigger ai_agent_events_store_scope
before insert or update on public.ai_agent_events
for each row execute function private.enforce_autocar_store_scope();

create trigger ai_agent_approvals_store_scope
before insert or update on public.ai_agent_approvals
for each row execute function private.enforce_autocar_store_scope();

alter table public.ai_store_agents enable row level security;
alter table public.ai_store_knowledge enable row level security;
alter table public.ai_store_policies enable row level security;
alter table public.ai_conversation_memory enable row level security;
alter table public.ai_agent_runs enable row level security;
alter table public.ai_agent_events enable row level security;
alter table public.ai_agent_approvals enable row level security;

revoke all on table public.ai_store_agents from anon, authenticated;
revoke all on table public.ai_store_knowledge from anon, authenticated;
revoke all on table public.ai_store_policies from anon, authenticated;
revoke all on table public.ai_conversation_memory from anon, authenticated;
revoke all on table public.ai_agent_runs from anon, authenticated;
revoke all on table public.ai_agent_events from anon, authenticated;
revoke all on table public.ai_agent_approvals from anon, authenticated;

grant all on table public.ai_store_agents to service_role;
grant all on table public.ai_store_knowledge to service_role;
grant all on table public.ai_store_policies to service_role;
grant all on table public.ai_conversation_memory to service_role;
grant all on table public.ai_agent_runs to service_role;
grant all on table public.ai_agent_events to service_role;
grant all on table public.ai_agent_approvals to service_role;

comment on table public.ai_store_agents is 'AUTOCAR agent configuration. One isolated agent per store in V1.';
comment on table public.ai_store_knowledge is 'Store-specific AUTOCAR knowledge. Live operational data remains in canonical CRM tables.';
comment on table public.ai_store_policies is 'Store-specific autonomy policy overrides. Global hard policies remain server-side.';
comment on table public.ai_conversation_memory is 'Compressed AUTOCAR memory isolated by store and conversation.';
comment on table public.ai_agent_runs is 'Durable AUTOCAR processing runs with idempotency and usage accounting.';
comment on table public.ai_agent_events is 'Append-oriented AUTOCAR audit events. Summaries must not contain secrets or raw credentials.';
comment on table public.ai_agent_approvals is 'Human approval queue for restricted AUTOCAR actions.';
