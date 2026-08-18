import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { publicError, readJsonBody } from '@/lib/server/requestSecurity';
import { recordLeadContactConsent } from '@/lib/server/leadConsent';
import { enforceRateLimit } from '@/lib/server/rateLimit';

export const runtime = 'nodejs';

const allowedInstallments = new Set([12, 24, 36, 48, 60]);
const maxRequestBytes = 20_000;
const minFormFillTimeMs = 2_500;
const maxFormAgeMs = 2 * 60 * 60 * 1_000;

function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

  if (!supabaseUrl || !serviceKey) {
    throw new Error('Configuração do servidor incompleta.');
  }

  return createClient(supabaseUrl, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
}

function clean(value: unknown, maxLength = 500) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function onlyDigits(value: unknown) {
  return String(value || '').replace(/\D/g, '');
}

function numberValue(value: unknown) {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;

  const text = String(value).trim();
  const normalized = text.includes(',')
    ? text.replace(/\./g, '').replace(',', '.')
    : text;
  const parsed = Number(normalized.replace(/[^\d.-]/g, ''));

  return Number.isFinite(parsed) ? parsed : 0;
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(value);
}

function isValidCpf(value: string) {
  const cpf = onlyDigits(value);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;

  const calculateDigit = (length: number) => {
    let sum = 0;
    for (let index = 0; index < length; index += 1) {
      sum += Number(cpf[index]) * (length + 1 - index);
    }
    const remainder = (sum * 10) % 11;
    return remainder === 10 ? 0 : remainder;
  };

  return calculateDigit(9) === Number(cpf[9]) && calculateDigit(10) === Number(cpf[10]);
}

function isValidUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function statusForDatabaseError(message: string) {
  const normalized = message.toLowerCase();
  if (normalized.includes('não está disponível')) return 404;
  if (normalized.includes('loja responsável') || normalized.includes('única loja')) return 409;
  if (normalized.includes('obrigatório') || normalized.includes('inválid') || normalized.includes('entrada')) return 400;
  return 500;
}

export async function POST(request: Request) {
  try {
    const contentLength = Number(request.headers.get('content-length') || 0);
    if (contentLength > maxRequestBytes) {
      return NextResponse.json({ error: 'Solicitação muito grande.' }, { status: 413 });
    }

    const requestUrl = new URL(request.url);
    const requestOrigin = requestUrl.origin;
    const originHeader = request.headers.get('origin');

    if (originHeader && originHeader !== requestOrigin) {
      return NextResponse.json({ error: 'Origem da solicitação não autorizada.' }, { status: 403 });
    }

    await enforceRateLimit(request, 'marketplace-leads', 20, 60 * 60);

    const body = await readJsonBody<any>(request, maxRequestBytes);
    const name = clean(body.name, 160);
    const phone = clean(body.phone, 40);
    const phoneDigits = onlyDigits(phone);
    const cpf = clean(body.cpf, 30);
    const email = clean(body.email, 180).toLowerCase();
    const vehicleId = clean(body.vehicle_id, 80);
    const consent = body.consent === true;
    const honeypot = clean(body.company_website, 200);
    const formStartedAt = Number(body.form_started_at || 0);
    const elapsed = Date.now() - formStartedAt;
    const downPayment = Math.max(numberValue(body.down_payment), 0);
    const installments = Math.trunc(numberValue(body.installments));

    if (honeypot) {
      return NextResponse.json({ error: 'Não foi possível validar o formulário.' }, { status: 400 });
    }

    if (!Number.isFinite(formStartedAt) || formStartedAt <= 0 || elapsed < minFormFillTimeMs || elapsed > maxFormAgeMs) {
      return NextResponse.json({ error: 'Reabra o formulário e tente novamente.' }, { status: 400 });
    }

    if (name.length < 3) {
      return NextResponse.json({ error: 'Informe seu nome completo.' }, { status: 400 });
    }

    if (![10, 11].includes(phoneDigits.length)) {
      return NextResponse.json({ error: 'Informe um telefone válido.' }, { status: 400 });
    }

    if (!isValidCpf(cpf)) {
      return NextResponse.json({ error: 'Informe um CPF válido.' }, { status: 400 });
    }

    if (!isValidEmail(email)) {
      return NextResponse.json({ error: 'Informe um e-mail válido.' }, { status: 400 });
    }

    if (!isValidUuid(vehicleId)) {
      return NextResponse.json({ error: 'Selecione um veículo válido.' }, { status: 400 });
    }

    if (!allowedInstallments.has(installments)) {
      return NextResponse.json({ error: 'Selecione uma quantidade de parcelas válida.' }, { status: 400 });
    }

    if (!Number.isFinite(downPayment) || downPayment < 0) {
      return NextResponse.json({ error: 'Informe um valor de entrada válido.' }, { status: 400 });
    }

    if (!consent) {
      return NextResponse.json({ error: 'Confirme a autorização para contato.' }, { status: 400 });
    }

    const supabase = getAdminClient();
    const { data, error } = await supabase.rpc('create_marketplace_lead', {
      p_name: name,
      p_phone: phone,
      p_cpf: cpf,
      p_email: email,
      p_vehicle_id: vehicleId,
      p_down_payment: downPayment,
      p_installments: installments
    });

    if (error) {
      const message = clean(error.message || 'Não foi possível enviar seu interesse.', 300);
      return NextResponse.json({ error: message }, { status: statusForDatabaseError(message) });
    }

    const result = data && typeof data === 'object' ? data as Record<string, any> : {};
    const routedLeadId = clean(result.lead_id, 80);
    if (!isValidUuid(routedLeadId)) {
      return NextResponse.json({ error: 'Não foi possível vincular a prova de consentimento ao lead.' }, { status: 500 });
    }

    const { data: baseLead, error: baseLeadError } = await supabase
      .from('leads_base')
      .select('id')
      .eq('routed_lead_id', routedLeadId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (baseLeadError || !baseLead?.id) {
      return NextResponse.json({ error: 'Não foi possível vincular a prova de consentimento ao lead.' }, { status: 500 });
    }

    await recordLeadContactConsent({
      supabase,
      leadBaseId: baseLead.id,
      source: 'public_marketplace',
      proof: {
        vehicle_id: vehicleId,
        form_started_at: formStartedAt,
        origin: originHeader || requestOrigin,
        user_agent: clean(request.headers.get('user-agent'), 300)
      }
    });

    return NextResponse.json({
      success: result.success === true,
      duplicate: result.duplicate === true,
      assigned_store_name: clean(result.assigned_store_name, 180),
      base_lead_id: baseLead.id,
      routing_strategy: 'vehicle_owner'
    });
  } catch (error: unknown) {
    const failure = publicError(error, 'Não foi possível enviar seu interesse.');
    return NextResponse.json({ error: failure.message }, { status: failure.status });
  }
}
