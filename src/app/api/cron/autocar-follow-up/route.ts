import { NextResponse } from 'next/server';
import { safeEqual } from '@/lib/server/requestSecurity';
import { getAdminClient } from '@/lib/server/masterApi';
import { getAutocarDevClient } from '@/lib/server/autocar/devAdmin';
import { processDueFollowUpsDryRun } from '@/lib/server/autocar/smartFollowUp';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  if (process.env.VERCEL_ENV !== 'preview') {
    return NextResponse.json({
      skipped: true,
      dry_run: true,
      external_execution: false,
      reason: 'Smart Follow-up V1 dry-run executa somente em Vercel Preview.'
    }, { status: 403 });
  }

  const configuredSecret = process.env.CRON_SECRET || '';
  const suppliedSecret = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!configuredSecret || !safeEqual(suppliedSecret, configuredSecret)) return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
  if (process.env.AUTOCAR_SMART_FOLLOW_UP_DRY_RUN_ENABLED !== 'true') {
    return NextResponse.json({ skipped: true, dry_run: true, external_execution: false, reason: 'Smart Follow-up dry-run desativado por configuração.' });
  }
  try {
    const result = await processDueFollowUpsDryRun({
      production: getAdminClient(),
      autocar: getAutocarDevClient(),
      workerId: `vercel-cron:${process.env.VERCEL_DEPLOYMENT_ID || 'unknown'}`,
      limit: 25
    });
    return NextResponse.json({ success: true, ...result });
  } catch (error: any) {
    console.error('AUTOCAR Smart Follow-up dry-run cron error:', error?.message || error);
    return NextResponse.json({ error: 'Smart Follow-up dry-run falhou.', dry_run: true, external_execution: false }, { status: 500 });
  }
}
