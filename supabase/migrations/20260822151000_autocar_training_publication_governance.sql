alter table public.ai_training_scenarios
  add column if not exists publication_status text not null default 'unpublished',
  add column if not exists approved_at timestamptz,
  add column if not exists approved_by_profile_id uuid,
  add column if not exists published_at timestamptz,
  add column if not exists published_by_profile_id uuid;

alter table public.ai_training_scenarios
  drop constraint if exists ai_training_scenarios_publication_status_check;

alter table public.ai_training_scenarios
  add constraint ai_training_scenarios_publication_status_check
  check (publication_status in ('unpublished', 'published'));

alter table public.ai_training_scenarios
  drop constraint if exists ai_training_scenarios_publication_consistency_check;

alter table public.ai_training_scenarios
  add constraint ai_training_scenarios_publication_consistency_check
  check (
    publication_status = 'unpublished'
    or (
      publication_status = 'published'
      and status = 'approved'
      and published_at is not null
    )
  );

-- Preserva o comportamento dos aprendizados que ja estavam ativos antes desta governanca.
-- A migration roda uma unica vez; novos aprendizados usam o default unpublished.
update public.ai_training_scenarios
set
  publication_status = 'published',
  approved_at = coalesce(approved_at, updated_at, created_at, now()),
  approved_by_profile_id = coalesce(approved_by_profile_id, updated_by_profile_id, created_by_profile_id),
  published_at = coalesce(published_at, updated_at, created_at, now()),
  published_by_profile_id = coalesce(published_by_profile_id, updated_by_profile_id, created_by_profile_id)
where status = 'approved'
  and publication_status = 'unpublished';

create index if not exists ai_training_scenarios_published_lookup_idx
  on public.ai_training_scenarios(scope, store_id, priority)
  where status = 'approved'
    and publication_status = 'published'
    and embedding is not null;

create or replace function public.match_autocar_training(
  p_store_id uuid,
  p_query_embedding extensions.vector,
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
    (1 - (s.embedding <=> p_query_embedding))::double precision as similarity
  from public.ai_training_scenarios s
  where s.status = 'approved'
    and s.publication_status = 'published'
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

comment on column public.ai_training_scenarios.publication_status is
  'Publication gate. Only approved + published scenarios are eligible for AUTOCAR semantic retrieval.';
comment on column public.ai_training_scenarios.approved_at is
  'Timestamp of the most recent explicit Master approval for the current scenario version.';
comment on column public.ai_training_scenarios.published_at is
  'Timestamp of the most recent explicit publication into the AUTOCAR retrieval layer.';
comment on function public.match_autocar_training(uuid, extensions.vector, integer) is
  'Returns only explicitly approved and published AUTOCAR training scenarios.';
