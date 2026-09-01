import { NextResponse } from 'next/server';
import { safeEqual } from '@/lib/server/requestSecurity';
import { createAdminClient } from '@/lib/server/storeTeam';
import { FOLLOW_UP_AUTOPILOT_CANARY_STORE_ID } from '@/lib/server/autocar/followUpV2Autopilot';
import { runGovernedA4FollowUpAutopilot } from '@/lib/server/autocar/followUpV2AutopilotGoverned';
import { readMasterAutopilotCeiling } from '@/lib/server/autocar/followUpV2MasterCeiling';
import { evaluateAutocarExternalExecutionGate, getAutocarRuntimeClient } from '@/lib/server/autocar/runtimeEnvironment';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

async function preflightGate() {
  const external = await evaluateAutocarExternalExecutionGate();
  if (!external.allowed) return { allowed: false, reason: external.reason };
  const autocar = getAutocarRuntimeClient();
  const ceiling = await readMasterAutopilotCeiling(autocar, FOLLOW_UP_AUTOPILOT_CANARY_STORE_ID);
  if (!ceiling.allowed) return { allowed: false, reason: ceiling.reason };
  const { data, error } = await autocar.from('ai_global_capability_policies')
    .select('effect,reason,is_active,version')
    .eq('capability', 'create_follow_up')
    .eq('is_active', true)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (data?.effect !== 'allow') {
    return { allowed: false, reason: String(data?.reason || 'Capability create_follow_up permanece bloqueada.') };
  }
  return { allowed: true, reason: 'SAFE CORE, teto Master e capability liberados para o canário.' };
}

export async function GET(request: Request) {
  const configuredSecret = String(process.env.CRON_SECRET || '').trim();
  const suppliedSecret = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!configuredSecret || !safeEqual(suppliedSecret, configuredSecret)) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
  }
  if (process.env.VERCEL_ENV !== 'production') {
    return NextResponse.json({ skipped: true, reason: 'Follow-up AUTOPILOT só executa na Vercel Production.' });
  }

  try {
    const gate = await preflightGate();
    if (!gate.allowed) {
      return NextResponse.json({ success: true, skipped: true, sent: 0, reason: gate.reason });
    }
    const result = await runGovernedA4FollowUpAutopilot({
      productionSupabase: createAdminClient(),
      maxSends: 3
    });
    return NextResponse.json(result);
  } catch (error: any) {
    console.error('[AUTOCAR Follow-up AUTOPILOT] cron failure', {
      error: String(error?.message || error || 'erro desconhecido').slice(0, 500)
    });
    return NextResponse.json({ error: 'Rotina AUTOPILOT de Follow-up falhou de forma segura; nenhum retry cego será executado.' }, { status: 500 });
  }
}
