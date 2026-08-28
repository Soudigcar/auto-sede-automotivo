-- Somente leitura. Execute antes e depois do pacote, sempre com as flags de
-- mutacao, trial, confirmacao de pagamento e enforcement desligadas.
select
  to_regclass('public.billing_plans') is not null as billing_plans_exists,
  to_regclass('public.store_billing_subscriptions') is not null as subscriptions_exists,
  to_regclass('public.billing_payments') is not null as payments_exists,
  to_regclass('public.billing_webhook_events') is not null as webhooks_exists,
  to_regclass('public.billing_audit_log') is not null as billing_audit_exists,
  to_regclass('public.store_billing_registration_profiles') is not null as registration_exists,
  to_regclass('public.store_billing_registration_audit') is not null as registration_audit_exists;

select
  c.relname as table_name,
  c.relrowsecurity as rls_enabled
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
    'save_store_billing_registration_profile'
  )
order by p.proname;

select
  exists (
    select 1
    from pg_constraint
    where conname = 'store_billing_stage14_observe_only'
      and conrelid = 'public.store_billing_subscriptions'::regclass
  ) as observe_only_constraint,
  (select count(*) from public.store_billing_subscriptions
    where access_enforcement_mode <> 'observe') as enforcement_rows,
  (select count(*) from public.store_billing_subscriptions) as subscriptions,
  (select count(*) from public.billing_payments) as payments,
  (select count(*) from public.billing_webhook_events) as webhooks,
  (select count(*) from public.billing_audit_log) as billing_audits,
  (select count(*) from public.store_billing_registration_profiles) as registrations,
  (select count(*) from public.store_billing_registration_audit) as registration_audits;
