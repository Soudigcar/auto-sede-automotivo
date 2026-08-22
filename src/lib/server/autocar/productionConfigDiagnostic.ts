import { createClient } from '@supabase/supabase-js';
import { AUTOCAR_RUNTIME_CUTOVER_CODE_ENABLED } from './runtimeEnvironment';

export const AUTOCAR_PRODUCTION_DIAGNOSTIC_EXPECTED_REF = 'icmwdggbvijexjgrvsbl';
export const AUTOCAR_PRODUCTION_DIAGNOSTIC_EXPECTED_SCHEMA_VERSION = 2;

export type AutocarProductionTransitionState =
  | 'pre_cutover_dev_shadow'
  | 'armed_pre_cutover'
  | 'cutover_production'
  | 'invalid_transition_state'
  | 'unknown';

type RuntimeConfigRow = {
  environment?: unknown;
  schema_version?: unknown;
  live_enabled?: unknown;
};

export type AutocarProductionRuntimeConfigReader = (credentials: {
  url: string;
  serviceRoleKey: string;
}) => Promise<RuntimeConfigRow | null>;

export type AutocarProductionConfigDiagnostic = {
  status: 'ok' | 'preview_fail_closed' | 'degraded';
  authoritative: boolean;
  service: 'autocar-production-config';
  vercel_environment: string;
  expected_project_ref: typeof AUTOCAR_PRODUCTION_DIAGNOSTIC_EXPECTED_REF;
  configured_project_ref: string | null;
  schema_version: number | null;
  live_enabled: boolean | null;
  cutover_code_enabled: boolean;
  transition_state: AutocarProductionTransitionState;
  reason:
    | 'pre_cutover_configuration_valid'
    | 'armed_pre_cutover_configuration_valid'
    | 'cutover_configuration_valid'
    | 'preview_is_not_authoritative'
    | 'configuration_missing'
    | 'invalid_supabase_url'
    | 'unexpected_project_ref'
    | 'service_role_validation_failed'
    | 'runtime_config_invalid';
  checks: {
    production_environment: boolean;
    url_configured: boolean;
    service_role_configured: boolean;
    project_ref_matches: boolean;
    service_role_valid: boolean;
    database_environment_matches: boolean;
    schema_version_matches: boolean;
    live_enabled_is_false: boolean;
    live_enabled_matches_transition: boolean;
  };
};

function clean(value: unknown) {
  return String(value ?? '').trim();
}

export function autocarProductionProjectRefFromUrl(rawUrl: string) {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'https:') return '';
    if (!parsed.hostname.endsWith('.supabase.co')) return '';
    return parsed.hostname.split('.')[0] || '';
  } catch {
    return '';
  }
}

async function defaultRuntimeConfigReader(credentials: {
  url: string;
  serviceRoleKey: string;
}): Promise<RuntimeConfigRow | null> {
  const client = createClient(credentials.url, credentials.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const { data, error } = await client
    .from('autocar_runtime_config')
    .select('environment,schema_version,live_enabled')
    .eq('id', 'primary')
    .single();

  if (error || !data) throw new Error('runtime_config_unavailable');
  return data;
}

function transitionState(
  cutoverCodeEnabled: boolean,
  liveEnabled: boolean | null
): AutocarProductionTransitionState {
  if (liveEnabled === null) return 'unknown';
  if (!cutoverCodeEnabled && liveEnabled === false) return 'pre_cutover_dev_shadow';
  if (!cutoverCodeEnabled && liveEnabled === true) return 'armed_pre_cutover';
  if (cutoverCodeEnabled && liveEnabled === true) return 'cutover_production';
  return 'invalid_transition_state';
}

function baseDiagnostic(
  vercelEnvironment: string,
  cutoverCodeEnabled: boolean
): AutocarProductionConfigDiagnostic {
  return {
    status: 'degraded',
    authoritative: vercelEnvironment === 'production',
    service: 'autocar-production-config',
    vercel_environment: vercelEnvironment,
    expected_project_ref: AUTOCAR_PRODUCTION_DIAGNOSTIC_EXPECTED_REF,
    configured_project_ref: null,
    schema_version: null,
    live_enabled: null,
    cutover_code_enabled: cutoverCodeEnabled,
    transition_state: 'unknown',
    reason: 'configuration_missing',
    checks: {
      production_environment: vercelEnvironment === 'production',
      url_configured: false,
      service_role_configured: false,
      project_ref_matches: false,
      service_role_valid: false,
      database_environment_matches: false,
      schema_version_matches: false,
      live_enabled_is_false: false,
      live_enabled_matches_transition: false
    }
  };
}

export async function diagnoseAutocarProductionConfig(
  environment: NodeJS.ProcessEnv = process.env,
  readRuntimeConfig: AutocarProductionRuntimeConfigReader = defaultRuntimeConfigReader,
  cutoverCodeEnabled = AUTOCAR_RUNTIME_CUTOVER_CODE_ENABLED
): Promise<AutocarProductionConfigDiagnostic> {
  const vercelEnvironment = clean(environment.VERCEL_ENV) || 'development';
  const report = baseDiagnostic(vercelEnvironment, cutoverCodeEnabled);

  // Preview/Development must never consume or validate Production credentials.
  if (vercelEnvironment !== 'production') {
    return {
      ...report,
      status: 'preview_fail_closed',
      authoritative: false,
      reason: 'preview_is_not_authoritative'
    };
  }

  const url = clean(environment.AUTOCAR_SUPABASE_URL);
  const serviceRoleKey = clean(environment.AUTOCAR_SUPABASE_SERVICE_ROLE_KEY);
  report.checks.url_configured = Boolean(url);
  report.checks.service_role_configured = Boolean(serviceRoleKey);

  if (!url || !serviceRoleKey) return report;

  const configuredProjectRef = autocarProductionProjectRefFromUrl(url);
  report.configured_project_ref = configuredProjectRef || null;
  if (!configuredProjectRef) {
    report.reason = 'invalid_supabase_url';
    return report;
  }

  report.checks.project_ref_matches = configuredProjectRef === AUTOCAR_PRODUCTION_DIAGNOSTIC_EXPECTED_REF;
  if (!report.checks.project_ref_matches) {
    report.reason = 'unexpected_project_ref';
    return report;
  }

  let runtimeConfig: RuntimeConfigRow | null;
  try {
    runtimeConfig = await readRuntimeConfig({ url, serviceRoleKey });
  } catch {
    report.reason = 'service_role_validation_failed';
    return report;
  }

  if (!runtimeConfig) {
    report.reason = 'service_role_validation_failed';
    return report;
  }

  report.checks.service_role_valid = true;
  const databaseEnvironment = clean(runtimeConfig.environment);
  const schemaVersion = Number(runtimeConfig.schema_version || 0);
  const liveEnabled = typeof runtimeConfig.live_enabled === 'boolean'
    ? runtimeConfig.live_enabled
    : null;

  report.schema_version = schemaVersion || null;
  report.live_enabled = liveEnabled;
  report.transition_state = transitionState(cutoverCodeEnabled, liveEnabled);
  report.checks.database_environment_matches = databaseEnvironment === 'production';
  report.checks.schema_version_matches = schemaVersion === AUTOCAR_PRODUCTION_DIAGNOSTIC_EXPECTED_SCHEMA_VERSION;
  report.checks.live_enabled_is_false = liveEnabled === false;
  report.checks.live_enabled_matches_transition = report.transition_state !== 'invalid_transition_state'
    && report.transition_state !== 'unknown';

  const valid = report.checks.database_environment_matches
    && report.checks.schema_version_matches
    && report.checks.live_enabled_matches_transition;

  if (!valid) {
    report.reason = 'runtime_config_invalid';
    return report;
  }

  const reason = report.transition_state === 'pre_cutover_dev_shadow'
    ? 'pre_cutover_configuration_valid'
    : report.transition_state === 'armed_pre_cutover'
      ? 'armed_pre_cutover_configuration_valid'
      : 'cutover_configuration_valid';

  return {
    ...report,
    status: 'ok',
    reason
  };
}
