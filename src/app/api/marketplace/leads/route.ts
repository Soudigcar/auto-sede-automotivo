import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

const invalidLinkStatuses = new Set(['rejected', 'duplicate', 'deleted', 'excluido']);

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

function validOwnerLink(link: any) {
  const status = clean(link?.status).toLowerCase();
  const metadata = link?.metadata || {};

  if (!link?.store_id || !link?.imported_vehicle_id) return false;
  if (metadata.store_removed === true) return false;
  if (invalidLinkStatuses.has(status)) return false;

  return true;
}

function vehicleName(vehicle: any) {
  return [vehicle.brand, vehicle.model, vehicle.version, vehicle.year]
    .map((value) => clean(value, 120))
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function money(value: number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(Number(value || 0));
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const name = clean(body.name, 160);
    const phone = clean(body.phone, 40);
    const cpf = clean(body.cpf, 30);
    const email = clean(body.email, 180).toLowerCase();
    const vehicleId = clean(body.vehicle_id, 80);
    const consent = body.consent === true;

    if (!name || !phone) {
      return NextResponse.json({ error: 'Nome e telefone são obrigatórios.' }, { status: 400 });
    }

    if (!vehicleId) {
      return NextResponse.json({ error: 'Selecione um veículo.' }, { status: 400 });
    }

    if (!consent) {
      return NextResponse.json({ error: 'Confirme a autorização para contato.' }, { status: 400 });
    }

    const supabase = getAdminClient();

    const { data: vehicle, error: vehicleError } = await supabase
      .from('site_vehicles')
      .select('id,brand,model,version,year,price,status,show_on_landing')
      .eq('id', vehicleId)
      .eq('status', 'disponivel')
      .eq('show_on_landing', true)
      .maybeSingle();

    if (vehicleError) throw vehicleError;
    if (!vehicle) {
      return NextResponse.json({ error: 'Este veículo não está mais disponível.' }, { status: 404 });
    }

    const { data: linkRows, error: linkError } = await supabase
      .from('store_vehicle_link_submissions')
      .select('id,store_id,imported_vehicle_id,status,metadata')
      .eq('imported_vehicle_id', vehicle.id);

    if (linkError) throw linkError;

    const validLinks = (linkRows || []).filter(validOwnerLink);
    const candidateStoreIds = Array.from(new Set(validLinks.map((link: any) => link.store_id).filter(Boolean)));

    const { data: storeRows, error: storeError } = candidateStoreIds.length
      ? await supabase
          .from('stores')
          .select('id,store_name,slug,status,portal_enabled')
          .in('id', candidateStoreIds)
          .eq('status', 'active')
          .eq('portal_enabled', true)
      : { data: [], error: null };

    if (storeError) throw storeError;

    const stores = storeRows || [];
    if (stores.length !== 1) {
      return NextResponse.json(
        { error: 'Não foi possível confirmar a loja responsável por este veículo.' },
        { status: 409 }
      );
    }

    const store = stores[0];
    const currentVehiclePrice = Number(vehicle.price || 0);
    const downPayment = Math.max(numberValue(body.down_payment), 0);
    const installmentCount = Math.min(Math.max(Math.trunc(numberValue(body.installments)), 1), 120);
    const financedAmount = Math.max(currentVehiclePrice - downPayment, 0);
    const interestRate = Math.max(numberValue(body.interest_rate) || 1.89, 0);
    const monthlyRate = interestRate / 100;
    const estimatedInstallment = financedAmount > 0 && installmentCount > 0 && monthlyRate > 0
      ? financedAmount * monthlyRate / (1 - Math.pow(1 + monthlyRate, -installmentCount))
      : installmentCount > 0
        ? financedAmount / installmentCount
        : 0;
    const selectedVehicleName = vehicleName(vehicle);
    const now = new Date().toISOString();

    const leadNotes = [
      'Lead criado pelo marketplace permanente.',
      `Veículo selecionado: ${selectedVehicleName}.`,
      downPayment > 0 ? `Entrada simulada: ${money(downPayment)}.` : 'Simulação sem entrada informada.',
      installmentCount > 0 ? `Prazo simulado: ${installmentCount} parcela(s).` : '',
      estimatedInstallment > 0 ? `Parcela estimada: ${money(estimatedInstallment)}.` : ''
    ].filter(Boolean).join(' ');

    const { data: lead, error: leadError } = await supabase
      .from('leads')
      .insert({
        event_id: null,
        customer_name: name,
        customer_phone: phone,
        customer_bank: '',
        interested_vehicle: selectedVehicleName,
        interested_vehicle_id: vehicle.id,
        interested_vehicle_price: currentVehiclePrice,
        vehicle_category_interest: '',
        origin: 'marketplace_site',
        assigned_store_id: store.id,
        assigned_user_id: null,
        assigned_user_role: null,
        assignment_source: 'marketplace_vehicle_owner',
        status: 'new_lead',
        notes: leadNotes,
        last_activity_at: now,
        last_activity_type: 'marketplace_lead_created',
        last_activity_label: 'Lead recebido pelo marketplace',
        last_activity_by_name: 'Marketplace público'
      })
      .select('id')
      .single();

    if (leadError || !lead?.id) {
      throw new Error(leadError?.message || 'Não foi possível criar o lead na loja.');
    }

    const metadata = {
      source: 'marketplace_permanente',
      page: '/',
      vehicle_owner: {
        store_id: store.id,
        store_name: store.store_name,
        store_slug: store.slug
      },
      routing: {
        strategy: 'vehicle_owner',
        assigned_store_id: store.id,
        assigned_store_name: store.store_name,
        assigned_at: now,
        routed_lead_id: lead.id
      }
    };

    const { error: baseError } = await supabase.from('leads_base').insert({
      name,
      phone,
      cpf: cpf || null,
      email: email || null,
      source: 'Marketplace permanente',
      campaign_id: null,
      campaign_name: null,
      vehicle_id: vehicle.id,
      vehicle_name: selectedVehicleName,
      vehicle_price: currentVehiclePrice,
      down_payment: downPayment,
      financed_amount: financedAmount,
      installments: installmentCount,
      estimated_installment: estimatedInstallment,
      interest_rate: interestRate,
      status: 'Novo lead',
      assigned_store_id: store.id,
      assigned_store_name: store.store_name,
      assigned_at: now,
      routed_lead_id: lead.id,
      routing_strategy: 'vehicle_owner',
      notes: leadNotes,
      metadata,
      created_at: now,
      updated_at: now
    });

    await Promise.allSettled([
      supabase.from('lead_activity_logs').insert({
        lead_id: lead.id,
        store_id: store.id,
        store_name: store.store_name,
        user_name: 'Marketplace público',
        activity_type: 'marketplace_lead_created',
        activity_label: 'Lead recebido pelo marketplace',
        customer_name: name,
        customer_phone: phone,
        vehicle_name: selectedVehicleName,
        notes: leadNotes,
        metadata
      }),
      supabase.from('lead_activities').insert({
        event_id: null,
        lead_id: lead.id,
        user_id: null,
        activity_type: 'marketplace_lead_created',
        description: `Lead do marketplace direcionado para ${store.store_name}.`,
        metadata
      })
    ]);

    return NextResponse.json({
      success: true,
      lead_id: lead.id,
      assigned_store_name: store.store_name,
      routing_strategy: 'vehicle_owner',
      base_saved: !baseError
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Não foi possível enviar seu interesse.' },
      { status: 500 }
    );
  }
}
