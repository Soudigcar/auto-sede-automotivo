-- Additional transactional pre-dispatch checks. No settings or data changes.
create policy service_only_deny_client_access on public.ai_follow_up_v2_execution_audit for all to anon,authenticated using(false) with check(false);

create or replace function public.transition_autocar_follow_up_v2(p_id uuid,p_owner uuid,p_token uuid,p_outcome jsonb) returns boolean
language plpgsql security invoker set search_path = '' as $$
declare v_row public.ai_follow_up_autopilot_executions; v_status text:=p_outcome->>'decision'; v_limit integer; v_interval integer; v_count integer; v_now timestamptz:=clock_timestamp();
begin
  select * into strict v_row from public.ai_follow_up_autopilot_executions where id=p_id;
  perform pg_advisory_xact_lock(hashtextextended(v_row.store_id::text||':'||coalesce(v_row.production_lead_id,v_row.production_conversation_id)::text,0));
  select * into strict v_row from public.ai_follow_up_autopilot_executions where id=p_id for update;
  v_now:=clock_timestamp();
  if v_row.lease_owner is distinct from p_owner or v_row.lease_token is distinct from p_token
    or v_row.status not in ('claimed','dispatching') then return false; end if;
  if v_row.status='claimed' and (v_row.lease_until is null or v_row.lease_until<=v_now) then return false; end if;
  if v_status not in ('blocked','cancelled','superseded','dry_run_ready','dispatching','sent','delivery_unknown') then raise exception 'invalid_transition'; end if;
  if v_status in ('sent','delivery_unknown') and v_row.status<>'dispatching' then raise exception 'not_armed'; end if;
  if v_status='dispatching' and (v_row.dry_run or v_row.store_id<>'239755c3-a2d4-4cdd-9502-f1595031c924'::uuid) then raise exception 'live_scope_denied'; end if;
  if v_status='dry_run_ready' and not v_row.dry_run then raise exception 'not_dry_run'; end if;
  if v_status in ('sent','dry_run_ready') and (nullif(p_outcome->>'proposed_text','') is null or nullif(p_outcome->>'model','') is null) then raise exception 'missing_generation'; end if;
  if v_status='dispatching' then
    if v_row.status<>'claimed' then return false; end if;
    -- Revalidate the Master, store policy, runtime and latest quotas in the arming transaction.
    if not exists(select 1 from public.ai_store_agents a where a.store_id=v_row.store_id and a.status='active'
      and a.master_enabled and a.master_autopilot_allowed and a.store_selected_mode='autopilot')
      or not exists(select 1 from public.ai_runtime_conversations r where r.store_id=v_row.store_id
        and r.production_conversation_id=v_row.production_conversation_id and r.human_state='autocar_active' and r.effective_mode='autopilot')
      or (select effect from public.ai_global_capability_policies where capability='create_follow_up' and is_active order by version desc limit 1) is distinct from 'allow'
      or not exists(select 1 from public.ai_store_policies where store_id=v_row.store_id and policy_key='create_follow_up' and is_active and effect='allow')
      or exists(select 1 from public.ai_store_policies where store_id=v_row.store_id and policy_key='create_follow_up' and is_active and effect<>'allow')
      then return false; end if;
    select least(g.max_per_lead_per_day,s.max_per_lead_per_day), greatest(g.min_interval_minutes,s.min_interval_minutes)
      into v_limit,v_interval from public.ai_follow_up_global_settings g cross join public.ai_follow_up_store_settings s
      where g.id='primary' and s.store_id=v_row.store_id and g.enabled and s.enabled and g.mode='autopilot' and s.mode='autopilot';
    if not found then return false; end if;
    perform pg_advisory_xact_lock(hashtextextended(v_row.store_id::text||':'||coalesce(v_row.production_lead_id,v_row.production_conversation_id)::text,0));
    select count(*) into v_count from public.ai_follow_up_autopilot_executions e where e.store_id=v_row.store_id and not e.dry_run
      and coalesce(e.production_lead_id,e.production_conversation_id)=coalesce(v_row.production_lead_id,v_row.production_conversation_id)
      and (e.status in ('sent','dispatching','delivery_unknown') or (e.status='claimed' and e.lease_until>v_now))
      and coalesce(e.completed_at,e.claimed_at)>=date_trunc('day',v_now at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo';
    if v_count>v_limit then return false; end if;
    if exists(select 1 from public.ai_follow_up_autopilot_executions e where e.id<>p_id and e.store_id=v_row.store_id and not e.dry_run
      and coalesce(e.production_lead_id,e.production_conversation_id)=coalesce(v_row.production_lead_id,v_row.production_conversation_id)
      and e.status in ('sent','dispatching','delivery_unknown') and coalesce(e.completed_at,e.claimed_at)>v_now-make_interval(mins=>v_interval)) then return false; end if;
  end if;
  update public.ai_follow_up_autopilot_executions set status=v_status,reason=p_outcome->>'reason',
    external_execution=case when v_status='dispatching' then null else (p_outcome->>'external_execution')::boolean end,
    planned_message=nullif(p_outcome->>'proposed_text',''),model=nullif(p_outcome->>'model',''),
    generated_at=case when p_outcome->>'model' is not null then v_now else generated_at end,
    provider_message_id=nullif(p_outcome->>'provider_message_id',''),updated_at=v_now,
    completed_at=case when v_status='dispatching' then null else v_now end where id=p_id;
  insert into public.ai_follow_up_v2_execution_audit(execution_id,decision,reason,external_execution,metadata)
    values(p_id,v_status,p_outcome->>'reason',case when v_status='dispatching' then null else (p_outcome->>'external_execution')::boolean end,
      jsonb_build_object('model',p_outcome->>'model','generation_fail_closed',p_outcome->'generation_fail_closed','gates',p_outcome->'gates'));
  return true;
end $$;


create or replace function public.claim_autocar_follow_up_v2(p_id uuid,p_owner uuid,p_limits jsonb) returns jsonb
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
  v_now:=clock_timestamp();
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

