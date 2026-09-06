-- Preserve runtime observability without letting stale workers create LIVE claims.
-- No configuration is enabled and no provider is called by this function.
create function public.arm_autocar_follow_up_v2(p_id uuid,p_owner uuid,p_token uuid,p_message_id uuid,p_text text,p_model text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_row public.ai_follow_up_autopilot_executions; v_claim uuid; v_armed boolean;
begin
  if p_message_id is null or nullif(trim(p_text),'') is null or char_length(p_text)>600 or nullif(trim(p_model),'') is null then
    return null;
  end if;
  v_armed:=public.transition_autocar_follow_up_v2(p_id,p_owner,p_token,
    jsonb_build_object('decision','dispatching','reason','provider_dispatch_armed','external_execution',null,'proposed_text',p_text,'model',p_model));
  if not v_armed then return null; end if;
  select * into strict v_row from public.ai_follow_up_autopilot_executions where id=p_id;
  insert into public.ai_runtime_message_claims(store_id,production_conversation_id,production_message_id,purpose,idempotency_key,
    direction,message_type,effective_mode,status,policy_capability,policy_effect,policy_source,policy_reason,result)
  values(v_row.store_id,v_row.production_conversation_id,p_message_id,'live_text_send',
    'autocar:'||v_row.store_id||':'||p_id||':follow_up_live_text_send','outbound','text','autopilot','ready',
    'create_follow_up','allow','follow_up_v2_controlled','Pre-dispatch revalidation required',
    jsonb_build_object('follow_up_autopilot',true,'follow_up_execution_id',p_id,'external_execution',null,'planned_text',p_text))
  returning id into v_claim;
  return jsonb_build_object('runtime_claim_id',v_claim);
exception when unique_violation then
  -- This exception block rolls back BOTH the arm and the insert.
  -- Never reuse an existing runtime claim to call the provider again.
  return null;
end $$;
revoke all on function public.arm_autocar_follow_up_v2(uuid,uuid,uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.arm_autocar_follow_up_v2(uuid,uuid,uuid,uuid,text,text) to service_role;
