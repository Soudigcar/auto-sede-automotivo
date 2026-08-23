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

create or replace function public.autocar_training_unpublish_on_content_change()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.status = 'archived' then
    return new;
  end if;

  if (
    new.situation is distinct from old.situation
    or new.intent is distinct from old.intent
    or new.ideal_response is distinct from old.ideal_response
    or new.objective is distinct from old.objective
    or new.next_action is distinct from old.next_action
    or new.restrictions is distinct from old.restrictions
    or new.tags is distinct from old.tags
    or new.examples is distinct from old.examples
    or new.priority is distinct from old.priority
  ) then
    new.status := 'draft';
    new.publication_status := 'unpublished';
    new.approved_at := null;
    new.approved_by_profile_id := null;
    new.published_at := null;
    new.published_by_profile_id := null;
  end if;

  if new.status <> 'approved' then
    new.publication_status := 'unpublished';
    new.published_at := null;
    new.published_by_profile_id := null;
  end if;

  return new;
end;
$$;

drop trigger if exists ai_training_scenarios_unpublish_on_content_change
  on public.ai_training_scenarios;

create trigger ai_training_scenarios_unpublish_on_content_change
before update on public.ai_training_scenarios
for each row
execute function public.autocar_training_unpublish_on_content_change();

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
