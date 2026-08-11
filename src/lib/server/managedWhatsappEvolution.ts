import {
  connectEvolutionInstance,
  createEvolutionInstance,
  deleteEvolutionInstance,
  evolutionInstanceName,
  getEvolutionConnectionState,
  getEvolutionInstance,
  logoutEvolutionInstance
} from '@/lib/server/evolution';
import { cleanText } from '@/lib/server/storeTeam';

export type EvolutionIntegrationScope = 'master' | 'store';
export type EvolutionIntegrationStatus =
  | 'pending'
  | 'qrcode'
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'error';

export type ManagedEvolutionContext = {
  supabase: any;
  scope: EvolutionIntegrationScope;
  storeId: string | null;
  profileId: string;
  numberLabel: string;
  routingMode: 'master_base' | 'store_pipeline';
};

export function evolutionConnectionStatus(value: unknown): EvolutionIntegrationStatus {
  const state = cleanText(value, 40).toLowerCase();
  if (state === 'open' || state === 'connected') return 'connected';
  if (state === 'connecting') return 'connecting';
  if (state === 'close' || state === 'disconnected') return 'disconnected';
  return 'pending';
}

function extractQrCode(result: any) {
  const candidate = result?.qrcode?.base64 || result?.base64 || result?.qrcode?.code || result?.code || '';
  return cleanText(candidate, 2_000_000);
}

function instanceDetails(result: any) {
  const item = Array.isArray(result) ? result[0] : result?.instance || result || {};
  const owner = cleanText(item.ownerJid || item.number, 120);

  return {
    phoneNumber: owner.replace(/@.*$/, '').replace(/\D/g, '') || null,
    profileName: cleanText(item.profileName, 160) || null,
    profilePictureUrl: cleanText(item.profilePicUrl || item.profilePictureUrl, 1_000) || null
  };
}

export function publicEvolutionIntegration(row: any, overrides: Record<string, unknown> = {}) {
  if (!row) {
    return {
      configured: false,
      scope: null,
      status: 'disconnected',
      phone_number: null,
      profile_name: null,
      profile_picture_url: null,
      last_connected_at: null,
      last_disconnected_at: null,
      last_webhook_at: null,
      last_error: null,
      ...overrides
    };
  }

  return {
    configured: true,
    scope: row.scope,
    status: row.status,
    phone_number: row.phone_number,
    profile_name: row.profile_name,
    profile_picture_url: row.profile_picture_url,
    last_connected_at: row.last_connected_at,
    last_disconnected_at: row.last_disconnected_at,
    last_webhook_at: row.last_webhook_at,
    last_error: row.last_error,
    created_at: row.created_at,
    updated_at: row.updated_at,
    ...overrides
  };
}

function applyScope(query: any, context: ManagedEvolutionContext) {
  const scoped = query.eq('scope', context.scope);
  return context.scope === 'master'
    ? scoped.is('store_id', null)
    : scoped.eq('store_id', context.storeId);
}

export async function loadManagedEvolutionIntegration(context: ManagedEvolutionContext) {
  const { data, error } = await applyScope(
    context.supabase.from('store_whatsapp_integrations').select('*'),
    context
  ).maybeSingle();

  if (error) throw error;
  return data;
}

export async function readManagedEvolutionState(row: any) {
  try {
    const stateResult = await getEvolutionConnectionState(row.instance_name);
    const status = evolutionConnectionStatus(stateResult?.instance?.state);
    const details = status === 'connected'
      ? instanceDetails(await getEvolutionInstance(row.instance_name))
      : { phoneNumber: null, profileName: null, profilePictureUrl: null };

    return {
      status,
      phone_number: details.phoneNumber || row.phone_number || null,
      profile_name: details.profileName || row.profile_name || null,
      profile_picture_url: details.profilePictureUrl || row.profile_picture_url || null,
      live_error: null
    };
  } catch (error: any) {
    return {
      status: row.status || 'error',
      phone_number: row.phone_number || null,
      profile_name: row.profile_name || null,
      profile_picture_url: row.profile_picture_url || null,
      live_error: error?.message || 'Não foi possível consultar a Evolution API.'
    };
  }
}

function instanceKey(context: ManagedEvolutionContext) {
  if (context.scope === 'master') return 'master';
  if (!context.storeId) throw new Error('Loja inválida para criar a instância WhatsApp.');
  return context.storeId;
}

export async function createManagedEvolutionIntegration(context: ManagedEvolutionContext) {
  const instanceName = evolutionInstanceName(instanceKey(context));
  const created = await createEvolutionInstance(instanceName);
  let crmNumber: any = null;

  try {
    const { data: number, error: numberError } = await context.supabase
      .from('whatsapp_numbers')
      .insert({
        store_id: context.storeId,
        label: context.numberLabel,
        phone_number: null,
        phone_number_id: `evolution:${instanceName}`,
        verify_token: `managed:${instanceName}`,
        graph_version: 'evolution-2.3.7',
        routing_mode: context.routingMode,
        is_active: false,
        status: 'pending',
        settings: {
          provider: 'evolution',
          instance_name: instanceName,
          scope: context.scope
        },
        created_by: context.profileId
      })
      .select('id')
      .single();

    if (numberError) throw numberError;
    crmNumber = number;

    const qrCode = extractQrCode(created);
    const { data: integration, error: integrationError } = await context.supabase
      .from('store_whatsapp_integrations')
      .insert({
        scope: context.scope,
        store_id: context.storeId,
        provider: 'evolution',
        instance_name: instanceName,
        crm_number_id: crmNumber.id,
        status: qrCode ? 'qrcode' : evolutionConnectionStatus(created?.instance?.status),
        created_by: context.profileId,
        updated_by: context.profileId,
        settings: {
          integration: 'WHATSAPP-BAILEYS',
          managed_by: 'auto-controle',
          scope: context.scope
        },
        updated_at: new Date().toISOString()
      })
      .select('*')
      .single();

    if (integrationError) throw integrationError;
    return { integration, qrCode };
  } catch (error) {
    if (crmNumber?.id) {
      await context.supabase.from('whatsapp_numbers').delete().eq('id', crmNumber.id);
    }
    await deleteEvolutionInstance(instanceName).catch(() => null);
    throw error;
  }
}

async function updateManagedEvolutionDetails(
  context: ManagedEvolutionContext,
  row: any,
  status: EvolutionIntegrationStatus
) {
  const details = status === 'connected'
    ? instanceDetails(await getEvolutionInstance(row.instance_name))
    : { phoneNumber: null, profileName: null, profilePictureUrl: null };
  const now = new Date().toISOString();
  const payload: Record<string, unknown> = {
    status,
    phone_number: details.phoneNumber || row.phone_number || null,
    profile_name: details.profileName || row.profile_name || null,
    profile_picture_url: details.profilePictureUrl || row.profile_picture_url || null,
    last_error: null,
    updated_by: context.profileId,
    updated_at: now
  };

  if (status === 'connected') payload.last_connected_at = now;
  if (status === 'disconnected') payload.last_disconnected_at = now;

  const { data, error } = await context.supabase
    .from('store_whatsapp_integrations')
    .update(payload)
    .eq('id', row.id)
    .eq('scope', context.scope)
    .select('*')
    .single();

  if (error) throw error;

  if (row.crm_number_id) {
    await context.supabase
      .from('whatsapp_numbers')
      .update({
        phone_number: payload.phone_number,
        status,
        is_active: status === 'connected',
        updated_at: now
      })
      .eq('id', row.crm_number_id);
  }

  return data;
}

export async function connectManagedEvolutionIntegration(context: ManagedEvolutionContext, row: any) {
  const result = await connectEvolutionInstance(row.instance_name);
  const qrCode = extractQrCode(result);
  const status = qrCode
    ? 'qrcode'
    : evolutionConnectionStatus(result?.instance?.state || result?.instance?.status);
  const integration = await updateManagedEvolutionDetails(context, row, status);
  return { integration, qrCode };
}

export async function disconnectManagedEvolutionIntegration(context: ManagedEvolutionContext, row: any) {
  const stateResult = await getEvolutionConnectionState(row.instance_name).catch(() => null);
  if (evolutionConnectionStatus(stateResult?.instance?.state) !== 'disconnected') {
    await logoutEvolutionInstance(row.instance_name);
  }

  return updateManagedEvolutionDetails(context, row, 'disconnected');
}

export async function markManagedEvolutionError(context: ManagedEvolutionContext, row: any, error: unknown) {
  if (!row?.id) return;

  await context.supabase
    .from('store_whatsapp_integrations')
    .update({
      status: 'error',
      last_error: cleanText((error as any)?.message, 500),
      updated_by: context.profileId || null,
      updated_at: new Date().toISOString()
    })
    .eq('id', row.id)
    .eq('scope', context.scope);
}
