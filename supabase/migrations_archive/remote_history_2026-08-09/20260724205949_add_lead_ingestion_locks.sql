create table if not exists public.lead_ingestion_locks (
  source text not null,
  dedup_key text not null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  attempts integer not null default 1,
  metadata jsonb not null default '{}'::jsonb,
  primary key (source, dedup_key)
);

create index if not exists lead_ingestion_locks_last_seen_idx
  on public.lead_ingestion_locks (last_seen_at desc);

create or replace function public.claim_lead_ingestion_lock(
  p_source text,
  p_dedup_key text,
  p_window_seconds integer default 120
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  affected_count integer := 0;
begin
  if coalesce(trim(p_source), '') = '' or coalesce(trim(p_dedup_key), '') = '' then
    return false;
  end if;

  insert into public.lead_ingestion_locks (source, dedup_key, first_seen_at, last_seen_at, attempts)
  values (trim(p_source), trim(p_dedup_key), now(), now(), 1)
  on conflict (source, dedup_key)
  do update set
    last_seen_at = now(),
    attempts = public.lead_ingestion_locks.attempts + 1
  where public.lead_ingestion_locks.last_seen_at < now() - make_interval(secs => greatest(coalesce(p_window_seconds, 120), 10));

  get diagnostics affected_count = row_count;
  return affected_count > 0;
end;
$$;

grant execute on function public.claim_lead_ingestion_lock(text, text, integer) to anon, authenticated, service_role;

