import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { calculateCampaignFinance, campaignInstallmentOptions } from '@/lib/campaignFinance';

export const runtime = 'nodejs';

const maxRequestBytes = 20_000;
const allowedInstallments = new Set<number>(campaignInstallmentOptions);

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

function isValidBirthDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;

  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return false;
  }

  const min = new Date(Date.UTC(1900, 0, 1));
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  return date >= min && date <= today;
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
    const birthDate = typeof body.birth_date === 'string' ? body.birth_date.trim() : '';
    const email = clean(body.email, 180).toLowerCase();
    const campaignId = clean(body.campaign_id, 80);
    const vehicleId = clean(body.vehicle_id, 80);
    const installments = Math.trunc(numericValue(body.installments));
    const downPaymentProvided = body.down_payment !== null && body.down_payment !== undefined && body.down_payment !== '';
    const requestedDownPayment = Number(body.down_payment);

    if (name.length < 3 || !phone) {
      return NextResponse.json({ error: 'Nome e telefone são obrigatórios.' }, { status: 400 });
    }

    if (!isValidBirthDate(birthDate)) {
      return NextResponse.json({ error: 'Informe uma data de nascimento válida.' }, { status: 400 });
    }

    if (!isValidUuid(campaignId) || !isValidUuid(vehicleId)) {
      return NextResponse.json({ error: 'Campanha ou veículo inválido.' }, { status: 400 });
    }

    if (!allowedInstallments.has(installments)) {
      return NextResponse.json({ error: 'Quantidade de parcelas inválida.' }, { status: 400 });
    }

    if (!downPaymentProvided || !Number.isFinite(requestedDownPayment) || requestedDownPayment < 0) {
      return NextResponse.json({ error: 'Informe um valor de entrada válido.' }, { status: 400 });
    }

    if (body.consent !== true) {
      return NextResponse.json({ error: 'A autorização de contato é obrigatória.' }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { data: campaign, error: campaignError } = await supabase
      .from('site_campaigns')
      .select('id,event_id,interest_rate,is_active')
      .eq('id', campaignId)
      .eq('is_active', true)
      .maybeSingle();

    if (campaignError || !campaign?.event_id) {
      return NextResponse.json({ error: 'Esta campanha de evento não está disponível.' }, { status: 409 });
    }

    const [vehicleResult, assignmentResult] = await Promise.all([
      supabase
        .from('site_vehicles')
        .select('id,price,status,show_on_landing')
        .eq('id', vehicleId)
        .eq('status', 'disponivel')
        .eq('show_on_landing', true)
        .maybeSingle(),
      supabase
        .from('event_vehicle_assignments')
        .select('promotional_price,status,show_on_landing')
        .eq('event_id', campaign.event_id)
        .eq('vehicle_id', vehicleId)
        .eq('status', 'active')
        .eq('show_on_landing', true)
        .maybeSingle()
    ]);

    if (vehicleResult.error || assignmentResult.error || !vehicleResult.data || !assignmentResult.data) {
      return NextResponse.json({ error: 'Este veículo não está disponível no evento.' }, { status: 409 });
    }

    const promotionalPrice = Math.max(numericValue(assignmentResult.data.promotional_price), 0);
    const vehiclePrice = promotionalPrice > 0 ? promotionalPrice : Math.max(numericValue(vehicleResult.data.price), 0);

    if (vehiclePrice <= 0) {
      return NextResponse.json({ error: 'O veículo selecionado não possui um preço válido.' }, { status: 409 });
    }

    if (requestedDownPayment > vehiclePrice) {
      return NextResponse.json({ error: 'O valor da entrada não pode ultrapassar o valor do veículo.' }, { status: 400 });
    }

    const simulation = calculateCampaignFinance({
      vehiclePrice,
      downPayment: requestedDownPayment,
      installments,
      monthlyRatePercent: campaign.interest_rate || 1.89
    });

    const { data, error } = await supabase.rpc('create_event_landing_lead', {
      p_name: name,
      p_phone: phone,
      p_cpf: cpf,
      p_email: email,
      p_campaign_id: campaignId,
      p_vehicle_id: vehicleId,
      p_down_payment: simulation.downPayment,
      p_financed_amount: simulation.financedAmount,
      p_installments: installments,
      p_estimated_installment: simulation.estimatedInstallment,
      p_interest_rate: simulation.monthlyRatePercent,
      p_notes: clean(body.notes, 1_500),
      p_metadata: {
        ...metadataValue(body.metadata),
        birth_date: birthDate,
        source: 'event_landing_simulator'
      }
    });

    if (error) {
      const message = clean(error.message || 'Não foi possível enviar sua simulação.', 300);
      return NextResponse.json({ error: message }, { status: statusForDatabaseError(message) });
    }

    const result = data && typeof data === 'object' ? data as Record<string, unknown> : {};
    const routedLeadId = clean(result.routed_lead_id, 80);
    const assignedStoreId = clean(result.assigned_store_id, 80);

    if (isValidUuid(routedLeadId) && isValidUuid(assignedStoreId)) {
      const commercialDetails = {
        lead_id: routedLeadId,
        store_id: assignedStoreId,
        cpf: cpf.replace(/\D/g, '').slice(0, 11) || null,
        birth_date: birthDate,
        payment_type: 'financed',
        negotiated_value: simulation.vehiclePrice,
        installment_count: installments,
        has_down_payment: simulation.downPayment > 0,
        down_payment_value: simulation.downPayment,
        financed_amount: simulation.financedAmount,
        installment_value: simulation.estimatedInstallment,
        updated_at: new Date().toISOString()
      };

      const { error: commercialDetailsError } = await supabase
        .from('lead_commercial_details')
        .upsert(commercialDetails, { onConflict: 'lead_id' });

      if (commercialDetailsError) {
        console.error('Failed to persist lead commercial details', {
          lead_id: routedLeadId,
          code: commercialDetailsError.code
        });
        return NextResponse.json(
          { error: 'Não foi possível salvar os dados comerciais da simulação.' },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({
      success: result.success === true,
      duplicate: result.duplicate === true,
      queued_for_manual_assignment: result.queued_for_manual_assignment === true,
      event_id: clean(result.event_id, 80) || null,
      assigned_store_id: assignedStoreId || null,
      assigned_store_name: clean(result.assigned_store_name, 180),
      routed_lead_id: routedLeadId || null,
      routing_strategy: clean(result.routing_strategy, 80) || 'event_round_robin',
      simulation
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: clean(error?.message || 'Erro ao salvar lead.', 300) },
      { status: 500 }
    );
  }
}
