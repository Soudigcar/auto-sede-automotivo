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

export type BillingDeploymentEnvironment = 'preview' | 'production' | 'unsupported';

export function billingDeploymentEnvironment(
  environment: NodeJS.ProcessEnv = process.env
): BillingDeploymentEnvironment {
  const value = String(environment.VERCEL_ENV || '').trim().toLowerCase();
  if (value === 'preview' || value === 'production') return value;
  return 'unsupported';
}

type BillingEnvironmentConfiguration = {
  allowedProjectRef: string;
  environmentName: string;
  readsRequested: boolean;
  mutationsRequested: boolean;
  enforcementRequested: boolean;
  registrationWritesRequested: boolean;
  stage13ActivationRequested: boolean;
};

function environmentConfiguration(
  environment: NodeJS.ProcessEnv,
  deploymentEnvironment: BillingDeploymentEnvironment
): BillingEnvironmentConfiguration {
  if (deploymentEnvironment === 'production') {
    return {
      allowedProjectRef: String(environment.BILLING_PRODUCTION_ALLOWED_SUPABASE_PROJECT_REF || '')
        .trim()
        .toLowerCase(),
      environmentName: String(environment.BILLING_PRODUCTION_ENVIRONMENT_NAME || 'production')
        .trim()
        .slice(0, 80),
      readsRequested: explicitTrue(environment.BILLING_PRODUCTION_READS_ENABLED),
      mutationsRequested: explicitTrue(environment.BILLING_PRODUCTION_MUTATIONS_ENABLED),
      enforcementRequested: explicitTrue(environment.BILLING_PRODUCTION_ENFORCEMENT_ENABLED),
      registrationWritesRequested: false,
      stage13ActivationRequested: false
    };
  }

  if (deploymentEnvironment === 'preview') {
    return {
      allowedProjectRef: String(environment.BILLING_PREVIEW_ALLOWED_SUPABASE_PROJECT_REF || '')
        .trim()
        .toLowerCase(),
      environmentName: String(environment.BILLING_PREVIEW_ENVIRONMENT_NAME || 'saas-dev')
        .trim()
        .slice(0, 80),
      readsRequested: explicitTrue(environment.BILLING_PREVIEW_READS_ENABLED),
      mutationsRequested: explicitTrue(environment.BILLING_PREVIEW_MUTATIONS_ENABLED),
      enforcementRequested: explicitTrue(environment.BILLING_PREVIEW_ENFORCEMENT_ENABLED),
      registrationWritesRequested: explicitTrue(
        environment.BILLING_PREVIEW_REGISTRATION_WRITES_ENABLED
      ),
      stage13ActivationRequested: explicitTrue(
        environment.BILLING_PREVIEW_STAGE13_ACTIVATION_ENABLED
      )
    };
  }

  return {
    allowedProjectRef: '',
    environmentName: 'unsupported',
    readsRequested: false,
    mutationsRequested: false,
    enforcementRequested: false,
    registrationWritesRequested: false,
    stage13ActivationRequested: false
  };
}

export type BillingRuntimeSafety = {
  environmentName: string;
  vercelEnvironment: string;
  deploymentEnvironment: BillingDeploymentEnvironment;
  actualProjectRef: string;
  allowedProjectRef: string;
  projectMatches: boolean;
  previewEnvironment: boolean;
  productionEnvironment: boolean;
  credentialsConfigured: boolean;
  readsRequested: boolean;
  mutationsRequested: boolean;
  enforcementRequested: boolean;
  registrationWritesRequested: boolean;
  stage13ActivationRequested: boolean;
  readsEnabled: boolean;
  mutationsEnabled: boolean;
  enforcementEnabled: boolean;
  registrationWritesEnabled: boolean;
  stage13ActivationEnabled: boolean;
  trialStartEnabled: boolean;
  reason:
    | 'ready'
    | 'environment_unsupported'
    | 'reads_disabled'
    | 'target_not_configured'
    | 'target_mismatch'
    | 'credentials_missing';
};

export function readBillingRuntimeSafety(
  environment: NodeJS.ProcessEnv = process.env
): BillingRuntimeSafety {
  const actualProjectRef = supabaseProjectRef(environment.NEXT_PUBLIC_SUPABASE_URL);
  const vercelEnvironment = String(environment.VERCEL_ENV || '').trim().toLowerCase();
  const deploymentEnvironment = billingDeploymentEnvironment(environment);
  const configuration = environmentConfiguration(environment, deploymentEnvironment);
  const projectMatches = Boolean(actualProjectRef)
    && Boolean(configuration.allowedProjectRef)
    && actualProjectRef === configuration.allowedProjectRef;
  const credentialsConfigured = Boolean(
    String(environment.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim()
    && String(environment.SUPABASE_SERVICE_ROLE_KEY || '').trim()
  );

  let reason: BillingRuntimeSafety['reason'] = 'ready';
  if (deploymentEnvironment === 'unsupported') reason = 'environment_unsupported';
  else if (!configuration.readsRequested) reason = 'reads_disabled';
  else if (
    !configuration.allowedProjectRef
    || !SUPABASE_PROJECT_REF_PATTERN.test(configuration.allowedProjectRef)
  ) {
    reason = 'target_not_configured';
  } else if (!projectMatches) reason = 'target_mismatch';
  else if (!credentialsConfigured) reason = 'credentials_missing';

  const readsEnabled = reason === 'ready';
  const mutationsEnabled = readsEnabled && configuration.mutationsRequested;
  const enforcementEnabled = readsEnabled && configuration.enforcementRequested;
  const registrationWritesEnabled = readsEnabled
    && deploymentEnvironment === 'preview'
    && configuration.registrationWritesRequested;
  const stage13ActivationEnabled = readsEnabled
    && deploymentEnvironment === 'preview'
    && configuration.stage13ActivationRequested
    && !configuration.mutationsRequested
    && !configuration.enforcementRequested
    && explicitTrue(environment.BILLING_TRIAL_START_ENABLED);

  return {
    environmentName: configuration.environmentName,
    vercelEnvironment,
    deploymentEnvironment,
    actualProjectRef,
    allowedProjectRef: configuration.allowedProjectRef,
    projectMatches,
    previewEnvironment: deploymentEnvironment === 'preview',
    productionEnvironment: deploymentEnvironment === 'production',
    credentialsConfigured,
    readsRequested: configuration.readsRequested,
    mutationsRequested: configuration.mutationsRequested,
    enforcementRequested: configuration.enforcementRequested,
    registrationWritesRequested: configuration.registrationWritesRequested,
    stage13ActivationRequested: configuration.stage13ActivationRequested,
    readsEnabled,
    mutationsEnabled,
    enforcementEnabled,
    registrationWritesEnabled,
    stage13ActivationEnabled,
    trialStartEnabled: (mutationsEnabled || stage13ActivationEnabled)
      && explicitTrue(environment.BILLING_TRIAL_START_ENABLED),
    reason
  };
}
