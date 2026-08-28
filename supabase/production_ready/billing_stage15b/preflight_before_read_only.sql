-- Estritamente somente leitura e seguro antes da existencia de qualquer
-- objeto de billing. O gate de aplicacao exige existing_billing_objects = 0.
select
  count(*) filter (where object_oid is not null) as existing_billing_objects,
  jsonb_object_agg(object_name, object_oid is not null order by object_name) as object_presence
from (
  values
    ('billing_plans', to_regclass('public.billing_plans')),
    ('store_billing_subscriptions', to_regclass('public.store_billing_subscriptions')),
    ('billing_payments', to_regclass('public.billing_payments')),
    ('billing_webhook_events', to_regclass('public.billing_webhook_events')),
    ('billing_audit_log', to_regclass('public.billing_audit_log')),
    ('store_billing_registration_profiles', to_regclass('public.store_billing_registration_profiles')),
    ('store_billing_registration_audit', to_regclass('public.store_billing_registration_audit'))
) as objects(object_name, object_oid);

select
  count(*) filter (where function_oid is not null) as existing_billing_functions,
  jsonb_object_agg(function_name, function_oid is not null order by function_name) as function_presence
from (
  values
    ('start_store_billing_trial', to_regprocedure(
      'public.start_store_billing_trial(uuid,text,uuid,text)'
    )),
    ('save_store_billing_registration_profile', to_regprocedure(
      'public.save_store_billing_registration_profile(uuid,uuid,text,text,text,text,uuid)'
    )),
    ('claim_billing_webhook_event', to_regprocedure(
      'public.claim_billing_webhook_event(uuid,integer)'
    )),
    ('complete_billing_webhook_event', to_regprocedure(
      'public.complete_billing_webhook_event(uuid,uuid,text,text)'
    )),
    ('apply_asaas_subscription_webhook_event', to_regprocedure(
      'public.apply_asaas_subscription_webhook_event(uuid,text,text,text,text)'
    )),
    ('apply_asaas_payment_webhook_event', to_regprocedure(
      'public.apply_asaas_payment_webhook_event(uuid,uuid,text,text,text,text,bigint,timestamptz,timestamptz,text,text,text)'
    ))
) as functions(function_name, function_oid);

select
  required_column.table_name,
  required_column.column_name,
  column_info.data_type,
  column_info.udt_name,
  column_info.is_nullable,
  column_info.column_name is not null as compatible_column_exists
from (
  values
    ('stores', 'id'),
    ('stores', 'status'),
    ('users', 'id'),
    ('users', 'store_id'),
    ('users', 'role'),
    ('users', 'status')
) as required_column(table_name, column_name)
left join information_schema.columns column_info
  on column_info.table_schema = 'public'
 and column_info.table_name = required_column.table_name
 and column_info.column_name = required_column.column_name
order by required_column.table_name, required_column.column_name;

select
  role_name,
  to_regrole(role_name) is not null as role_exists
from unnest(array['anon', 'authenticated', 'service_role']) as role_name
order by role_name;

select
  extname,
  extversion
from pg_extension
where extname in ('pgcrypto', 'uuid-ossp')
order by extname;

select
  pid,
  usename,
  application_name,
  state,
  wait_event_type,
  wait_event,
  clock_timestamp() - xact_start as transaction_age
from pg_stat_activity
where pid <> pg_backend_pid()
  and xact_start is not null
  and (
    clock_timestamp() - xact_start > interval '30 seconds'
    or wait_event_type = 'Lock'
  )
order by xact_start;

select
  version,
  name,
  statements
from supabase_migrations.schema_migrations
where name in (
  'billing_stage15b_foundation_asaas',
  'billing_stage15b_registration_profiles',
  'billing_stage15b_observe_hardening',
  'billing_stage15b_webhook_atomicity',
  'billing_stage15b_forward_rollback'
)
order by version;
