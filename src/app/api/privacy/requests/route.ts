import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { publicError, readJsonBody } from '@/lib/server/requestSecurity';
import { enforceRateLimit } from '@/lib/server/rateLimit';

export const runtime = 'nodejs';

const requestTypes = new Set(['confirmation','access','correction','portability','anonymization','deletion','consent_revocation','information']);

function clean(value: unknown, max = 500) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) throw new Error('Configuração do servidor incompleta.');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function POST(request: Request) {
  try {
    const origin = request.headers.get('origin');
    if (origin && origin !== new URL(request.url).origin) {
      return NextResponse.json({ error: 'Origem não autorizada.' }, { status: 403 });
    }

    await enforceRateLimit(request, 'privacy-requests', 5, 60 * 60);

    const body = await readJsonBody<any>(request, 16 * 1024);
    if (clean(body.company_website, 200)) return NextResponse.json({ error: 'Solicitação inválida.' }, { status: 400 });

    const startedAt = Number(body.form_started_at || 0);
    const elapsed = Date.now() - startedAt;
    if (!Number.isFinite(startedAt) || elapsed < 2_000 || elapsed > 2 * 60 * 60 * 1000) {
      return NextResponse.json({ error: 'Reabra o formulário e tente novamente.' }, { status: 400 });
    }

    const requestType = clean(body.request_type, 40);
    const requesterName = clean(body.requester_name, 160);
    const requesterEmail = clean(body.requester_email, 180).toLowerCase();
    const requesterPhone = clean(body.requester_phone, 40);
    const details = clean(body.details, 2_000);

    if (!requestTypes.has(requestType) || requesterName.length < 3 || (!requesterEmail && !requesterPhone)) {
      return NextResponse.json({ error: 'Preencha o tipo, seu nome e ao menos um contato.' }, { status: 400 });
    }
    if (requesterEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(requesterEmail)) {
      return NextResponse.json({ error: 'E-mail inválido.' }, { status: 400 });
    }

    const receivedAt = new Date();
    const dueAt = new Date(receivedAt.getTime() + 15 * 24 * 60 * 60 * 1000);
    const { data, error } = await admin().from('privacy_requests').insert({
      request_type: requestType,
      requester_name: requesterName,
      requester_email: requesterEmail || null,
      requester_phone: requesterPhone || null,
      details: details || null,
      status: 'received',
      received_at: receivedAt.toISOString(),
      due_at: dueAt.toISOString()
    }).select('id,received_at,due_at').single();
    if (error) throw error;

    return NextResponse.json({ success: true, protocol: data.id, received_at: data.received_at, due_at: data.due_at }, { status: 201 });
  } catch (error: unknown) {
    const failure = publicError(error, 'Não foi possível registrar a solicitação.');
    return NextResponse.json({ error: failure.message }, { status: failure.status });
  }
}
