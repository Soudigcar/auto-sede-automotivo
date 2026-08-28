begin;

-- Seed exclusivamente sintético para o ensaio da etapa 13 no saas-dev.
-- Este arquivo não deve ser executado no CRM Production.
do $$
declare
  v_store_id constant uuid := '360eaf1f-8ea3-4fc6-bdb5-a17282c0f103';
  v_user_id constant uuid := '1fb23d03-9ec0-45e9-abd9-dfd9b6973ff9';
  v_profile_id constant uuid := 'ddf22e2f-9ce0-434b-bb98-aac5986178fe';
  v_audit_id constant uuid := '11cc496c-af31-4987-b3d8-f842ac378ad6';
  v_idempotency_key constant uuid := '5df7162d-490d-4cab-9331-e3423e55aeb7';
  v_master_id uuid;
begin
  select actor.id
    into v_master_id
  from public.users actor
  where actor.role = 'master'
    and actor.status = 'active'
  order by actor.created_at, actor.id
  limit 1;

  if v_master_id is null then
    raise exception 'Master ativo nao encontrado no ambiente sintetico.' using errcode = '42501';
  end if;

  insert into public.stores (
    id,
    store_name,
    responsible_name,
    status,
    slug,
    portal_enabled,
    registration_source
  ) values (
    v_store_id,
    'Loja DEV Billing Ativacao',
    'Responsavel Sintetico Etapa 13',
    'active',
    'loja-dev-billing-ativacao',
    false,
    'billing_stage13_seed'
  )
  on conflict (id) do nothing;

  if not exists (
    select 1
    from public.stores store_row
    where store_row.id = v_store_id
      and store_row.store_name = 'Loja DEV Billing Ativacao'
      and store_row.slug = 'loja-dev-billing-ativacao'
      and store_row.registration_source = 'billing_stage13_seed'
      and store_row.status = 'active'
      and store_row.portal_enabled = false
  ) then
    raise exception 'O ID da loja sintetica ja existe com identidade diferente.' using errcode = '23505';
  end if;

  insert into public.users (
    id,
    full_name,
    email,
    role,
    status,
    store_id,
    receives_leads
  ) values (
    v_user_id,
    'Usuario Sintetico Etapa 13',
    'billing-stage13-user@example.com',
    'store',
    'active',
    v_store_id,
    false
  )
  on conflict (id) do nothing;

  if not exists (
    select 1
    from public.users store_user
    where store_user.id = v_user_id
      and store_user.store_id = v_store_id
      and store_user.email = 'billing-stage13-user@example.com'
      and store_user.role = 'store'
      and store_user.status = 'active'
      and store_user.auth_user_id is null
  ) then
    raise exception 'O ID do usuario sintetico ja existe com identidade diferente.' using errcode = '23505';
  end if;

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
    v_profile_id,
    v_store_id,
    'Loja DEV Billing Ativacao Ltda',
    '98765432000198',
    'billing-stage13@example.com',
    '11900000000',
    'ready_for_activation',
    clock_timestamp(),
    v_master_id
  )
  on conflict (store_id) do nothing;

  if not exists (
    select 1
    from public.store_billing_registration_profiles profile
    where profile.id = v_profile_id
      and profile.store_id = v_store_id
      and profile.legal_name = 'Loja DEV Billing Ativacao Ltda'
      and profile.cnpj = '98765432000198'
      and profile.financial_email = 'billing-stage13@example.com'
      and profile.financial_phone = '11900000000'
      and profile.registration_status = 'ready_for_activation'
      and profile.validated_at is not null
      and profile.validated_by = v_master_id
  ) then
    raise exception 'O cadastro financeiro sintetico diverge do seed autorizado.' using errcode = '23505';
  end if;

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
    v_audit_id,
    v_profile_id,
    v_store_id,
    v_master_id,
    'registration_created',
    null,
    'ready_for_activation',
    array['legal_name', 'cnpj', 'financial_email', 'financial_phone', 'registration_status']::text[],
    v_idempotency_key
  )
  on conflict (idempotency_key) do nothing;

  if exists (
    select 1
    from public.store_billing_subscriptions subscription
    where subscription.store_id = v_store_id
  ) then
    raise exception 'O seed da etapa 13 nao pode criar ou reutilizar trial.' using errcode = '23505';
  end if;
end;
$$;

commit;
