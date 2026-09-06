-- DEV ONLY: synthetic records are deleted in the same transaction; errors roll back all changes.
do $$
declare
  s uuid:=gen_random_uuid(); c uuid:=gen_random_uuid(); l uuid:=gen_random_uuid();
  w uuid:=gen_random_uuid(); w2 uuid:=gen_random_uuid(); e uuid; e2 uuid; token uuid; next_token uuid;
  candidate jsonb; result jsonb; limits jsonb:='{"maxPerLeadPerDay":1,"maxPerSequence":3,"minIntervalMinutes":60,"maxSequenceDays":7}';
begin
  insert into public.ai_store_refs(store_id,store_slug,store_name,crm_status,portal_enabled)
    values(s,'autocar-v2-sql-'||s,'AUTOCAR HOMOLOGACAO V2 SQL','active',true);
  candidate:=jsonb_build_object('storeId',s,'conversationId',c,'leadId',l,'scenario','silent_lead','stepId','synthetic-step',
    'dueAt',now()-interval '5 minutes','inboundAt',now()-interval '2 hours','anchorAt',now()-interval '1 hour',
    'idempotencyKey','AUTOCAR-HOMOLOGACAO-V2-SQL-'||s,'dryRun',true,'sequenceKey','sequence-'||s,'sourceId','synthetic-message','homologation','AUTOCAR HOMOLOGACAO V2 SQL');
  e:=public.plan_autocar_follow_up_v2(candidate);
  if public.plan_autocar_follow_up_v2(candidate)<>e then raise exception 'duplicate_plan'; end if;
  result:=public.claim_autocar_follow_up_v2(e,w,limits);
  token:=(result->'lease'->>'token')::uuid;
  if token is null then raise exception 'claim_failed: %',result; end if;
  perform public.audit_autocar_follow_up_v2(e,'{"decision":"cancelled","reason":"human_protected","external_execution":false,"gates":{"human_state":"human_active","global_policy":"allow"},"context":"DO-NOT-STORE"}');
  if not exists(select 1 from public.ai_follow_up_v2_execution_audit where execution_id=e
    and reason='human_protected' and metadata->'gates'->>'human_state'='human_active'
    and metadata->'gates'->>'global_policy'='allow' and not metadata ? 'context') then raise exception 'gate_evidence_missing'; end if;
  if (select status from public.ai_follow_up_autopilot_executions where id=e)<>'claimed' then raise exception 'audit_revoked_active_lease'; end if;
  begin
    perform public.audit_autocar_follow_up_v2(e,'{"decision":"sent","reason":"forbidden","external_execution":true}');
    raise exception 'audit_forged_provider_result';
  exception when others then if sqlerrm<>'invalid_audit_only_outcome' then raise; end if; end;
  if has_function_privilege('anon','public.audit_autocar_follow_up_v2(uuid,jsonb)','EXECUTE')
    or has_function_privilege('authenticated','public.audit_autocar_follow_up_v2(uuid,jsonb)','EXECUTE') then raise exception 'public_audit_access'; end if;
  if public.claim_autocar_follow_up_v2(e,w2,limits)->>'reason'<>'duplicate_or_leased' then raise exception 'duplicate_worker'; end if;
  if public.transition_autocar_follow_up_v2(e,w2,token,'{"decision":"blocked","reason":"wrong_worker","external_execution":false}') then raise exception 'unfenced_worker'; end if;
  -- A second conversation for the same lead shares the reservation limit.
  e2:=public.plan_autocar_follow_up_v2(candidate||jsonb_build_object('conversationId',gen_random_uuid(),'idempotencyKey','second-'||s));
  if public.claim_autocar_follow_up_v2(e2,w2,limits)->>'reason'<>'daily_limit' then raise exception 'daily_reservation_race'; end if;
  update public.ai_follow_up_autopilot_executions set lease_until=now()-interval '1 second' where id=e;
  if public.transition_autocar_follow_up_v2(e,w,token,'{"decision":"dry_run_ready","reason":"stale","external_execution":false,"proposed_text":"synthetic","model":"mock"}') then raise exception 'expired_worker'; end if;
  result:=public.claim_autocar_follow_up_v2(e,w2,limits); next_token:=(result->'lease'->>'token')::uuid;
  if next_token is null or next_token=token then raise exception 'lease_recovery'; end if;
  if public.transition_autocar_follow_up_v2(e,w,token,'{"decision":"blocked","reason":"old_token","external_execution":false}') then raise exception 'old_token_reused'; end if;
  begin
    perform public.transition_autocar_follow_up_v2(e,w2,next_token,'{"decision":"dispatching","reason":"forbidden","external_execution":null}');
    raise exception 'dry_run_armed';
  exception when others then if sqlerrm<>'live_scope_denied' then raise; end if; end;
  begin
    perform public.arm_autocar_follow_up_v2(e,w2,next_token,gen_random_uuid(),'Texto sintético','mock');
    raise exception 'dry_run_runtime_claim_armed';
  exception when others then if sqlerrm<>'live_scope_denied' then raise; end if; end;
  if has_function_privilege('anon','public.arm_autocar_follow_up_v2(uuid,uuid,uuid,uuid,text,text)','EXECUTE')
    or has_function_privilege('authenticated','public.arm_autocar_follow_up_v2(uuid,uuid,uuid,uuid,text,text)','EXECUTE') then raise exception 'public_arm_access'; end if;
  if not public.transition_autocar_follow_up_v2(e,w2,next_token,'{"decision":"dry_run_ready","reason":"all_gates_allow","external_execution":false,"proposed_text":"Conteúdo do modelo simulado no teste SQL.","model":"mock-sql"}') then raise exception 'settle_failed'; end if;
  if public.claim_autocar_follow_up_v2(e,w,limits)->>'reason'<>'duplicate_or_leased' then raise exception 'completed_reclaimed'; end if;
  if public.claim_autocar_follow_up_v2(e2,w,limits)->>'reason'<>'daily_limit' then raise exception 'daily_limit_failed'; end if;
  if public.claim_autocar_follow_up_v2(e2,w,limits||'{"maxPerLeadPerDay":5}')->>'reason'<>'cooldown' then raise exception 'cooldown_failed'; end if;
  update public.ai_follow_up_autopilot_executions set completed_at=now()-interval '2 hours' where id=e;
  if public.claim_autocar_follow_up_v2(e2,w,limits||'{"maxPerLeadPerDay":5,"maxPerSequence":1}')->>'reason'<>'sequence_limit' then raise exception 'sequence_limit_failed'; end if;
  perform public.audit_autocar_follow_up_v2(e2,'{"decision":"superseded","reason":"new_inbound","external_execution":false}');
  if (select status from public.ai_follow_up_autopilot_executions where id=e2)<>'superseded' then raise exception 'superseded_failed'; end if;
  if exists(select 1 from public.ai_follow_up_autopilot_executions where store_id=s and external_execution is true) then raise exception 'unexpected_external_execution'; end if;
  if (select count(*) from public.ai_follow_up_v2_execution_audit where execution_id in(e,e2))<8 then raise exception 'missing_audit'; end if;
  delete from public.ai_store_refs where store_id=s;
  if exists(select 1 from public.ai_follow_up_autopilot_executions where store_id=s) or exists(select 1 from public.ai_follow_up_v2_execution_audit where execution_id in(e,e2)) then raise exception 'cleanup_failed'; end if;
end $$;
select 'passed' as ledger_assertions, (select count(*) from public.ai_store_refs where store_name='AUTOCAR HOMOLOGACAO V2 SQL') as synthetic_remaining;
