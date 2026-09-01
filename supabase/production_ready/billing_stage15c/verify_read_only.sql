select jsonb_build_object(
  'stores', (select count(*) from public.stores),
  'users', (select count(*) from public.users),
  'auth_users', (select count(*) from auth.users),
  'billing_tables', (
    select count(*)
    from pg_class relation
    join pg_namespace namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relkind = 'r'
      and relation.relname in (
        'billing_plans',
        'store_billing_subscriptions',
        'billing_payments',
        'billing_webhook_events',
        'billing_audit_log',
        'store_billing_registration_profiles',
        'store_billing_registration_audit'
      )
  ),
  'rls_enabled', (
    select count(*)
    from pg_class relation
    join pg_namespace namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relrowsecurity
      and relation.relname in (
        'billing_plans',
        'store_billing_subscriptions',
        'billing_payments',
        'billing_webhook_events',
        'billing_audit_log',
        'store_billing_registration_profiles',
        'store_billing_registration_audit'
      )
  ),
  'client_table_grants', (
    select count(*)
    from information_schema.role_table_grants
    where table_schema = 'public'
      and grantee in ('anon', 'authenticated')
      and table_name in (
        'billing_plans',
        'store_billing_subscriptions',
        'billing_payments',
        'billing_webhook_events',
        'billing_audit_log',
        'store_billing_registration_profiles',
        'store_billing_registration_audit'
      )
  ),
  'stage15b_migrations', (
    select count(*)
    from supabase_migrations.schema_migrations
    where name in (
      'billing_stage15b_foundation_asaas',
      'billing_stage15b_registration_profiles',
      'billing_stage15b_observe_hardening',
      'billing_stage15b_webhook_atomicity'
    )
  ),
  'plans', (select count(*) from public.billing_plans),
  'subscriptions', (select count(*) from public.store_billing_subscriptions),
  'payments', (select count(*) from public.billing_payments),
  'webhooks', (select count(*) from public.billing_webhook_events),
  'billing_audits', (select count(*) from public.billing_audit_log),
  'registration_profiles', (select count(*) from public.store_billing_registration_profiles),
  'registration_audits', (select count(*) from public.store_billing_registration_audit),
  'lock_waiters', (
    select count(*) from pg_stat_activity where wait_event_type = 'Lock'
  ),
  'long_transactions', (
    select count(*)
    from pg_stat_activity
    where state <> 'idle' and xact_start < clock_timestamp() - interval '5 minutes'
  )
) as billing_stage15c_verification;
