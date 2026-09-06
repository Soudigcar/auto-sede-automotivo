import { cleanText } from '@/lib/server/storeTeam';

export type WhatsappCloudIntegrationStatus = 'draft' | 'testing' | 'ready' | 'disabled' | 'error';
export type WhatsappCloudWriteMode = 'preview_synthetic' | 'production_config';

export const WHATSAPP_CLOUD_PREVIEW_BRANCH = 'feature/whatsapp-api-store-v1-isolated';
export const WHATSAPP_CLOUD_PREVIEW_PROJECT_REF = 'ggvwuqomwbxhtlxaocau';
export const WHATSAPP_CLOUD_PRODUCTION_PROJECT_REF = 'wufikrdgyxrsszlbpfmv';
const WHATSAPP_CLOUD_PREVIEW_SUPABASE_HOST = `${WHATSAPP_CLOUD_PREVIEW_PROJECT_REF}.supabase.co`;
const WHATSAPP_CLOUD_PRODUCTION_SUPABASE_HOST = `${WHATSAPP_CLOUD_PRODUCTION_PROJECT_REF}.supabase.co`;

type WhatsappCloudWriteScopeInput = {
  vercelEnv?: string | null;
  gitRef?: string | null;
  previewEnabled?: string | null;
  productionConfigEnabled?: string | null;
  supabaseUrl?: string | null;
};

function parseHostname(url: string) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return '';
  }
}

export function evaluateWhatsappCloudWriteScope(input: WhatsappCloudWriteScopeInput) {
  const vercelEnv = String(input.vercelEnv || '').trim().toLowerCase();
  const gitRef = String(input.gitRef || '').trim();
  const previewEnabled = String(input.previewEnabled || '').trim().toLowerCase() === 'true';
  const productionConfigEnabled = String(input.productionConfigEnabled || '').trim().toLowerCase() === 'true';
  const hostname = parseHostname(String(input.supabaseUrl || '').trim());

  if (vercelEnv === 'preview') {
    if (gitRef !== WHATSAPP_CLOUD_PREVIEW_BRANCH) {
      return { allowed: false, mode: null, reason: 'WhatsApp Cloud API V1 está bloqueada fora da branch isolada autorizada.' } as const;
    }
    if (!previewEnabled) {
      return { allowed: false, mode: null, reason: 'WhatsApp Cloud API V1 não está habilitada neste Preview isolado.' } as const;
    }
    if (hostname !== WHATSAPP_CLOUD_PREVIEW_SUPABASE_HOST) {
      return { allowed: false, mode: null, reason: 'WhatsApp Cloud API V1 está bloqueada fora do Supabase temporário autorizado.' } as const;
    }
    return { allowed: true, mode: 'preview_synthetic', reason: 'Preview isolado autorizado.' } as const;
  }

  if (vercelEnv === 'production') {
    if (!productionConfigEnabled) {
      return { allowed: false, mode: null, reason: 'Configuração da WhatsApp Cloud API em Production ainda não foi liberada.' } as const;
    }
    if (gitRef !== 'main') {
      return { allowed: false, mode: null, reason: 'Configuração Production aceita somente a main publicada.' } as const;
    }
    if (hostname !== WHATSAPP_CLOUD_PRODUCTION_SUPABASE_HOST) {
      return { allowed: false, mode: null, reason: 'Configuração Production está bloqueada fora do CRM Production autorizado.' } as const;
    }
    return { allowed: true, mode: 'production_config', reason: 'Configuração Production autorizada; execução externa permanece OFF.' } as const;
  }

  return { allowed: false, mode: null, reason: 'WhatsApp Cloud API V1 não aceita escrita neste ambiente.' } as const;
}

export function evaluateWhatsappCloudPreviewWriteScope(input: WhatsappCloudWriteScopeInput) {
  return evaluateWhatsappCloudWriteScope(input);
}

export function assertWhatsappCloudWriteEnabled(): WhatsappCloudWriteMode {
  const scope = evaluateWhatsappCloudWriteScope({
    vercelEnv: process.env.VERCEL_ENV,
    gitRef: process.env.VERCEL_GIT_COMMIT_REF,
    previewEnabled: process.env.WHATSAPP_CLOUD_PREVIEW_ENABLED,
    productionConfigEnabled: process.env.WHATSAPP_CLOUD_PRODUCTION_CONFIG_ENABLED,
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL
  });

  if (!scope.allowed || !scope.mode) throw new Error(scope.reason);
  return scope.mode;
}

export function assertWhatsappCloudPreviewWriteEnabled() {
  const mode = assertWhatsappCloudWriteEnabled();
  if (mode !== 'preview_synthetic') throw new Error('Ação permitida somente no Preview sintético.');
}

export function publicWhatsappCloudIntegration(row: any) {
  if (!row) {
    return {
      configured: false,
      provider: 'meta_cloud',
      status: 'draft' as WhatsappCloudIntegrationStatus,
      enabled: false,
      waba_id: null,
      phone_number_id: null,
      display_phone_number: null,
      business_account_name: null,
      graph_api_version: null,
      has_access_token: false,
      has_app_secret: false,
      has_verify_token: false,
      last_tested_at: null,
      last_synced_at: null,
      last_error: null
    };
  }

  return {
    configured: true,
    provider: 'meta_cloud',
    status: row.status as WhatsappCloudIntegrationStatus,
    enabled: Boolean(row.enabled),
    waba_id: row.waba_id || null,
    phone_number_id: row.phone_number_id || null,
    display_phone_number: row.display_phone_number || null,
    business_account_name: row.business_account_name || null,
    graph_api_version: row.graph_api_version || null,
    has_access_token: Boolean(row.access_token_secret_id),
    has_app_secret: Boolean(row.app_secret_secret_id),
    has_verify_token: Boolean(row.verify_token_secret_id),
    last_tested_at: row.last_tested_at || null,
    last_synced_at: row.last_synced_at || null,
    last_error: row.last_error || null
  };
}

export async function loadStoreWhatsappCloudIntegration(supabase: any, storeId: string) {
  const { data, error } = await supabase
    .from('store_whatsapp_cloud_integrations')
    .select('id, store_id, provider, status, enabled, waba_id, phone_number_id, display_phone_number, business_account_name, graph_api_version, access_token_secret_id, app_secret_secret_id, verify_token_secret_id, last_tested_at, last_synced_at, last_error, created_at, updated_at')
    .eq('store_id', storeId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function saveStoreWhatsappCloudDraft(
  supabase: any,
  context: { storeId: string; profileId: string },
  input: any,
  mode: WhatsappCloudWriteMode = 'preview_synthetic'
) {
  const existing = await loadStoreWhatsappCloudIntegration(supabase, context.storeId);
  const payload = {
    store_id: context.storeId,
    provider: 'meta_cloud',
    status: existing?.status === 'disabled' ? 'draft' : (existing?.status || 'draft'),
    enabled: false,
    is_synthetic: mode === 'preview_synthetic',
    waba_id: cleanText(input?.waba_id, 180) || null,
    phone_number_id: cleanText(input?.phone_number_id, 180) || null,
    display_phone_number: cleanText(input?.display_phone_number, 80) || null,
    business_account_name: cleanText(input?.business_account_name, 180) || null,
    graph_api_version: cleanText(input?.graph_api_version, 40) || null,
    updated_by: context.profileId,
    ...(existing ? {} : { created_by: context.profileId })
  };

  const query = existing
    ? supabase.from('store_whatsapp_cloud_integrations').update(payload).eq('id', existing.id)
    : supabase.from('store_whatsapp_cloud_integrations').insert(payload);
  const { data, error } = await query.select('*').single();
  if (error) throw error;
  return data;
}

export async function saveStoreWhatsappCloudSecrets(
  supabase: any,
  integrationId: string,
  input: any,
  mode: WhatsappCloudWriteMode = 'preview_synthetic'
) {
  const accessToken = cleanText(input?.access_token, 4096);
  const appSecret = cleanText(input?.app_secret, 1024);
  const verifyToken = cleanText(input?.verify_token, 1024);
  if (!accessToken || !appSecret || !verifyToken) {
    throw new Error('Informe Access Token, App Secret e Verify Token.');
  }
  if (mode === 'preview_synthetic' && ![accessToken, appSecret, verifyToken].every((value) => value.toLowerCase().startsWith('synthetic-'))) {
    throw new Error('Nesta homologação são aceitas somente credenciais sintéticas iniciadas por synthetic-.');
  }

  const { error } = await supabase.rpc('store_whatsapp_cloud_set_secrets', {
    p_integration_id: integrationId,
    p_access_token: accessToken,
    p_app_secret: appSecret,
    p_verify_token: verifyToken
  });
  if (error) throw error;
}

export async function saveStoreWhatsappCloudSyntheticSecrets(supabase: any, integrationId: string, input: any) {
  return saveStoreWhatsappCloudSecrets(supabase, integrationId, input, 'preview_synthetic');
}

export async function auditStoreWhatsappCloud(
  supabase: any,
  input: {
    storeId: string;
    integrationId?: string | null;
    actorUserId?: string | null;
    action: string;
    entityType: string;
    entityId?: string | null;
    outcome: 'success' | 'denied' | 'error' | 'noop';
    metadata?: Record<string, unknown>;
  }
) {
  const { error } = await supabase.from('whatsapp_cloud_audit_events').insert({
    store_id: input.storeId,
    integration_id: input.integrationId || null,
    actor_user_id: input.actorUserId || null,
    source: 'store_portal',
    action: cleanText(input.action, 120),
    entity_type: cleanText(input.entityType, 120),
    entity_id: input.entityId || null,
    outcome: input.outcome,
    metadata: input.metadata || {}
  });
  if (error) throw error;
}
