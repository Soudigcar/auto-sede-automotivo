begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- Etapa 14: a estrutura pode observar estados comerciais, mas nao pode
-- bloquear uma loja. Uma etapa futura devera remover explicitamente esta
-- constraint antes que qualquer linha possa usar o modo enforce.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'store_billing_stage14_observe_only'
      and conrelid = 'public.store_billing_subscriptions'::regclass
  ) then
    alter table public.store_billing_subscriptions
      add constraint store_billing_stage14_observe_only
      check (access_enforcement_mode = 'observe');
  end if;
end;
$$;

-- Postgres nao cria indices automaticamente para chaves estrangeiras.
create index if not exists store_billing_subscriptions_store_idx
  on public.store_billing_subscriptions(store_id);
create index if not exists store_billing_subscriptions_plan_idx
  on public.store_billing_subscriptions(plan_id);
create index if not exists store_billing_subscriptions_master_idx
  on public.store_billing_subscriptions(master_authorized_by);
create index if not exists billing_audit_actor_created_idx
  on public.billing_audit_log(actor_user_id, created_at desc)
  where actor_user_id is not null;

alter table public.billing_plans enable row level security;
alter table public.store_billing_subscriptions enable row level security;
alter table public.billing_payments enable row level security;
alter table public.billing_webhook_events enable row level security;
alter table public.billing_audit_log enable row level security;
alter table public.store_billing_registration_profiles enable row level security;
alter table public.store_billing_registration_audit enable row level security;

-- Revoga inclusive privilegios implicitos de projetos antigos e concede
-- somente o minimo necessario ao backend. Nenhuma tabela permite DELETE.
revoke all on table public.billing_plans
  from public, anon, authenticated, service_role;
revoke all on table public.store_billing_subscriptions
  from public, anon, authenticated, service_role;
revoke all on table public.billing_payments
  from public, anon, authenticated, service_role;
revoke all on table public.billing_webhook_events
  from public, anon, authenticated, service_role;
revoke all on table public.billing_audit_log
  from public, anon, authenticated, service_role;
revoke all on table public.store_billing_registration_profiles
  from public, anon, authenticated, service_role;
revoke all on table public.store_billing_registration_audit
  from public, anon, authenticated, service_role;

grant select, insert, update on table public.billing_plans to service_role;
grant select, insert, update on table public.store_billing_subscriptions to service_role;
grant select, insert, update on table public.billing_payments to service_role;
grant select, insert, update on table public.billing_webhook_events to service_role;
grant select, insert on table public.billing_audit_log to service_role;
grant select, insert, update on table public.store_billing_registration_profiles to service_role;
grant select, insert on table public.store_billing_registration_audit to service_role;

-- Substitui a versao inicial da RPC por uma versao Production-safe que exige
-- cadastro financeiro validado e usuario SaaS ativo antes de iniciar o trial.
create or replace function public.start_store_billing_trial(
  p_store_id uuid,
  p_plan_code text,
  p_actor_user_id uuid,
  p_reason text default null
)
returns public.store_billing_subscriptions
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_plan public.billing_plans;
  v_existing public.store_billing_subscriptions;
  v_subscription public.store_billing_subscriptions;
  v_now timestamptz;
begin
  if not exists (
    select 1
    from public.users actor
    where actor.id = p_actor_user_id
      and actor.role = 'master'
      and actor.status = 'active'
  ) then
    raise exception 'Acesso restrito ao Master.' using errcode = '42501';
  end if;

  perform 1
  from public.stores store_row
  where store_row.id = p_store_id
    and store_row.status = 'active'
  for update;

  if not found then
    raise exception 'Loja ativa nao encontrada.' using errcode = 'P0002';
  end if;

  if not exists (
    select 1
    from public.users store_user
    where store_user.store_id = p_store_id
      and store_user.status = 'active'
      and store_user.role in ('store', 'pre_sales', 'seller', 'prospector')
  ) then
    raise exception 'Loja sem usuario SaaS ativo.' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.store_billing_registration_profiles registration
    where registration.store_id = p_store_id
      and registration.registration_status = 'ready_for_activation'
      and registration.validated_at is not null
      and registration.validated_by is not null
  ) then
    raise exception 'Cadastro financeiro validado obrigatorio.' using errcode = '42501';
  end if;

  select plan_row.*
    into v_plan
  from public.billing_plans plan_row
  where plan_row.code = lower(trim(p_plan_code))
    and plan_row.is_active = true;

  if not found then
    raise exception 'Plano ativo nao encontrado.' using errcode = 'P0002';
  end if;

  select subscription_row.*
    into v_existing
  from public.store_billing_subscriptions subscription_row
  where subscription_row.store_id = p_store_id
    and subscription_row.status <> 'cancelled'
  order by subscription_row.created_at desc
  limit 1
  for update;

  if found then
    if v_existing.status = 'trialing' then
      return v_existing;
    end if;
    raise exception 'A loja ja possui uma assinatura aberta.' using errcode = '23505';
  end if;

  if exists (
    select 1
    from public.store_billing_subscriptions previous_trial
    where previous_trial.store_id = p_store_id
      and previous_trial.trial_started_at is not null
  ) then
    raise exception 'O trial de sete dias desta loja ja foi utilizado.' using errcode = '23505';
  end if;

  v_now := clock_timestamp();

  insert into public.store_billing_subscriptions (
    store_id,
    plan_id,
    status,
    access_enforcement_mode,
    activation_source,
    master_authorized_by,
    master_authorized_at,
    trial_started_at,
    trial_ends_at,
    external_reference
  ) values (
    p_store_id,
    v_plan.id,
    'trialing',
    'observe',
    'master_authorization',
    p_actor_user_id,
    v_now,
    v_now,
    v_now + interval '7 days',
    'store:' || p_store_id::text || ':subscription:' || gen_random_uuid()::text
  )
  returning * into v_subscription;

  insert into public.billing_audit_log (
    store_id,
    subscription_id,
    actor_user_id,
    action,
    new_status,
    reason,
    metadata
  ) values (
    p_store_id,
    v_subscription.id,
    p_actor_user_id,
    'trial_started_by_master',
    'trialing',
    nullif(trim(p_reason), ''),
    jsonb_build_object(
      'trial_days', 7,
      'access_enforcement_mode', 'observe',
      'plan_code', v_plan.code
    )
  );

  return v_subscription;
end;
$$;

revoke all on function public.start_store_billing_trial(uuid, text, uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.start_store_billing_trial(uuid, text, uuid, text)
  to service_role;

revoke all on function public.save_store_billing_registration_profile(
  uuid, uuid, text, text, text, text, uuid
) from public, anon, authenticated, service_role;
grant execute on function public.save_store_billing_registration_profile(
  uuid, uuid, text, text, text, text, uuid
) to service_role;

comment on constraint store_billing_stage14_observe_only
  on public.store_billing_subscriptions is
  'Protecao da etapa 14: impede enforcement antes de uma autorizacao e migration futuras.';
comment on function public.start_store_billing_trial(uuid, text, uuid, text) is
  'Inicia um unico trial de sete dias para loja SaaS ativa e cadastro validado, sempre em observe.';

commit;
