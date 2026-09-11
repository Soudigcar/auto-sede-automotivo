-- Hosted Supabase development branch contract only. Validates inherited schema; never reshapes it.
do $$
declare
  ref text := current_setting('app.metrics_project_ref', true);
  missing text[];
  unexpected bigint;
begin
  if current_setting('app.metrics_homologation', true) is distinct from 'synthetic-only'
    or current_setting('app.metrics_target_mode', true) is distinct from 'branch'
    or current_setting('app.metrics_preflight', true) is distinct from 'branch-metadata-v2'
    or ref is null or ref !~ '^[a-z]{20}$'
    or ref in ('wufikrdgyxrsszlbpfmv','icmwdggbvijexjgrvsbl','azszzdotbrczlhrmhrlw','hfzmzfhuhukmxkxbkxay')
  then raise exception 'Unverified hosted homologation branch'; end if;

  select array_agg(required.name order by required.name)
  into missing
  from (values
    ('ai_store_refs.store_id'),('ai_store_refs.store_slug'),('ai_store_refs.store_name'),
    ('ai_store_agents.id'),('ai_store_agents.store_id'),('ai_store_agents.status'),('ai_store_agents.mode'),('ai_store_agents.master_enabled'),('ai_store_agents.master_autopilot_allowed'),('ai_store_agents.store_selected_mode'),
    ('ai_runtime_conversations.id'),('ai_runtime_conversations.store_id'),('ai_runtime_conversations.production_conversation_id'),('ai_runtime_conversations.production_lead_id'),('ai_runtime_conversations.effective_mode'),('ai_runtime_conversations.human_state'),('ai_runtime_conversations.metadata'),('ai_runtime_conversations.created_at'),('ai_runtime_conversations.updated_at'),
    ('ai_runtime_message_claims.id'),('ai_runtime_message_claims.store_id'),('ai_runtime_message_claims.production_conversation_id'),('ai_runtime_message_claims.production_message_id'),('ai_runtime_message_claims.purpose'),('ai_runtime_message_claims.idempotency_key'),('ai_runtime_message_claims.direction'),('ai_runtime_message_claims.effective_mode'),('ai_runtime_message_claims.status'),('ai_runtime_message_claims.result'),('ai_runtime_message_claims.completed_at')
  ) required(name)
  where not exists (
    select 1 from information_schema.columns c
    where c.table_schema='public' and required.name = c.table_name || '.' || c.column_name
  );
  if missing is not null then raise exception 'Hosted AUTOCAR schema contract mismatch: missing %', missing; end if;

  if (select is_nullable from information_schema.columns where table_schema='public' and table_name='ai_runtime_message_claims' and column_name='production_message_id') <> 'NO'
    or (select is_nullable from information_schema.columns where table_schema='public' and table_name='ai_runtime_message_claims' and column_name='idempotency_key') <> 'NO'
    or (select is_nullable from information_schema.columns where table_schema='public' and table_name='ai_runtime_message_claims' and column_name='direction') <> 'NO'
    or (select is_nullable from information_schema.columns where table_schema='public' and table_name='ai_runtime_conversations' and column_name='production_conversation_id') <> 'NO'
  then raise exception 'Hosted AUTOCAR nullability contract mismatch'; end if;

  if not exists (select 1 from pg_constraint where conname='ai_runtime_message_claims_direction_check')
    or not exists (select 1 from pg_constraint where conname='ai_runtime_message_claims_status_check')
    or not exists (select 1 from pg_constraint where conname='ai_runtime_message_claims_idempotency_key_key')
    or not exists (select 1 from pg_constraint where conname='ai_runtime_conversations_store_conversation_unique')
    or not exists (select 1 from pg_constraint where conname='ai_store_agents_store_unique')
  then raise exception 'Hosted AUTOCAR constraint contract mismatch'; end if;

  if not exists (select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='ai_runtime_conversations' and c.relrowsecurity)
    or not exists (select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='ai_runtime_message_claims' and c.relrowsecurity)
    or not exists (select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='ai_store_agents' and c.relrowsecurity)
  then raise exception 'Hosted AUTOCAR RLS contract mismatch'; end if;

  if not exists (select 1 from pg_trigger t join pg_class c on c.oid=t.tgrelid where c.relname='ai_store_agents' and t.tgname='ai_store_agents_dual_control' and not t.tgisinternal)
    or not exists (select 1 from pg_trigger t join pg_class c on c.oid=t.tgrelid where c.relname='ai_runtime_message_claims' and t.tgname='ai_runtime_message_claims_global_capability_ceiling' and not t.tgisinternal)
  then raise exception 'Hosted AUTOCAR trigger contract mismatch'; end if;

  if exists (select 1 from pg_extension where extname='pg_net') or exists (select 1 from pg_namespace where nspname='net') then
    raise exception 'Hosted AUTOCAR egress precondition failed';
  end if;
  if exists (
    select 1 from pg_trigger t
    join pg_proc p on p.oid=t.tgfoid
    join pg_namespace n on n.oid=p.pronamespace
    where not t.tgisinternal and n.nspname='supabase_functions' and p.proname='http_request'
  ) then raise exception 'Hosted AUTOCAR HTTP hook precondition failed'; end if;
  if exists (select 1 from auth.users) then raise exception 'Unexpected Auth state'; end if;

  execute 'select count(*) from public.ai_store_refs' into unexpected; if unexpected <> 0 then raise exception 'AUTOCAR target is not empty: ai_store_refs'; end if;
  execute 'select count(*) from public.ai_store_agents' into unexpected; if unexpected <> 0 then raise exception 'AUTOCAR target is not empty: ai_store_agents'; end if;
  execute 'select count(*) from public.ai_runtime_conversations' into unexpected; if unexpected <> 0 then raise exception 'AUTOCAR target is not empty: ai_runtime_conversations'; end if;
  execute 'select count(*) from public.ai_runtime_message_claims' into unexpected; if unexpected <> 0 then raise exception 'AUTOCAR target is not empty: ai_runtime_message_claims'; end if;
end $$;
