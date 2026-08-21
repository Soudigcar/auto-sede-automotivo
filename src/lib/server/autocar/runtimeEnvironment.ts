import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export const AUTOCAR_DEV_REF = 'azszzdotbrczlhrmhrlw';
export const AUTOCAR_PRODUCTION_REF = 'icmwdggbvijexjgrvsbl';
export const AUTOCAR_PRODUCTION_SCHEMA_VERSION = 2;

export type AutocarRuntimeSchema = 'dev_v1' | 'production_v2';

export type AutocarRuntimeTarget = {
  vercelEnvironment: string;
  projectRef: string;
  schema: AutocarRuntimeSchema;
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

function credentialsFromEnvironment(environment: NodeJS.ProcessEnv, production: boolean) {
  if (production) {
    return {
      url: clean(environment.AUTOCAR_SUPABASE_URL),
      serviceRoleKey: clean(environment.AUTOCAR_SUPABASE_SERVICE_ROLE_KEY)
    };
  }

  return {
    url: clean(environment.AUTOCAR_DEV_SUPABASE_URL) || clean(environment.AUTOCAR_KNOWLEDGE_SUPABASE_URL),
    serviceRoleKey:
      clean(environment.AUTOCAR_DEV_SUPABASE_SERVICE_ROLE_KEY)
      || clean(environment.AUTOCAR_KNOWLEDGE_SUPABASE_SERVICE_ROLE_KEY)
  };
}

export function resolveAutocarRuntimeTarget(environment: NodeJS.ProcessEnv = process.env): AutocarRuntimeTarget {
  const vercelEnvironment = clean(environment.VERCEL_ENV) || 'development';
  const production = vercelEnvironment === 'production';
  const credentials = credentialsFromEnvironment(environment, production);

  if (!credentials.url || !credentials.serviceRoleKey) {
    if (production) {
      throw new Error('AUTOCAR Production não configurada: AUTOCAR_SUPABASE_URL e AUTOCAR_SUPABASE_SERVICE_ROLE_KEY são obrigatórias em Vercel Production.');
    }
    throw new Error('AUTOCAR DEV não configurada para este ambiente.');
  }

  const projectRef = autocarProjectRefFromUrl(credentials.url);
  if (!projectRef) throw new Error('URL do Supabase AUTOCAR inválida.');

  if (production) {
    if (projectRef === AUTOCAR_DEV_REF) {
      throw new Error('SAFE CORE: Vercel Production não pode executar AUTOCAR apontando para autocar-dev.');
    }
    if (projectRef !== AUTOCAR_PRODUCTION_REF) {
      throw new Error(`SAFE CORE: Vercel Production recebeu um projeto AUTOCAR não autorizado (${projectRef}).`);
    }
    return {
      vercelEnvironment,
      projectRef,
      schema: 'production_v2',
      url: credentials.url,
      serviceRoleKey: credentials.serviceRoleKey
    };
  }

  if (projectRef !== AUTOCAR_DEV_REF) {
    throw new Error(`SAFE CORE: ${vercelEnvironment} deve usar exclusivamente autocar-dev (${AUTOCAR_DEV_REF}).`);
  }

  return {
    vercelEnvironment,
    projectRef,
    schema: 'dev_v1',
    url: credentials.url,
    serviceRoleKey: credentials.serviceRoleKey
  };
}

export type AutocarRuntimePublicDescriptor = {
  vercel_environment: string;
  runtime_environment: 'autocar-dev' | 'autocar-production';
  database_state: 'autocar-dev-isolated' | 'autocar-production-v2';
  project_ref: string;
  schema: AutocarRuntimeSchema;
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
    schema: target.schema
  };
}

export function getAutocarRuntimeClient(environment: NodeJS.ProcessEnv = process.env): SupabaseClient {
  const target = resolveAutocarRuntimeTarget(environment);
  return createClient(target.url, target.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
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
};

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
      live_enabled: false
    };
  }

  let target: AutocarRuntimeTarget;
  try {
    target = resolveAutocarRuntimeTarget(environment);
  } catch (error: any) {
    return {
      allowed: false,
      reason: String(error?.message || error || 'Configuração AUTOCAR Production inválida.').slice(0, 500),
      project_ref: null,
      environment: vercelEnvironment,
      schema_version: null,
      live_enabled: false
    };
  }

  const client = createClient(target.url, target.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  try {
    const { data, error } = await client
      .from('autocar_runtime_config')
      .select('environment,schema_version,live_enabled')
      .eq('id', 'primary')
      .single();

    if (error) throw error;

    const schemaVersion = Number(data?.schema_version || 0);
    const liveEnabled = data?.live_enabled === true;
    const databaseEnvironment = clean(data?.environment);

    if (databaseEnvironment !== 'production') {
      return {
        allowed: false,
        reason: 'SAFE CORE: banco AUTOCAR não se identifica como production.',
        project_ref: target.projectRef,
        environment: vercelEnvironment,
        schema_version: schemaVersion || null,
        live_enabled: liveEnabled
      };
    }

    if (schemaVersion !== AUTOCAR_PRODUCTION_SCHEMA_VERSION) {
      return {
        allowed: false,
        reason: `SAFE CORE: schema AUTOCAR incompatível. Esperado ${AUTOCAR_PRODUCTION_SCHEMA_VERSION}, recebido ${schemaVersion || 'desconhecido'}.`,
        project_ref: target.projectRef,
        environment: vercelEnvironment,
        schema_version: schemaVersion || null,
        live_enabled: liveEnabled
      };
    }

    if (!liveEnabled) {
      return {
        allowed: false,
        reason: 'AUTOCAR Production está em shadow/cutover seguro: live_enabled=false.',
        project_ref: target.projectRef,
        environment: vercelEnvironment,
        schema_version: schemaVersion,
        live_enabled: false
      };
    }

    return {
      allowed: true,
      reason: 'AUTOCAR Production validada para execução externa LIVE.',
      project_ref: target.projectRef,
      environment: vercelEnvironment,
      schema_version: schemaVersion,
      live_enabled: true
    };
  } catch (error: any) {
    return {
      allowed: false,
      reason: `SAFE CORE: não foi possível validar o runtime AUTOCAR Production: ${String(error?.message || error || 'erro desconhecido').slice(0, 350)}`,
      project_ref: target.projectRef,
      environment: vercelEnvironment,
      schema_version: null,
      live_enabled: false
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
