begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- Fixtures-base exclusivas da branch descartavel 15C. O arquivo recusa uma
-- base com dados, Auth ou qualquer objeto de billing para impedir uso em um
-- dos ambientes permanentes.
do $$
begin
  if to_regclass('public.billing_plans') is not null
    or to_regclass('public.store_billing_subscriptions') is not null
    or to_regclass('public.billing_webhook_events') is not null then
    raise exception 'Fixtures 15C recusadas: billing ja existe neste ambiente.'
      using errcode = '55000';
  end if;

  if (select count(*) from public.stores) <> 0
    or (select count(*) from public.users) <> 0
    or (select count(*) from auth.users) <> 0 then
    raise exception 'Fixtures 15C recusadas: o baseline deve estar vazio e sem usuarios Auth.'
      using errcode = '55000';
  end if;
end;
$$;

insert into public.stores (
  id, store_name, responsible_name, status, slug, portal_enabled, registration_source
) values
  (
    '150c0000-0000-4000-8000-000000000101',
    'Loja DEV Roteamento',
    'Responsavel Sintetico Positivo',
    'active',
    'billing-stage15c-positive',
    false,
    'dev_routing_seed'
  ),
  (
    '150c0000-0000-4000-8000-000000000102',
    'Loja DEV Billing Falhas',
    'Responsavel Sintetico Falhas',
    'active',
    'billing-stage15c-failure',
    false,
    'billing_stage5_seed'
  ),
  (
    '150c0000-0000-4000-8000-000000000103',
    'Loja DEV Billing Ativacao',
    'Responsavel Sintetico Ativacao',
    'active',
    'billing-stage15c-activation',
    false,
    'billing_stage13_seed'
  );

insert into public.users (
  id, full_name, email, role, status, store_id, receives_leads
) values
  (
    '150c0000-0000-4000-8000-000000000001',
    'Master Sintetico Billing 15C',
    'billing-stage15c-master@example.com',
    'master',
    'active',
    null,
    false
  ),
  (
    '150c0000-0000-4000-8000-000000000201',
    'Usuario Sintetico Positivo',
    'billing-stage15c-positive-user@example.com',
    'store',
    'active',
    '150c0000-0000-4000-8000-000000000101',
    false
  ),
  (
    '150c0000-0000-4000-8000-000000000202',
    'Usuario Sintetico Falhas',
    'billing-stage15c-failure-user@example.com',
    'store',
    'active',
    '150c0000-0000-4000-8000-000000000102',
    false
  ),
  (
    '150c0000-0000-4000-8000-000000000203',
    'Usuario Sintetico Ativacao',
    'billing-stage15c-activation-user@example.com',
    'store',
    'active',
    '150c0000-0000-4000-8000-000000000103',
    false
  );

do $$
begin
  if (select count(*) from public.stores) <> 3
    or (select count(*) from public.users) <> 4
    or (select count(*) from auth.users) <> 0
    or exists (select 1 from public.stores where portal_enabled or status <> 'active')
    or exists (select 1 from public.users where auth_user_id is not null) then
    raise exception 'Fixtures-base 15C divergiram do estado sintetico selado.'
      using errcode = '55000';
  end if;
end;
$$;

commit;
