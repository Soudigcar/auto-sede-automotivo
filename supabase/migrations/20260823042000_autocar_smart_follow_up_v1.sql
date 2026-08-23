create table if not exists public.ai_follow_up_events (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null,
  production_conversation_id uuid not null,
  production_lead_id uuid,
  trigger_type text not null check (trigger_type in ('visit_confirmation','post_visit','no_show','callback_requested')),
  contact_basis text not null check (contact_basis in ('appointment_service','customer_requested_callback')),
  due_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending','evaluating','dry_run_ready','dry_run_blocked','cancelled','superseded','completed')),
  source_type text not null check (source_type in ('appointment','callback_request','manual_test')),
  source_id text,
  anchor_message_id uuid,
  context_last_message_at timestamptz,
  idempotency_key text not null unique,
  source_snapshot jsonb not null default '{}'::jsonb,
  last_decision jsonb not null default '{}'::jsonb,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  lease_owner text,
  lease_until timestamptz,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ai_follow_up_events_due_idx
  on public.ai_follow_up_events(status, due_at)
  where status = 'pending';
create index if not exists ai_follow_up_events_store_conversation_idx
  on public.ai_follow_up_events(store_id, production_conversation_id, created_at desc);

create table if not exists public.ai_follow_up_event_audit (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.ai_follow_up_events(id) on delete restrict,
  event_status text not null,
  action text not null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists ai_follow_up_event_audit_event_idx
  on public.ai_follow_up_event_audit(event_id, created_at desc);

create or replace function private.touch_autocar_follow_up_event()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
begin
  new.updated_at := now();
  new.version := old.version + 1;
  return new;
end;
$$;

create or replace function private.prevent_autocar_follow_up_audit_mutation()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
begin
  raise exception using errcode = '42501', message = 'AUTOCAR Smart Follow-up audit is append-only.';
end;
$$;

drop trigger if exists ai_follow_up_events_touch on public.ai_follow_up_events;
create trigger ai_follow_up_events_touch
before update on public.ai_follow_up_events
for each row execute function private.touch_autocar_follow_up_event();

drop trigger if exists ai_follow_up_event_audit_append_only on public.ai_follow_up_event_audit;
create trigger ai_follow_up_event_audit_append_only
before update or delete on public.ai_follow_up_event_audit
for each row execute function private.prevent_autocar_follow_up_audit_mutation();

create or replace function public.claim_autocar_follow_up_events(
  p_worker_id text,
  p_limit integer default 25,
  p_lease_seconds integer default 120
)
returns setof public.ai_follow_up_events
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if nullif(trim(p_worker_id), '') is null then
    raise exception 'worker id is required';
  end if;

  return query
  with due as (
    select e.id
    from public.ai_follow_up_events e
    where e.status = 'pending'
      and e.due_at <= now()
      and (e.lease_until is null or e.lease_until < now())
    order by e.due_at asc, e.created_at asc
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 25), 100))
  )
  update public.ai_follow_up_events e
  set status = 'evaluating',
      lease_owner = p_worker_id,
      lease_until = now() + make_interval(secs => greatest(30, least(coalesce(p_lease_seconds, 120), 900))),
      attempt_count = e.attempt_count + 1
  from due
  where e.id = due.id
  returning e.*;
end;
$$;

alter table public.ai_follow_up_events enable row level security;
alter table public.ai_follow_up_event_audit enable row level security;

create policy service_only_deny_client_access on public.ai_follow_up_events
  as restrictive for all to anon, authenticated using (false) with check (false);
create policy service_only_deny_client_access on public.ai_follow_up_event_audit
  as restrictive for all to anon, authenticated using (false) with check (false);

revoke all on table public.ai_follow_up_events from anon, authenticated;
revoke all on table public.ai_follow_up_event_audit from anon, authenticated;
revoke all on table public.ai_follow_up_events from service_role;
revoke all on table public.ai_follow_up_event_audit from service_role;
grant select, insert, update on table public.ai_follow_up_events to service_role;
grant select, insert on table public.ai_follow_up_event_audit to service_role;

revoke execute on function public.claim_autocar_follow_up_events(text, integer, integer) from public, anon, authenticated;
grant execute on function public.claim_autocar_follow_up_events(text, integer, integer) to service_role;
revoke execute on function private.touch_autocar_follow_up_event() from public, anon, authenticated;
revoke execute on function private.prevent_autocar_follow_up_audit_mutation() from public, anon, authenticated;

comment on table public.ai_follow_up_events is
  'AUTOCAR Smart Follow-up V1 future reevaluation events. V1 is dry-run only and has no external send path.';
comment on table public.ai_follow_up_event_audit is
  'Append-only audit trail for Smart Follow-up planning and dry-run decisions.';
comment on function public.claim_autocar_follow_up_events(text, integer, integer) is
  'Claims due Smart Follow-up events with SKIP LOCKED lease semantics. Execution remains dry-run in V1.';
