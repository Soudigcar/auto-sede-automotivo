-- Hosted development branch seed. Synthetic historical evidence only; no external executors or pending work.
insert into public.ai_store_refs(store_id,store_slug,store_name,crm_status,portal_enabled,synced_at)
values
 ('10000000-0000-4000-8000-000000000001','store-alpha','Store Alpha','active',true,'2026-01-01 00:00Z'),
 ('10000000-0000-4000-8000-000000000002','store-beta','Store Beta','active',true,'2026-01-01 00:00Z');

insert into public.ai_store_agents(
 id,store_id,name,status,mode,master_enabled,master_autopilot_allowed,store_selected_mode,capabilities,model_routing
)
values
 ('61000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','AUTOCAR','active','autopilot',true,true,'autopilot','{}','{}');

insert into public.ai_runtime_conversations(
 id,store_id,production_conversation_id,production_lead_id,effective_mode,human_state,runtime_version,metadata,created_at,updated_at
)
values
 ('62000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000002','autopilot','autocar_active',1,'{"synthetic":true}','2026-01-01 00:00Z','2026-01-01 00:00Z');

insert into public.ai_runtime_message_claims(
 id,store_id,production_conversation_id,production_message_id,purpose,idempotency_key,direction,message_type,effective_mode,status,result,claimed_at,completed_at,created_at,updated_at
)
values
 ('60000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000011','live_text_send','metrics-synthetic-claim-1','outbound','text','autopilot','completed','{"external_execution":true,"synthetic":true}','2026-01-01 00:01Z','2026-01-01 00:02Z','2026-01-01 00:01Z','2026-01-01 00:02Z'),
 ('60000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000002','50000000-0000-4000-8000-000000000021','live_text_send','metrics-synthetic-claim-2','outbound','text','autopilot','completed','{"external_execution":true,"synthetic":true}','2026-01-01 00:01Z','2026-01-01 00:02Z','2026-01-01 00:01Z','2026-01-01 00:02Z'),
 ('60000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000003','50000000-0000-4000-8000-000000000031','live_text_send','metrics-synthetic-claim-3','outbound','text','autopilot','completed','{"external_execution":false,"synthetic":true}','2026-01-01 00:01Z','2026-01-01 00:02Z','2026-01-01 00:01Z','2026-01-01 00:02Z'),
 ('60000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000004','50000000-0000-4000-8000-000000000041','live_text_send','metrics-synthetic-claim-4','outbound','text','autopilot','failed','{"external_execution":true,"synthetic":true}','2026-01-01 00:01Z','2026-01-01 00:02Z','2026-01-01 00:01Z','2026-01-01 00:02Z');
