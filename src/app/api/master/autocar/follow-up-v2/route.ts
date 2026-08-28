import { NextResponse } from 'next/server';
import { getAdminClient, requireMaster } from '@/lib/server/masterApi';
import { ensureAutocarDevStore, getAutocarDevClient } from '@/lib/server/autocar/devAdmin';
import { getAutocarRuntimeClient } from '@/lib/server/autocar/runtimeEnvironment';
import {
  FOLLOW_UP_V2_AUTOPILOT_CANARY_STORE_ID,
  FOLLOW_UP_V2_AUTOPILOT_LOCKED,
  followUpAutopilotCanaryAllowed,
  readMasterFollowUpV2,
  readStoreFollowUpV2,
  saveMasterFollowUpV2,
  saveStoreFollowUpV2
} from '@/lib/server/autocar/followUpV2ConfigStore';
import { readFollowUpV2Performance } from '@/lib/server/autocar/followUpV2Performance';
import type { FollowUpConfigV2 } from '@/lib/server/autocar/smartFollowUpV2';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function context(request: Request) {
  const crm = getAdminClient();
  const master = await requireMaster(request, crm);
  if (!master) return { error: NextResponse.json({ error: 'Acesso restrito ao perfil Master.' }, { status: 403 }) } as const;
  return { crm, master } as const;
}

function message(error: any) {
  const text = String(error?.message || error || 'Falha no Smart Follow-up V2.');
  if (/does not exist|relation .* not found|schema cache/i.test(text)) {
    return 'Persistência do Smart Follow-up V2 ainda não está disponível neste ambiente.';
  }
  return text.slice(0, 500);
}

export async function GET(request: Request) {
  try {
    const auth = await context(request);
    if ('error' in auth) return auth.error;
    const client = getAutocarRuntimeClient();
    const url = new URL(request.url);
    const storeId = String(url.searchParams.get('store_id') || '').trim();
    const performanceDays = Math.max(1, Math.min(Number(url.searchParams.get('performance_days') || 30), 90));
    const master = await readMasterFollowUpV2(client);
    if (!storeId) {
      const performance = await readFollowUpV2Performance({
        autocar: client,
        crm: auth.crm,
        storeId: FOLLOW_UP_V2_AUTOPILOT_CANARY_STORE_ID,
        periodDays: performanceDays
      });
      return NextResponse.json({
        success: true,
        autopilot_locked: FOLLOW_UP_V2_AUTOPILOT_LOCKED,
        autopilot_canary_store_id: FOLLOW_UP_V2_AUTOPILOT_CANARY_STORE_ID,
        master,
        performance
      });
    }
    const store = await auth.crm.from('stores').select('id,store_name,slug,status,portal_enabled').eq('id', storeId).maybeSingle();
    if (store.error) throw store.error;
    if (!store.data) return NextResponse.json({ error: 'Loja não encontrada.' }, { status: 404 });
    await ensureAutocarDevStore(getAutocarDevClient(), store.data);
    const [storeConfig, performance] = await Promise.all([
      readStoreFollowUpV2(client, storeId),
      readFollowUpV2Performance({ autocar: client, crm: auth.crm, storeId, periodDays: performanceDays })
    ]);
    return NextResponse.json({
      success: true,
      autopilot_locked: FOLLOW_UP_V2_AUTOPILOT_LOCKED,
      autopilot_canary_allowed: followUpAutopilotCanaryAllowed(storeId),
      autopilot_canary_store_id: FOLLOW_UP_V2_AUTOPILOT_CANARY_STORE_ID,
      master,
      store: storeConfig,
      performance
    });
  } catch (error: any) {
    return NextResponse.json({ error: message(error), persistence_available: false }, { status: 503 });
  }
}

export async function POST(request: Request) {
  try {
    const auth = await context(request);
    if ('error' in auth) return auth.error;
    const body = await request.json().catch(() => ({}));
    const action = String(body?.action || '').trim();
    const client = getAutocarRuntimeClient();

    if (action === 'save-master') {
      const config = body?.config as FollowUpConfigV2;
      if (!config) return NextResponse.json({ error: 'Configuração Master obrigatória.' }, { status: 400 });
      const saved = await saveMasterFollowUpV2(client, config, auth.master.id);
      return NextResponse.json({
        success: true,
        autopilot_locked: FOLLOW_UP_V2_AUTOPILOT_LOCKED,
        autopilot_canary_store_id: FOLLOW_UP_V2_AUTOPILOT_CANARY_STORE_ID,
        master: saved
      });
    }

    if (action === 'save-store') {
      const storeId = String(body?.store_id || '').trim();
      const config = body?.config as FollowUpConfigV2;
      if (!storeId || !config) return NextResponse.json({ error: 'Loja e configuração são obrigatórias.' }, { status: 400 });
      const store = await auth.crm.from('stores').select('id,store_name,slug,status,portal_enabled').eq('id', storeId).maybeSingle();
      if (store.error) throw store.error;
      if (!store.data) return NextResponse.json({ error: 'Loja não encontrada.' }, { status: 404 });
      await ensureAutocarDevStore(getAutocarDevClient(), store.data);
      const saved = await saveStoreFollowUpV2(client, storeId, config, auth.master.id);
      return NextResponse.json({
        success: true,
        autopilot_locked: FOLLOW_UP_V2_AUTOPILOT_LOCKED,
        autopilot_canary_allowed: followUpAutopilotCanaryAllowed(storeId),
        store: saved
      });
    }

    return NextResponse.json({ error: 'Ação de Follow-up inválida.' }, { status: 400 });
  } catch (error: any) {
    const text = message(error);
    const status = /AUTOPILOT|inválid|não habilitou|não autorizado|canário/i.test(text) ? 400 : 500;
    return NextResponse.json({ error: text }, { status });
  }
}