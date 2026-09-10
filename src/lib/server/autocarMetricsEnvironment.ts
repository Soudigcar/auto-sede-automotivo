import { createClient } from '@supabase/supabase-js';
import { validateMetricsHomologation, restrictedMetricsFetch } from '../commercialMetricsHomologation';
import { createAutocarRuntimeClient, resolveAutocarRuntimeTarget } from './autocar/runtimeEnvironment';

/** Metrics only: operational executors must never import this module. */
export function createAutocarMetricsClient(env: NodeJS.ProcessEnv = process.env) {
  if (env.VERCEL_ENV === 'production') return createAutocarRuntimeClient(resolveAutocarRuntimeTarget(env));
  const refs = validateMetricsHomologation(env);
  return createClient(env.AUTOCAR_METRICS_SUPABASE_URL!, env.AUTOCAR_METRICS_SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: restrictedMetricsFetch([`${refs.autocar}.supabase.co`]) }
  });
}
