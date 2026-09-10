import manifest from './commercialMetricsHomologationManifest.json';

export const forbiddenMetricsRefs = ['wufikrdgyxrsszlbpfmv', 'icmwdggbvijexjgrvsbl', 'azszzdotbrczlhrmhrlw', 'hfzmzfhuhukmxkxbkxay'];
export const metricsBranch = 'fix/commercial-metrics-canonicalization-v1';
export type MetricsManifest = { branch: string; crmProjectRef: string | null; autocarProjectRef: string | null; approved: boolean };
export function homologationRequested(env: NodeJS.ProcessEnv = process.env) {
  return env.VERCEL_ENV !== 'production' && (env.COMMERCIAL_METRICS_HOMOLOGATION_ENABLED === 'true' || env.NEXT_PUBLIC_COMMERCIAL_METRICS_HOMOLOGATION_ENABLED === 'true' || env.VERCEL_GIT_COMMIT_REF === metricsBranch);
}
export function projectRef(url: string | undefined) {
  const parsed = new URL(url || '');
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.port || parsed.search || parsed.hash || parsed.pathname !== '/' || !/^[a-z]{20}\.supabase\.co$/.test(parsed.hostname)) throw new Error('Invalid homologation URL');
  return parsed.hostname.split('.')[0];
}
export function validateMetricsHomologation(env: NodeJS.ProcessEnv = process.env, approved: MetricsManifest = manifest) {
  if (env.VERCEL_ENV !== 'preview' || env.NEXT_PUBLIC_VERCEL_ENV !== 'preview' || env.COMMERCIAL_METRICS_HOMOLOGATION_ENABLED !== 'true' || env.NEXT_PUBLIC_COMMERCIAL_METRICS_HOMOLOGATION_ENABLED !== 'true' || env.VERCEL_GIT_COMMIT_REF !== metricsBranch || approved.branch !== metricsBranch || !approved.approved) throw new Error('Homologation is not authorized');
  const crm = projectRef(env.NEXT_PUBLIC_SUPABASE_URL);
  const autocar = projectRef(env.AUTOCAR_METRICS_SUPABASE_URL);
  if (crm === autocar || [crm, autocar].some(ref => forbiddenMetricsRefs.includes(ref)) || crm !== approved.crmProjectRef || autocar !== approved.autocarProjectRef || crm !== env.CRM_METRICS_EXPECTED_PROJECT_REF || autocar !== env.AUTOCAR_METRICS_EXPECTED_PROJECT_REF) throw new Error('Invalid homologation project boundary');
  if (!env.SUPABASE_SERVICE_ROLE_KEY || !env.NEXT_PUBLIC_SUPABASE_ANON_KEY || !env.AUTOCAR_METRICS_SUPABASE_SERVICE_ROLE_KEY) throw new Error('Missing homologation credentials');
  return { crm, autocar };
}
export function homologationRouteAllowed(path: string, method: string) {
  if (!['GET','HEAD'].includes(method)) return false;
  if (['/login','/logout','/api/store/portal/context','/api/store/portal/dashboard','/api/store/portal/pipeline','/favicon.ico'].includes(path)) return true;
  return /^\/loja\/store-(alpha|beta)(\/pipeline)?\/?$/.test(path) || /^\/_next\/static\/[a-zA-Z0-9_./%+-]+$/.test(path);
}
export function restrictedMetricsFetch(hosts: string[], transport: typeof fetch = fetch): typeof fetch {
  return async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.protocol !== 'https:' || url.username || url.password || url.port || !hosts.includes(url.hostname) || !['/rest/v1/rpc/read_store_autocar_evidence_v1','/rest/v1/rpc/read_store_commercial_metrics_v1','/rest/v1/rpc/read_store_autocar_metrics_v1'].includes(url.pathname)) throw new Error('Blocked homologation request');
    const response = await transport(input, { ...init, redirect: 'error' });
    return response;
  };
}

export function restrictedCrmFetch(host: string, transport: typeof fetch = fetch): typeof fetch {
  return async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const method = (init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
    const reads = /^\/rest\/v1\/(users|stores|leads|sales|lead_activity_logs|whatsapp_conversations|whatsapp_messages|whatsapp_contacts|store_whatsapp_integrations)$/.test(url.pathname) && ['GET','HEAD'].includes(method);
    const rpc = ['/rest/v1/rpc/read_store_commercial_metrics_v1','/rest/v1/rpc/read_store_autocar_metrics_v1'].includes(url.pathname) && method === 'POST';
    const auth = ['/auth/v1/user','/auth/v1/token','/auth/v1/logout'].includes(url.pathname) && ['GET','POST'].includes(method);
    if (url.protocol !== 'https:' || url.hostname !== host || url.port || url.username || url.password || !(reads || rpc || auth)) throw new Error('Blocked CRM homologation request');
    return transport(input, { ...init, redirect: 'error' });
  };
}
