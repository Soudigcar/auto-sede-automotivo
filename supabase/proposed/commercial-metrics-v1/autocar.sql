-- PROPOSAL ONLY: AUTOCAR database, separately authorized installation required.
begin;
create or replace function public.read_store_autocar_evidence_v1(p_store_id uuid,p_as_of timestamptz default now())
returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('store_id',p_store_id,'as_of',p_as_of,'definition_version','autocar_evidence_v1',
   'claims',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'conversation_id',c.production_conversation_id))
     from public.ai_runtime_message_claims c where c.store_id=p_store_id and c.status='completed'
       and c.result->>'external_execution'='true' and c.completed_at<=p_as_of
       and c.purpose in ('live_text_send','live_photo_send','live_audio_send','live_location_send','live_visit_schedule','live_human_handoff')),'[]'),
   'active',coalesce((select jsonb_agg(jsonb_build_object('conversation_id',r.production_conversation_id,'lead_id',r.production_lead_id))
     from public.ai_runtime_conversations r join public.ai_store_agents a on a.store_id=r.store_id
     where r.store_id=p_store_id and r.human_state='autocar_active' and r.effective_mode='autopilot'
       and r.updated_at<=p_as_of and a.status='active' and a.mode='autopilot'
       and a.master_enabled=true and a.master_autopilot_allowed=true),'[]'));
$$;
revoke all on function public.read_store_autocar_evidence_v1(uuid,timestamptz) from public,anon,authenticated;
grant execute on function public.read_store_autocar_evidence_v1(uuid,timestamptz) to service_role;
commit;
