import { createAutocarMetricsClient } from './autocarMetricsEnvironment';
import { resolveMetricsSubject, type MetricsContext } from './canonicalCommercialMetrics';

/** Reads persisted evidence only. Never imports runtime executors or store upserts. */
export async function readAutocarMetrics(context: MetricsContext, asOf: string) {
  const subject = await resolveMetricsSubject(context);
  try {
    const autocar = createAutocarMetricsClient();
    const evidence = await autocar.rpc('read_store_autocar_evidence_v1', {
      p_store_id: context.store.id, p_as_of: asOf
    });
    if (evidence.error || !evidence.data || evidence.data.store_id !== context.store.id) throw new Error('Unavailable evidence');
    const result = await context.supabase.rpc('read_store_autocar_metrics_v1', {
      p_store_id: context.store.id, p_actor_profile_id: context.profile.id,
      p_subject_user_id: subject, p_as_of: asOf, p_evidence: evidence.data
    });
    if (result.error || !result.data) throw new Error('Unavailable reconciliation');
    return result.data;
  } catch {
    // A missing migration or environment cannot be represented as zero activity.
    return { available: false, reason: 'Evidências AUTOCAR indisponíveis neste ambiente.', crm_as_of: asOf, autocar_as_of: null, atomic_snapshot: false };
  }
}
