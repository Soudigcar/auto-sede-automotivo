begin;

-- Billing comercial do CRM/SaaS. Estas tabelas nao controlam o cadastro
-- publico das lojas no portal e nao alteram stores.status/portal_enabled.
create table if not exists public.billing_plans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  amount_cents bigint not null check (amount_cents >= 149700),
  billing_cycle text not null default 'monthly' check (billing_cycle = 'monthly'),
  included_users integer not null default 5 check (included_users > 0),
  ai_included boolean not null default true,
  is_active boolean not null default true,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.store_billing_subscriptions (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete restrict,
  plan_id uuid not null references public.billing_plans(id) on delete restrict,
  status text not null check (status in (
    'pending_checkout', 'trialing', 'active', 'past_due', 'suspended', 'cancelled'
  )),
  access_enforcement_mode text not null default 'observe'
    check (access_enforcement_mode in ('observe', 'enforce')),
  activation_source text not null default 'master_authorization'
    check (activation_source in ('master_authorization', 'existing_system_access', 'asaas_checkout')),
  master_authorized_by uuid not null references public.users(id) on delete restrict,
  master_authorized_at timestamptz not null,
  trial_started_at timestamptz,
  trial_ends_at timestamptz,
  current_period_started_at timestamptz,
  current_period_ends_at timestamptz,
  past_due_at timestamptz,
  grace_ends_at timestamptz,
  suspended_at timestamptz,
  cancelled_at timestamptz,
  provider text not null default 'asaas' check (provider = 'asaas'),
  provider_customer_id text,
  provider_subscription_id text,
  provider_checkout_id text,
  external_reference text not null unique,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint store_billing_trial_window_exactly_seven_days check (
    trial_started_at is null and trial_ends_at is null
    or trial_started_at is not null
      and trial_ends_at = trial_started_at + interval '7 days'
  ),
  constraint store_billing_trialing_requires_window check (
    status <> 'trialing' or trial_started_at is not null and trial_ends_at is not null
  )
);

create unique index if not exists store_billing_one_open_subscription_idx
  on public.store_billing_subscriptions(store_id)
  where status <> 'cancelled';

create unique index if not exists store_billing_provider_subscription_idx
  on public.store_billing_subscriptions(provider_subscription_id)
  where provider_subscription_id is not null;

create unique index if not exists store_billing_provider_checkout_idx
  on public.store_billing_subscriptions(provider_checkout_id)
  where provider_checkout_id is not null;

create index if not exists store_billing_status_idx
  on public.store_billing_subscriptions(status, trial_ends_at, grace_ends_at);

create table if not exists public.billing_payments (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.store_billing_subscriptions(id) on delete restrict,
  store_id uuid not null references public.stores(id) on delete restrict,
  provider text not null default 'asaas' check (provider = 'asaas'),
  provider_payment_id text not null unique,
  provider_status text not null,
  amount_cents bigint not null check (amount_cents > 0),
  due_at timestamptz,
  confirmed_at timestamptz,
  received_at timestamptz,
  overdue_at timestamptz,
  refunded_at timestamptz,
  chargeback_at timestamptz,
  external_reference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists billing_payments_subscription_idx
  on public.billing_payments(subscription_id, due_at desc);

create index if not exists billing_payments_store_status_idx
  on public.billing_payments(store_id, provider_status, due_at desc);

create table if not exists public.billing_webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'asaas' check (provider = 'asaas'),
  provider_event_id text not null unique,
  event_type text not null,
  provider_object_type text,
  provider_object_id text,
  processing_status text not null default 'pending'
    check (processing_status in ('pending', 'processed', 'ignored', 'failed')),
  payload jsonb not null default '{}'::jsonb,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  processing_attempts integer not null default 0 check (processing_attempts >= 0),
  last_error text
);

create index if not exists billing_webhook_pending_idx
  on public.billing_webhook_events(processing_status, received_at)
  where processing_status in ('pending', 'failed');

create table if not exists public.billing_audit_log (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete restrict,
  subscription_id uuid references public.store_billing_subscriptions(id) on delete restrict,
  actor_user_id uuid references public.users(id) on delete restrict,
  action text not null,
  previous_status text,
  new_status text,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists billing_audit_store_created_idx
  on public.billing_audit_log(store_id, created_at desc);

-- As tabelas ficam acessiveis somente pelas APIs server-side com service_role.
alter table public.billing_plans enable row level security;
alter table public.store_billing_subscriptions enable row level security;
alter table public.billing_payments enable row level security;
alter table public.billing_webhook_events enable row level security;
alter table public.billing_audit_log enable row level security;

revoke all on table public.billing_plans from public, anon, authenticated;
revoke all on table public.store_billing_subscriptions from public, anon, authenticated;
revoke all on table public.billing_payments from public, anon, authenticated;
revoke all on table public.billing_webhook_events from public, anon, authenticated;
revoke all on table public.billing_audit_log from public, anon, authenticated;

grant select, insert, update on table public.billing_plans to service_role;
grant select, insert, update on table public.store_billing_subscriptions to service_role;
grant select, insert, update on table public.billing_payments to service_role;
grant select, insert, update on table public.billing_webhook_events to service_role;
grant select, insert on table public.billing_audit_log to service_role;

insert into public.billing_plans (
  code, name, amount_cents, billing_cycle, included_users, ai_included, is_active
)
values ('professional', 'Profissional', 149700, 'monthly', 5, true, true)
on conflict (code) do nothing;

-- Concede o trial atomicamente. Somente uma API server-side autenticada como
-- Master pode chamar esta funcao; ela nunca altera lojas ou usuarios atuais.
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
  )
  values (
    p_store_id,
    v_plan.id,
    'trialing',
    'observe',
    'existing_system_access',
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
  )
  values (
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
  from public, anon, authenticated;
grant execute on function public.start_store_billing_trial(uuid, text, uuid, text)
  to service_role;

comment on table public.billing_plans is
  'Catalogo comercial do SaaS. Nao representa cadastro da loja no portal publico.';
comment on table public.store_billing_subscriptions is
  'Assinaturas de acesso ao sistema. O modo observe preserva integralmente o acesso atual.';
comment on table public.billing_webhook_events is
  'Caixa de entrada idempotente e service-only para eventos financeiros do Asaas.';
comment on function public.start_store_billing_trial(uuid, text, uuid, text) is
  'Inicia trial fixo de sete dias exclusivamente por autorizacao Master, em modo observe e sem alterar stores/users.';

commit;
