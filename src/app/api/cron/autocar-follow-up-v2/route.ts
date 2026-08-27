import { NextResponse } from 'next/server';
import { safeEqual } from '@/lib/server/requestSecurity';
import { createAdminClient } from '@/lib/server/storeTeam';
import { runA4FollowUpAutopilot } from '@/lib/server/autocar/followUpV2Autopilot';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

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
    const result = await runA4FollowUpAutopilot({
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
