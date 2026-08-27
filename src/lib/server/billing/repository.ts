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
