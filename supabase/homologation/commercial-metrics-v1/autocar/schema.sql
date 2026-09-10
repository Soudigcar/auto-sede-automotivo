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
create table if not exists public.ai_runtime_message_claims(id uuid primary key,store_id uuid,production_conversation_id uuid,status text,result jsonb,completed_at timestamptz,purpose text);
create table if not exists public.ai_runtime_conversations(store_id uuid,production_conversation_id uuid primary key,production_lead_id uuid,human_state text,effective_mode text,updated_at timestamptz);
create table if not exists public.ai_store_agents(store_id uuid primary key,status text,mode text,master_enabled boolean,master_autopilot_allowed boolean);
alter table public.ai_runtime_message_claims enable row level security;
revoke all on public.ai_runtime_message_claims from anon,authenticated;
grant select,insert,update,delete on public.ai_runtime_message_claims to service_role;
alter table public.ai_runtime_conversations enable row level security;
revoke all on public.ai_runtime_conversations from anon,authenticated;
grant select,insert,update,delete on public.ai_runtime_conversations to service_role;
alter table public.ai_store_agents enable row level security;
revoke all on public.ai_store_agents from anon,authenticated;
grant select,insert,update,delete on public.ai_store_agents to service_role;
