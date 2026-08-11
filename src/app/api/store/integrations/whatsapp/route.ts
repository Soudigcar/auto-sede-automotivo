import { NextResponse } from 'next/server';
import {
  connectEvolutionInstance,
  createEvolutionInstance,
  deleteEvolutionInstance,
  evolutionInstanceName,
  getEvolutionConnectionState,
  getEvolutionInstance,
  logoutEvolutionInstance
} from '@/lib/server/evolution';
import { authorizeStorePortal } from '@/lib/server/storePortal';
import { cleanText } from '@/lib/server/storeTeam';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type IntegrationStatus = 'pending' | 'qrcode' | 'connecting' | 'connected' | 'disconnected' | 'error';

function managerOnly(role: string) {
  return role === 'master' || role === 'store';
}

function connectionStatus(value: unknown): IntegrationStatus {
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
    state: item.connectionStatus || item.state || item.status || null,
    phoneNumber: owner.replace(/@.*$/, '').replace(/\D/g, '') || null,
    profileName: cleanText(item.profileName, 160) || null,
    profilePictureUrl: cleanText(item.profilePicUrl || item.profilePictureUrl, 1_000) || null
  };
}

function publicIntegration(row: any, overrides: Record<string, unknown> = {}) {
  if (!row) {
    return {
      configured: false,
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

async function loadIntegration(supabase: any, storeId: string) {
  const { data, error } = await supabase
    .from('store_whatsapp_integrations')
    .select('*')
    .eq('store_id', storeId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

async function authorizeManager(request: Request, slug: string) {
  const context = await authorizeStorePortal(request, slug);
  if ('error' in context) return context;

  if (!managerOnly(context.role)) {
    return {
      error: NextResponse.json(
        { error: 'Somente o Gestor da loja ou Master pode administrar integrações.' },
        { status: 403 }
      )
    } as const;
  }

  return context;
}

async function readLiveState(row: any) {
  try {
    const stateResult = await getEvolutionConnectionState(row.instance_name);
    const state = connectionStatus(stateResult?.instance?.state);
    let details = { state: null, phoneNumber: null, profileName: null, profilePictureUrl: null } as ReturnType<typeof instanceDetails>;

    if (state === 'connected') {
      details = instanceDetails(await getEvolutionInstance(row.instance_name));
    }

    return {
      status: state,
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

export async function GET(request: Request) {
  try {
    const slug = cleanText(new URL(request.url).searchParams.get('slug'), 120);
    const context = await authorizeManager(request, slug);
    if ('error' in context) return context.error;

    const row = await loadIntegration(context.supabase, context.store.id);
    if (!row) return NextResponse.json({ success: true, integration: publicIntegration(null) });

    const live = await readLiveState(row);
    return NextResponse.json({ success: true, integration: publicIntegration(row, live) });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Não foi possível consultar a integração WhatsApp.' },
      { status: 500 }
    );
  }
}

async function createManagedIntegration(context: any) {
  const instanceName = evolutionInstanceName(context.store.id);
  const created = await createEvolutionInstance(instanceName);
  let crmNumber: any = null;

  try {
    const { data: number, error: numberError } = await context.supabase
      .from('whatsapp_numbers')
      .insert({
        store_id: context.store.id,
        label: `${context.store.store_name} · WhatsApp Evolution`,
        phone_number: null,
        phone_number_id: `evolution:${instanceName}`,
        verify_token: `managed:${instanceName}`,
        graph_version: 'evolution-2.3.7',
        routing_mode: 'store_pipeline',
        is_active: false,
        status: 'pending',
        settings: { provider: 'evolution', instance_name: instanceName },
        created_by: context.profile.id
      })
      .select('id')
      .single();

    if (numberError) throw numberError;
    crmNumber = number;

    const qrCode = extractQrCode(created);
    const now = new Date().toISOString();
    const { data: integration, error: integrationError } = await context.supabase
      .from('store_whatsapp_integrations')
      .insert({
        store_id: context.store.id,
        provider: 'evolution',
        instance_name: instanceName,
        crm_number_id: crmNumber.id,
        status: qrCode ? 'qrcode' : connectionStatus(created?.instance?.status),
        created_by: context.profile.id,
        updated_by: context.profile.id,
        settings: { integration: 'WHATSAPP-BAILEYS', managed_by: 'auto-controle' },
        updated_at: now
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

async function updateConnectedDetails(context: any, row: any, status: IntegrationStatus) {
  let details = { state: null, phoneNumber: null, profileName: null, profilePictureUrl: null } as ReturnType<typeof instanceDetails>;

  if (status === 'connected') {
    details = instanceDetails(await getEvolutionInstance(row.instance_name));
  }

  const now = new Date().toISOString();
  const payload: Record<string, unknown> = {
    status,
    phone_number: details.phoneNumber || row.phone_number || null,
    profile_name: details.profileName || row.profile_name || null,
    profile_picture_url: details.profilePictureUrl || row.profile_picture_url || null,
    last_error: null,
    updated_by: context.profile.id,
    updated_at: now
  };

  if (status === 'connected') payload.last_connected_at = now;
  if (status === 'disconnected') payload.last_disconnected_at = now;

  const { data, error } = await context.supabase
    .from('store_whatsapp_integrations')
    .update(payload)
    .eq('id', row.id)
    .eq('store_id', context.store.id)
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
      .eq('id', row.crm_number_id)
      .eq('store_id', context.store.id);
  }

  return data;
}

export async function POST(request: Request) {
  let context: any = null;
  let row: any = null;

  try {
    const body = await request.json();
    const slug = cleanText(body.slug, 120);
    const action = cleanText(body.action, 40).toLowerCase();
    context = await authorizeManager(request, slug);
    if ('error' in context) return context.error;

    row = await loadIntegration(context.supabase, context.store.id);

    if (action === 'connect' || action === 'refresh-qr' || action === 'reconnect') {
      if (!row) {
        const created = await createManagedIntegration(context);
        return NextResponse.json({
          success: true,
          integration: publicIntegration(created.integration, { qr_code: created.qrCode || null })
        });
      }

      const result = await connectEvolutionInstance(row.instance_name);
      const qrCode = extractQrCode(result);
      const state = qrCode ? 'qrcode' : connectionStatus(result?.instance?.state || result?.instance?.status);
      const integration = await updateConnectedDetails(context, row, state);

      return NextResponse.json({
        success: true,
        integration: publicIntegration(integration, { qr_code: qrCode || null })
      });
    }

    if (action === 'disconnect') {
      if (!row) {
        return NextResponse.json({ error: 'Nenhuma conexão WhatsApp foi configurada para esta loja.' }, { status: 404 });
      }

      const stateResult = await getEvolutionConnectionState(row.instance_name).catch(() => null);
      if (connectionStatus(stateResult?.instance?.state) !== 'disconnected') {
        await logoutEvolutionInstance(row.instance_name);
      }

      const integration = await updateConnectedDetails(context, row, 'disconnected');
      return NextResponse.json({ success: true, integration: publicIntegration(integration) });
    }

    return NextResponse.json({ error: 'Ação de integração inválida.' }, { status: 400 });
  } catch (error: any) {
    if (context?.supabase && row?.id) {
      await context.supabase
        .from('store_whatsapp_integrations')
        .update({
          status: 'error',
          last_error: cleanText(error?.message, 500),
          updated_by: context.profile?.id || null,
          updated_at: new Date().toISOString()
        })
        .eq('id', row.id)
        .eq('store_id', context.store.id);
    }

    return NextResponse.json(
      { error: error?.message || 'Não foi possível administrar a integração WhatsApp.' },
      { status: 500 }
    );
  }
}
