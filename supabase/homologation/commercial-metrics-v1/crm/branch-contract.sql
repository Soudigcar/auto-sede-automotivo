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
    ('stores.id'),('stores.store_name'),('stores.responsible_name'),('stores.slug'),
    ('users.id'),('users.store_id'),('users.email'),('users.full_name'),('users.role'),('users.auth_user_id'),
    ('leads.id'),('leads.assigned_store_id'),('leads.assigned_user_id'),('leads.assigned_user_role'),('leads.seller_user_id'),('leads.pre_sales_user_id'),('leads.captured_by_user_id'),('leads.customer_name'),('leads.origin'),('leads.status'),('leads.created_at'),('leads.updated_at'),
    ('sales.id'),('sales.lead_id'),('sales.store_id'),('sales.seller_name'),('sales.financing_bank'),('sales.payment_type'),('sales.status'),('sales.seller_user_id'),('sales.pre_sales_user_id'),('sales.captured_by_user_id'),('sales.created_at'),('sales.confirmed_at'),
    ('lead_activity_logs.id'),('lead_activity_logs.lead_id'),('lead_activity_logs.store_id'),('lead_activity_logs.activity_type'),('lead_activity_logs.activity_label'),('lead_activity_logs.to_status'),('lead_activity_logs.created_at'),
    ('whatsapp_conversations.id'),('whatsapp_conversations.store_id'),('whatsapp_conversations.lead_id'),('whatsapp_conversations.status'),('whatsapp_conversations.last_message_at'),
    ('whatsapp_messages.id'),('whatsapp_messages.store_id'),('whatsapp_messages.lead_id'),('whatsapp_messages.conversation_id'),('whatsapp_messages.wa_message_id'),('whatsapp_messages.direction'),('whatsapp_messages.status'),('whatsapp_messages.message_type'),('whatsapp_messages.raw_payload'),('whatsapp_messages.sent_at'),('whatsapp_messages.created_at'),
    ('store_whatsapp_integrations.id'),('store_whatsapp_integrations.store_id')
  ) required(name)
  where not exists (
    select 1 from information_schema.columns c
    where c.table_schema='public' and required.name = c.table_name || '.' || c.column_name
  );
  if missing is not null then raise exception 'Hosted CRM schema contract mismatch: missing %', missing; end if;

  if (select is_nullable from information_schema.columns where table_schema='public' and table_name='stores' and column_name='responsible_name') <> 'NO'
    or (select is_nullable from information_schema.columns where table_schema='public' and table_name='leads' and column_name='origin') <> 'NO'
    or (select is_nullable from information_schema.columns where table_schema='public' and table_name='sales' and column_name='seller_name') <> 'NO'
    or (select is_nullable from information_schema.columns where table_schema='public' and table_name='sales' and column_name='financing_bank') <> 'NO'
    or (select is_nullable from information_schema.columns where table_schema='public' and table_name='sales' and column_name='payment_type') <> 'NO'
  then raise exception 'Hosted CRM nullability contract mismatch'; end if;

  if not exists (select 1 from pg_constraint where conname='leads_origin_check')
    or not exists (select 1 from pg_constraint where conname='leads_assigned_user_role_check')
    or not exists (select 1 from pg_constraint where conname='users_role_check')
    or not exists (select 1 from pg_constraint where conname='users_store_role_requires_store')
    or not exists (select 1 from pg_constraint where conname='sales_status_check')
  then raise exception 'Hosted CRM constraint contract mismatch'; end if;

  if not exists (select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='leads' and c.relrowsecurity)
    or not exists (select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='sales' and c.relrowsecurity)
    or not exists (select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='users' and c.relrowsecurity)
  then raise exception 'Hosted CRM RLS contract mismatch'; end if;

  if not exists (select 1 from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='leads' and t.tgname='trg_validate_lead_team_assignment' and not t.tgisinternal)
    or not exists (select 1 from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='leads' and t.tgname='trg_log_lead_activity_from_leads' and not t.tgisinternal)
    or not exists (select 1 from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='sales' and t.tgname='trg_sync_sale_vehicle_from_lead' and not t.tgisinternal)
  then raise exception 'Hosted CRM trigger contract mismatch'; end if;

  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='leads') then
    raise exception 'Hosted CRM Realtime contract mismatch';
  end if;

  if exists (select 1 from pg_extension where extname in ('pg_net','http'))
    or exists (select 1 from pg_namespace where nspname='net')
  then raise exception 'Hosted CRM egress precondition failed'; end if;
  if exists (
    select 1 from pg_trigger t
    join pg_proc p on p.oid=t.tgfoid
    join pg_namespace n on n.oid=p.pronamespace
    where not t.tgisinternal and n.nspname='supabase_functions' and p.proname='http_request'
  ) then raise exception 'Hosted CRM HTTP hook precondition failed'; end if;

  if exists (select 1 from public.store_whatsapp_integrations) then raise exception 'Unexpected WhatsApp integration state'; end if;
  if exists (select 1 from auth.users) then raise exception 'Unexpected Auth state'; end if;

  execute 'select count(*) from public.stores' into unexpected; if unexpected <> 0 then raise exception 'CRM target is not empty: stores'; end if;
  execute 'select count(*) from public.users' into unexpected; if unexpected <> 0 then raise exception 'CRM target is not empty: users'; end if;
  execute 'select count(*) from public.leads' into unexpected; if unexpected <> 0 then raise exception 'CRM target is not empty: leads'; end if;
  execute 'select count(*) from public.sales' into unexpected; if unexpected <> 0 then raise exception 'CRM target is not empty: sales'; end if;
  execute 'select count(*) from public.whatsapp_messages' into unexpected; if unexpected <> 0 then raise exception 'CRM target is not empty: whatsapp_messages'; end if;
end $$;
