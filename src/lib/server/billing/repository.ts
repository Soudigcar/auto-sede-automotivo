import {
  asaasSandboxCheckoutLink,
  createAsaasRecurringCheckout,
  ensureAsaasSandboxWebhook,
  type AsaasSandboxSafety,
  type AsaasServerConfiguration
} from '@/lib/server/billing/asaas';

export const BILLING_FOUNDATION_MIGRATION = '20260827044014_billing_foundation_asaas';

export function isStoreBillingEligible(input: {
  status: unknown;
  activeSystemUsers: unknown;
}) {
  return String(input.status || '').trim().toLowerCase() === 'active'
    && Number(input.activeSystemUsers || 0) > 0;
}

function billingRepositoryError(code: string, message: string) {
  return Object.assign(new Error(message), { code });
}

export function missingBillingFoundation(error: any) {
  const code = String(error?.code || '');
  const message = String(error?.message || error || '');
  return ['42P01', '42883', 'PGRST202', 'PGRST205'].includes(code)
    || /billing_plans|store_billing_subscriptions|start_store_billing_trial|schema cache|does not exist/i.test(message);
}

export async function readMasterBillingOverview(supabase: any) {
  const [plansResult, subscriptionsResult, storesResult, usersResult] = await Promise.all([
    supabase
      .from('billing_plans')
      .select('id,code,name,amount_cents,billing_cycle,included_users,ai_included,is_active,version')
      .order('amount_cents', { ascending: true }),
    supabase
      .from('store_billing_subscriptions')
      .select('id,store_id,plan_id,status,access_enforcement_mode,activation_source,master_authorized_at,trial_started_at,trial_ends_at,current_period_ends_at,past_due_at,grace_ends_at,provider_customer_id,provider_subscription_id,provider_checkout_id,created_at,updated_at')
      .neq('status', 'cancelled')
      .order('created_at', { ascending: false }),
    supabase
      .from('stores')
      .select('id,store_name,slug,status,portal_enabled,cnpj')
      .neq('status', 'deleted')
      .order('store_name', { ascending: true }),
    supabase
      .from('users')
      .select('store_id')
      .eq('status', 'active')
      .in('role', ['store', 'pre_sales', 'seller', 'prospector'])
  ]);

  if (storesResult.error) throw storesResult.error;
  if (usersResult.error) throw usersResult.error;

  const activeUsersByStore = new Map<string, number>();
  for (const user of usersResult.data || []) {
    const storeId = String(user?.store_id || '');
    if (!storeId) continue;
    activeUsersByStore.set(storeId, (activeUsersByStore.get(storeId) || 0) + 1);
  }

  const stores = (storesResult.data || []).map((store: any) => {
    const activeSystemUsers = activeUsersByStore.get(String(store.id)) || 0;
    return {
      ...store,
      active_system_users: activeSystemUsers,
      billing_eligible: isStoreBillingEligible({
        status: store.status,
        activeSystemUsers
      })
    };
  });

  const billingErrors = [plansResult.error, subscriptionsResult.error].filter(Boolean);
  if (billingErrors.length) {
    if (billingErrors.every(missingBillingFoundation)) {
      return {
        schema_ready: false,
        required_migration: BILLING_FOUNDATION_MIGRATION,
        plans: [],
        subscriptions: [],
        stores
      };
    }
    throw billingErrors[0];
  }

  return {
    schema_ready: true,
    required_migration: null,
    plans: plansResult.data || [],
    subscriptions: subscriptionsResult.data || [],
    stores
  };
}

export async function startStoreBillingTrial(supabase: any, input: {
  storeId: string;
  planCode: string;
  actorUserId: string;
  reason: string;
}) {
  const [storeResult, usersResult] = await Promise.all([
    supabase
      .from('stores')
      .select('id,status')
      .eq('id', input.storeId)
      .maybeSingle(),
    supabase
      .from('users')
      .select('id', { count: 'exact', head: true })
      .eq('store_id', input.storeId)
      .eq('status', 'active')
      .in('role', ['store', 'pre_sales', 'seller', 'prospector'])
  ]);
  if (storeResult.error) throw storeResult.error;
  if (usersResult.error) throw usersResult.error;
  if (!storeResult.data) {
    throw billingRepositoryError('P0002', 'Loja ativa nao encontrada.');
  }
  if (!isStoreBillingEligible({
    status: storeResult.data.status,
    activeSystemUsers: usersResult.count || 0
  })) {
    throw billingRepositoryError(
      'BILLING_STORE_NOT_ELIGIBLE',
      'O trial exige uma loja ativa com usuario ativo no sistema.'
    );
  }

  const { data, error } = await supabase.rpc('start_store_billing_trial', {
    p_store_id: input.storeId,
    p_plan_code: input.planCode,
    p_actor_user_id: input.actorUserId,
    p_reason: input.reason
  });
  if (error) throw error;
  return data;
}

export async function createStoreAsaasSandboxCheckout(supabase: any, input: {
  storeId: string;
  actorUserId: string;
  configuration: AsaasServerConfiguration;
  safety: AsaasSandboxSafety;
  environment?: NodeJS.ProcessEnv;
  fetchImplementation?: typeof fetch;
}) {
  if (!input.safety.enabled || input.storeId !== input.safety.syntheticStoreId) {
    throw billingRepositoryError(
      'ASAAS_SANDBOX_STORE_FORBIDDEN',
      'O Checkout Sandbox esta restrito a Loja DEV Roteamento.'
    );
  }
  const [storeResult, subscriptionResult] = await Promise.all([
    supabase
      .from('stores')
      .select('id,store_name,status,registration_source')
      .eq('id', input.storeId)
      .maybeSingle(),
    supabase
      .from('store_billing_subscriptions')
      .select('id,store_id,plan_id,status,access_enforcement_mode,trial_ends_at,provider_checkout_id,external_reference')
      .eq('store_id', input.storeId)
      .neq('status', 'cancelled')
      .maybeSingle()
  ]);
  if (storeResult.error) throw storeResult.error;
  if (subscriptionResult.error) throw subscriptionResult.error;
  const store = storeResult.data;
  const subscription = subscriptionResult.data;
  if (!store || store.store_name !== 'Loja DEV Roteamento' || store.registration_source !== 'dev_routing_seed') {
    throw billingRepositoryError(
      'ASAAS_SANDBOX_STORE_FORBIDDEN',
      'A loja autorizada nao corresponde ao seed sintetico do saas-dev.'
    );
  }
  if (!subscription || subscription.status !== 'trialing' || subscription.access_enforcement_mode !== 'observe') {
    throw billingRepositoryError(
      'ASAAS_SANDBOX_TRIAL_REQUIRED',
      'O Checkout Sandbox exige o trial sintetico ativo em modo de observacao.'
    );
  }
  if (subscription.provider_checkout_id) {
    const existingLink = asaasSandboxCheckoutLink(subscription.provider_checkout_id);
    if (!existingLink) throw new Error('O Checkout Sandbox salvo possui identificador invalido.');
    return {
      checkout_id: subscription.provider_checkout_id,
      checkout_url: existingLink,
      reused: true,
      webhook_created: false,
      trial_ends_at: subscription.trial_ends_at
    };
  }

  const { data: plan, error: planError } = await supabase
    .from('billing_plans')
    .select('id,code,name,amount_cents,included_users,ai_included,is_active')
    .eq('id', subscription.plan_id)
    .eq('code', 'professional')
    .eq('is_active', true)
    .maybeSingle();
  if (planError) throw planError;
  if (!plan || plan.amount_cents !== 149700 || plan.ai_included !== true) {
    throw billingRepositoryError('ASAAS_SANDBOX_PLAN_INVALID', 'Plano Profissional invalido para o Checkout Sandbox.');
  }

  const webhook = await ensureAsaasSandboxWebhook(
    input.configuration,
    input.safety,
    input.environment || process.env,
    input.fetchImplementation
  );
  if (!webhook.id || !webhook.enabled || webhook.interrupted) {
    throw new Error('O Webhook Sandbox nao ficou ativo no Asaas.');
  }

  const checkout = await createAsaasRecurringCheckout(input.configuration, {
    externalReference: subscription.external_reference,
    planName: plan.name,
    amountCents: plan.amount_cents,
    includedUsers: plan.included_users,
    trialEndsAt: subscription.trial_ends_at,
    previewBaseUrl: input.safety.previewBaseUrl
  }, input.fetchImplementation);
  const updatedAt = new Date().toISOString();
  const { data: updated, error: updateError } = await supabase
    .from('store_billing_subscriptions')
    .update({
      provider_checkout_id: checkout.id,
      updated_at: updatedAt
    })
    .eq('id', subscription.id)
    .is('provider_checkout_id', null)
    .select('id,provider_checkout_id')
    .maybeSingle();
  if (updateError) throw updateError;
  if (!updated?.provider_checkout_id) {
    throw new Error('Nao foi possivel vincular o Checkout Sandbox a assinatura sintetica.');
  }

  const { error: auditError } = await supabase.from('billing_audit_log').insert({
    store_id: input.storeId,
    subscription_id: subscription.id,
    actor_user_id: input.actorUserId,
    action: 'asaas_sandbox_checkout_created',
    previous_status: 'trialing',
    new_status: 'trialing',
    reason: 'Checkout recorrente sintetico criado no Asaas Sandbox.',
    metadata: {
      provider: 'asaas',
      environment: 'sandbox',
      provider_checkout_id: checkout.id,
      next_due_at: subscription.trial_ends_at,
      access_enforcement_mode: 'observe'
    }
  });
  if (auditError) throw auditError;

  return {
    checkout_id: checkout.id,
    checkout_url: checkout.link,
    reused: false,
    webhook_created: webhook.created,
    trial_ends_at: subscription.trial_ends_at
  };
}

type StoredAsaasWebhookEvent = {
  event_type: string;
  provider_object_type: string | null;
  provider_object_id: string | null;
  payload: any;
};

function providerText(value: unknown, max = 240) {
  return String(value || '').trim().slice(0, max);
}

async function findSubscriptionForAsaasEvent(supabase: any, event: StoredAsaasWebhookEvent) {
  const object = event.payload?.object || {};
  const externalReference = providerText(object.externalReference, 200);
  const checkoutId = event.provider_object_type === 'checkout'
    ? providerText(event.provider_object_id)
    : '';
  const providerSubscriptionId = event.provider_object_type === 'subscription'
    ? providerText(event.provider_object_id)
    : providerText(object.subscription);
  const customerId = providerText(object.customer);
  const select = 'id,store_id,status,access_enforcement_mode,trial_ends_at,provider_customer_id,provider_subscription_id,provider_checkout_id,external_reference';
  const attempts: Array<[string, string]> = [
    ['external_reference', externalReference],
    ['provider_checkout_id', checkoutId],
    ['provider_subscription_id', providerSubscriptionId],
    ['provider_customer_id', customerId]
  ];
  for (const [column, value] of attempts) {
    if (!value) continue;
    const { data, error } = await supabase
      .from('store_billing_subscriptions')
      .select(select)
      .eq(column, value)
      .maybeSingle();
    if (error) throw error;
    if (data) return data;
  }
  return null;
}

function paymentEventStatus(eventType: string) {
  if (['PAYMENT_CONFIRMED', 'PAYMENT_RECEIVED'].includes(eventType)) return 'active';
  if (['PAYMENT_OVERDUE', 'PAYMENT_REFUNDED', 'PAYMENT_CHARGEBACK_REQUESTED', 'PAYMENT_CHARGEBACK_DISPUTE'].includes(eventType)) {
    return 'past_due';
  }
  return null;
}

export async function processStoredAsaasWebhookEvent(
  supabase: any,
  event: StoredAsaasWebhookEvent
): Promise<{ processing_status: 'processed' | 'ignored'; subscription_id: string | null }> {
  const object = event.payload?.object || {};
  const subscription = await findSubscriptionForAsaasEvent(supabase, event);
  if (!subscription) return { processing_status: 'ignored', subscription_id: null };
  if (subscription.access_enforcement_mode !== 'observe') {
    throw new Error('O Webhook Sandbox recusou assinatura fora do modo observe.');
  }

  const now = new Date().toISOString();
  if (event.provider_object_type === 'checkout') {
    const checkoutId = providerText(event.provider_object_id);
    const customerId = providerText(object.customer);
    const providerSubscriptionId = providerText(object.subscription);
    const update: Record<string, unknown> = { updated_at: now };
    if (checkoutId) update.provider_checkout_id = checkoutId;
    if (customerId) update.provider_customer_id = customerId;
    if (providerSubscriptionId) update.provider_subscription_id = providerSubscriptionId;
    const checkoutClosed = ['CHECKOUT_CANCELED', 'CHECKOUT_EXPIRED'].includes(event.event_type);
    if (checkoutClosed) {
      update.provider_checkout_id = null;
    }
    let updateQuery = supabase
      .from('store_billing_subscriptions')
      .update(update)
      .eq('id', subscription.id);
    if (checkoutClosed) {
      updateQuery = updateQuery.eq('provider_checkout_id', checkoutId);
    }
    const { error } = await updateQuery;
    if (error) throw error;
    return { processing_status: 'processed', subscription_id: subscription.id };
  }

  if (event.provider_object_type === 'subscription') {
    const providerSubscriptionId = providerText(event.provider_object_id);
    const customerId = providerText(object.customer);
    const update: Record<string, unknown> = { updated_at: now };
    if (providerSubscriptionId) update.provider_subscription_id = providerSubscriptionId;
    if (customerId) update.provider_customer_id = customerId;
    if (['SUBSCRIPTION_INACTIVATED', 'SUBSCRIPTION_DELETED'].includes(event.event_type)) {
      update.status = 'cancelled';
      update.cancelled_at = now;
    }
    const { error } = await supabase
      .from('store_billing_subscriptions')
      .update(update)
      .eq('id', subscription.id);
    if (error) throw error;
    return { processing_status: 'processed', subscription_id: subscription.id };
  }

  if (event.provider_object_type === 'payment') {
    const providerPaymentId = providerText(event.provider_object_id);
    const amountCents = Math.round(Number(object.value || 0) * 100);
    if (!providerPaymentId || !Number.isInteger(amountCents) || amountCents <= 0) {
      return { processing_status: 'ignored', subscription_id: subscription.id };
    }
    const paymentDate = providerText(object.paymentDate || object.confirmedDate, 80) || null;
    const dueAt = providerText(object.dueDate, 80) || null;
    const existingPaymentResult = await supabase
      .from('billing_payments')
      .select('due_at,confirmed_at,received_at,overdue_at,refunded_at,chargeback_at,external_reference')
      .eq('provider_payment_id', providerPaymentId)
      .maybeSingle();
    if (existingPaymentResult.error) throw existingPaymentResult.error;
    const existingPayment = existingPaymentResult.data || {};
    const { error: paymentError } = await supabase.from('billing_payments').upsert({
      subscription_id: subscription.id,
      store_id: subscription.store_id,
      provider: 'asaas',
      provider_payment_id: providerPaymentId,
      provider_status: providerText(object.status || event.event_type, 120),
      amount_cents: amountCents,
      due_at: dueAt || existingPayment.due_at || null,
      confirmed_at: event.event_type === 'PAYMENT_CONFIRMED'
        ? paymentDate || now
        : existingPayment.confirmed_at || null,
      received_at: event.event_type === 'PAYMENT_RECEIVED'
        ? paymentDate || now
        : existingPayment.received_at || null,
      overdue_at: event.event_type === 'PAYMENT_OVERDUE' ? now : existingPayment.overdue_at || null,
      refunded_at: event.event_type === 'PAYMENT_REFUNDED' ? now : existingPayment.refunded_at || null,
      chargeback_at: event.event_type.startsWith('PAYMENT_CHARGEBACK')
        ? now
        : existingPayment.chargeback_at || null,
      external_reference: providerText(object.externalReference, 200) || existingPayment.external_reference || null,
      updated_at: now
    }, { onConflict: 'provider_payment_id' });
    if (paymentError) throw paymentError;

    const targetStatus = paymentEventStatus(event.event_type);
    if (targetStatus) {
      const update: Record<string, unknown> = {
        status: targetStatus,
        updated_at: now
      };
      if (targetStatus === 'active') {
        update.current_period_started_at = paymentDate || now;
        update.past_due_at = null;
        update.grace_ends_at = null;
      } else {
        update.past_due_at = now;
        update.grace_ends_at = new Date(Date.now() + 3 * 86_400_000).toISOString();
      }
      const { error: subscriptionError } = await supabase
        .from('store_billing_subscriptions')
        .update(update)
        .eq('id', subscription.id);
      if (subscriptionError) throw subscriptionError;
    }
    return { processing_status: 'processed', subscription_id: subscription.id };
  }

  return { processing_status: 'ignored', subscription_id: subscription.id };
}
