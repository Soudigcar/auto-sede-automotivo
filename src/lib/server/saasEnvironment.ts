const BLOCKED_SUPABASE_REFS = new Set([
  'wufikrdgyxrsszlbpfmv', // CRM Production
  'azszzdotbrczlhrmhrlw', // autocar-dev (currently participates in LIVE runtime)
  'icmwdggbvijexjgrvsbl'  // AUTOCAR Production
]);

export type SaasWriteEnvironment = {
  enabled: boolean;
  projectRef: string;
  reason?: string;
};

export function extractSupabaseProjectRef(rawUrl: string) {
  try {
    const hostname = new URL(rawUrl).hostname.toLowerCase();
    const match = hostname.match(/^([a-z0-9]+)\.supabase\.co$/);
    return match?.[1] || '';
  } catch {
    return '';
  }
}

export function evaluateSaasWriteEnvironment(env: NodeJS.ProcessEnv = process.env): SaasWriteEnvironment {
  if (env.SAAS_ONBOARDING_WRITE_ENABLED !== 'true') {
    return { enabled: false, projectRef: '', reason: 'SAAS_ONBOARDING_WRITE_ENABLED não está habilitado.' };
  }

  if (env.VERCEL_ENV === 'production') {
    return { enabled: false, projectRef: '', reason: 'Onboarding SaaS fase 1 não pode gravar em Vercel Production.' };
  }

  const projectRef = extractSupabaseProjectRef(env.NEXT_PUBLIC_SUPABASE_URL || '');
  if (!projectRef) {
    return { enabled: false, projectRef: '', reason: 'Projeto Supabase não identificado.' };
  }

  if (BLOCKED_SUPABASE_REFS.has(projectRef)) {
    return { enabled: false, projectRef, reason: 'Este projeto Supabase é protegido contra gravações da Fase 1 SaaS.' };
  }

  return { enabled: true, projectRef };
}

export function requireSaasWriteEnvironment(env: NodeJS.ProcessEnv = process.env) {
  const state = evaluateSaasWriteEnvironment(env);
  if (!state.enabled) {
    throw new Error(state.reason || 'Ambiente SaaS não autorizado para gravação.');
  }
  return state;
}
