import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export const AUTOCAR_DEV_REF = 'azszzdotbrczlhrmhrlw';
export const AUTOCAR_PRODUCTION_REF = 'icmwdggbvijexjgrvsbl';
export const AUTOCAR_PRODUCTION_SCHEMA_VERSION = 2;

/**
 * Deliberately code-controlled. While false, Vercel Production keeps the
 * already validated autocar-dev runtime as its primary source and mirrors
 * runtime writes to AUTOCAR Production. Enabling the final cutover requires a
 * new code change and a separately authorized Production deployment.
 */
export const AUTOCAR_RUNTIME_CUTOVER_CODE_ENABLED = false;

export type AutocarRuntimeSchema = 'dev_v1' | 'production_v2';
export type AutocarRuntimeTransitionMode =
  | 'development_dev'
  | 'pre_cutover_dev_shadow'
  | 'cutover_production';

export type AutocarRuntimeTarget = {
  vercelEnvironment: string;
  projectRef: string;
  schema: AutocarRuntimeSchema;
  transitionMode: AutocarRuntimeTransitionMode;
  url: string;
  serviceRoleKey: string;
};

export type AutocarExternalReferenceColumns = {
  memory: {
    conversationId: 'conversation_id' | 'production_conversation_id';
    leadId: 'lead_id' | 'production_lead_id';
    lastProcessedMessageId: 'last_processed_message_id' | 'last_processed_production_message_id';
  };
  runs: {
    conversationId: 'conversation_id' | 'production_conversation_id';
    leadId: 'lead_id' | 'production_lead_id';
    triggerMessageId: 'trigger_message_id' | 'production_trigger_message_id';
  };
  events: {
    conversationId: 'conversation_id' | 'production_conversation_id';
    leadId: 'lead_id' | 'production_lead_id';
  };
  approvals: {
    conversationId: 'conversation_id' | 'production_conversation_id';
    leadId: 'lead_id' | 'production_lead_id';
    resolvedBy: 'resolved_by' | 'resolved_by_profile_id';
  };
};

function clean(value: unknown) {
  return String(value || '').trim();
}

export function autocarProjectRefFromUrl(rawUrl: string) {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'https:') return '';
    if (!parsed.hostname.endsWith('.supabase.co')) return '';
    return parsed.hostname.split('.')[0] || '';
  } catch {
    return '';
  }
}

type AutocarRuntimeCredentials = {
  url: string;
  serviceRoleKey: string;
};

function devCredentialsFromEnvironment(environment: NodeJS.ProcessEnv): AutocarRuntimeCredentials {
  const modern = {
    url: clean(environment.AUTOCAR_DEV_SUPABASE_URL),
    serviceRoleKey: clean(environment.AUTOCAR_DEV_SUPABASE_SERVICE_ROLE_KEY)
  };
  if (modern.url && modern.serviceRoleKey) return modern;

  const legacy = {
    url: clean(environment.AUTOCAR_KNOWLEDGE_SUPABASE_URL),
    serviceRoleKey: clean(environment.AUTOCAR_KNOWLEDGE_SUPABASE_SERVICE_ROLE_KEY)
  };
  if (legacy.url && legacy.serviceRoleKey) return legacy;

  return { url: '', serviceRoleKey: '' };
}

function productionCredentialsFromEnvironment(environment: NodeJS.ProcessEnv): AutocarRuntimeCredentials {
  return {
    url: clean(environment.AUTOCAR_SUPABASE_URL),
    serviceRoleKey: clean(environment.AUTOCAR_SUPABASE_SERVICE_ROLE_KEY)
  };
}

/**
 * Pure selector used by tests and by the code-controlled runtime resolver.
 * It never falls back from a requested Production cutover to DEV. Conversely,
 * pre-cutover Production intentionally selects DEV and requires the exact DEV
 * project ref; that is an explicit transition mode, not a fallback.
 */
export function resolveAutocarRuntimeTargetForCutoverMode(
  environment: NodeJS.ProcessEnv,
  cutoverEnabled: boolean
): AutocarRuntimeTarget {
  const vercelEnvironment = clean(environment.VERCEL_ENV) || 'development';
  const productionDeployment = vercelEnvironment === 'production';
  const productionCutover = productionDeployment && cutoverEnabled;
  const credentials = productionCutover
    ? productionCredentialsFromEnvironment(environment)
    : devCredentialsFromEnvironment(environment);

  if (!credentials.url || !credentials.serviceRoleKey) {
    if (productionCutover) {
      throw new Error(
        'AUTOCAR Production não configurada: AUTOCAR_SUPABASE_URL e AUTOCAR_SUPABASE_SERVICE_ROLE_KEY são obrigatórias para o cutover.'
      );
    }
    if (productionDeployment) {
      throw new Error(
        'AUTOCAR DEV não configurada para o pré-cutover; não haverá fallback silencioso para AUTOCAR Production.'
      );
    }
    throw new Error('AUTOCAR DEV não configurada para este ambiente.');
  }

  const projectRef = autocarProjectRefFromUrl(credentials.url);
  if (!projectRef) throw new Error('URL do Supabase AUTOCAR inválida.');

  if (productionCutover) {
    if (projectRef === AUTOCAR_DEV_REF) {
      throw new Error('SAFE CORE: cutover Production não pode executar AUTOCAR apontando para autocar-dev.');
    }
    if (projectRef !== AUTOCAR_PRODUCTION_REF) {
      throw new Error(`SAFE CORE: cutover Production recebeu um projeto AUTOCAR não autorizado (${projectRef}).`);
    }
    return {
      vercelEnvironment,
      projectRef,
      schema: 'production_v2',
      transitionMode: 'cutover_production',
      url: credentials.url,
      serviceRoleKey: credentials.serviceRoleKey
    };
  }

  if (projectRef !== AUTOCAR_DEV_REF) {
    const phase = productionDeployment ? 'Production pré-cutover' : vercelEnvironment;
    throw new Error(`SAFE CORE: ${phase} deve usar exclusivamente autocar-dev (${AUTOCAR_DEV_REF}).`);
  }

  return {
    vercelEnvironment,
    projectRef,
    schema: 'dev_v1',
    transitionMode: productionDeployment ? 'pre_cutover_dev_shadow' : 'development_dev',
    url: credentials.url,
    serviceRoleKey: credentials.serviceRoleKey
  };
}

export function resolveAutocarRuntimeTarget(environment: NodeJS.ProcessEnv = process.env): AutocarRuntimeTarget {
  return resolveAutocarRuntimeTargetForCutoverMode(
    environment,
    AUTOCAR_RUNTIME_CUTOVER_CODE_ENABLED
  );
}

export type AutocarRuntimePublicDescriptor = {
  vercel_environment: string;
  runtime_environment: 'autocar-dev' | 'autocar-production';
  database_state: 'autocar-dev-isolated' | 'autocar-production-v2';
  project_ref: string;
  schema: AutocarRuntimeSchema;
  transition_mode: AutocarRuntimeTransitionMode;
  cutover_code_enabled: boolean;
};

export function autocarRuntimePublicDescriptor(
  environment: NodeJS.ProcessEnv = process.env
): AutocarRuntimePublicDescriptor {
  const target = resolveAutocarRuntimeTarget(environment);
  const production = target.schema === 'production_v2';

  return {
    vercel_environment: target.vercelEnvironment,
    runtime_environment: production ? 'autocar-production' : 'autocar-dev',
    database_state: production ? 'autocar-production-v2' : 'autocar-dev-isolated',
    project_ref: target.projectRef,
    schema: target.schema,
    transition_mode: target.transitionMode,
    cutover_code_enabled: AUTOCAR_RUNTIME_CUTOVER_CODE_ENABLED
  };
}

export function createAutocarRuntimeClient(target: AutocarRuntimeTarget): SupabaseClient {
  return createClient(target.url, target.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

export function getAutocarRuntimeClient(environment: NodeJS.ProcessEnv = process.env): SupabaseClient {
  return createAutocarRuntimeClient(resolveAutocarRuntimeTarget(environment));
}

export function autocarExternalReferenceColumns(schema: AutocarRuntimeSchema): AutocarExternalReferenceColumns {
  if (schema === 'production_v2') {
    return {
      memory: {
        conversationId: 'production_conversation_id',
        leadId: 'production_lead_id',
        lastProcessedMessageId: 'last_processed_production_message_id'
      },
      runs: {
        conversationId: 'production_conversation_id',
        leadId: 'production_lead_id',
        triggerMessageId: 'production_trigger_message_id'
      },
      events: {
        conversationId: 'production_conversation_id',
        leadId: 'production_lead_id'
      },
      approvals: {
        conversationId: 'production_conversation_id',
        leadId: 'production_lead_id',
        resolvedBy: 'resolved_by_profile_id'
      }
    };
  }

  return {
    memory: {
      conversationId: 'conversation_id',
      leadId: 'lead_id',
      lastProcessedMessageId: 'last_processed_message_id'
    },
    runs: {
      conversationId: 'conversation_id',
      leadId: 'lead_id',
      triggerMessageId: 'trigger_message_id'
    },
    events: {
      conversationId: 'conversation_id',
      leadId: 'lead_id'
    },
    approvals: {
      conversationId: 'conversation_id',
      leadId: 'lead_id',
      resolvedBy: 'resolved_by'
    }
  };
}

export function currentAutocarExternalReferenceColumns(environment: NodeJS.ProcessEnv = process.env) {
  return autocarExternalReferenceColumns(resolveAutocarRuntimeTarget(environment).schema);
}

export type AutocarExternalExecutionGate = {
  allowed: boolean;
  reason: string;
  project_ref: string | null;
  environment: string;
  schema_version: number | null;
  live_enabled: boolean;
  transition_mode: AutocarRuntimeTransitionMode;
};

export function evaluateAutocarProductionRuntimeConfig(
  data: { environment?: unknown; schema_version?: unknown; live_enabled?: unknown },
  target: AutocarRuntimeTarget
): AutocarExternalExecutionGate {
  const schemaVersion = Number(data?.schema_version || 0);
  const liveEnabled = data?.live_enabled === true;
  const databaseEnvironment = clean(data?.environment);

  if (databaseEnvironment !== 'production') {
    return {
      allowed: false,
      reason: 'SAFE CORE: banco AUTOCAR não se identifica como production.',
      project_ref: target.projectRef,
      environment: target.vercelEnvironment,
      schema_version: schemaVersion || null,
      live_enabled: liveEnabled,
      transition_mode: target.transitionMode
    };
  }

  if (schemaVersion !== AUTOCAR_PRODUCTION_SCHEMA_VERSION) {
    return {
      allowed: false,
      reason: `SAFE CORE: schema AUTOCAR incompatível. Esperado ${AUTOCAR_PRODUCTION_SCHEMA_VERSION}, recebido ${schemaVersion || 'desconhecido'}.`,
      project_ref: target.projectRef,
      environment: target.vercelEnvironment,
      schema_version: schemaVersion || null,
      live_enabled: liveEnabled,
      transition_mode: target.transitionMode
    };
  }

  if (!liveEnabled) {
    return {
      allowed: false,
      reason: 'AUTOCAR Production está em shadow/cutover seguro: live_enabled=false.',
      project_ref: target.projectRef,
      environment: target.vercelEnvironment,
      schema_version: schemaVersion,
      live_enabled: false,
      transition_mode: target.transitionMode
    };
  }

  return {
    allowed: true,
    reason: 'AUTOCAR Production validada para execução externa LIVE.',
    project_ref: target.projectRef,
    environment: target.vercelEnvironment,
    schema_version: schemaVersion,
    live_enabled: true,
    transition_mode: target.transitionMode
  };
}

export async function evaluateAutocarExternalExecutionGate(
  environment: NodeJS.ProcessEnv = process.env
): Promise<AutocarExternalExecutionGate> {
  const vercelEnvironment = clean(environment.VERCEL_ENV) || 'development';

  if (vercelEnvironment !== 'production') {
    return {
      allowed: false,
      reason: `Execução externa AUTOCAR bloqueada em ${vercelEnvironment}; somente Vercel Production pode enviar ações LIVE.`,
      project_ref: null,
      environment: vercelEnvironment,
      schema_version: null,
      live_enabled: false,
      transition_mode: 'development_dev'
    };
  }

  let target: AutocarRuntimeTarget;
  try {
    target = resolveAutocarRuntimeTarget(environment);
  } catch (error: any) {
    return {
      allowed: false,
      reason: String(error?.message || error || 'Configuração AUTOCAR inválida.').slice(0, 500),
      project_ref: null,
      environment: vercelEnvironment,
      schema_version: null,
      live_enabled: false,
      transition_mode: 'pre_cutover_dev_shadow'
    };
  }

  if (target.transitionMode === 'pre_cutover_dev_shadow') {
    return {
      allowed: true,
      reason: 'Pré-cutover controlado: Vercel Production preserva explicitamente o runtime atual em autocar-dev; AUTOCAR Production continua somente como Shadow Mirror.',
      project_ref: target.projectRef,
      environment: vercelEnvironment,
      schema_version: null,
      live_enabled: false,
      transition_mode: target.transitionMode
    };
  }

  if (target.transitionMode !== 'cutover_production') {
    return {
      allowed: false,
      reason: 'SAFE CORE: modo de transição AUTOCAR inválido para execução externa em Production.',
      project_ref: target.projectRef,
      environment: vercelEnvironment,
      schema_version: null,
      live_enabled: false,
      transition_mode: target.transitionMode
    };
  }

  const client = createAutocarRuntimeClient(target);

  try {
    const { data, error } = await client
      .from('autocar_runtime_config')
      .select('environment,schema_version,live_enabled')
      .eq('id', 'primary')
      .single();

    if (error) throw error;
    return evaluateAutocarProductionRuntimeConfig(data || {}, target);
  } catch (error: any) {
    return {
      allowed: false,
      reason: `SAFE CORE: não foi possível validar o runtime AUTOCAR Production: ${String(error?.message || error || 'erro desconhecido').slice(0, 350)}`,
      project_ref: target.projectRef,
      environment: vercelEnvironment,
      schema_version: null,
      live_enabled: false,
      transition_mode: target.transitionMode
    };
  }
}

export type AutocarRuntimePublicStatus = AutocarRuntimePublicDescriptor & {
  schema_version: number | null;
  live_enabled: boolean;
  external_execution_allowed: boolean;
  external_execution_reason: string;
  automatic_replies_enabled: boolean;
  automatic_replies_reason: string;
  autopilot_preview_only: boolean;
  webhook_hooked: boolean | null;
  webhook_status: 'preview-disabled' | 'server-secret-missing' | 'server-configured-not-externally-verified';
};

export async function getAutocarRuntimePublicStatus(
  environment: NodeJS.ProcessEnv = process.env
): Promise<AutocarRuntimePublicStatus> {
  const descriptor = autocarRuntimePublicDescriptor(environment);
  const gate = await evaluateAutocarExternalExecutionGate(environment);
  const production = descriptor.vercel_environment === 'production';
  const webhookServerConfigured = Boolean(clean(environment.EVOLUTION_WEBHOOK_SECRET));
  const automaticRepliesEnabled = gate.allowed && webhookServerConfigured;

  const webhookStatus = !production
    ? 'preview-disabled'
    : webhookServerConfigured
      ? 'server-configured-not-externally-verified'
      : 'server-secret-missing';

  const automaticRepliesReason = !gate.allowed
    ? gate.reason
    : webhookServerConfigured
      ? 'SAFE CORE e configuração server-side permitem execução; a ligação externa do webhook deve ser confirmada operacionalmente.'
      : 'Execução bloqueada: segredo server-side do webhook Evolution não está configurado.';

  return {
    ...descriptor,
    schema_version: gate.schema_version,
    live_enabled: gate.live_enabled,
    external_execution_allowed: gate.allowed,
    external_execution_reason: gate.reason,
    automatic_replies_enabled: automaticRepliesEnabled,
    automatic_replies_reason: automaticRepliesReason,
    autopilot_preview_only: !automaticRepliesEnabled,
    webhook_hooked: !production ? false : webhookServerConfigured ? null : false,
    webhook_status: webhookStatus
  };
}
