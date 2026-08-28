import {
  asaasSandboxCheckoutLink,
  confirmAsaasSandboxPayment,
  createAsaasRecurringCheckout,
  deliverAsaasSandboxTestWebhook,
  ensureAsaasSandboxWebhook,
  formatAsaasDateTime,
  forceAsaasSandboxPaymentOverdue,
  refundAsaasSandboxPayment,
  type AsaasSandboxSafety,
  type AsaasServerConfiguration
} from '@/lib/server/billing/asaas';

export const BILLING_FOUNDATION_MIGRATION = '20260827044014_billing_foundation_asaas';
export const BILLING_REGISTRATION_MIGRATION =
  '20260828131550_store_registration_profiles_stage12';
export const BILLING_GRACE_PERIOD_DAYS = 3;

type SyntheticStoreProfile = {
  id: string;
  name: string;
  registrationSource: string;
  scenario: 'positive' | 'failure' | 'activation';
};

function syntheticStoreProfile(safety: AsaasSandboxSafety, storeId: string): SyntheticStoreProfile | null {
  if (storeId === safety.syntheticStoreId) {
    return {
      id: safety.syntheticStoreId,
      name: 'Loja DEV Roteamento',
      registrationSource: 'dev_routing_seed',
      scenario: 'positive'
    };
  }
  if (safety.failureTestEnabled && storeId === safety.failureSyntheticStoreId) {
    return {
      id: safety.failureSyntheticStoreId,
      name: 'Loja DEV Billing Falhas',
      registrationSource: 'billing_stage5_seed',
      scenario: 'failure'
    };
  }
  if (safety.stage13ActivationEnabled && storeId === safety.stage13SyntheticStoreId) {
    return {
      id: safety.stage13SyntheticStoreId,
      name: 'Loja DEV Billing Ativacao',
      registrationSource: 'billing_stage13_seed',
      scenario: 'activation'
    };
  }
  return null;
}

function assertSyntheticStore(store: any, profile: SyntheticStoreProfile | null) {
  if (
    !profile
    || !store
    || store.id !== profile.id
    || store.store_name !== profile.name
    || store.registration_source !== profile.registrationSource
    || String(store.status || '').toLowerCase() !== 'active'
  ) {
    throw billingRepositoryError(
      'ASAAS_SANDBOX_STORE_FORBIDDEN',
      'A loja nao corresponde a um seed sintetico autorizado do saas-dev.'
    );
  }
  return profile;
}

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

export function asaasCheckoutFailureState(subscription: any) {
  return {
    code: 'asaas_sandbox_checkout_retryable',
    retryable: true,
    trial_preserved: subscription?.status === 'trialing',
    payment_confirmed: false,
    access_enforcement_mode: 'observe' as const,
    subscription: {
      id: providerText(subscription?.id, 80),
      status: providerText(subscription?.status, 40),
      trial_started_at: providerText(subscription?.trial_started_at, 80) || null,
      trial_ends_at: providerText(subscription?.trial_ends_at, 80) || null,
      access_enforcement_mode: 'observe' as const
    }
  };
}

export function missingBillingFoundation(error: any) {
  const code = String(error?.code || '');
  const message = String(error?.message || error || '');
  return ['42P01', '42883', 'PGRST202', 'PGRST205'].includes(code)
    || /billing_plans|store_billing_subscriptions|store_billing_registration_profiles|store_billing_registration_audit|start_store_billing_trial|schema cache|does not exist/i.test(message);
}

export async function readMasterBillingOverview(supabase: any) {
  const [
    plansResult,
    subscriptionsResult,
    storesResult,
    usersResult,
    paymentsResult,
    webhooksResult,
    auditResult,
    registrationProfilesResult,
    registrationAuditResult
  ] = await Promise.all([
    supabase
      .from('billing_plans')
      .select('id,code,name,amount_cents,billing_cycle,included_users,ai_included,is_active,version')
      .order('amount_cents', { ascending: true }),
    supabase
      .from('store_billing_subscriptions')
      .select('id,store_id,plan_id,status,access_enforcement_mode,activation_source,master_authorized_at,trial_started_at,trial_ends_at,current_period_started_at,current_period_ends_at,past_due_at,grace_ends_at,provider_customer_id,provider_subscription_id,provider_checkout_id,created_at,updated_at')
      .neq('status', 'cancelled')
      .order('created_at', { ascending: false }),
    supabase
      .from('stores')
      .select('id,store_name,slug,status,portal_enabled,registration_source,legal_name,cnpj,responsible_email,responsible_phone')
      .neq('status', 'deleted')
      .order('store_name', { ascending: true }),
    supabase
      .from('users')
      .select('store_id')
      .eq('status', 'active')
      .in('role', ['store', 'pre_sales', 'seller', 'prospector']),
    supabase
      .from('billing_payments')
      .select('id,subscription_id,store_id,provider_status,amount_cents,due_at,confirmed_at,received_at,overdue_at,refunded_at,chargeback_at,created_at,updated_at')
      .order('due_at', { ascending: false })
      .limit(200),
    supabase
      .from('billing_webhook_events')
      .select('event_type,processing_status,received_at,processed_at', { count: 'exact' })
      .order('received_at', { ascending: false })
      .limit(100),
    supabase
      .from('billing_audit_log')
      .select('id,store_id,subscription_id,action,previous_status,new_status,reason,created_at')
      .order('created_at', { ascending: false })
      .limit(100),
    supabase
      .from('store_billing_registration_profiles')
      .select('id,store_id,legal_name,cnpj,financial_email,financial_phone,registration_status,validated_at,validated_by,version,created_at,updated_at')
      .order('updated_at', { ascending: false }),
    supabase
      .from('store_billing_registration_audit')
      .select('id,profile_id,store_id,actor_user_id,action,previous_status,new_status,changed_fields,created_at')
      .order('created_at', { ascending: false })
      .limit(100)
  ]);

  if (storesResult.error) throw storesResult.error;
  if (usersResult.error) throw usersResult.error;

  const activeUsersByStore = new Map<string, number>();
  for (const user of usersResult.data || []) {
    const storeId = String(user?.store_id || '');
    if (!storeId) continue;
    activeUsersByStore.set(storeId, (activeUsersByStore.get(storeId) || 0) + 1);
  }

  const registrationProfilesByStore = new Map<string, any>();
  for (const profile of registrationProfilesResult.data || []) {
    registrationProfilesByStore.set(String(profile.store_id), profile);
  }

  const stores = (storesResult.data || []).map((store: any) => {
    const activeSystemUsers = activeUsersByStore.get(String(store.id)) || 0;
    return {
      ...store,
      active_system_users: activeSystemUsers,
      billing_eligible: isStoreBillingEligible({
        status: store.status,
        activeSystemUsers
      }),
      billing_registration_profile: registrationProfilesByStore.get(String(store.id)) || null
    };
  });

  const billingErrors = [
    plansResult.error,
    subscriptionsResult.error,
    paymentsResult.error,
    webhooksResult.error,
    auditResult.error,
    registrationProfilesResult.error,
    registrationAuditResult.error
  ].filter(Boolean);
  if (billingErrors.length) {
    if (billingErrors.every(missingBillingFoundation)) {
      return {
        schema_ready: false,
        required_migration: BILLING_FOUNDATION_MIGRATION,
        plans: [],
        subscriptions: [],
        payments: [],
        webhook_health: {
          total: 0,
          processed: 0,
          ignored: 0,
          pending: 0,
          failed: 0,
          last_event_type: null,
          last_received_at: null
        },
        audit_log: [],
        registration_profiles: [],
        registration_audit_log: [],
        stores
      };
    }
    throw billingErrors[0];
  }

  const webhookRows = webhooksResult.data || [];
  return {
    schema_ready: true,
    required_migration: null,
    plans: plansResult.data || [],
    subscriptions: subscriptionsResult.data || [],
    payments: paymentsResult.data || [],
    webhook_health: {
      total: Number(webhooksResult.count || webhookRows.length),
      processed: webhookRows.filter((event: any) => event.processing_status === 'processed').length,
      ignored: webhookRows.filter((event: any) => event.processing_status === 'ignored').length,
      pending: webhookRows.filter((event: any) => event.processing_status === 'pending').length,
      failed: webhookRows.filter((event: any) => event.processing_status === 'failed').length,
      last_event_type: webhookRows[0]?.event_type || null,
      last_received_at: webhookRows[0]?.received_at || null
    },
    audit_log: auditResult.data || [],
    registration_profiles: registrationProfilesResult.data || [],
    registration_audit_log: registrationAuditResult.data || [],
    stores
  };
}

export async function readStoreBillingOverview(supabase: any, storeId: string) {
  const [subscriptionResult, planResult] = await Promise.all([
    supabase
      .from('store_billing_subscriptions')
      .select('id,store_id,plan_id,status,access_enforcement_mode,trial_started_at,trial_ends_at,current_period_started_at,current_period_ends_at,past_due_at,grace_ends_at,provider_customer_id,provider_subscription_id,provider_checkout_id,created_at,updated_at')
      .eq('store_id', storeId)
      .neq('status', 'cancelled')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('billing_plans')
      .select('id,code,name,amount_cents,billing_cycle,included_users,ai_included,is_active,version')
      .eq('code', 'professional')
      .eq('is_active', true)
      .maybeSingle()
  ]);

  const foundationErrors = [subscriptionResult.error, planResult.error].filter(Boolean);
  if (foundationErrors.length) {
    if (foundationErrors.every(missingBillingFoundation)) {
      return {
        schema_ready: false,
        required_migration: BILLING_FOUNDATION_MIGRATION,
        plan: null,
        subscription: null,
        payment: null,
        latest_audit: null
      };
    }
    throw foundationErrors[0];
  }

  const subscription = subscriptionResult.data || null;
  if (!subscription) {
    return {
      schema_ready: true,
      required_migration: null,
      plan: planResult.data || null,
      subscription: null,
      payment: null,
      latest_audit: null
    };
  }

  const [paymentResult, auditResult] = await Promise.all([
    supabase
      .from('billing_payments')
      .select('id,subscription_id,store_id,provider_status,amount_cents,due_at,confirmed_at,received_at,overdue_at,refunded_at,chargeback_at,created_at,updated_at')
      .eq('store_id', storeId)
      .eq('subscription_id', subscription.id)
      .order('due_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('billing_audit_log')
      .select('id,store_id,subscription_id,action,previous_status,new_status,reason,created_at')
      .eq('store_id', storeId)
      .eq('subscription_id', subscription.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
  ]);

  const detailError = paymentResult.error || auditResult.error;
  if (detailError) throw detailError;

  return {
    schema_ready: true,
    required_migration: null,
    plan: planResult.data || null,
    subscription,
    payment: paymentResult.data || null,
    latest_audit: auditResult.data || null
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
  const profile = syntheticStoreProfile(input.safety, input.storeId);
  if (!input.safety.enabled || !profile) {
    throw billingRepositoryError(
      'ASAAS_SANDBOX_STORE_FORBIDDEN',
      'O Checkout Sandbox esta restrito as lojas sinteticas autorizadas.'
    );
  }
  const [storeResult, subscriptionResult, registrationResult] = await Promise.all([
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
      .maybeSingle(),
    profile.scenario === 'activation'
      ? supabase
          .from('store_billing_registration_profiles')
          .select('store_id,legal_name,cnpj,financial_email,financial_phone,registration_status,validated_at')
          .eq('store_id', input.storeId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null })
  ]);
  if (storeResult.error) throw storeResult.error;
  if (subscriptionResult.error) throw subscriptionResult.error;
  if (registrationResult.error) throw registrationResult.error;
  const store = storeResult.data;
  const subscription = subscriptionResult.data;
  const registration = registrationResult.data;
  assertSyntheticStore(store, profile);
  if (!subscription || subscription.status !== 'trialing' || subscription.access_enforcement_mode !== 'observe') {
    throw billingRepositoryError(
      'ASAAS_SANDBOX_TRIAL_REQUIRED',
      'O Checkout Sandbox exige o trial sintetico ativo em modo de observacao.'
    );
  }
  if (profile.scenario === 'activation' && (
    !registration
    || registration.store_id !== input.storeId
    || registration.registration_status !== 'ready_for_activation'
    || !registration.validated_at
  )) {
    throw billingRepositoryError(
      'ASAAS_SANDBOX_REGISTRATION_REQUIRED',
      'O Checkout da etapa 13 exige cadastro financeiro sintetico validado.'
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
      customer_data_prefilled: profile.scenario === 'activation',
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

  const customerData = profile.scenario === 'activation'
    ? {
        name: String(registration?.legal_name || ''),
        cpfCnpj: String(registration?.cnpj || ''),
        email: String(registration?.financial_email || ''),
        phone: String(registration?.financial_phone || ''),
        address: 'Rua Sintetica',
        addressNumber: 13,
        complement: 'Ambiente Sandbox',
        province: 'Centro',
        postalCode: '01001000',
        city: 3550308
      }
    : undefined;
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
    previewBaseUrl: input.safety.previewBaseUrl,
    customerData
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
      customer_data_prefilled: Boolean(customerData),
      access_enforcement_mode: 'observe'
    }
  });
  if (auditError) throw auditError;

  return {
    checkout_id: checkout.id,
    checkout_url: checkout.link,
    reused: false,
    webhook_created: webhook.created,
    customer_data_prefilled: Boolean(customerData),
    trial_ends_at: subscription.trial_ends_at
  };
}

export function billingDateKey(value: unknown) {
  const text = providerText(value, 80);
  if (!text) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  try {
    return formatAsaasDateTime(text).slice(0, 10);
  } catch {
    return '';
  }
}

// O Asaas trata o vencimento como uma data civil, sem horario. Quando essa
// data passa por uma coluna timestamptz, o Postgres a devolve como meia-noite
// UTC; converter esse instante para Brasilia deslocaria o dia para a vespera.
export function asaasDueDateKey(value: unknown) {
  const text = providerText(value, 80);
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(text);
  return match?.[1] || '';
}

export async function confirmStoreAsaasSandboxPayment(supabase: any, input: {
  storeId: string;
  actorUserId: string;
  configuration: AsaasServerConfiguration;
  safety: AsaasSandboxSafety;
  fetchImplementation?: typeof fetch;
}) {
  if (
    !input.safety.enabled
    || !input.safety.paymentConfirmationEnabled
    || input.storeId !== input.safety.syntheticStoreId
  ) {
    throw billingRepositoryError(
      'ASAAS_SANDBOX_PAYMENT_CONFIRMATION_FORBIDDEN',
      'A confirmacao de pagamento esta restrita ao cenario sintetico autorizado no Sandbox.'
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
      .select('id,store_id,plan_id,status,access_enforcement_mode,trial_ends_at,provider_customer_id,provider_subscription_id')
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
  if (
    !subscription
    || !['trialing', 'active'].includes(subscription.status)
    || subscription.access_enforcement_mode !== 'observe'
    || !providerText(subscription.provider_customer_id)
    || !providerText(subscription.provider_subscription_id).startsWith('sub_')
  ) {
    throw billingRepositoryError(
      'ASAAS_SANDBOX_PAYMENT_NOT_READY',
      'A assinatura sintetica ainda nao esta pronta para confirmar a cobranca.'
    );
  }

  const [planResult, paymentsResult] = await Promise.all([
    supabase
      .from('billing_plans')
      .select('id,code,amount_cents,is_active')
      .eq('id', subscription.plan_id)
      .eq('code', 'professional')
      .eq('is_active', true)
      .maybeSingle(),
    supabase
      .from('billing_payments')
      .select('id,provider_payment_id,provider_status,amount_cents,due_at,confirmed_at,received_at')
      .eq('subscription_id', subscription.id)
      .eq('store_id', input.storeId)
      .order('due_at', { ascending: true })
      .limit(2)
  ]);
  if (planResult.error) throw planResult.error;
  if (paymentsResult.error) throw paymentsResult.error;
  if (!planResult.data || Number(planResult.data.amount_cents) !== 149700) {
    throw billingRepositoryError('ASAAS_SANDBOX_PLAN_INVALID', 'Plano Profissional invalido para homologacao.');
  }
  const payments = paymentsResult.data || [];
  if (payments.length !== 1) {
    throw billingRepositoryError(
      'ASAAS_SANDBOX_PAYMENT_NOT_READY',
      'A homologacao exige exatamente uma cobranca sintetica vinculada.'
    );
  }
  const payment = payments[0];
  if (
    Number(payment.amount_cents) !== 149700
    || !providerText(payment.provider_payment_id).startsWith('pay_')
    || asaasDueDateKey(payment.due_at) !== billingDateKey(subscription.trial_ends_at)
  ) {
    throw billingRepositoryError(
      'ASAAS_SANDBOX_PAYMENT_MISMATCH',
      'A cobranca sintetica nao corresponde ao valor ou vencimento autorizado.'
    );
  }

  const settled = Boolean(payment.confirmed_at || payment.received_at)
    || ['CONFIRMED', 'RECEIVED'].includes(providerText(payment.provider_status).toUpperCase());
  if (settled && subscription.status === 'active') {
    return {
      reused: true,
      webhook_pending: false,
      payment_status: providerText(payment.provider_status).toUpperCase(),
      subscription_status: subscription.status
    };
  }
  const normalizedPaymentStatus = providerText(payment.provider_status).toUpperCase();
  if (normalizedPaymentStatus === 'SANDBOX_CONFIRMATION_REQUESTED') {
    return {
      reused: true,
      webhook_pending: true,
      payment_status: normalizedPaymentStatus,
      subscription_status: subscription.status
    };
  }

  const auditLookup = await supabase
    .from('billing_audit_log')
    .select('id')
    .eq('subscription_id', subscription.id)
    .eq('action', 'asaas_sandbox_payment_confirmation_requested')
    .contains('metadata', { provider_payment_id: payment.provider_payment_id })
    .limit(1)
    .maybeSingle();
  if (auditLookup.error) throw auditLookup.error;
  if (auditLookup.data) {
    return {
      reused: true,
      webhook_pending: subscription.status !== 'active',
      payment_status: providerText(payment.provider_status).toUpperCase(),
      subscription_status: subscription.status
    };
  }

  if (normalizedPaymentStatus !== 'PENDING') {
    throw billingRepositoryError(
      'ASAAS_SANDBOX_PAYMENT_NOT_READY',
      'A cobranca sintetica nao esta pendente para confirmacao.'
    );
  }
  const claimTime = new Date().toISOString();
  const claim = await supabase
    .from('billing_payments')
    .update({
      provider_status: 'SANDBOX_CONFIRMATION_REQUESTED',
      updated_at: claimTime
    })
    .eq('id', payment.id)
    .eq('provider_status', payment.provider_status)
    .select('id')
    .maybeSingle();
  if (claim.error) throw claim.error;
  if (!claim.data) {
    return {
      reused: true,
      webhook_pending: true,
      payment_status: 'SANDBOX_CONFIRMATION_REQUESTED',
      subscription_status: subscription.status
    };
  }

  let confirmation: { id: string; status: string };
  try {
    confirmation = await confirmAsaasSandboxPayment(
      input.configuration,
      payment.provider_payment_id,
      input.fetchImplementation
    );
  } catch (error) {
    await supabase
      .from('billing_payments')
      .update({ provider_status: payment.provider_status, updated_at: new Date().toISOString() })
      .eq('id', payment.id)
      .eq('provider_status', 'SANDBOX_CONFIRMATION_REQUESTED');
    throw error;
  }
  const { error: auditError } = await supabase.from('billing_audit_log').insert({
    store_id: input.storeId,
    subscription_id: subscription.id,
    actor_user_id: input.actorUserId,
    action: 'asaas_sandbox_payment_confirmation_requested',
    previous_status: subscription.status,
    new_status: subscription.status,
    reason: 'Confirmacao exclusiva da cobranca sintetica solicitada no Asaas Sandbox.',
    metadata: {
      provider: 'asaas',
      environment: 'sandbox',
      provider_payment_id: payment.provider_payment_id,
      provider_status: confirmation.status,
      amount_cents: 149700,
      due_at: payment.due_at,
      access_enforcement_mode: 'observe'
    }
  });
  if (auditError) throw auditError;

  return {
    reused: false,
    webhook_pending: true,
    payment_status: confirmation.status,
    subscription_status: subscription.status
  };
}

export type AsaasStageFiveScenario =
  | 'card-refused'
  | 'overdue'
  | 'confirm-for-refund'
  | 'refund'
  | 'chargeback-sequence';

async function writeStageFiveAuditOnce(supabase: any, input: {
  storeId: string;
  subscriptionId: string;
  actorUserId: string;
  status: string;
  scenario: AsaasStageFiveScenario;
  paymentId: string;
}) {
  const action = `asaas_sandbox_stage5_${input.scenario.replaceAll('-', '_')}`;
  const existing = await supabase
    .from('billing_audit_log')
    .select('id')
    .eq('subscription_id', input.subscriptionId)
    .eq('action', action)
    .contains('metadata', { provider_payment_id: input.paymentId })
    .limit(1)
    .maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data) return;
  const { error } = await supabase.from('billing_audit_log').insert({
    store_id: input.storeId,
    subscription_id: input.subscriptionId,
    actor_user_id: input.actorUserId,
    action,
    previous_status: input.status,
    new_status: input.status,
    reason: 'Cenario financeiro sintetico executado na homologacao isolada da etapa 5.',
    metadata: {
      provider: 'asaas',
      environment: 'sandbox',
      scenario: input.scenario,
      provider_payment_id: input.paymentId,
      access_enforcement_mode: 'observe',
      grace_period_days: BILLING_GRACE_PERIOD_DAYS
    }
  });
  if (error) throw error;
}

function stageFiveWebhookBody(input: {
  eventType: string;
  eventSuffix: string;
  providerStatus: string;
  paymentId: string;
  providerSubscriptionId: string;
  providerCustomerId: string;
  externalReference: string;
  dueAt: string;
}) {
  return {
    id: `evt_stage5_${input.eventSuffix}_${input.paymentId}`.slice(0, 240),
    event: input.eventType,
    dateCreated: new Date().toISOString(),
    payment: {
      object: 'payment',
      id: input.paymentId,
      status: input.providerStatus,
      value: 1497,
      dueDate: asaasDueDateKey(input.dueAt),
      billingType: 'CREDIT_CARD',
      customer: input.providerCustomerId,
      subscription: input.providerSubscriptionId,
      externalReference: input.externalReference
    }
  };
}

export async function runStoreAsaasSandboxFailureScenario(supabase: any, input: {
  storeId: string;
  actorUserId: string;
  scenario: AsaasStageFiveScenario;
  configuration: AsaasServerConfiguration;
  safety: AsaasSandboxSafety;
  environment?: NodeJS.ProcessEnv;
  fetchImplementation?: typeof fetch;
}) {
  const profile = syntheticStoreProfile(input.safety, input.storeId);
  if (
    !input.safety.enabled
    || !input.safety.failureTestEnabled
    || !profile
    || profile.scenario !== 'failure'
  ) {
    throw billingRepositoryError(
      'ASAAS_SANDBOX_FAILURE_TEST_FORBIDDEN',
      'A etapa 5 esta restrita a segunda loja sintetica do saas-dev.'
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
      .select('id,store_id,status,access_enforcement_mode,trial_ends_at,past_due_at,grace_ends_at,provider_customer_id,provider_subscription_id,external_reference')
      .eq('store_id', input.storeId)
      .neq('status', 'cancelled')
      .maybeSingle()
  ]);
  if (storeResult.error) throw storeResult.error;
  if (subscriptionResult.error) throw subscriptionResult.error;
  assertSyntheticStore(storeResult.data, profile);
  const subscription = subscriptionResult.data;
  if (
    !subscription
    || !['trialing', 'active', 'past_due'].includes(subscription.status)
    || subscription.access_enforcement_mode !== 'observe'
    || !providerText(subscription.provider_customer_id).startsWith('cus_')
    || !providerText(subscription.provider_subscription_id).startsWith('sub_')
  ) {
    throw billingRepositoryError(
      'ASAAS_SANDBOX_PAYMENT_NOT_READY',
      'A assinatura negativa nao esta pronta ou saiu do modo observe.'
    );
  }
  const { data: payments, error: paymentsError } = await supabase
    .from('billing_payments')
    .select('id,provider_payment_id,provider_status,amount_cents,due_at,confirmed_at,received_at')
    .eq('subscription_id', subscription.id)
    .eq('store_id', input.storeId)
    .order('due_at', { ascending: true })
    .limit(2);
  if (paymentsError) throw paymentsError;
  if (!payments || payments.length !== 1) {
    throw billingRepositoryError(
      'ASAAS_SANDBOX_PAYMENT_NOT_READY',
      'A etapa 5 exige exatamente uma cobranca sintetica vinculada.'
    );
  }
  const payment = payments[0];
  const paymentId = providerText(payment.provider_payment_id);
  const paymentStatus = providerText(payment.provider_status).toUpperCase();
  if (
    Number(payment.amount_cents) !== 149700
    || !paymentId.startsWith('pay_')
    || asaasDueDateKey(payment.due_at) !== billingDateKey(subscription.trial_ends_at)
  ) {
    throw billingRepositoryError(
      'ASAAS_SANDBOX_PAYMENT_MISMATCH',
      'A cobranca negativa nao corresponde ao plano ou vencimento autorizado.'
    );
  }

  const environment = input.environment || process.env;
  const fetchImplementation = input.fetchImplementation || fetch;
  const webhookInput = {
    paymentId,
    providerSubscriptionId: providerText(subscription.provider_subscription_id),
    providerCustomerId: providerText(subscription.provider_customer_id),
    externalReference: providerText(subscription.external_reference, 200),
    dueAt: providerText(payment.due_at, 80)
  };
  let result: Record<string, unknown> = { webhook_pending: false };

  if (input.scenario === 'card-refused') {
    if (!['PENDING', 'CREDIT_CARD_CAPTURE_REFUSED'].includes(paymentStatus)) {
      throw billingRepositoryError('ASAAS_SANDBOX_PAYMENT_NOT_READY', 'O teste de recusa exige cobranca pendente.');
    }
    result = await deliverAsaasSandboxTestWebhook(
      input.configuration,
      input.safety,
      stageFiveWebhookBody({
        ...webhookInput,
        eventType: 'PAYMENT_CREDIT_CARD_CAPTURE_REFUSED',
        eventSuffix: 'capture_refused',
        providerStatus: 'CREDIT_CARD_CAPTURE_REFUSED'
      }),
      environment,
      fetchImplementation
    );
  } else if (input.scenario === 'overdue') {
    const overdue = await forceAsaasSandboxPaymentOverdue(
      input.configuration,
      paymentId,
      fetchImplementation
    );
    result = { ...overdue, webhook_pending: true };
  } else if (input.scenario === 'confirm-for-refund') {
    if (['REFUNDED', 'CHARGEBACK_REQUESTED', 'CHARGEBACK_DISPUTE'].includes(paymentStatus)) {
      throw billingRepositoryError('ASAAS_SANDBOX_PAYMENT_NOT_READY', 'A cobranca ja possui perda financeira terminal.');
    }
    const confirmation = await confirmAsaasSandboxPayment(
      input.configuration,
      paymentId,
      fetchImplementation
    );
    result = { ...confirmation, webhook_pending: true };
  } else if (input.scenario === 'refund') {
    if (!['CONFIRMED', 'RECEIVED'].includes(paymentStatus)) {
      throw billingRepositoryError('ASAAS_SANDBOX_PAYMENT_NOT_READY', 'O estorno exige pagamento confirmado.');
    }
    const refund = await refundAsaasSandboxPayment(
      input.configuration,
      paymentId,
      fetchImplementation
    );
    result = { ...refund, webhook_pending: true };
  } else {
    if (!['REFUNDED', 'CHARGEBACK_REQUESTED', 'CHARGEBACK_DISPUTE'].includes(paymentStatus)) {
      throw billingRepositoryError('ASAAS_SANDBOX_PAYMENT_NOT_READY', 'O chargeback sintetico exige estorno anterior.');
    }
    const requested = stageFiveWebhookBody({
      ...webhookInput,
      eventType: 'PAYMENT_CHARGEBACK_REQUESTED',
      eventSuffix: 'chargeback_requested',
      providerStatus: 'CHARGEBACK_REQUESTED'
    });
    const dispute = stageFiveWebhookBody({
      ...webhookInput,
      eventType: 'PAYMENT_CHARGEBACK_DISPUTE',
      eventSuffix: 'chargeback_dispute',
      providerStatus: 'CHARGEBACK_DISPUTE'
    });
    const staleConfirmation = stageFiveWebhookBody({
      ...webhookInput,
      eventType: 'PAYMENT_CONFIRMED',
      eventSuffix: 'out_of_order_confirmed',
      providerStatus: 'CONFIRMED'
    });
    const first = await deliverAsaasSandboxTestWebhook(
      input.configuration, input.safety, requested, environment, fetchImplementation
    );
    const duplicateRequested = await deliverAsaasSandboxTestWebhook(
      input.configuration, input.safety, requested, environment, fetchImplementation
    );
    const second = await deliverAsaasSandboxTestWebhook(
      input.configuration, input.safety, dispute, environment, fetchImplementation
    );
    const duplicateDispute = await deliverAsaasSandboxTestWebhook(
      input.configuration, input.safety, dispute, environment, fetchImplementation
    );
    const outOfOrder = await deliverAsaasSandboxTestWebhook(
      input.configuration, input.safety, staleConfirmation, environment, fetchImplementation
    );
    result = {
      first,
      duplicate_requested: duplicateRequested.duplicate,
      second,
      duplicate_dispute: duplicateDispute.duplicate,
      out_of_order: outOfOrder,
      webhook_pending: false
    };
  }

  await writeStageFiveAuditOnce(supabase, {
    storeId: input.storeId,
    subscriptionId: subscription.id,
    actorUserId: input.actorUserId,
    status: subscription.status,
    scenario: input.scenario,
    paymentId
  });
  return {
    scenario: input.scenario,
    payment_id: paymentId,
    subscription_status_before: subscription.status,
    access_enforcement_mode: 'observe',
    grace_period_days: BILLING_GRACE_PERIOD_DAYS,
    webhook_pending: result.webhook_pending === true,
    details: result
  };
}

export type StoredAsaasWebhookEvent = {
  provider_event_id?: string;
  event_type: string;
  provider_object_type: string | null;
  provider_object_id: string | null;
  payload: any;
};

function providerText(value: unknown, max = 240) {
  if (typeof value !== 'string' && typeof value !== 'number') return '';
  return String(value).trim().slice(0, max);
}

function providerIdentifier(value: unknown, max = 240) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return providerText((value as Record<string, unknown>).id, max);
  }
  return providerText(value, max);
}

export function extractAsaasWebhookReferences(event: StoredAsaasWebhookEvent) {
  const object = event.payload?.object || {};
  const externalReference = providerText(object.externalReference, 200);
  const checkoutId = event.provider_object_type === 'checkout'
    ? providerText(event.provider_object_id)
    : '';
  const providerSubscriptionId = event.provider_object_type === 'subscription'
    ? providerText(event.provider_object_id)
    : providerIdentifier(object.subscription);
  const customerId = providerIdentifier(object.customer);
  return { externalReference, checkoutId, providerSubscriptionId, customerId };
}

export function isSafeSyntheticAsaasFallback(input: {
  event: StoredAsaasWebhookEvent;
  candidate: any;
  syntheticStoreId: string;
}) {
  const { event, candidate, syntheticStoreId } = input;
  if (!syntheticStoreId || candidate?.store_id !== syntheticStoreId) return false;
  if (candidate?.status !== 'trialing' || candidate?.access_enforcement_mode !== 'observe') return false;
  if (!providerText(candidate?.provider_checkout_id)) return false;

  const object = event.payload?.object || {};
  const references = extractAsaasWebhookReferences(event);
  const amountCents = Math.round(Number(object.value || 0) * 100);
  if (amountCents !== 149700 || !references.providerSubscriptionId.startsWith('sub_')) return false;

  if (event.provider_object_type === 'payment') {
    const dueDate = providerText(object.dueDate, 10);
    const expectedDueDate = candidate?.trial_ends_at
      ? formatAsaasDateTime(candidate.trial_ends_at).slice(0, 10)
      : '';
    return Boolean(dueDate && dueDate === expectedDueDate);
  }

  if (event.provider_object_type === 'subscription') {
    return providerText(object.cycle, 40).toUpperCase() === 'MONTHLY';
  }

  return false;
}

async function findSubscriptionForAsaasEvent(
  supabase: any,
  event: StoredAsaasWebhookEvent,
  syntheticStoreIds: string[] = []
) {
  const references = extractAsaasWebhookReferences(event);
  const select = 'id,store_id,status,access_enforcement_mode,trial_ends_at,current_period_started_at,current_period_ends_at,past_due_at,grace_ends_at,provider_customer_id,provider_subscription_id,provider_checkout_id,external_reference';
  const attempts: Array<[string, string]> = [
    ['external_reference', references.externalReference],
    ['provider_checkout_id', references.checkoutId],
    ['provider_subscription_id', references.providerSubscriptionId],
    ['provider_customer_id', references.customerId]
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

  const authorizedIds = syntheticStoreIds.filter(Boolean);
  if (!authorizedIds.length || !['payment', 'subscription'].includes(String(event.provider_object_type || ''))) {
    return null;
  }
  const { data: candidates, error: fallbackError } = await supabase
    .from('store_billing_subscriptions')
    .select(select)
    .in('store_id', authorizedIds)
    .eq('status', 'trialing')
    .eq('access_enforcement_mode', 'observe')
    .limit(authorizedIds.length + 1);
  if (fallbackError) throw fallbackError;
  const matches = (candidates || []).filter((candidate: any) => authorizedIds.some((syntheticStoreId) => (
    isSafeSyntheticAsaasFallback({ event, candidate, syntheticStoreId })
  )));
  if (matches.length !== 1) return null;
  return matches[0];
}

type BillingSubscriptionTarget = 'active' | 'past_due' | null;

const PAYMENT_SUCCESS_STATUSES = new Set(['CONFIRMED', 'RECEIVED', 'RECEIVED_IN_CASH']);
const PAYMENT_LOSS_STATUSES = new Set([
  'REFUNDED',
  'REFUND_REQUESTED',
  'CHARGEBACK_REQUESTED',
  'CHARGEBACK_DISPUTE'
]);
const PAYMENT_FAILURE_STATUSES = new Set([
  'CREDIT_CARD_CAPTURE_REFUSED',
  'REPROVED_BY_RISK_ANALYSIS'
]);

function paymentStatusFromEvent(eventType: string) {
  return String(eventType || '').replace(/^PAYMENT_/, '').trim().toUpperCase();
}

export function resolveAsaasPaymentState(input: {
  eventType: string;
  providerStatus: unknown;
  existingStatus?: unknown;
  existingConfirmedAt?: unknown;
  existingReceivedAt?: unknown;
}): { providerStatus: string; subscriptionTarget: BillingSubscriptionTarget; stale: boolean } {
  const eventStatus = paymentStatusFromEvent(input.eventType);
  const incoming = providerText(input.providerStatus, 120).toUpperCase() || eventStatus;
  const existing = providerText(input.existingStatus, 120).toUpperCase();
  const existingSettled = Boolean(input.existingConfirmedAt || input.existingReceivedAt)
    || PAYMENT_SUCCESS_STATUSES.has(existing);
  const existingLost = PAYMENT_LOSS_STATUSES.has(existing);
  const incomingLost = PAYMENT_LOSS_STATUSES.has(incoming) || PAYMENT_LOSS_STATUSES.has(eventStatus);
  const incomingFailure = PAYMENT_FAILURE_STATUSES.has(incoming)
    || PAYMENT_FAILURE_STATUSES.has(eventStatus);
  const incomingSuccess = PAYMENT_SUCCESS_STATUSES.has(incoming) || PAYMENT_SUCCESS_STATUSES.has(eventStatus);
  const incomingOverdue = incoming === 'OVERDUE' || eventStatus === 'OVERDUE';

  if (incomingLost) {
    return {
      providerStatus: incoming || eventStatus,
      subscriptionTarget: 'past_due',
      stale: false
    };
  }
  if (existingLost) {
    return { providerStatus: existing, subscriptionTarget: null, stale: true };
  }
  if (incomingFailure) {
    return {
      providerStatus: incoming || eventStatus,
      subscriptionTarget: 'past_due',
      stale: false
    };
  }
  if (incomingSuccess) {
    const providerStatus = existing === 'RECEIVED' && incoming !== 'RECEIVED'
      ? existing
      : incoming || eventStatus;
    return { providerStatus, subscriptionTarget: 'active', stale: false };
  }
  if (incomingOverdue) {
    if (existingSettled) {
      return { providerStatus: existing || 'CONFIRMED', subscriptionTarget: null, stale: true };
    }
    return { providerStatus: 'OVERDUE', subscriptionTarget: 'past_due', stale: false };
  }
  if (
    existing === 'SANDBOX_CONFIRMATION_REQUESTED'
    && ['PENDING', 'CREATED', 'UPDATED'].includes(incoming || eventStatus)
  ) {
    return { providerStatus: existing, subscriptionTarget: null, stale: true };
  }
  if (existingSettled && ['PENDING', 'CREATED', 'UPDATED'].includes(incoming || eventStatus)) {
    return { providerStatus: existing || 'CONFIRMED', subscriptionTarget: null, stale: true };
  }
  return {
    providerStatus: incoming || existing || eventStatus || 'UNKNOWN',
    subscriptionTarget: null,
    stale: false
  };
}

export function monthlyBillingPeriod(input: unknown) {
  const text = providerText(input, 80);
  const start = new Date(text);
  if (!text || !Number.isFinite(start.getTime())) return null;
  const end = new Date(start);
  const day = end.getUTCDate();
  end.setUTCDate(1);
  end.setUTCMonth(end.getUTCMonth() + 1);
  const lastDay = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0)).getUTCDate();
  end.setUTCDate(Math.min(day, lastDay));
  return {
    startsAt: start.toISOString(),
    endsAt: end.toISOString()
  };
}

function staleBillingPeriod(dueAt: unknown, currentPeriodStartedAt: unknown) {
  const dueDate = asaasDueDateKey(dueAt);
  const currentDate = billingDateKey(currentPeriodStartedAt);
  return Boolean(dueDate && currentDate && dueDate < currentDate);
}

async function writeWebhookAuditOnce(supabase: any, input: {
  event: StoredAsaasWebhookEvent;
  subscription: any;
  action: string;
  previousStatus: string;
  newStatus: string;
  reason: string;
}) {
  const eventId = providerText(input.event.provider_event_id, 240);
  if (!eventId) return;
  const existing = await supabase
    .from('billing_audit_log')
    .select('id')
    .eq('subscription_id', input.subscription.id)
    .eq('action', input.action)
    .contains('metadata', { provider_event_id: eventId })
    .limit(1)
    .maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data) return;
  const { error } = await supabase.from('billing_audit_log').insert({
    store_id: input.subscription.store_id,
    subscription_id: input.subscription.id,
    actor_user_id: null,
    action: input.action,
    previous_status: input.previousStatus,
    new_status: input.newStatus,
    reason: input.reason,
    metadata: {
      provider: 'asaas',
      environment: 'sandbox',
      provider_event_id: eventId,
      event_type: input.event.event_type,
      provider_object_type: input.event.provider_object_type,
      provider_object_id: input.event.provider_object_id,
      access_enforcement_mode: 'observe'
    }
  });
  if (error) throw error;
}

function safeTransitionReason(eventType: string) {
  if (['PAYMENT_CONFIRMED', 'PAYMENT_RECEIVED'].includes(eventType)) {
    return 'Pagamento sintetico confirmado pelo webhook autenticado do Asaas Sandbox.';
  }
  if (eventType === 'PAYMENT_OVERDUE') {
    return 'Cobranca marcada como vencida pelo webhook autenticado do Asaas Sandbox.';
  }
  if (eventType === 'PAYMENT_CREDIT_CARD_CAPTURE_REFUSED') {
    return 'Cartao sintetico recusado pelo fluxo autenticado de homologacao do Asaas Sandbox.';
  }
  if (eventType === 'PAYMENT_REFUNDED') {
    return 'Pagamento marcado como estornado pelo webhook autenticado do Asaas Sandbox.';
  }
  if (eventType.startsWith('PAYMENT_CHARGEBACK')) {
    return 'Chargeback informado pelo webhook autenticado do Asaas Sandbox.';
  }
  return 'Estado da assinatura atualizado pelo webhook autenticado do Asaas Sandbox.';
}

export async function processStoredAsaasWebhookEvent(
  supabase: any,
  event: StoredAsaasWebhookEvent,
  options: { syntheticStoreId?: string; syntheticStoreIds?: string[] } = {}
): Promise<{ processing_status: 'processed' | 'ignored'; subscription_id: string | null }> {
  const object = event.payload?.object || {};
  const references = extractAsaasWebhookReferences(event);
  const subscription = await findSubscriptionForAsaasEvent(
    supabase,
    event,
    [
      ...(options.syntheticStoreIds || []),
      providerText(options.syntheticStoreId)
    ].filter(Boolean)
  );
  if (!subscription) return { processing_status: 'ignored', subscription_id: null };
  if (subscription.access_enforcement_mode !== 'observe') {
    throw new Error('O Webhook Sandbox recusou assinatura fora do modo observe.');
  }

  if (subscription.status === 'cancelled' && event.provider_object_type !== 'payment') {
    await writeWebhookAuditOnce(supabase, {
      event,
      subscription,
      action: 'asaas_webhook_terminal_transition_ignored',
      previousStatus: 'cancelled',
      newStatus: 'cancelled',
      reason: 'Evento atrasado preservado sem reabrir assinatura cancelada.'
    });
    return { processing_status: 'processed', subscription_id: subscription.id };
  }

  const now = new Date().toISOString();
  if (event.provider_object_type === 'checkout') {
    const update: Record<string, unknown> = { updated_at: now };
    if (references.checkoutId) update.provider_checkout_id = references.checkoutId;
    if (references.customerId) update.provider_customer_id = references.customerId;
    if (references.providerSubscriptionId) {
      update.provider_subscription_id = references.providerSubscriptionId;
    }
    const checkoutClosed = ['CHECKOUT_CANCELED', 'CHECKOUT_EXPIRED'].includes(event.event_type);
    if (checkoutClosed) {
      update.provider_checkout_id = null;
    }
    let updateQuery = supabase
      .from('store_billing_subscriptions')
      .update(update)
      .eq('id', subscription.id);
    if (checkoutClosed) {
      updateQuery = updateQuery.eq('provider_checkout_id', references.checkoutId);
    }
    const { error } = await updateQuery;
    if (error) throw error;
    return { processing_status: 'processed', subscription_id: subscription.id };
  }

  if (event.provider_object_type === 'subscription') {
    const update: Record<string, unknown> = { updated_at: now };
    if (references.providerSubscriptionId) {
      update.provider_subscription_id = references.providerSubscriptionId;
    }
    if (references.customerId) update.provider_customer_id = references.customerId;
    const cancelled = ['SUBSCRIPTION_INACTIVATED', 'SUBSCRIPTION_DELETED'].includes(event.event_type);
    if (cancelled) {
      update.status = 'cancelled';
      update.cancelled_at = now;
    }
    const { error } = await supabase
      .from('store_billing_subscriptions')
      .update(update)
      .eq('id', subscription.id);
    if (error) throw error;
    if (cancelled && subscription.status !== 'cancelled') {
      await writeWebhookAuditOnce(supabase, {
        event,
        subscription,
        action: 'asaas_webhook_subscription_transition',
        previousStatus: subscription.status,
        newStatus: 'cancelled',
        reason: 'Assinatura cancelada pelo webhook autenticado do Asaas Sandbox.'
      });
    }
    return { processing_status: 'processed', subscription_id: subscription.id };
  }

  if (event.provider_object_type === 'payment') {
    const providerPaymentId = providerText(event.provider_object_id);
    const amountCents = Math.round(Number(object.value || 0) * 100);
    if (!providerPaymentId || !Number.isInteger(amountCents) || amountCents !== 149700) {
      return { processing_status: 'ignored', subscription_id: subscription.id };
    }
    if (references.providerSubscriptionId || references.customerId) {
      const linkUpdate: Record<string, unknown> = { updated_at: now };
      if (references.providerSubscriptionId) {
        linkUpdate.provider_subscription_id = references.providerSubscriptionId;
      }
      if (references.customerId) linkUpdate.provider_customer_id = references.customerId;
      const { error: linkError } = await supabase
        .from('store_billing_subscriptions')
        .update(linkUpdate)
        .eq('id', subscription.id);
      if (linkError) throw linkError;
    }
    const paymentDate = providerText(object.paymentDate || object.confirmedDate, 80) || null;
    const dueAt = providerText(object.dueDate, 80) || null;
    const existingPaymentResult = await supabase
      .from('billing_payments')
      .select('provider_status,due_at,confirmed_at,received_at,overdue_at,refunded_at,chargeback_at,external_reference')
      .eq('provider_payment_id', providerPaymentId)
      .maybeSingle();
    if (existingPaymentResult.error) throw existingPaymentResult.error;
    const existingPayment = existingPaymentResult.data || {};
    const paymentState = resolveAsaasPaymentState({
      eventType: event.event_type,
      providerStatus: object.status,
      existingStatus: existingPayment.provider_status,
      existingConfirmedAt: existingPayment.confirmed_at,
      existingReceivedAt: existingPayment.received_at
    });
    const { error: paymentError } = await supabase.from('billing_payments').upsert({
      subscription_id: subscription.id,
      store_id: subscription.store_id,
      provider: 'asaas',
      provider_payment_id: providerPaymentId,
      provider_status: paymentState.providerStatus,
      amount_cents: amountCents,
      due_at: existingPayment.due_at || dueAt || null,
      confirmed_at: paymentState.subscriptionTarget === 'active'
        ? existingPayment.confirmed_at || paymentDate || now
        : existingPayment.confirmed_at || null,
      received_at: ['RECEIVED', 'RECEIVED_IN_CASH'].includes(paymentState.providerStatus)
        ? existingPayment.received_at || paymentDate || now
        : existingPayment.received_at || null,
      overdue_at: paymentState.providerStatus === 'OVERDUE' ? now : existingPayment.overdue_at || null,
      refunded_at: paymentState.providerStatus.startsWith('REFUND') ? now : existingPayment.refunded_at || null,
      chargeback_at: paymentState.providerStatus.startsWith('CHARGEBACK')
        ? now
        : existingPayment.chargeback_at || null,
      external_reference: providerText(object.externalReference, 200) || existingPayment.external_reference || null,
      updated_at: now
    }, { onConflict: 'provider_payment_id' });
    if (paymentError) throw paymentError;

    let targetStatus = paymentState.subscriptionTarget;
    let terminalTransitionIgnored = false;
    if (subscription.status === 'cancelled') {
      terminalTransitionIgnored = true;
      targetStatus = null;
    }
    const lossEvent = event.event_type === 'PAYMENT_REFUNDED'
      || event.event_type.startsWith('PAYMENT_CHARGEBACK');
    if (
      targetStatus
      && staleBillingPeriod(dueAt || existingPayment.due_at, subscription.current_period_started_at)
      && !lossEvent
    ) {
      targetStatus = null;
      await writeWebhookAuditOnce(supabase, {
        event,
        subscription,
        action: 'asaas_webhook_stale_transition_ignored',
        previousStatus: subscription.status,
        newStatus: subscription.status,
        reason: 'Evento financeiro antigo preservado sem regredir o periodo atual da assinatura.'
      });
    }
    if (paymentState.stale && !targetStatus) {
      await writeWebhookAuditOnce(supabase, {
        event,
        subscription,
        action: 'asaas_webhook_stale_transition_ignored',
        previousStatus: subscription.status,
        newStatus: subscription.status,
        reason: 'Evento financeiro duplicado ou fora de ordem preservado sem regressao de estado.'
      });
    }
    if (terminalTransitionIgnored) {
      await writeWebhookAuditOnce(supabase, {
        event,
        subscription,
        action: 'asaas_webhook_terminal_transition_ignored',
        previousStatus: 'cancelled',
        newStatus: 'cancelled',
        reason: 'Evento financeiro atrasado preservado sem reabrir assinatura cancelada.'
      });
    }
    if (targetStatus) {
      const update: Record<string, unknown> = {
        status: targetStatus,
        updated_at: now
      };
      if (targetStatus === 'active') {
        const effectiveDueAt = existingPayment.due_at || dueAt;
        const periodAnchor = asaasDueDateKey(effectiveDueAt) === billingDateKey(subscription.trial_ends_at)
          ? subscription.trial_ends_at
          : effectiveDueAt || paymentDate || now;
        const period = monthlyBillingPeriod(periodAnchor);
        update.current_period_started_at = period?.startsAt || paymentDate || now;
        update.current_period_ends_at = period?.endsAt || null;
        update.past_due_at = null;
        update.grace_ends_at = null;
      } else {
        update.past_due_at = subscription.past_due_at || now;
        update.grace_ends_at = subscription.grace_ends_at
          || new Date(Date.now() + BILLING_GRACE_PERIOD_DAYS * 86_400_000).toISOString();
      }
      const { error: subscriptionError } = await supabase
        .from('store_billing_subscriptions')
        .update(update)
        .eq('id', subscription.id);
      if (subscriptionError) throw subscriptionError;
      if (subscription.status !== targetStatus) {
        await writeWebhookAuditOnce(supabase, {
          event,
          subscription,
          action: 'asaas_webhook_subscription_transition',
          previousStatus: subscription.status,
          newStatus: targetStatus,
          reason: safeTransitionReason(event.event_type)
        });
      }
    }
    return { processing_status: 'processed', subscription_id: subscription.id };
  }

  return { processing_status: 'ignored', subscription_id: subscription.id };
}
