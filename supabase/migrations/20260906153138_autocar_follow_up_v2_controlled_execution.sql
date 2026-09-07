-- V2 only. No settings, policies, modes, cron or existing V1 events are changed.
-- Apply only to the explicitly authorized environment; application rollout is separate.
alter table public.ai_follow_up_autopilot_executions
  add column dry_run boolean not null default false,
  add column sequence_key text,
  add column source_id text,
  add column anchor_at timestamptz,
  add column lease_owner uuid,
  add column lease_token uuid,
  add column lease_until timestamptz,
  add column external_execution boolean,
  add column generated_at timestamptz;

alter table public.ai_follow_up_autopilot_executions
  drop constraint ai_follow_up_autopilot_executions_scenario_key_check,
  drop constraint ai_follow_up_autopilot_executions_status_check,
  drop constraint ai_follow_up_autopilot_executions_store_id_check;
alter table public.ai_follow_up_autopilot_executions
  add constraint ai_follow_up_autopilot_executions_scenario_key_check check
    (scenario_key in ('silent_lead','simulation_pending','vehicle_interest','visit_confirmation','no_show','post_visit','callback_requested')),
  add constraint ai_follow_up_autopilot_executions_status_check check
    (status in ('planned','claimed','blocked','fallback_copilot','sent','failed','cancelled','superseded','dry_run_ready','dispatching','delivery_unknown')),
  add constraint ai_follow_up_autopilot_executions_store_id_check check
    (store_id = '239755c3-a2d4-4cdd-9502-f1595031c924'::uuid or dry_run),
  add constraint ai_follow_up_v2_dry_run_never_external check
    (not dry_run or (external_execution is not true and status not in ('dispatching','sent','delivery_unknown')));

alter table public.ai_follow_up_copilot_suggestions
  drop constraint ai_follow_up_copilot_suggestions_scenario_key_check;
alter table public.ai_follow_up_copilot_suggestions
  add constraint ai_follow_up_copilot_suggestions_scenario_key_check check
    (scenario_key in ('silent_lead','simulation_pending','vehicle_interest','visit_confirmation','no_show','post_visit','callback_requested'));

create table public.ai_follow_up_v2_execution_audit (
  id uuid primary key default gen_random_uuid(),
  execution_id uuid not null references public.ai_follow_up_autopilot_executions(id) on delete cascade,
  decision text not null,
  reason text not null,
  external_execution boolean,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index ai_follow_up_v2_audit_execution_idx on public.ai_follow_up_v2_execution_audit(execution_id,created_at);
create index ai_follow_up_v2_reservation_idx on public.ai_follow_up_autopilot_executions(store_id,production_lead_id,claimed_at)
  where status in ('claimed','dispatching','delivery_unknown','sent','dry_run_ready');
alter table public.ai_follow_up_v2_execution_audit enable row level security;
revoke all on public.ai_follow_up_v2_execution_audit from anon, authenticated;
grant select,insert,delete on public.ai_follow_up_v2_execution_audit to service_role;
grant select,insert,update,delete on public.ai_follow_up_autopilot_executions to service_role;

-- Service-only RPCs use caller privileges, fixed search paths and no network calls.
create function public.plan_autocar_follow_up_v2(p_event jsonb) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare v_id uuid; v_row public.ai_follow_up_autopilot_executions;
begin
  insert into public.ai_follow_up_autopilot_executions
    (store_id,production_conversation_id,production_lead_id,scenario_key,step_id,due_at,
     trigger_last_customer_message_at,trigger_last_store_message_at,idempotency_key,status,
     dry_run,sequence_key,source_id,anchor_at,external_execution,metadata)
  values ((p_event->>'storeId')::uuid,(p_event->>'conversationId')::uuid,(p_event->>'leadId')::uuid,
    p_event->>'scenario',p_event->>'stepId',(p_event->>'dueAt')::timestamptz,
    (p_event->>'inboundAt')::timestamptz,(p_event->>'anchorAt')::timestamptz,p_event->>'idempotencyKey','planned',
    (p_event->>'dryRun')::boolean,p_event->>'sequenceKey',p_event->>'sourceId',(p_event->>'anchorAt')::timestamptz,false,
    jsonb_build_object('version','follow-up-v2-controlled','homologation',p_event->>'homologation'))
  on conflict (idempotency_key) do nothing returning id into v_id;
  if v_id is null then
    select * into strict v_row from public.ai_follow_up_autopilot_executions where idempotency_key=p_event->>'idempotencyKey';
    if v_row.store_id<>(p_event->>'storeId')::uuid or v_row.production_conversation_id<>(p_event->>'conversationId')::uuid
      or v_row.dry_run<>(p_event->>'dryRun')::boolean then raise exception 'idempotency_scope_mismatch'; end if;
    return v_row.id;
  end if;
  insert into public.ai_follow_up_v2_execution_audit(execution_id,decision,reason,external_execution)
    values (v_id,'planned','source_planned',false);
  return v_id;
end $$;

create function public.claim_autocar_follow_up_v2(p_id uuid,p_owner uuid,p_limits jsonb) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  v_row public.ai_follow_up_autopilot_executions; v_token uuid; v_reason text;
  v_daily integer; v_sequence integer; v_interval integer; v_days integer;
  v_count integer; v_latest timestamptz; v_now timestamptz:=clock_timestamp();
begin
  select * into strict v_row from public.ai_follow_up_autopilot_executions where id=p_id;
  -- Same lead across different conversations/scenarios uses the same transaction lock.
  perform pg_advisory_xact_lock(hashtextextended(v_row.store_id::text||':'||coalesce(v_row.production_lead_id,v_row.production_conversation_id)::text,0));
  select * into strict v_row from public.ai_follow_up_autopilot_executions where id=p_id for update;
  if v_row.status not in ('planned','claimed') or (v_row.status='claimed' and v_row.lease_until>v_now) then
    return jsonb_build_object('reason','duplicate_or_leased');
  end if;
  if v_row.status='claimed' and v_row.lease_until is null then return jsonb_build_object('reason','legacy_claim'); end if;
  v_daily:=(p_limits->>'maxPerLeadPerDay')::integer;
  v_sequence:=(p_limits->>'maxPerSequence')::integer;
  v_interval:=(p_limits->>'minIntervalMinutes')::integer;
  v_days:=(p_limits->>'maxSequenceDays')::integer;
  if v_daily is null or v_daily not between 1 and 5 or v_sequence is null or v_sequence not between 1 and 10
    or v_interval is null or v_interval<15 or v_days is null or v_days not between 1 and 30 then
    return jsonb_build_object('reason','invalid_limits');
  end if;
  if not v_row.dry_run then
    -- Never trust a previously captured looser config for a LIVE reservation.
    select least(v_daily,g.max_per_lead_per_day,s.max_per_lead_per_day),
      least(v_sequence,g.max_per_sequence,s.max_per_sequence),
      greatest(v_interval,g.min_interval_minutes,s.min_interval_minutes),
      least(v_days,g.max_sequence_days,s.max_sequence_days)
    into v_daily,v_sequence,v_interval,v_days
    from public.ai_follow_up_global_settings g cross join public.ai_follow_up_store_settings s
    where g.id='primary' and s.store_id=v_row.store_id and g.enabled and s.enabled and g.mode='autopilot' and s.mode='autopilot';
    if not found then return jsonb_build_object('reason','follow_up_disabled'); end if;
  end if;
  if v_row.due_at>v_now then v_reason:='not_due';
  elsif v_row.anchor_at + make_interval(days=>v_days)<v_now then v_reason:='sequence_expired';
  else
    select count(*),max(coalesce(completed_at,claimed_at)) into v_count,v_latest
    from public.ai_follow_up_autopilot_executions e
    where e.id<>p_id and e.store_id=v_row.store_id and e.dry_run=v_row.dry_run
      and coalesce(e.production_lead_id,e.production_conversation_id)=coalesce(v_row.production_lead_id,v_row.production_conversation_id)
      and (e.status in ('dispatching','delivery_unknown','sent','dry_run_ready') or (e.status='claimed' and e.lease_until>v_now))
      and coalesce(e.completed_at,e.claimed_at)>=date_trunc('day',v_now at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo';
    if v_count>=v_daily then v_reason:='daily_limit';
    elsif exists (select 1 from public.ai_follow_up_autopilot_executions e where e.id<>p_id and e.store_id=v_row.store_id
      and e.dry_run=v_row.dry_run and coalesce(e.production_lead_id,e.production_conversation_id)=coalesce(v_row.production_lead_id,v_row.production_conversation_id)
      and (e.status in ('dispatching','delivery_unknown') or (e.status='claimed' and e.lease_until>v_now))) then v_reason:='lead_reserved';
    elsif exists (select 1 from public.ai_follow_up_autopilot_executions e where e.id<>p_id and e.store_id=v_row.store_id
      and e.dry_run=v_row.dry_run and coalesce(e.production_lead_id,e.production_conversation_id)=coalesce(v_row.production_lead_id,v_row.production_conversation_id)
      and e.status in ('sent','dry_run_ready') and e.completed_at>v_now-make_interval(mins=>v_interval)) then v_reason:='cooldown';
    else
      select count(*) into v_count from public.ai_follow_up_autopilot_executions e
      where e.id<>p_id and e.store_id=v_row.store_id and e.sequence_key=v_row.sequence_key and e.dry_run=v_row.dry_run
        and (e.status in ('dispatching','delivery_unknown','sent','dry_run_ready') or (e.status='claimed' and e.lease_until>v_now));
      if v_count>=v_sequence then v_reason:='sequence_limit'; end if;
    end if;
  end if;
  if v_reason is not null then
    insert into public.ai_follow_up_v2_execution_audit(execution_id,decision,reason,external_execution)
      values (p_id,'blocked',v_reason,false);
    return jsonb_build_object('reason',v_reason);
  end if;
  v_token:=gen_random_uuid();
  update public.ai_follow_up_autopilot_executions set status='claimed',lease_owner=p_owner,lease_token=v_token,
    lease_until=v_now+interval '120 seconds',claimed_at=v_now,updated_at=v_now where id=p_id;
  insert into public.ai_follow_up_v2_execution_audit(execution_id,decision,reason,external_execution)
    values (p_id,'claimed','lease_acquired',false);
  return jsonb_build_object('lease',jsonb_build_object('id',p_id,'owner',p_owner,'token',v_token));
end $$;

create function public.transition_autocar_follow_up_v2(p_id uuid,p_owner uuid,p_token uuid,p_outcome jsonb) returns boolean
language plpgsql security invoker set search_path = '' as $$
declare v_row public.ai_follow_up_autopilot_executions; v_status text:=p_outcome->>'decision'; v_now timestamptz:=clock_timestamp();
begin
  select * into strict v_row from public.ai_follow_up_autopilot_executions where id=p_id for update;
  if v_row.lease_owner is distinct from p_owner or v_row.lease_token is distinct from p_token
    or v_row.status not in ('claimed','dispatching') then return false; end if;
  if v_row.status='claimed' and (v_row.lease_until is null or v_row.lease_until<=v_now) then return false; end if;
  if v_status not in ('blocked','cancelled','superseded','dry_run_ready','dispatching','sent','delivery_unknown') then raise exception 'invalid_transition'; end if;
  if v_status in ('sent','delivery_unknown') and v_row.status<>'dispatching' then raise exception 'not_armed'; end if;
  if v_status='dispatching' and (v_row.dry_run or v_row.store_id<>'239755c3-a2d4-4cdd-9502-f1595031c924'::uuid) then raise exception 'live_scope_denied'; end if;
  if v_status='dry_run_ready' and not v_row.dry_run then raise exception 'not_dry_run'; end if;
  if v_status in ('sent','dry_run_ready') and (nullif(p_outcome->>'proposed_text','') is null or nullif(p_outcome->>'model','') is null) then raise exception 'missing_generation'; end if;
  update public.ai_follow_up_autopilot_executions set status=v_status,reason=p_outcome->>'reason',
    external_execution=case when v_status='dispatching' then null else (p_outcome->>'external_execution')::boolean end,
    planned_message=nullif(p_outcome->>'proposed_text',''),model=nullif(p_outcome->>'model',''),
    generated_at=case when p_outcome->>'model' is not null then v_now else generated_at end,
    provider_message_id=nullif(p_outcome->>'provider_message_id',''),updated_at=v_now,
    completed_at=case when v_status='dispatching' then null else v_now end where id=p_id;
  insert into public.ai_follow_up_v2_execution_audit(execution_id,decision,reason,external_execution,metadata)
    values(p_id,v_status,p_outcome->>'reason',case when v_status='dispatching' then null else (p_outcome->>'external_execution')::boolean end,
      jsonb_build_object('model',p_outcome->>'model','generation_fail_closed',p_outcome->'generation_fail_closed'));
  return true;
end $$;

create function public.audit_autocar_follow_up_v2(p_id uuid,p_outcome jsonb) returns void
language plpgsql security invoker set search_path = '' as $$
begin
  insert into public.ai_follow_up_v2_execution_audit(execution_id,decision,reason,external_execution)
    values(p_id,p_outcome->>'decision',p_outcome->>'reason',false);
  -- A blocked attempt cannot revoke another worker's active lease or overwrite a receipt.
  if p_outcome->>'decision' in ('cancelled','superseded') then
    update public.ai_follow_up_autopilot_executions set status=p_outcome->>'decision',reason=p_outcome->>'reason',
      external_execution=false,completed_at=clock_timestamp(),updated_at=clock_timestamp()
    where id=p_id and (status='planned' or (status='claimed' and lease_until<=clock_timestamp()));
  end if;
end $$;
revoke all on function public.audit_autocar_follow_up_v2(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.audit_autocar_follow_up_v2(uuid,jsonb) to service_role;
revoke all on function public.plan_autocar_follow_up_v2(jsonb) from public,anon,authenticated;
revoke all on function public.claim_autocar_follow_up_v2(uuid,uuid,jsonb) from public,anon,authenticated;
revoke all on function public.transition_autocar_follow_up_v2(uuid,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.plan_autocar_follow_up_v2(jsonb) to service_role;
grant execute on function public.claim_autocar_follow_up_v2(uuid,uuid,jsonb) to service_role;
grant execute on function public.transition_autocar_follow_up_v2(uuid,uuid,uuid,jsonb) to service_role;
