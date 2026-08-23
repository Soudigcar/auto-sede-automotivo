import { NextResponse } from 'next/server';
import { cleanText, getAdminClient, requireMaster } from '@/lib/server/masterApi';
import { getAutocarDevClient } from '@/lib/server/autocar/devAdmin';
import { simulateSmartFollowUp } from '@/lib/server/autocar/smartFollowUp';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const production = getAdminClient();
  const master = await requireMaster(request, production);
  if (!master) return NextResponse.json({ error: 'Acesso restrito ao perfil Master.' }, { status: 403 });
  const autocar = getAutocarDevClient();
  const { data, error } = await autocar.from('ai_follow_up_events')
    .select('id,store_id,trigger_type,due_at,status,contact_basis,attempt_count,last_decision,created_at')
    .order('created_at', { ascending: false }).limit(50);
  if (error) {
    const message = String(error?.message || error || '');
    if (/does not exist|schema cache|could not find/i.test(message)) return NextResponse.json({ success: true, schema_ready: false, dry_run: true, events: [] });
    return NextResponse.json({ error: 'Não foi possível consultar Smart Follow-up.' }, { status: 500 });
  }
  return NextResponse.json({ success: true, schema_ready: true, dry_run: true, external_execution: false, events: data || [] });
}

export async function POST(request: Request) {
  const production = getAdminClient();
  const master = await requireMaster(request, production);
  if (!master) return NextResponse.json({ error: 'Acesso restrito ao perfil Master.' }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  const trigger = cleanText(body?.trigger_type, 60);
  if (!['visit_confirmation','post_visit','no_show','callback_requested'].includes(trigger)) return NextResponse.json({ error: 'Cenário de follow-up inválido.' }, { status: 400 });
  const result = simulateSmartFollowUp({
    trigger_type: trigger as any,
    global_policy: cleanText(body?.global_policy, 30) || 'default',
    autopilot: body?.autopilot === true,
    human_active: body?.human_active === true,
    sale_confirmed: body?.sale_confirmed === true,
    new_message: body?.new_message === true,
    appointment_status: cleanText(body?.appointment_status, 40) || 'scheduled',
    lead_status: cleanText(body?.lead_status, 40) || 'scheduled',
    customer_name: cleanText(body?.customer_name, 80) || 'Cliente'
  });
  return NextResponse.json({ success: true, dry_run: true, external_execution: false, result });
}
