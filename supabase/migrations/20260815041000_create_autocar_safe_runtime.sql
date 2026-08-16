create table public.ai_runtime_conversations (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  production_conversation_id uuid not null,
  production_whatsapp_number_id uuid,
  production_lead_id uuid,
  effective_mode text not null default 'off' check (effective_mode in ('off', 'copilot', 'autopilot')),
  human_state text not null default 'autocar_active' check (human_state in ('autocar_active', 'human_active', 'paused')),
  pause_reason text,
  paused_by_profile_id uuid,
  paused_by_source text,
  paused_at timestamptz,
  resumed_at timestamptz,
  last_inbound_message_id uuid,
  last_human_message_id uuid,
  last_processed_message_id uuid,
  runtime_version integer not null default 1 check (runtime_version > 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_runtime_conversations_store_conversation_unique unique (store_id, production_conversation_id)
);

create table public.ai_runtime_message_claims (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  production_conversation_id uuid not null,
  production_message_id uuid not null,
  purpose text not null default 'autopilot_reply',
  idempotency_key text not null,
  direction text not null check (direction in ('inbound', 'outbound')),
  message_type text,
  effective_mode text not null default 'off' check (effective_mode in ('off', 'copilot', 'autopilot')),
  status text not null default 'claimed' check (status in ('claimed', 'ready', 'skipped', 'completed', 'failed')),
  policy_capability text,
  policy_effect text check (policy_effect is null or policy_effect in ('allow', 'deny', 'approval', 'handoff')),
  policy_source text,
  policy_reason text,
  result jsonb not null default '{}'::jsonb,
  claimed_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_runtime_message_claims_idempotency_unique unique (idempotency_key),
  constraint ai_runtime_message_claims_message_purpose_unique unique (store_id, production_message_id, purpose)
);

create index ai_runtime_conversations_store_state_idx
  on public.ai_runtime_conversations(store_id, human_state, updated_at desc);
create index ai_runtime_conversations_external_idx
  on public.ai_runtime_conversations(production_conversation_id);
create index ai_runtime_message_claims_conversation_idx
  on public.ai_runtime_message_claims(store_id, production_conversation_id, created_at desc);
create index ai_runtime_message_claims_status_idx
  on public.ai_runtime_message_claims(store_id, status, created_at desc);

alter table public.ai_runtime_conversations enable row level security;
alter table public.ai_runtime_message_claims enable row level security;

revoke all on table public.ai_runtime_conversations from anon, authenticated;
revoke all on table public.ai_runtime_message_claims from anon, authenticated;
grant all on table public.ai_runtime_conversations to service_role;
grant all on table public.ai_runtime_message_claims to service_role;

comment on table public.ai_runtime_conversations is 'AUTOCAR Preview runtime state. Production CRM identifiers are external references only and intentionally have no foreign keys to AUTOCAR dev data.';
comment on column public.ai_runtime_conversations.production_conversation_id is 'External UUID of the canonical Production WhatsApp conversation. No cross-database foreign key by design.';
comment on column public.ai_runtime_conversations.production_whatsapp_number_id is 'External UUID of the canonical Production WhatsApp number. No cross-database foreign key by design.';
comment on column public.ai_runtime_conversations.production_lead_id is 'External UUID of the canonical Production lead. No cross-database foreign key by design.';
comment on table public.ai_runtime_message_claims is 'Idempotency and deterministic policy audit for AUTOCAR message processing. This table never sends WhatsApp messages.';
comment on column public.ai_runtime_message_claims.production_message_id is 'External UUID of the canonical Production WhatsApp message. No cross-database foreign key by design.';
