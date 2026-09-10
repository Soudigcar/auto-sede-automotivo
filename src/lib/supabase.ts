import { createBrowserClient } from '@supabase/ssr';

import manifest from './commercialMetricsHomologationManifest.json';
import { projectRef, forbiddenMetricsRefs, restrictedCrmFetch } from './commercialMetricsHomologation';

export function createClient() {
  const isolated = process.env.NEXT_PUBLIC_VERCEL_ENV === 'preview' && process.env.NEXT_PUBLIC_COMMERCIAL_METRICS_HOMOLOGATION_ENABLED === 'true';
  let host: string | null = null;
  if (isolated) {
    const ref = projectRef(process.env.NEXT_PUBLIC_SUPABASE_URL);
    if (!manifest.approved || ref !== manifest.crmProjectRef || forbiddenMetricsRefs.includes(ref)) throw new Error('Unauthorized browser database');
    host = `${ref}.supabase.co`;
  }
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
    host ? { global: { fetch: restrictedCrmFetch(host) } } : undefined
  );
}
