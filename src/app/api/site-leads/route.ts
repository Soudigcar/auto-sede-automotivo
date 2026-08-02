import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

const maxRequestBytes = 20_000;
const allowedInstallments = new Set([12, 24, 36, 48, 60]);

function clean(value: unknown, maxLength = 500) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function numericValue(value: unknown) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isValidUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function metadataValue(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function getSupabaseAdmin() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';

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

function statusForDatabaseError(message: string) {
  const normalized = message.toLowerCase();

  if (normalized.includes('não está disponível') || normalized.includes('não está vinculado')) {
    return 409;
  }

  if (
    normalized.includes('obrigatório') ||
    normalized.includes('obrigatórios') ||
    normalized.includes('inválido') ||
    normalized.includes('inválida')
  ) {
    return 400;
  }

  return 500;
}

export async function POST(request: Request) {
  try {
    const contentLength = Number(request.headers.get('content-length') || 0);
    if (contentLength > maxRequestBytes) {
      return NextResponse.json({ error: 'Solicitação muito grande.' }, { status: 413 });
    }

    const requestUrl = new URL(request.url);
    const originHeader = request.headers.get('origin');
    if (originHeader && originHeader !== requestUrl.origin) {
      return NextResponse.json({ error: 'Origem da solicitação não autorizada.' }, { status: 403 });
    }

    const body = await request.json();
    const name = clean(body.name, 160);
    const phone = clean(body.phone, 40);
    const cpf = clean(body.cpf, 30);
    const email = clean(body.email, 180).toLowerCase();
    const campaignId = clean(body.campaign_id, 80);
    const vehicleId = clean(body.vehicle_id, 80);
    const installments = Math.trunc(numericValue(body.installments));

    if (name.length < 3 || !phone) {
      return NextResponse.json({ error: 'Nome e telefone são obrigatórios.' }, { status: 400 });
    }

    if (!isValidUuid(campaignId) || !isValidUuid(vehicleId)) {
      return NextResponse.json({ error: 'Campanha ou veículo inválido.' }, { status: 400 });
    }

    if (!allowedInstallments.has(installments)) {
      return NextResponse.json({ error: 'Quantidade de parcelas inválida.' }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.rpc('create_event_landing_lead', {
      p_name: name,
      p_phone: phone,
      p_cpf: cpf,
      p_email: email,
      p_campaign_id: campaignId,
      p_vehicle_id: vehicleId,
      p_down_payment: Math.max(numericValue(body.down_payment), 0),
      p_financed_amount: Math.max(numericValue(body.financed_amount), 0),
      p_installments: installments,
      p_estimated_installment: Math.max(numericValue(body.estimated_installment), 0),
      p_interest_rate: Math.max(numericValue(body.interest_rate), 0),
      p_notes: clean(body.notes, 1_500),
      p_metadata: {
        ...metadataValue(body.metadata),
        source: 'event_landing_simulator'
      }
    });

    if (error) {
      const message = clean(error.message || 'Não foi possível enviar sua simulação.', 300);
      return NextResponse.json({ error: message }, { status: statusForDatabaseError(message) });
    }

    const result = data && typeof data === 'object' ? data as Record<string, unknown> : {};

    return NextResponse.json({
      success: result.success === true,
      duplicate: result.duplicate === true,
      queued_for_manual_assignment: result.queued_for_manual_assignment === true,
      event_id: clean(result.event_id, 80) || null,
      assigned_store_id: clean(result.assigned_store_id, 80) || null,
      assigned_store_name: clean(result.assigned_store_name, 180),
      routed_lead_id: clean(result.routed_lead_id, 80) || null,
      routing_strategy: clean(result.routing_strategy, 80) || 'event_round_robin'
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: clean(error?.message || 'Erro ao salvar lead.', 300) },
      { status: 500 }
    );
  }
}
