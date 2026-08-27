export const BILLING_FOUNDATION_MIGRATION = '20260827044014_billing_foundation_asaas';

export function missingBillingFoundation(error: any) {
  const code = String(error?.code || '');
  const message = String(error?.message || error || '');
  return ['42P01', '42883', 'PGRST202', 'PGRST205'].includes(code)
    || /billing_plans|store_billing_subscriptions|start_store_billing_trial|schema cache|does not exist/i.test(message);
}

export async function readMasterBillingOverview(supabase: any) {
  const [plansResult, subscriptionsResult, storesResult] = await Promise.all([
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
      .order('store_name', { ascending: true })
  ]);

  const billingErrors = [plansResult.error, subscriptionsResult.error].filter(Boolean);
  if (billingErrors.length) {
    if (billingErrors.every(missingBillingFoundation)) {
      return {
        schema_ready: false,
        required_migration: BILLING_FOUNDATION_MIGRATION,
        plans: [],
        subscriptions: [],
        stores: storesResult.data || []
      };
    }
    throw billingErrors[0];
  }
  if (storesResult.error) throw storesResult.error;

  return {
    schema_ready: true,
    required_migration: null,
    plans: plansResult.data || [],
    subscriptions: subscriptionsResult.data || [],
    stores: storesResult.data || []
  };
}

export async function startStoreBillingTrial(supabase: any, input: {
  storeId: string;
  planCode: string;
  actorUserId: string;
  reason: string;
}) {
  const { data, error } = await supabase.rpc('start_store_billing_trial', {
    p_store_id: input.storeId,
    p_plan_code: input.planCode,
    p_actor_user_id: input.actorUserId,
    p_reason: input.reason
  });
  if (error) throw error;
  return data;
}
