const SUPABASE_PROJECT_REF_PATTERN = /^[a-z0-9]{20}$/;

function explicitTrue(value: unknown) {
  return String(value || '').trim().toLowerCase() === 'true';
}

export function supabaseProjectRef(value: unknown) {
  try {
    const hostname = new URL(String(value || '')).hostname.toLowerCase();
    const [projectRef, ...suffix] = hostname.split('.');
    if (suffix.join('.') !== 'supabase.co') return '';
    return SUPABASE_PROJECT_REF_PATTERN.test(projectRef) ? projectRef : '';
  } catch {
    return '';
  }
}

export type BillingRuntimeSafety = {
  environmentName: string;
  vercelEnvironment: string;
  actualProjectRef: string;
  allowedProjectRef: string;
  projectMatches: boolean;
  previewEnvironment: boolean;
  credentialsConfigured: boolean;
  readsEnabled: boolean;
  mutationsEnabled: boolean;
  trialStartEnabled: boolean;
  reason: 'ready' | 'preview_only' | 'target_not_configured' | 'target_mismatch' | 'credentials_missing';
};

export function readBillingRuntimeSafety(
  environment: NodeJS.ProcessEnv = process.env
): BillingRuntimeSafety {
  const actualProjectRef = supabaseProjectRef(environment.NEXT_PUBLIC_SUPABASE_URL);
  const allowedProjectRef = String(environment.BILLING_ALLOWED_SUPABASE_PROJECT_REF || '')
    .trim()
    .toLowerCase();
  const vercelEnvironment = String(environment.VERCEL_ENV || '').trim().toLowerCase();
  const previewEnvironment = vercelEnvironment === 'preview';
  const projectMatches = Boolean(actualProjectRef)
    && Boolean(allowedProjectRef)
    && actualProjectRef === allowedProjectRef;
  const credentialsConfigured = Boolean(
    String(environment.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim()
    && String(environment.SUPABASE_SERVICE_ROLE_KEY || '').trim()
  );

  let reason: BillingRuntimeSafety['reason'] = 'ready';
  if (!previewEnvironment) reason = 'preview_only';
  else if (!allowedProjectRef || !SUPABASE_PROJECT_REF_PATTERN.test(allowedProjectRef)) {
    reason = 'target_not_configured';
  } else if (!projectMatches) reason = 'target_mismatch';
  else if (!credentialsConfigured) reason = 'credentials_missing';

  const readsEnabled = reason === 'ready';
  const mutationsEnabled = readsEnabled
    && explicitTrue(environment.BILLING_STAGE6_MUTATIONS_ENABLED);
  return {
    environmentName: String(environment.BILLING_RUNTIME_ENVIRONMENT_NAME || 'saas-dev').trim().slice(0, 80),
    vercelEnvironment,
    actualProjectRef,
    allowedProjectRef,
    projectMatches,
    previewEnvironment,
    credentialsConfigured,
    readsEnabled,
    mutationsEnabled,
    trialStartEnabled: mutationsEnabled && explicitTrue(environment.BILLING_TRIAL_START_ENABLED),
    reason
  };
}
