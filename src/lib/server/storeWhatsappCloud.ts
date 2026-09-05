import { cleanText } from '@/lib/server/storeTeam';

export type WhatsappCloudIntegrationStatus = 'draft' | 'testing' | 'ready' | 'disabled' | 'error';

export const WHATSAPP_CLOUD_PREVIEW_BRANCH = 'feature/whatsapp-api-store-v1-isolated';
export const WHATSAPP_CLOUD_PREVIEW_PROJECT_REF = 'ggvwuqomwbxhtlxaocau';
const WHATSAPP_CLOUD_PREVIEW_SUPABASE_HOST = `${WHATSAPP_CLOUD_PREVIEW_PROJECT_REF}.supabase.co`;

type WhatsappCloudPreviewWriteScopeInput = {
  vercelEnv?: string | null;
  gitRef?: string | null;
  previewEnabled?: string | null;
  supabaseUrl?: string | null;
};

export function evaluateWhatsappCloudPreviewWriteScope(input: WhatsappCloudPreviewWriteScopeInput) {
  const vercelEnv = String(input.vercelEnv || '').trim().toLowerCase();
  const gitRef = String(input.gitRef || '').trim();
  const previewEnabled = String(input.previewEnabled || '').trim().toLowerCase() === 'true';
  const supabaseUrl = String(input.supabaseUrl || '').trim();

  if (vercelEnv !== 'preview') {
    return { allowed: false, reason: 'WhatsApp Cloud API V1 aceita escrita somente em Vercel Preview.' } as const;
  }

  if (gitRef !== WHATSAPP_CLOUD_PREVIEW_BRANCH) {
    return { allowed: false, reason: 'WhatsApp Cloud API V1 está bloqueada fora da branch isolada autorizada.' } as const;
  }

  if (!previewEnabled) {
    return { allowed: false, reason: 'WhatsApp Cloud API V1 não está habilitada neste Preview isolado.' } as const;
  }

  let hostname = '';
  try {
    hostname = new URL(supabaseUrl).hostname.toLowerCase();
  } catch {}

  if (hostname !== WHATSAPP_CLOUD_PREVIEW_SUPABASE_HOST) {
    return { allowed: false, reason: 'WhatsApp Cloud API V1 está bloqueada fora do Supabase temporário autorizado.' } as const;
  }

  return { allowed: true, reason: 'Preview isolado autorizado.' } as const;
}

export function assertWhatsappCloudPreviewWriteEnabled() {
  const scope = evaluateWhatsappCloudPreviewWriteScope({
    vercelEnv: process.env.VERCEL_ENV,
    gitRef: process.env.VERCEL_GIT_COMMIT_REF,
    previewEnabled: process.env.WHATSAPP_CLOUD_PREVIEW_ENABLED,
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL
  });

  if (!scope.allowed) throw new Error(scope.reason);
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
  input: any
) {
  const existing = await loadStoreWhatsappCloudIntegration(supabase, context.storeId);
  const payload = {
    store_id: context.storeId,
    provider: 'meta_cloud',
    status: existing?.status === 'disabled' ? 'draft' : (existing?.status || 'draft'),
    enabled: false,
    is_synthetic: true,
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

export async function saveStoreWhatsappCloudSyntheticSecrets(
  supabase: any,
  integrationId: string,
  input: any
) {
  const accessToken = cleanText(input?.access_token, 4096);
  const appSecret = cleanText(input?.app_secret, 1024);
  const verifyToken = cleanText(input?.verify_token, 1024);
  if (!accessToken || !appSecret || !verifyToken) {
    throw new Error('Informe Access Token, App Secret e Verify Token sintéticos.');
  }
  if (![accessToken, appSecret, verifyToken].every((value) => value.toLowerCase().startsWith('synthetic-'))) {
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
    source: 'store_portal_preview',
    action: cleanText(input.action, 120),
    entity_type: cleanText(input.entityType, 120),
    entity_id: input.entityId || null,
    outcome: input.outcome,
    metadata: input.metadata || {}
  });
  if (error) throw error;
}
