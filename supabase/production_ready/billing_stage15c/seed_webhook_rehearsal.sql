begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- Fixture financeira deterministica e descartavel para o E2E de webhooks 15C.
-- Ela nao representa cobranca real e so pode coexistir com a loja sintetica de
-- falhas criada por fixtures_before_migrations.sql.
do $$
begin
  if (
    select count(*)
    from supabase_migrations.schema_migrations
    where name in (
      'billing_stage15b_foundation_asaas',
      'billing_stage15b_registration_profiles',
      'billing_stage15b_observe_hardening',
      'billing_stage15b_webhook_atomicity'
    )
  ) <> 4 then
    raise exception 'Seed de webhooks 15C recusado: historico 15B incompleto.'
      using errcode = '55000';
  end if;

  if not exists (
    select 1 from public.stores
    where id = '150c0000-0000-4000-8000-000000000102'
      and store_name = 'Loja DEV Billing Falhas'
      and registration_source = 'billing_stage5_seed'
      and status = 'active'
  ) or not exists (
    select 1 from public.users
    where id = '150c0000-0000-4000-8000-000000000001'
      and lower(role::text) = 'master'
      and status = 'active'
  ) or (select count(*) from public.billing_plans where code = 'professional') <> 1 then
    raise exception 'Seed de webhooks 15C recusado: identidades sinteticas divergentes.'
      using errcode = '55000';
  end if;

  if exists (
    select 1 from public.store_billing_subscriptions
    where store_id = '150c0000-0000-4000-8000-000000000102'
      and id <> '150c0000-0000-4000-8000-000000000202'
      and status <> 'cancelled'
  ) or exists (
    select 1 from public.billing_payments
    where store_id = '150c0000-0000-4000-8000-000000000102'
      and id <> '150c0000-0000-4000-8000-000000000302'
  ) then
    raise exception 'Seed de webhooks 15C recusado: a loja sintetica ja possui estado financeiro inesperado.'
      using errcode = '55000';
  end if;
end;
$$;

insert into public.store_billing_subscriptions (
  id,
  store_id,
  plan_id,
  status,
  access_enforcement_mode,
  activation_source,
  master_authorized_by,
  master_authorized_at,
  trial_started_at,
  trial_ends_at,
  provider,
  provider_customer_id,
  provider_subscription_id,
  external_reference
) select
  '150c0000-0000-4000-8000-000000000202',
  '150c0000-0000-4000-8000-000000000102',
  plan.id,
  'trialing',
  'observe',
  'master_authorization',
  '150c0000-0000-4000-8000-000000000001',
  statement_timestamp(),
  statement_timestamp(),
  statement_timestamp() + interval '7 days',
  'asaas',
  'cus_stage15c_failure_synthetic',
  'sub_stage15c_failure_synthetic',
  'store:150c0000-0000-4000-8000-000000000102:subscription:150c0000-0000-4000-8000-000000000202'
from public.billing_plans plan
where plan.code = 'professional'
on conflict (id) do nothing;

insert into public.billing_payments (
  id,
  subscription_id,
  store_id,
  provider,
  provider_payment_id,
  provider_status,
  amount_cents,
  due_at,
  external_reference
) select
  '150c0000-0000-4000-8000-000000000302',
  subscription.id,
  subscription.store_id,
  'asaas',
  'pay_stage15c_failure_synthetic',
  'PENDING',
  149700,
  subscription.trial_ends_at,
  subscription.external_reference
from public.store_billing_subscriptions subscription
where subscription.id = '150c0000-0000-4000-8000-000000000202'
on conflict (id) do nothing;

do $$
begin
  if not exists (
    select 1
    from public.store_billing_subscriptions subscription
    join public.billing_payments payment
      on payment.subscription_id = subscription.id
      and payment.store_id = subscription.store_id
    where subscription.id = '150c0000-0000-4000-8000-000000000202'
      and subscription.store_id = '150c0000-0000-4000-8000-000000000102'
      and subscription.status = 'trialing'
      and subscription.access_enforcement_mode = 'observe'
      and subscription.trial_ends_at = subscription.trial_started_at + interval '7 days'
      and subscription.provider_customer_id = 'cus_stage15c_failure_synthetic'
      and subscription.provider_subscription_id = 'sub_stage15c_failure_synthetic'
      and payment.id = '150c0000-0000-4000-8000-000000000302'
      and payment.provider_payment_id = 'pay_stage15c_failure_synthetic'
      and payment.provider_status = 'PENDING'
      and payment.amount_cents = 149700
      and payment.due_at = subscription.trial_ends_at
  ) then
    raise exception 'Seed de webhooks 15C divergiu da fixture financeira selada.'
      using errcode = '55000';
  end if;
end;
$$;

commit;
