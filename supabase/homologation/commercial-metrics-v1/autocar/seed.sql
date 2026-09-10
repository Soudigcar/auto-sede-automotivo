-- Isolated project installation only. No operational migrations or integrations.
do $$
declare ref text := current_setting('app.metrics_project_ref',true);
begin
 if current_setting('app.metrics_homologation',true) is distinct from 'synthetic-only'
 or ref is null or ref !~ '^[a-z]{20}$'
 or ref in ('wufikrdgyxrsszlbpfmv','icmwdggbvijexjgrvsbl','azszzdotbrczlhrmhrlw','hfzmzfhuhukmxkxbkxay')
 or current_setting('app.settings.api_external_url',true) is distinct from ('https://' || ref || '.supabase.co')
 then raise exception 'Unverified homologation database'; end if;
end $$;
-- Synthetic external_execution=true DOES NOT perform external execution.
-- This data source contains no executor, credentials, triggers, or destination.
insert into public.ai_runtime_message_claims(id,store_id,production_conversation_id,status,result,completed_at,purpose)
select ('60000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'10000000-0000-4000-8000-000000000001',
 ('40000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 case when n=4 then 'failed' else 'completed' end,
 jsonb_build_object('external_execution',n<>3,'synthetic',true),'2026-01-01 00:02Z','live_text_send'
from generate_series(1,4)n on conflict(id) do nothing;
insert into public.ai_store_agents values('10000000-0000-4000-8000-000000000001','active','autopilot',true,true) on conflict(store_id) do nothing;
insert into public.ai_runtime_conversations values('10000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000002','autocar_active','autopilot','2026-01-01T00:00:00Z') on conflict(production_conversation_id) do nothing;
