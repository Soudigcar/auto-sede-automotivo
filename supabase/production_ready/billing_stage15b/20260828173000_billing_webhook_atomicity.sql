begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- Claim atomico: somente um worker recebe o token de processamento. Um claim
-- abandonado pode ser retomado depois do lease, sem liberar dois workers ao
-- mesmo tempo para o mesmo provider_event_id.
create or replace function public.claim_billing_webhook_event(
  p_event_id uuid,
  p_lease_seconds integer default 120
)
returns table (
  id uuid,
  provider_event_id text,
  event_type text,
  provider_object_type text,
  provider_object_id text,
  payload jsonb,
  processing_status text,
  processing_attempts integer,
  processing_token uuid
)
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if p_event_id is null then
    raise exception 'Evento de webhook obrigatorio.' using errcode = '22023';
  end if;
  if p_lease_seconds not between 15 and 900 then
    raise exception 'Lease de webhook fora do intervalo permitido.' using errcode = '22023';
  end if;

  return query
  update public.billing_webhook_events event_row
  set processing_status = 'processing',
      processing_attempts = event_row.processing_attempts + 1,
      processing_token = gen_random_uuid(),
      processing_started_at = clock_timestamp(),
      processed_at = null,
      last_error = null
  where event_row.id = p_event_id
    and (
      event_row.processing_status in ('pending', 'failed')
      or (
        event_row.processing_status = 'processing'
        and event_row.processing_started_at
          < clock_timestamp() - make_interval(secs => p_lease_seconds)
      )
    )
  returning
    event_row.id,
    event_row.provider_event_id,
    event_row.event_type,
    event_row.provider_object_type,
    event_row.provider_object_id,
    event_row.payload,
    event_row.processing_status,
    event_row.processing_attempts,
    event_row.processing_token;
end;
$$;

create or replace function public.complete_billing_webhook_event(
  p_event_id uuid,
  p_processing_token uuid,
  p_processing_status text,
  p_last_error text default null
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_updated integer;
begin
  if p_event_id is null or p_processing_token is null then
    raise exception 'Evento e token de processamento obrigatorios.' using errcode = '22023';
  end if;
  if p_processing_status not in ('processed', 'ignored', 'failed') then
    raise exception 'Estado final de webhook invalido.' using errcode = '22023';
  end if;

  update public.billing_webhook_events event_row
  set processing_status = p_processing_status,
      processed_at = case
        when p_processing_status in ('processed', 'ignored') then clock_timestamp()
        else null
      end,
      processing_token = null,
      processing_started_at = null,
      last_error = case
        when p_processing_status = 'failed'
          then left(coalesce(nullif(trim(p_last_error), ''), 'Falha de processamento.'), 1000)
        else null
      end
  where event_row.id = p_event_id
    and event_row.processing_status = 'processing'
    and event_row.processing_token = p_processing_token;

  get diagnostics v_updated = row_count;
  return v_updated = 1;
end;
$$;

-- Eventos de assinatura e pagamentos disputam o mesmo row lock da assinatura.
-- Assim, cancelamento e confirmacao financeira nunca reabrem uma assinatura
-- por causa de duas entregas concorrentes ou fora de ordem.
create or replace function public.apply_asaas_subscription_webhook_event(
  p_subscription_id uuid,
  p_provider_event_id text,
  p_event_type text,
  p_provider_subscription_id text default null,
  p_provider_customer_id text default null
)
returns table (
  subscription_status text,
  transitioned boolean,
  terminal_transition_ignored boolean
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_subscription public.store_billing_subscriptions%rowtype;
  v_cancelled boolean;
  v_previous_status text;
begin
  if p_subscription_id is null
    or nullif(trim(p_provider_event_id), '') is null
    or nullif(trim(p_event_type), '') is null then
    raise exception 'Evento de assinatura incompleto.' using errcode = '22023';
  end if;

  select subscription_row.*
    into v_subscription
  from public.store_billing_subscriptions subscription_row
  where subscription_row.id = p_subscription_id
  for update;

  if not found then
    raise exception 'Assinatura nao encontrada.' using errcode = 'P0002';
  end if;

  v_previous_status := v_subscription.status;
  v_cancelled := upper(trim(p_event_type)) in (
    'SUBSCRIPTION_INACTIVATED',
    'SUBSCRIPTION_DELETED'
  );

  if v_subscription.status = 'cancelled' then
    insert into public.billing_audit_log (
      store_id,
      subscription_id,
      actor_user_id,
      action,
      previous_status,
      new_status,
      reason,
      metadata
    ) values (
      v_subscription.store_id,
      v_subscription.id,
      null,
      'asaas_webhook_terminal_transition_ignored',
      'cancelled',
      'cancelled',
      'Evento atrasado preservado sem reabrir assinatura cancelada.',
      jsonb_build_object(
        'provider', 'asaas',
        'environment', 'sandbox',
        'provider_event_id', trim(p_provider_event_id),
        'event_type', upper(trim(p_event_type)),
        'access_enforcement_mode', 'observe'
      )
    ) on conflict do nothing;

    return query select 'cancelled'::text, false, true;
    return;
  end if;

  update public.store_billing_subscriptions subscription_row
  set provider_subscription_id = coalesce(
        nullif(trim(p_provider_subscription_id), ''),
        subscription_row.provider_subscription_id
      ),
      provider_customer_id = coalesce(
        nullif(trim(p_provider_customer_id), ''),
        subscription_row.provider_customer_id
      ),
      status = case when v_cancelled then 'cancelled' else subscription_row.status end,
      cancelled_at = case when v_cancelled then clock_timestamp() else subscription_row.cancelled_at end,
      updated_at = clock_timestamp(),
      version = subscription_row.version + 1
  where subscription_row.id = v_subscription.id
  returning subscription_row.* into v_subscription;

  if v_cancelled and v_previous_status <> 'cancelled' then
    insert into public.billing_audit_log (
      store_id,
      subscription_id,
      actor_user_id,
      action,
      previous_status,
      new_status,
      reason,
      metadata
    ) values (
      v_subscription.store_id,
      v_subscription.id,
      null,
      'asaas_webhook_subscription_transition',
      v_previous_status,
      'cancelled',
      'Assinatura cancelada pelo webhook autenticado do Asaas Sandbox.',
      jsonb_build_object(
        'provider', 'asaas',
        'environment', 'sandbox',
        'provider_event_id', trim(p_provider_event_id),
        'event_type', upper(trim(p_event_type)),
        'access_enforcement_mode', 'observe'
      )
    ) on conflict do nothing;
  end if;

  return query select v_subscription.status, v_cancelled, false;
end;
$$;

create or replace function public.apply_asaas_payment_webhook_event(
  p_subscription_id uuid,
  p_store_id uuid,
  p_provider_event_id text,
  p_provider_payment_id text,
  p_event_type text,
  p_provider_status text,
  p_amount_cents bigint,
  p_due_at timestamptz default null,
  p_payment_at timestamptz default null,
  p_external_reference text default null,
  p_provider_subscription_id text default null,
  p_provider_customer_id text default null
)
returns table (
  payment_status text,
  subscription_status text,
  subscription_transitioned boolean,
  stale_transition_ignored boolean,
  terminal_transition_ignored boolean
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_subscription public.store_billing_subscriptions%rowtype;
  v_existing public.billing_payments%rowtype;
  v_event_status text;
  v_incoming_status text;
  v_existing_status text;
  v_result_status text;
  v_target_status text;
  v_existing_settled boolean;
  v_existing_lost boolean;
  v_incoming_lost boolean;
  v_incoming_failure boolean;
  v_incoming_success boolean;
  v_incoming_overdue boolean;
  v_stale boolean := false;
  v_terminal boolean := false;
  v_transitioned boolean := false;
  v_loss_event boolean;
  v_previous_status text;
  v_period_anchor timestamptz;
begin
  if p_subscription_id is null
    or p_store_id is null
    or nullif(trim(p_provider_event_id), '') is null
    or nullif(trim(p_provider_payment_id), '') is null
    or nullif(trim(p_event_type), '') is null then
    raise exception 'Evento de pagamento incompleto.' using errcode = '22023';
  end if;
  if p_amount_cents <> 149700 then
    raise exception 'Valor de pagamento fora do plano Profissional.' using errcode = '22023';
  end if;

  -- A chave do provedor e travada antes da assinatura, em ordem consistente.
  -- Isso fecha a corrida em que o mesmo payment_id chega ligado a duas lojas.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('asaas:payment:' || trim(p_provider_payment_id), 0)
  );

  select subscription_row.*
    into v_subscription
  from public.store_billing_subscriptions subscription_row
  where subscription_row.id = p_subscription_id
    and subscription_row.store_id = p_store_id
  for update;

  if not found then
    raise exception 'Assinatura e loja nao correspondem.' using errcode = '23503';
  end if;

  select payment_row.*
    into v_existing
  from public.billing_payments payment_row
  where payment_row.provider_payment_id = trim(p_provider_payment_id)
  for update;

  if found and (
    v_existing.subscription_id <> p_subscription_id
    or v_existing.store_id <> p_store_id
  ) then
    raise exception 'Pagamento ja associado a outra assinatura ou loja.' using errcode = '23503';
  end if;

  v_event_status := upper(regexp_replace(trim(p_event_type), '^PAYMENT_', ''));
  v_incoming_status := coalesce(nullif(upper(trim(p_provider_status)), ''), v_event_status);
  v_existing_status := upper(coalesce(v_existing.provider_status, ''));
  v_existing_settled := v_existing.confirmed_at is not null
    or v_existing.received_at is not null
    or v_existing_status in ('CONFIRMED', 'RECEIVED', 'RECEIVED_IN_CASH');
  v_existing_lost := v_existing_status in (
    'REFUNDED', 'REFUND_REQUESTED', 'CHARGEBACK_REQUESTED', 'CHARGEBACK_DISPUTE'
  );
  v_incoming_lost := v_incoming_status in (
      'REFUNDED', 'REFUND_REQUESTED', 'CHARGEBACK_REQUESTED', 'CHARGEBACK_DISPUTE'
    ) or v_event_status in (
      'REFUNDED', 'REFUND_REQUESTED', 'CHARGEBACK_REQUESTED', 'CHARGEBACK_DISPUTE'
    );
  v_incoming_failure := v_incoming_status in (
      'CREDIT_CARD_CAPTURE_REFUSED', 'REPROVED_BY_RISK_ANALYSIS'
    ) or v_event_status in (
      'CREDIT_CARD_CAPTURE_REFUSED', 'REPROVED_BY_RISK_ANALYSIS'
    );
  v_incoming_success := v_incoming_status in ('CONFIRMED', 'RECEIVED', 'RECEIVED_IN_CASH')
    or v_event_status in ('CONFIRMED', 'RECEIVED', 'RECEIVED_IN_CASH');
  v_incoming_overdue := v_incoming_status = 'OVERDUE' or v_event_status = 'OVERDUE';

  if v_incoming_lost then
    v_result_status := coalesce(nullif(v_incoming_status, ''), v_event_status);
    v_target_status := 'past_due';
  elsif v_existing_lost then
    v_result_status := v_existing_status;
    v_target_status := null;
    v_stale := true;
  elsif v_incoming_failure then
    v_result_status := coalesce(nullif(v_incoming_status, ''), v_event_status);
    v_target_status := 'past_due';
  elsif v_incoming_success then
    v_result_status := case
      when v_existing_status = 'RECEIVED' and v_incoming_status <> 'RECEIVED'
        then v_existing_status
      else coalesce(nullif(v_incoming_status, ''), v_event_status)
    end;
    v_target_status := 'active';
  elsif v_incoming_overdue then
    if v_existing_settled then
      v_result_status := coalesce(nullif(v_existing_status, ''), 'CONFIRMED');
      v_target_status := null;
      v_stale := true;
    else
      v_result_status := 'OVERDUE';
      v_target_status := 'past_due';
    end if;
  elsif v_existing_status = 'SANDBOX_CONFIRMATION_REQUESTED'
    and coalesce(nullif(v_incoming_status, ''), v_event_status) in ('PENDING', 'CREATED', 'UPDATED') then
    v_result_status := v_existing_status;
    v_target_status := null;
    v_stale := true;
  elsif v_existing_settled
    and coalesce(nullif(v_incoming_status, ''), v_event_status) in ('PENDING', 'CREATED', 'UPDATED') then
    v_result_status := coalesce(nullif(v_existing_status, ''), 'CONFIRMED');
    v_target_status := null;
    v_stale := true;
  else
    v_result_status := coalesce(
      nullif(v_incoming_status, ''),
      nullif(v_existing_status, ''),
      nullif(v_event_status, ''),
      'UNKNOWN'
    );
    v_target_status := null;
  end if;

  insert into public.billing_payments (
    subscription_id,
    store_id,
    provider,
    provider_payment_id,
    provider_status,
    amount_cents,
    due_at,
    confirmed_at,
    received_at,
    overdue_at,
    refunded_at,
    chargeback_at,
    external_reference,
    updated_at
  ) values (
    p_subscription_id,
    p_store_id,
    'asaas',
    trim(p_provider_payment_id),
    v_result_status,
    p_amount_cents,
    coalesce(v_existing.due_at, p_due_at),
    case when v_target_status = 'active'
      then coalesce(v_existing.confirmed_at, p_payment_at, clock_timestamp())
      else v_existing.confirmed_at end,
    case when v_result_status in ('RECEIVED', 'RECEIVED_IN_CASH')
      then coalesce(v_existing.received_at, p_payment_at, clock_timestamp())
      else v_existing.received_at end,
    case when v_result_status = 'OVERDUE'
      then coalesce(v_existing.overdue_at, clock_timestamp())
      else v_existing.overdue_at end,
    case when v_result_status like 'REFUND%'
      then coalesce(v_existing.refunded_at, clock_timestamp())
      else v_existing.refunded_at end,
    case when v_result_status like 'CHARGEBACK%'
      then coalesce(v_existing.chargeback_at, clock_timestamp())
      else v_existing.chargeback_at end,
    coalesce(nullif(trim(p_external_reference), ''), v_existing.external_reference),
    clock_timestamp()
  )
  on conflict (provider_payment_id) do update
  set provider_status = excluded.provider_status,
      due_at = excluded.due_at,
      confirmed_at = excluded.confirmed_at,
      received_at = excluded.received_at,
      overdue_at = excluded.overdue_at,
      refunded_at = excluded.refunded_at,
      chargeback_at = excluded.chargeback_at,
      external_reference = excluded.external_reference,
      updated_at = excluded.updated_at;

  update public.store_billing_subscriptions subscription_row
  set provider_subscription_id = coalesce(
        nullif(trim(p_provider_subscription_id), ''),
        subscription_row.provider_subscription_id
      ),
      provider_customer_id = coalesce(
        nullif(trim(p_provider_customer_id), ''),
        subscription_row.provider_customer_id
      ),
      updated_at = clock_timestamp()
  where subscription_row.id = v_subscription.id
  returning subscription_row.* into v_subscription;

  v_previous_status := v_subscription.status;
  v_loss_event := upper(trim(p_event_type)) = 'PAYMENT_REFUNDED'
    or upper(trim(p_event_type)) like 'PAYMENT_CHARGEBACK%';

  if v_subscription.status = 'cancelled' then
    v_terminal := true;
    v_target_status := null;
  elsif v_target_status is not null
    and coalesce(v_existing.due_at, p_due_at)::date
      < v_subscription.current_period_started_at::date
    and not v_loss_event then
    v_target_status := null;
    v_stale := true;
  end if;

  if v_target_status is not null then
    if v_target_status = 'active' then
      v_period_anchor := case
        when coalesce(v_existing.due_at, p_due_at)::date = v_subscription.trial_ends_at::date
          then v_subscription.trial_ends_at
        else coalesce(v_existing.due_at, p_due_at, p_payment_at, clock_timestamp())
      end;
      update public.store_billing_subscriptions subscription_row
      set status = 'active',
          current_period_started_at = v_period_anchor,
          current_period_ends_at = v_period_anchor + interval '1 month',
          past_due_at = null,
          grace_ends_at = null,
          updated_at = clock_timestamp(),
          version = subscription_row.version + 1
      where subscription_row.id = v_subscription.id
      returning subscription_row.* into v_subscription;
    else
      update public.store_billing_subscriptions subscription_row
      set status = 'past_due',
          past_due_at = coalesce(subscription_row.past_due_at, clock_timestamp()),
          grace_ends_at = coalesce(
            subscription_row.grace_ends_at,
            clock_timestamp() + interval '3 days'
          ),
          updated_at = clock_timestamp(),
          version = subscription_row.version + 1
      where subscription_row.id = v_subscription.id
      returning subscription_row.* into v_subscription;
    end if;
    v_transitioned := v_previous_status is distinct from v_subscription.status;
  end if;

  if v_terminal then
    insert into public.billing_audit_log (
      store_id, subscription_id, actor_user_id, action,
      previous_status, new_status, reason, metadata
    ) values (
      v_subscription.store_id,
      v_subscription.id,
      null,
      'asaas_webhook_terminal_transition_ignored',
      'cancelled',
      'cancelled',
      'Evento financeiro atrasado preservado sem reabrir assinatura cancelada.',
      jsonb_build_object(
        'provider', 'asaas', 'environment', 'sandbox',
        'provider_event_id', trim(p_provider_event_id),
        'event_type', upper(trim(p_event_type)),
        'access_enforcement_mode', 'observe'
      )
    ) on conflict do nothing;
  elsif v_stale then
    insert into public.billing_audit_log (
      store_id, subscription_id, actor_user_id, action,
      previous_status, new_status, reason, metadata
    ) values (
      v_subscription.store_id,
      v_subscription.id,
      null,
      'asaas_webhook_stale_transition_ignored',
      v_subscription.status,
      v_subscription.status,
      'Evento financeiro duplicado ou fora de ordem preservado sem regressao de estado.',
      jsonb_build_object(
        'provider', 'asaas', 'environment', 'sandbox',
        'provider_event_id', trim(p_provider_event_id),
        'event_type', upper(trim(p_event_type)),
        'access_enforcement_mode', 'observe'
      )
    ) on conflict do nothing;
  elsif v_transitioned then
    insert into public.billing_audit_log (
      store_id, subscription_id, actor_user_id, action,
      previous_status, new_status, reason, metadata
    ) values (
      v_subscription.store_id,
      v_subscription.id,
      null,
      'asaas_webhook_subscription_transition',
      v_previous_status,
      v_subscription.status,
      case
        when v_subscription.status = 'active'
          then 'Pagamento confirmado pelo webhook autenticado do Asaas Sandbox.'
        else 'Estado financeiro atualizado pelo webhook autenticado do Asaas Sandbox.'
      end,
      jsonb_build_object(
        'provider', 'asaas', 'environment', 'sandbox',
        'provider_event_id', trim(p_provider_event_id),
        'event_type', upper(trim(p_event_type)),
        'access_enforcement_mode', 'observe'
      )
    ) on conflict do nothing;
  end if;

  return query select
    v_result_status,
    v_subscription.status,
    v_transitioned,
    v_stale,
    v_terminal;
end;
$$;

revoke all on function public.claim_billing_webhook_event(uuid, integer)
  from public, anon, authenticated, service_role;
revoke all on function public.complete_billing_webhook_event(uuid, uuid, text, text)
  from public, anon, authenticated, service_role;
revoke all on function public.apply_asaas_subscription_webhook_event(
  uuid, text, text, text, text
) from public, anon, authenticated, service_role;
revoke all on function public.apply_asaas_payment_webhook_event(
  uuid, uuid, text, text, text, text, bigint, timestamptz, timestamptz, text, text, text
) from public, anon, authenticated, service_role;

grant execute on function public.claim_billing_webhook_event(uuid, integer)
  to service_role;
grant execute on function public.complete_billing_webhook_event(uuid, uuid, text, text)
  to service_role;
grant execute on function public.apply_asaas_subscription_webhook_event(
  uuid, text, text, text, text
) to service_role;
grant execute on function public.apply_asaas_payment_webhook_event(
  uuid, uuid, text, text, text, text, bigint, timestamptz, timestamptz, text, text, text
) to service_role;

comment on function public.claim_billing_webhook_event(uuid, integer) is
  'Adquire lease atomico e token exclusivo para processar um webhook de billing.';
comment on function public.complete_billing_webhook_event(uuid, uuid, text, text) is
  'Finaliza um webhook somente quando o chamador ainda possui o token do claim.';
comment on function public.apply_asaas_subscription_webhook_event(uuid, text, text, text, text) is
  'Serializa eventos de assinatura do Asaas no row lock da assinatura.';
comment on function public.apply_asaas_payment_webhook_event(
  uuid, uuid, text, text, text, text, bigint, timestamptz, timestamptz, text, text, text
) is 'Aplica pagamento e transicao da assinatura atomicamente, sem regressao concorrente.';

commit;
