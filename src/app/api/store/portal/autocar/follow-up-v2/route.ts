import { NextResponse } from 'next/server';
import { authorizeStorePortal } from '@/lib/server/storePortal';
import { ensureAutocarDevStore, getAutocarDevClient } from '@/lib/server/autocar/devAdmin';
import { getAutocarRuntimeClient } from '@/lib/server/autocar/runtimeEnvironment';
import {
  FOLLOW_UP_V2_AUTOPILOT_LOCKED,
  followUpAutopilotCanaryAllowed
} from '@/lib/server/autocar/followUpV2ConfigStore';
import {
  readGovernedStoreFollowUpV2,
  saveGovernedStoreFollowUpV2
} from '@/lib/server/autocar/followUpV2MasterCeiling';
import { readFollowUpV2Performance } from '@/lib/server/autocar/followUpV2Performance';
import type { FollowUpConfigV2 } from '@/lib/server/autocar/smartFollowUpV2';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function humanError(error: any) {
  const text = String(error?.message || error || 'Falha no Smart Follow-up V2.');
  if (/does not exist|relation .* not found|schema cache/i.test(text)) {
    return 'Persistência do Smart Follow-up V2 ainda não está disponível neste ambiente.';
  }
  return text.slice(0, 500);
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const slug = String(url.searchParams.get('slug') || '').trim();
    const performanceDays = Math.max(1, Math.min(Number(url.searchParams.get('performance_days') || 30), 90));
    const context = await authorizeStorePortal(request, slug);
    if ('error' in context) return context.error;
    if (!context.permissions.includes('view_autocar')) {
      return NextResponse.json({ error: 'Usuário sem permissão para visualizar a AUTOCAR.' }, { status: 403 });
    }
    await ensureAutocarDevStore(getAutocarDevClient(), context.store);
    const autocar = getAutocarRuntimeClient();
    const [config, performance] = await Promise.all([
      readGovernedStoreFollowUpV2(autocar, context.store.id),
      readFollowUpV2Performance({
        autocar,
        crm: context.supabase,
        storeId: context.store.id,
        periodDays: performanceDays
      })
    ]);
    return NextResponse.json({
      success: true,
      autopilot_locked: FOLLOW_UP_V2_AUTOPILOT_LOCKED,
      autopilot_canary_allowed: followUpAutopilotCanaryAllowed(context.store.id),
      autopilot_ceiling: config.autopilot_ceiling,
      permissions: { manage: context.permissions.includes('manage_autocar') },
      store: { id: context.store.id, store_name: context.store.store_name, slug: context.store.slug },
      config,
      performance
    });
  } catch (error: any) {
    return NextResponse.json({ error: humanError(error), persistence_available: false }, { status: 503 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const slug = String(body?.slug || '').trim();
    const context = await authorizeStorePortal(request, slug);
    if ('error' in context) return context.error;
    if (!context.permissions.includes('manage_autocar')) {
      return NextResponse.json({ error: 'Somente o gestor da loja pode alterar o Smart Follow-up.' }, { status: 403 });
    }
    const config = body?.config as FollowUpConfigV2;
    if (!config) return NextResponse.json({ error: 'Configuração do Follow-up obrigatória.' }, { status: 400 });
    await ensureAutocarDevStore(getAutocarDevClient(), context.store);
    const saved = await saveGovernedStoreFollowUpV2(getAutocarRuntimeClient(), context.store.id, config, context.profile.id);
    return NextResponse.json({
      success: true,
      autopilot_locked: FOLLOW_UP_V2_AUTOPILOT_LOCKED,
      autopilot_canary_allowed: followUpAutopilotCanaryAllowed(context.store.id),
      autopilot_ceiling: saved.autopilot_ceiling,
      config: saved
    });
  } catch (error: any) {
    const text = humanError(error);
    const status = /AUTOPILOT|inválid|não habilitou|não autorizado|canário|Master não permitiu/i.test(text) ? 400 : 500;
    return NextResponse.json({ error: text }, { status });
  }
}
