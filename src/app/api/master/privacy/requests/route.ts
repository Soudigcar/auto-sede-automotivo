import { NextResponse } from 'next/server';
import { cleanText, getAdminClient, requireMaster } from '@/lib/server/masterApi';
import { readJsonBody } from '@/lib/server/requestSecurity';

export const runtime = 'nodejs';

const statuses = new Set(['received','identity_verification','in_progress','completed','rejected']);

export async function GET(request: Request) {
  try {
    const supabase = getAdminClient();
    if (!await requireMaster(request, supabase)) return NextResponse.json({ error: 'Acesso restrito ao Master.' }, { status: 403 });
    const { data, error } = await supabase.from('privacy_requests').select('*').order('received_at', { ascending: false }).limit(250);
    if (error) throw error;
    return NextResponse.json({ requests: data || [] });
  } catch {
    return NextResponse.json({ error: 'Não foi possível consultar as solicitações.' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const supabase = getAdminClient();
    if (!await requireMaster(request, supabase)) return NextResponse.json({ error: 'Acesso restrito ao Master.' }, { status: 403 });
    const body = await readJsonBody<any>(request, 12 * 1024);
    const id = cleanText(body.id, 80);
    const status = cleanText(body.status, 40);
    if (!/^[0-9a-f-]{36}$/i.test(id) || !statuses.has(status)) return NextResponse.json({ error: 'Solicitação ou status inválido.' }, { status: 400 });

    const completed = status === 'completed' || status === 'rejected';
    const { data, error } = await supabase.from('privacy_requests').update({
      status,
      verification_notes: cleanText(body.verification_notes, 2_000) || null,
      resolution_notes: cleanText(body.resolution_notes, 4_000) || null,
      completed_at: completed ? new Date().toISOString() : null,
      updated_at: new Date().toISOString()
    }).eq('id', id).select('*').single();
    if (error) throw error;
    return NextResponse.json({ success: true, request: data });
  } catch {
    return NextResponse.json({ error: 'Não foi possível atualizar a solicitação.' }, { status: 500 });
  }
}
