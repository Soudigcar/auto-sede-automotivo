import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function text(value: unknown) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function number(value: unknown) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getSupabaseAdmin() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl || !serviceKey) throw new Error('Configuração do servidor incompleta.');
  return createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function pickLegacyStore(supabase: any) {
  const { data, error } = await supabase.rpc('pick_next_lead_store', { p_routing_key: 'default' });
  if (error) throw new Error(`Erro ao escolher loja: ${error.message}`);
  return Array.isArray(data) && data.length ? data[0] : null;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const name = text(body.name);
    const phone = text(body.phone);
    const campaignId = text(body.campaign_id);
    const vehicleId = text(body.vehicle_id);

    if (!name || !phone) return NextResponse.json({ error: 'Nome e telefone são obrigatórios.' }, { status: 400 });
    if (!campaignId || !vehicleId) return NextResponse.json({ error: 'Campanha e veículo são obrigatórios.' }, { status: 400 });

    const supabase = getSupabaseAdmin();
    const [{ data: campaign }, { data: vehicle }] = await Promise.all([
      supabase.from('site_campaigns').select('*').eq('id', campaignId).eq('is_active', true).maybeSingle(),
      supabase.from('site_vehicles').select('*').eq('id', vehicleId).eq('status', 'disponivel').maybeSingle()
    ]);

    if (!campaign || !vehicle) return NextResponse.json({ error: 'Campanha ou veículo indisponível.' }, { status: 409 });

    let selectedStore: any = null;
    let eventId: string | null = campaign.event_id || null;
    let routingStrategy = 'unassigned_no_store';

    if (campaign.event_id && vehicle.store_id) {
      const [{ data: assignment }, { data: participation }, { data: store }] = await Promise.all([
        supabase
          .from('event_vehicle_assignments')
          .select('id,store_id,status,show_on_landing')
          .eq('event_id', campaign.event_id)
          .eq('vehicle_id', vehicle.id)
          .eq('store_id', vehicle.store_id)
          .eq('status', 'active')
          .eq('show_on_landing', true)
          .maybeSingle(),
        supabase
          .from('store_event_participations')
          .select('id,status')
          .eq('event_id', campaign.event_id)
          .eq('store_id', vehicle.store_id)
          .eq('status', 'active')
          .maybeSingle(),
        supabase.from('stores').select('id,store_name,status').eq('id', vehicle.store_id).eq('status', 'active').maybeSingle()
      ]);

      if (!assignment || !participation || !store) {
        return NextResponse.json({ error: 'Este veículo não está mais disponível para o evento.' }, { status: 409 });
      }

      selectedStore = { store_id: store.id, store_name: store.store_name, event_id: campaign.event_id };
      routingStrategy = 'event_vehicle_owner';
    } else {
      selectedStore = await pickLegacyStore(supabase);
      eventId = selectedStore?.event_id || null;
      routingStrategy = selectedStore?.store_id ? 'legacy_round_robin' : 'unassigned_no_store';
    }

    let routedLeadId: string | null = null;
    const assignedStoreId = selectedStore?.store_id || null;
    const assignedStoreName = selectedStore?.store_name || '';
    const assignedAt = assignedStoreId ? new Date().toISOString() : null;
    const vehicleName = text(body.vehicle_name) || `${vehicle.brand || ''} ${vehicle.model || ''}`.trim();

    if (assignedStoreId) {
      const { data: routedLead, error: routedLeadError } = await supabase
        .from('leads')
        .insert({
          event_id: eventId,
          customer_name: name,
          customer_phone: phone,
          customer_bank: '',
          interested_vehicle: vehicleName,
          interested_vehicle_id: vehicle.id,
          interested_vehicle_price: number(body.vehicle_price) || number(vehicle.price),
          vehicle_category_interest: '',
          origin: 'manual',
          assigned_store_id: assignedStoreId,
          status: 'new_lead',
          notes: [
            'Lead criado automaticamente pela landing do evento.',
            campaign.name ? `Campanha: ${campaign.name}.` : '',
            vehicleName ? `Veículo: ${vehicleName}.` : '',
            `Roteamento: ${routingStrategy}.`
          ].filter(Boolean).join(' ')
        })
        .select('id')
        .single();

      if (routedLeadError) throw new Error(`Erro ao criar lead no pipeline da loja: ${routedLeadError.message}`);
      routedLeadId = routedLead?.id || null;
    }

    const metadata = {
      ...(body.metadata || {}),
      event_id: eventId,
      campaign_slug: campaign.slug,
      routing: {
        strategy: routingStrategy,
        assigned_store_id: assignedStoreId,
        assigned_store_name: assignedStoreName,
        assigned_at: assignedAt,
        routed_lead_id: routedLeadId
      }
    };

    const payload = {
      event_id: eventId,
      name,
      phone,
      cpf: text(body.cpf),
      email: text(body.email),
      source: text(body.source) || 'Landing Page Simulador',
      campaign_id: campaign.id,
      campaign_name: campaign.name,
      vehicle_id: vehicle.id,
      vehicle_name: vehicleName,
      vehicle_price: number(body.vehicle_price) || number(vehicle.price),
      down_payment: number(body.down_payment),
      financed_amount: number(body.financed_amount),
      installments: Number(body.installments || 0),
      estimated_installment: number(body.estimated_installment),
      interest_rate: number(body.interest_rate) || number(campaign.interest_rate) || 1.89,
      status: 'Novo lead',
      assigned_store_id: assignedStoreId,
      assigned_store_name: assignedStoreName || null,
      assigned_at: assignedAt,
      routed_lead_id: routedLeadId,
      routing_strategy: routingStrategy,
      notes: text(body.notes),
      metadata,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const { error } = await supabase.from('leads_base').insert(payload);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({
      success: true,
      event_id: eventId,
      assigned_store_id: assignedStoreId,
      assigned_store_name: assignedStoreName,
      routed_lead_id: routedLeadId,
      routing_strategy: routingStrategy
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Erro ao salvar lead.' }, { status: 500 });
  }
}
