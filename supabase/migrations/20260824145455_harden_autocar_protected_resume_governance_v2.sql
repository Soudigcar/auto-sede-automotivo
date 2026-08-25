create table if not exists public.ai_runtime_resume_audit (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null default gen_random_uuid(),
  store_id uuid not null references public.ai_store_refs(store_id) on delete restrict,
  autocar_conversation_id uuid not null references public.ai_runtime_conversations(id) on delete restrict,
  production_conversation_id uuid not null,
  actor_profile_id uuid not null,
  actor_role text not null check (actor_role in ('master', 'store')),
  previous_human_state text not null,
  new_human_state text not null check (new_human_state = 'autocar_active'),
  previous_pause_reason text,
  previous_paused_by_source text,
  previous_paused_by_profile_id uuid,
  previous_paused_at timestamptz,
  resume_reason text not null,
  resume_source text not null,
  protected_resume boolean not null default false,
  created_at timestamptz not null default now(),
  constraint ai_runtime_resume_audit_request_unique unique (request_id)
);

create index if not exists ai_runtime_resume_audit_conversation_idx
  on public.ai_runtime_resume_audit(store_id, production_conversation_id, created_at desc);

alter table public.ai_runtime_resume_audit enable row level security;
revoke all on table public.ai_runtime_resume_audit from public, anon, authenticated, service_role;
grant select on table public.ai_runtime_resume_audit to service_role;

create or replace function public.prevent_autocar_resume_audit_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception using
    errcode = '42501',
    message = 'AUTOCAR resume audit is immutable.';
end;
$$;

drop trigger if exists ai_runtime_resume_audit_immutable on public.ai_runtime_resume_audit;
create trigger ai_runtime_resume_audit_immutable
before update or delete on public.ai_runtime_resume_audit
for each row execute function public.prevent_autocar_resume_audit_mutation();

create or replace function public.guard_autocar_protected_resume_transition()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_protected boolean := lower(btrim(coalesce(old.paused_by_source, ''))) = 'autocar_handoff'
    and old.human_state in ('human_active', 'paused');
  v_authorized boolean := current_setting('autocar.protected_resume_authorized', true) = '1';
begin
  if not v_protected or v_authorized then
    return new;
  end if;

  if new.human_state = 'autocar_active' then
    raise exception using
      errcode = '42501',
      message = 'Protected AUTOCAR handoff can only be resumed through the audited resume RPC.';
  end if;

  new.human_state := old.human_state;
  new.pause_reason := old.pause_reason;
  new.paused_by_profile_id := old.paused_by_profile_id;
  new.paused_by_source := old.paused_by_source;
  new.paused_at := old.paused_at;
  new.resumed_at := old.resumed_at;
  return new;
end;
$$;

drop trigger if exists ai_runtime_conversations_protected_resume_guard
  on public.ai_runtime_conversations;
create trigger ai_runtime_conversations_protected_resume_guard
before update on public.ai_runtime_conversations
for each row execute function public.guard_autocar_protected_resume_transition();

create or replace function public.resume_autocar_conversation_audited(
  p_store_id uuid,
  p_production_conversation_id uuid,
  p_actor_profile_id uuid,
  p_actor_role text,
  p_resume_reason text,
  p_resume_source text,
  p_confirmed boolean default false,
  p_request_id uuid default gen_random_uuid()
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current public.ai_runtime_conversations%rowtype;
  v_updated public.ai_runtime_conversations%rowtype;
  v_role text := lower(btrim(coalesce(p_actor_role, '')));
  v_reason text := btrim(coalesce(p_resume_reason, ''));
  v_source text := btrim(coalesce(p_resume_source, ''));
  v_protected boolean := false;
  v_audit_id uuid;
begin
  if p_store_id is null or p_production_conversation_id is null or p_actor_profile_id is null then
    raise exception using errcode = '22023', message = 'Missing required AUTOCAR resume identity.';
  end if;

  if v_role not in ('master', 'store') then
    raise exception using errcode = '42501', message = 'Actor role is not allowed to resume AUTOCAR.';
  end if;

  if v_source = '' then
    raise exception using errcode = '22023', message = 'Resume source is required.';
  end if;

  select *
    into v_current
  from public.ai_runtime_conversations
  where store_id = p_store_id
    and production_conversation_id = p_production_conversation_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'AUTOCAR runtime conversation not found.';
  end if;

  if v_current.human_state not in ('human_active', 'paused') then
    raise exception using errcode = 'P0001', message = 'AUTOCAR conversation is not paused for human service.';
  end if;

  v_protected := lower(btrim(coalesce(v_current.paused_by_source, ''))) = 'autocar_handoff';

  if v_protected and v_role <> 'master' then
    raise exception using errcode = '42501', message = 'Protected AUTOCAR handoff requires Master role.';
  end if;

  if v_protected and length(v_reason) < 12 then
    raise exception using errcode = '22023', message = 'Protected AUTOCAR handoff requires a resume reason with at least 12 characters.';
  end if;

  if v_protected and p_confirmed is not true then
    raise exception using errcode = '22023', message = 'Protected AUTOCAR handoff requires explicit Master confirmation.';
  end if;

  if v_reason = '' then
    v_reason := 'Retomada manual pelo Portal da Loja.';
  end if;

  if v_protected then
    perform set_config('autocar.protected_resume_authorized', '1', true);
  end if;

  update public.ai_runtime_conversations
  set
    human_state = 'autocar_active',
    pause_reason = null,
    paused_by_profile_id = null,
    paused_by_source = null,
    paused_at = null,
    resumed_at = clock_timestamp(),
    updated_at = clock_timestamp()
  where id = v_current.id
  returning * into v_updated;

  insert into public.ai_runtime_resume_audit (
    request_id,
    store_id,
    autocar_conversation_id,
    production_conversation_id,
    actor_profile_id,
    actor_role,
    previous_human_state,
    new_human_state,
    previous_pause_reason,
    previous_paused_by_source,
    previous_paused_by_profile_id,
    previous_paused_at,
    resume_reason,
    resume_source,
    protected_resume
  ) values (
    coalesce(p_request_id, gen_random_uuid()),
    v_current.store_id,
    v_current.id,
    v_current.production_conversation_id,
    p_actor_profile_id,
    v_role,
    v_current.human_state,
    v_updated.human_state,
    v_current.pause_reason,
    v_current.paused_by_source,
    v_current.paused_by_profile_id,
    v_current.paused_at,
    v_reason,
    v_source,
    v_protected
  )
  returning id into v_audit_id;

  return jsonb_build_object(
    'runtime', to_jsonb(v_updated),
    'audit_id', v_audit_id,
    'protected_resume', v_protected
  );
end;
$$;

revoke all on function public.resume_autocar_conversation_audited(uuid, uuid, uuid, text, text, text, boolean, uuid)
  from public, anon, authenticated;
grant execute on function public.resume_autocar_conversation_audited(uuid, uuid, uuid, text, text, text, boolean, uuid)
  to service_role;

comment on table public.ai_runtime_resume_audit is
  'Immutable audit trail for manual AUTOCAR resume transitions. Actor identity is supplied only by the authenticated server route.';
comment on function public.resume_autocar_conversation_audited(uuid, uuid, uuid, text, text, text, boolean, uuid) is
  'Atomically resumes a human-paused AUTOCAR conversation and records the previous state. autocar_handoff requires Master, reason and explicit confirmation.';
