import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { safeEqual } from '@/lib/server/requestSecurity';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const configuredSecret = process.env.CRON_SECRET || '';
  const suppliedSecret = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!configuredSecret || !safeEqual(suppliedSecret, configuredSecret)) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
  }
  if (process.env.LGPD_RETENTION_ENABLED !== 'true') {
    return NextResponse.json({ skipped: true, reason: 'Retenção automática desativada.' }, { status: 200 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) return NextResponse.json({ error: 'Configuração incompleta.' }, { status: 503 });

  const leadDays = Math.max(30, Number(process.env.LGPD_LEAD_RETENTION_DAYS || 730));
  const webhookDays = Math.max(7, Number(process.env.LGPD_WEBHOOK_RETENTION_DAYS || 90));
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.rpc('run_lgpd_retention', {
    p_lead_retention_days: leadDays,
    p_webhook_retention_days: webhookDays
  });
  if (error) return NextResponse.json({ error: 'Rotina de retenção falhou.' }, { status: 500 });
  return NextResponse.json({ success: true, result: data });
}
