export const BILLING_TRIAL_DAYS = 7;

export const billingSubscriptionStatuses = [
  'pending_checkout',
  'trialing',
  'active',
  'past_due',
  'suspended',
  'cancelled'
] as const;

export type BillingSubscriptionStatus = (typeof billingSubscriptionStatuses)[number];
export type BillingAccessReason =
  | 'master_bypass'
  | 'store_unavailable'
  | 'global_observation_mode'
  | 'subscription_observation_mode'
  | 'billing_infrastructure_unavailable'
  | 'subscription_required'
  | 'checkout_required'
  | 'trial_active'
  | 'trial_expired'
  | 'subscription_active'
  | 'past_due_grace'
  | 'payment_required'
  | 'subscription_suspended'
  | 'subscription_cancelled';

export type BillingSubscriptionAccessRow = {
  id: string;
  status: BillingSubscriptionStatus;
  access_enforcement_mode: 'observe' | 'enforce';
  trial_ends_at: string | null;
  grace_ends_at: string | null;
};

export type BillingAccessDecision = {
  allowed: boolean;
  enforced: boolean;
  reason: BillingAccessReason;
  subscriptionId: string | null;
  subscriptionStatus: BillingSubscriptionStatus | null;
  accessEnforcementMode: 'observe' | 'enforce' | null;
  observedAllowed: boolean;
  observedReason: BillingAccessReason;
};

export function billingEnforcementEnabled(environment: NodeJS.ProcessEnv = process.env) {
  const enabled = (value: unknown) => String(value || '').trim().toLowerCase() === 'true';
  const vercelEnvironment = String(environment.VERCEL_ENV || '').trim().toLowerCase();
  const environmentEnabled = vercelEnvironment === 'preview'
    ? enabled(environment.BILLING_PREVIEW_ENFORCEMENT_ENABLED)
    : vercelEnvironment === 'production'
      ? enabled(environment.BILLING_PRODUCTION_ENFORCEMENT_ENABLED)
      : false;
  return enabled(environment.BILLING_ENFORCEMENT_ENABLED) && environmentEnabled;
}

function validFutureDate(value: string | null | undefined, nowMs: number) {
  if (!value) return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && timestamp > nowMs;
}

export function evaluateBillingAccess(input: {
  role: unknown;
  operationalStore: boolean;
  enforcementEnabled: boolean;
  subscription?: BillingSubscriptionAccessRow | null;
  now?: Date;
}): BillingAccessDecision {
  if (input.role === 'master') {
    return {
      allowed: true,
      enforced: false,
      reason: 'master_bypass',
      subscriptionId: null,
      subscriptionStatus: null,
      accessEnforcementMode: null,
      observedAllowed: true,
      observedReason: 'master_bypass'
    };
  }

  if (!input.operationalStore) {
    return {
      allowed: false,
      enforced: false,
      reason: 'store_unavailable',
      subscriptionId: null,
      subscriptionStatus: null,
      accessEnforcementMode: null,
      observedAllowed: false,
      observedReason: 'store_unavailable'
    };
  }

  const subscription = input.subscription || null;
  const nowMs = (input.now || new Date()).getTime();
  let observedAllowed = false;
  let observedReason: BillingAccessReason = 'subscription_required';

  if (subscription?.status === 'active') {
    observedAllowed = true;
    observedReason = 'subscription_active';
  } else if (subscription?.status === 'trialing') {
    observedAllowed = validFutureDate(subscription.trial_ends_at, nowMs);
    observedReason = observedAllowed ? 'trial_active' : 'trial_expired';
  } else if (subscription?.status === 'past_due') {
    observedAllowed = validFutureDate(subscription.grace_ends_at, nowMs);
    observedReason = observedAllowed ? 'past_due_grace' : 'payment_required';
  } else if (subscription?.status === 'pending_checkout') {
    observedReason = 'checkout_required';
  } else if (subscription?.status === 'suspended') {
    observedReason = 'subscription_suspended';
  } else if (subscription?.status === 'cancelled') {
    observedReason = 'subscription_cancelled';
  }

  const observation = {
    subscriptionId: subscription?.id || null,
    subscriptionStatus: subscription?.status || null,
    accessEnforcementMode: subscription?.access_enforcement_mode || null,
    observedAllowed,
    observedReason
  } as const;

  if (!input.enforcementEnabled) {
    return {
      allowed: true,
      enforced: false,
      reason: 'global_observation_mode',
      ...observation
    };
  }

  if (subscription?.access_enforcement_mode !== 'enforce') {
    return {
      allowed: true,
      enforced: false,
      reason: 'subscription_observation_mode',
      ...observation
    };
  }

  return {
    allowed: observedAllowed,
    enforced: true,
    reason: observedReason,
    ...observation
  };
}

function missingBillingSchema(error: any) {
  const code = String(error?.code || '');
  const message = String(error?.message || error || '');
  return code === '42P01' || code === 'PGRST205'
    || /store_billing_subscriptions|schema cache|does not exist/i.test(message);
}

export async function resolveStoreBillingAccess(supabase: any, input: {
  role: unknown;
  storeId: string;
  operationalStore: boolean;
  enforcementEnabled?: boolean;
  now?: Date;
}): Promise<BillingAccessDecision> {
  const enforcementEnabled = input.enforcementEnabled ?? billingEnforcementEnabled();
  const earlyDecision = evaluateBillingAccess({
    role: input.role,
    operationalStore: input.operationalStore,
    enforcementEnabled,
    subscription: null,
    now: input.now
  });

  if (input.role === 'master' || !input.operationalStore) {
    return earlyDecision;
  }

  const { data, error } = await supabase
    .from('store_billing_subscriptions')
    .select('id,status,access_enforcement_mode,trial_ends_at,grace_ends_at')
    .eq('store_id', input.storeId)
    .neq('status', 'cancelled')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    if (!missingBillingSchema(error)) {
      console.error('[billing.entitlement] consulta indisponivel; acesso preservado', {
        code: String(error?.code || 'unknown')
      });
    }
    return {
      allowed: true,
      enforced: false,
      reason: 'billing_infrastructure_unavailable',
      subscriptionId: null,
      subscriptionStatus: null,
      accessEnforcementMode: null,
      observedAllowed: true,
      observedReason: 'billing_infrastructure_unavailable'
    };
  }

  return evaluateBillingAccess({
    role: input.role,
    operationalStore: input.operationalStore,
    enforcementEnabled,
    subscription: data as BillingSubscriptionAccessRow | null,
    now: input.now
  });
}
