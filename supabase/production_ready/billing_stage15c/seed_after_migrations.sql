begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- Seed cadastral posterior as quatro migrations 15B. Nao cria assinatura,
-- trial, pagamento, webhook ou qualquer identidade em auth.users.
do $$
begin
  if to_regclass('public.billing_plans') is null
    or to_regclass('public.store_billing_subscriptions') is null
    or to_regclass('public.billing_payments') is null
    or to_regclass('public.billing_webhook_events') is null
    or to_regclass('public.billing_audit_log') is null
    or to_regclass('public.store_billing_registration_profiles') is null
    or to_regclass('public.store_billing_registration_audit') is null then
    raise exception 'Seed 15C recusado: as sete tabelas 15B nao estao instaladas.'
      using errcode = '55000';
  end if;

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
    raise exception 'Seed 15C recusado: historico 15B incompleto.' using errcode = '55000';
  end if;

  if (select count(*) from public.stores) <> 3
    or (select count(*) from public.users) <> 4
    or (select count(*) from auth.users) <> 0
    or (select count(*) from public.billing_plans where code = 'professional') <> 1
    or (select count(*) from public.store_billing_subscriptions) <> 0
    or (select count(*) from public.billing_payments) <> 0
    or (select count(*) from public.billing_webhook_events) <> 0
    or (select count(*) from public.billing_audit_log) <> 0 then
    raise exception 'Seed 15C recusado: o estado anterior nao corresponde ao baseline selado.'
      using errcode = '55000';
  end if;
end;
$$;

insert into public.store_billing_registration_profiles (
  id,
  store_id,
  legal_name,
  cnpj,
  financial_email,
  financial_phone,
  registration_status,
  validated_at,
  validated_by
) values (
  '150c0000-0000-4000-8000-000000000301',
  '150c0000-0000-4000-8000-000000000103',
  'Loja DEV Billing Ativacao Ltda',
  '98765432000198',
  'billing-stage15c-activation@example.com',
  '11900000000',
  'ready_for_activation',
  clock_timestamp(),
  '150c0000-0000-4000-8000-000000000001'
)
on conflict (id) do nothing;

insert into public.store_billing_registration_audit (
  id,
  profile_id,
  store_id,
  actor_user_id,
  action,
  previous_status,
  new_status,
  changed_fields,
  idempotency_key
) values (
  '150c0000-0000-4000-8000-000000000401',
  '150c0000-0000-4000-8000-000000000301',
  '150c0000-0000-4000-8000-000000000103',
  '150c0000-0000-4000-8000-000000000001',
  'registration_created',
  null,
  'ready_for_activation',
  array['legal_name', 'cnpj', 'financial_email', 'financial_phone', 'registration_status']::text[],
  '150c0000-0000-4000-8000-000000000501'
)
on conflict (idempotency_key) do nothing;

do $$
begin
  if (select count(*) from public.store_billing_registration_profiles) <> 1
    or (select count(*) from public.store_billing_registration_audit) <> 1
    or (select count(*) from public.store_billing_subscriptions) <> 0
    or (select count(*) from public.billing_payments) <> 0
    or (select count(*) from public.billing_webhook_events) <> 0
    or (select count(*) from public.billing_audit_log) <> 0
    or exists (select 1 from public.store_billing_registration_profiles
      where id <> '150c0000-0000-4000-8000-000000000301'
        or store_id <> '150c0000-0000-4000-8000-000000000103'
        or registration_status <> 'ready_for_activation') then
    raise exception 'Seed cadastral 15C divergiu do estado sintetico selado.'
      using errcode = '55000';
  end if;
end;
$$;

commit;
