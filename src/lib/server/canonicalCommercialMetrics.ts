import type { StorePortalRole } from './storePortal';

export type MetricsContext = { supabase: any; profile: any; role: StorePortalRole; store: { id: string } };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function resolveMetricsSubject(context: MetricsContext, requested?: string | null) {
  if (!context.profile?.id || context.profile.status !== 'active' ||
      !['master', 'store', 'seller', 'pre_sales', 'prospector'].includes(context.role) ||
      (context.role !== 'master' && context.profile.store_id !== context.store.id)) throw new Error('Invalid metrics scope');
  const subject = requested && requested !== 'all' ? requested : null;
  if (subject && !UUID.test(subject)) throw new Error('Invalid metrics subject');
  if (!['master', 'store'].includes(context.role)) {
    if (subject && subject !== context.profile.id) throw new Error('Metrics scope cannot be expanded');
    return context.profile.id as string;
  }
  if (subject) {
    const { data, error } = await context.supabase.from('users').select('id').eq('id', subject)
      .eq('store_id', context.store.id).eq('status', 'active').in('role', ['store', 'seller', 'pre_sales', 'prospector']).maybeSingle();
    if (error || !data) throw new Error('Metrics subject does not belong to this store');
  }
  return subject;
}

export async function readCanonicalCommercialMetrics(context: MetricsContext, options: {
  subject?: string | null; asOf?: string; cardIds?: string[];
} = {}) {
  const subject = await resolveMetricsSubject(context, options.subject);
  const { data, error } = await context.supabase.rpc('read_store_commercial_metrics_v1', {
    p_store_id: context.store.id, p_actor_profile_id: context.profile.id,
    p_subject_user_id: subject, p_as_of: options.asOf || new Date().toISOString(),
    p_card_ids: options.cardIds || []
  });
  // Do not silently restore truncated legacy metrics when the migration is absent.
  if (error || !data || data.definition_version !== 'commercial_metrics_v1') {
    throw new Error('Métricas canônicas indisponíveis. Verifique a versão de banco autorizada.');
  }
  return data;
}
