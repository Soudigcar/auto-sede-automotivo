begin;

-- Extend the existing append-only AUTOCAR governance audit with a dedicated
-- store mode area. Existing global policy/model pricing semantics remain intact.
alter table public.ai_master_control_plane_audit
  drop constraint if exists ai_master_control_plane_audit_area_check;

alter table public.ai_master_control_plane_audit
  add constraint ai_master_control_plane_audit_area_check
  check (area in ('global_policy', 'model_pricing', 'store_mode'));

-- A request id is globally unique for store-mode audit events. This supports
-- safe retries without duplicating the immutable audit trail.
create unique index if not exists ai_master_control_plane_audit_store_mode_request_uidx
  on public.ai_master_control_plane_audit ((new_value ->> 'request_id'))
  where area = 'store_mode' and new_value ? 'request_id';

create or replace function public.set_autocar_store_mode_audited(
  p_store_id uuid,
  p_requested_mode text,
  p_actor_profile_id uuid,
  p_actor_role text,
  p_source text,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  current_agent public.ai_store_agents%rowtype;
  updated_agent public.ai_store_agents%rowtype;
  previous_payload jsonb;
  new_payload jsonb;
  existing_audit jsonb;
begin
  if p_store_id is null then
    raise exception using errcode = '22023', message = 'AUTOCAR store_id is required.';
  end if;
  if p_actor_profile_id is null then
    raise exception using errcode = '22023', message = 'AUTOCAR actor_profile_id is required.';
  end if;
  if p_request_id is null then
    raise exception using errcode = '22023', message = 'AUTOCAR request_id is required.';
  end if;
  if p_requested_mode not in ('off', 'copilot', 'autopilot') then
    raise exception using errcode = '22023', message = 'AUTOCAR requested mode is invalid.';
  end if;
  if p_actor_role not in ('master', 'store') then
    raise exception using errcode = '42501', message = 'AUTOCAR actor role is not allowed to change store mode.';
  end if;
  if p_source <> 'store_portal' then
    raise exception using errcode = '42501', message = 'AUTOCAR store mode source is not allowed.';
  end if;

  -- Serialize retries for the same request id before checking the immutable
  -- audit table. The unique index remains the final database-level guard.
  perform pg_advisory_xact_lock(hashtextextended(p_request_id::text, 0));

  select audit.new_value
    into existing_audit
  from public.ai_master_control_plane_audit audit
  where audit.area = 'store_mode'
    and audit.new_value ->> 'request_id' = p_request_id::text
  limit 1;

  if existing_audit is not null then
    if existing_audit ->> 'store_id' is distinct from p_store_id::text
      or existing_audit ->> 'requested_mode' is distinct from p_requested_mode
      or existing_audit ->> 'actor_profile_id' is distinct from p_actor_profile_id::text
      or existing_audit ->> 'actor_role' is distinct from p_actor_role
      or existing_audit ->> 'source' is distinct from p_source
    then
      raise exception using errcode = '23505', message = 'AUTOCAR request_id was already used with different store-mode parameters.';
    end if;

    return existing_audit || jsonb_build_object(
      'audit_request_id', p_request_id,
      'audit_replayed', true
    );
  end if;

  select agent.*
    into current_agent
  from public.ai_store_agents agent
  where agent.store_id = p_store_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'AUTOCAR agent is not provisioned for this store.';
  end if;

  -- Preserve the existing dual-control behavior. A store cannot select any
  -- operational mode until Master enables AUTOCAR, and AUTOPILOT still needs
  -- its independent Master gate.
  if not current_agent.master_enabled then
    raise exception using errcode = '42501', message = 'A AUTOCAR ainda não foi liberada pelo Master para esta loja.';
  end if;
  if p_requested_mode = 'autopilot' and not current_agent.master_autopilot_allowed then
    raise exception using errcode = '42501', message = 'O AUTOPILOT ainda não foi liberado pelo Master para esta loja.';
  end if;

  previous_payload := jsonb_build_object(
    'id', current_agent.id,
    'store_id', current_agent.store_id,
    'status', current_agent.status,
    'mode', current_agent.mode,
    'store_selected_mode', current_agent.store_selected_mode,
    'master_enabled', current_agent.master_enabled,
    'master_autopilot_allowed', current_agent.master_autopilot_allowed,
    'updated_by_profile_id', current_agent.updated_by_profile_id,
    'updated_at', current_agent.updated_at
  );

  update public.ai_store_agents agent
  set
    store_selected_mode = p_requested_mode,
    updated_by_profile_id = p_actor_profile_id
  where agent.id = current_agent.id
  returning agent.* into updated_agent;

  -- The existing ai_store_agents_dual_control BEFORE trigger computes the
  -- effective mode/status. Capture the post-trigger row so requested and
  -- effective state are both immutable evidence.
  new_payload := jsonb_build_object(
    'id', updated_agent.id,
    'store_id', updated_agent.store_id,
    'status', updated_agent.status,
    'mode', updated_agent.mode,
    'store_selected_mode', updated_agent.store_selected_mode,
    'master_enabled', updated_agent.master_enabled,
    'master_autopilot_allowed', updated_agent.master_autopilot_allowed,
    'updated_by_profile_id', updated_agent.updated_by_profile_id,
    'updated_at', updated_agent.updated_at,
    'requested_mode', p_requested_mode,
    'effective_mode', updated_agent.mode,
    'actor_profile_id', p_actor_profile_id,
    'actor_role', p_actor_role,
    'source', p_source,
    'request_id', p_request_id
  );

  insert into public.ai_master_control_plane_audit (
    area,
    record_key,
    previous_value,
    new_value,
    actor_profile_id
  ) values (
    'store_mode',
    p_store_id::text,
    previous_payload,
    new_payload,
    p_actor_profile_id
  );

  return new_payload || jsonb_build_object(
    'audit_request_id', p_request_id,
    'audit_replayed', false
  );
end;
$$;

revoke all on function public.set_autocar_store_mode_audited(uuid, text, uuid, text, text, uuid)
  from public, anon, authenticated;
grant execute on function public.set_autocar_store_mode_audited(uuid, text, uuid, text, text, uuid)
  to service_role;

comment on function public.set_autocar_store_mode_audited(uuid, text, uuid, text, text, uuid) is
  'Server-only transactional AUTOCAR store-mode mutation. Preserves dual-control gates, records actor/source/request id, and appends immutable store_mode audit evidence.';

comment on index public.ai_master_control_plane_audit_store_mode_request_uidx is
  'Idempotency guard for immutable AUTOCAR store_mode audit events by request_id.';

commit;
