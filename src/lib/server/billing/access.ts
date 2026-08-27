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
};

export function billingEnforcementEnabled(environment: NodeJS.ProcessEnv = process.env) {
  return String(environment.BILLING_ENFORCEMENT_ENABLED || '').trim().toLowerCase() === 'true';
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
    return { allowed: true, enforced: false, reason: 'master_bypass', subscriptionId: null };
  }

  if (!input.operationalStore) {
    return { allowed: false, enforced: false, reason: 'store_unavailable', subscriptionId: null };
  }

  if (!input.enforcementEnabled) {
    return { allowed: true, enforced: false, reason: 'global_observation_mode', subscriptionId: null };
  }

  const subscription = input.subscription || null;
  if (!subscription) {
    return { allowed: false, enforced: true, reason: 'subscription_required', subscriptionId: null };
  }

  if (subscription.access_enforcement_mode !== 'enforce') {
    return {
      allowed: true,
      enforced: false,
      reason: 'subscription_observation_mode',
      subscriptionId: subscription.id
    };
  }

  const nowMs = (input.now || new Date()).getTime();
  const base = { enforced: true, subscriptionId: subscription.id } as const;

  if (subscription.status === 'active') {
    return { ...base, allowed: true, reason: 'subscription_active' };
  }

  if (subscription.status === 'trialing') {
    return validFutureDate(subscription.trial_ends_at, nowMs)
      ? { ...base, allowed: true, reason: 'trial_active' }
      : { ...base, allowed: false, reason: 'trial_expired' };
  }

  if (subscription.status === 'past_due') {
    return validFutureDate(subscription.grace_ends_at, nowMs)
      ? { ...base, allowed: true, reason: 'past_due_grace' }
      : { ...base, allowed: false, reason: 'payment_required' };
  }

  if (subscription.status === 'pending_checkout') {
    return { ...base, allowed: false, reason: 'checkout_required' };
  }

  if (subscription.status === 'suspended') {
    return { ...base, allowed: false, reason: 'subscription_suspended' };
  }

  return { ...base, allowed: false, reason: 'subscription_cancelled' };
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

  if (input.role === 'master' || !input.operationalStore || !enforcementEnabled) {
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
    if (missingBillingSchema(error)) {
      return {
        allowed: true,
        enforced: false,
        reason: 'billing_infrastructure_unavailable',
        subscriptionId: null
      };
    }
    throw error;
  }

  return evaluateBillingAccess({
    role: input.role,
    operationalStore: input.operationalStore,
    enforcementEnabled,
    subscription: data as BillingSubscriptionAccessRow | null,
    now: input.now
  });
}
