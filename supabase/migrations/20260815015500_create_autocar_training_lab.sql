create table public.ai_training_scenarios (
  id uuid primary key default gen_random_uuid(),
  scope text not null default 'global' check (scope in ('global', 'store')),
  store_id uuid references public.stores(id) on delete cascade,
  situation text not null,
  intent text,
  ideal_response text not null,
  objective text,
  next_action text,
  restrictions jsonb not null default '[]'::jsonb,
  tags jsonb not null default '[]'::jsonb,
  examples jsonb not null default '[]'::jsonb,
  priority integer not null default 100 check (priority between 1 and 1000),
  status text not null default 'draft' check (status in ('draft', 'approved', 'archived')),
  version integer not null default 1 check (version > 0),
  embedding extensions.vector(1536),
  created_by_profile_id uuid,
  updated_by_profile_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_training_scenarios_scope_store_check check (
    (scope = 'global' and store_id is null)
    or (scope = 'store' and store_id is not null)
  )
);

create table public.ai_training_simulations (
  id uuid primary key default gen_random_uuid(),
  scenario_id uuid references public.ai_training_scenarios(id) on delete set null,
  store_id uuid references public.stores(id) on delete set null,
  customer_input text not null,
  ai_response text not null,
  corrected_response text,
  evaluation text not null default 'generated' check (evaluation in ('generated', 'approved', 'corrected', 'rejected')),
  reasoning_summary text,
  next_action text,
  context_snapshot jsonb not null default '{}'::jsonb,
  model text,
  input_tokens integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  actor_profile_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index ai_training_scenarios_status_priority_idx
  on public.ai_training_scenarios(status, priority, updated_at desc);
create index ai_training_scenarios_store_status_idx
  on public.ai_training_scenarios(store_id, status, priority)
  where store_id is not null;
create index ai_training_simulations_created_idx
  on public.ai_training_simulations(created_at desc);
create index ai_training_simulations_evaluation_idx
  on public.ai_training_simulations(evaluation, created_at desc);

create or replace function public.match_autocar_training(
  p_store_id uuid,
  p_query_embedding extensions.vector(1536),
  p_match_count integer default 6
)
returns table (
  id uuid,
  scope text,
  store_id uuid,
  situation text,
  intent text,
  ideal_response text,
  objective text,
  next_action text,
  restrictions jsonb,
  tags jsonb,
  examples jsonb,
  priority integer,
  similarity double precision
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  select
    s.id,
    s.scope,
    s.store_id,
    s.situation,
    s.intent,
    s.ideal_response,
    s.objective,
    s.next_action,
    s.restrictions,
    s.tags,
    s.examples,
    s.priority,
    1 - (s.embedding <=> p_query_embedding) as similarity
  from public.ai_training_scenarios s
  where s.status = 'approved'
    and s.embedding is not null
    and (
      s.scope = 'global'
      or (s.scope = 'store' and p_store_id is not null and s.store_id = p_store_id)
    )
  order by
    s.priority asc,
    s.embedding <=> p_query_embedding asc
  limit greatest(1, least(coalesce(p_match_count, 6), 20));
$$;

alter table public.ai_training_scenarios enable row level security;
alter table public.ai_training_simulations enable row level security;

revoke all on table public.ai_training_scenarios from anon, authenticated;
revoke all on table public.ai_training_simulations from anon, authenticated;
revoke all on function public.match_autocar_training(uuid, extensions.vector, integer) from public, anon, authenticated;

grant all on table public.ai_training_scenarios to service_role;
grant all on table public.ai_training_simulations to service_role;
grant execute on function public.match_autocar_training(uuid, extensions.vector, integer) to service_role;

comment on table public.ai_training_scenarios is 'Approved AUTOCAR behavioral training scenarios managed by Master, with semantic retrieval.';
comment on table public.ai_training_simulations is 'Master AUTOCAR simulation and human review history. No automatic customer message is sent.';
