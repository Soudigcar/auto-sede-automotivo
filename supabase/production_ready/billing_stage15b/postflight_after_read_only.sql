-- Estritamente somente leitura. Execute apenas depois das quatro migrations.
select
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as rls_forced
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in (
    'billing_plans',
    'store_billing_subscriptions',
    'billing_payments',
    'billing_webhook_events',
    'billing_audit_log',
    'store_billing_registration_profiles',
    'store_billing_registration_audit'
  )
order by c.relname;

select
  grantee,
  table_name,
  string_agg(privilege_type, ',' order by privilege_type) as privileges
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in (
    'billing_plans',
    'store_billing_subscriptions',
    'billing_payments',
    'billing_webhook_events',
    'billing_audit_log',
    'store_billing_registration_profiles',
    'store_billing_registration_audit'
  )
  and grantee in ('anon', 'authenticated', 'service_role', 'PUBLIC')
group by grantee, table_name
order by table_name, grantee;

select
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as identity_arguments,
  p.prosecdef as security_definer,
  p.proconfig as function_configuration,
  has_function_privilege('anon', p.oid, 'execute') as anon_execute,
  has_function_privilege('authenticated', p.oid, 'execute') as authenticated_execute,
  has_function_privilege('service_role', p.oid, 'execute') as service_role_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'start_store_billing_trial',
    'save_store_billing_registration_profile',
    'claim_billing_webhook_event',
    'complete_billing_webhook_event',
    'apply_asaas_subscription_webhook_event',
    'apply_asaas_payment_webhook_event'
  )
order by p.proname;

select
  conrelid::regclass::text as table_name,
  conname as constraint_name,
  contype as constraint_type,
  pg_get_constraintdef(oid) as definition
from pg_constraint
where conname in (
  'store_billing_subscriptions_id_store_key',
  'billing_payments_subscription_store_fkey',
  'billing_audit_subscription_store_fkey',
  'store_billing_registration_profiles_id_store_key',
  'billing_registration_audit_profile_store_fkey',
  'billing_webhook_processing_claim_consistency',
  'store_billing_stage14_observe_only'
)
order by conrelid::regclass::text, conname;

select
  (select count(*) from public.billing_plans) as plans,
  (select count(*) from public.store_billing_subscriptions) as subscriptions,
  (select count(*) from public.billing_payments) as payments,
  (select count(*) from public.billing_webhook_events) as webhooks,
  (select count(*) from public.billing_audit_log) as billing_audits,
  (select count(*) from public.store_billing_registration_profiles) as registrations,
  (select count(*) from public.store_billing_registration_audit) as registration_audits,
  (select count(*) from public.store_billing_subscriptions
    where access_enforcement_mode <> 'observe') as enforcement_rows,
  (select count(*) from public.billing_webhook_events
    where processing_status = 'processing'
      and (processing_token is null or processing_started_at is null))
    as invalid_processing_claims,
  (select count(*) from public.billing_webhook_events
    where processing_status <> 'processing'
      and (processing_token is not null or processing_started_at is not null))
    as leaked_processing_claims;

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
