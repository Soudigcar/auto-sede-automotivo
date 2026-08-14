import { NextResponse } from 'next/server';
import { cleanText, getAdminClient, requireMaster } from '@/lib/server/masterApi';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function vehicleName(vehicle: any) {
  return [vehicle?.brand, vehicle?.model, vehicle?.version, vehicle?.model_year || vehicle?.year]
    .map((value) => cleanText(value, 140))
    .filter(Boolean)
    .join(' ');
}

async function loadLead(supabase: any, leadId: string) {
  const { data, error } = await supabase
    .from('leads')
    .select('id,event_id,assigned_store_id,customer_name,customer_phone,interested_vehicle,interested_vehicle_id,interested_vehicle_price,status')
    .eq('id', leadId)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

async function loadBaseLead(supabase: any, baseLeadId: string) {
  const { data, error } = await supabase
    .from('leads_base')
    .select('id,event_id,assigned_store_id,assigned_store_name,name,phone,vehicle_id,vehicle_name,vehicle_price,status,routed_lead_id')
    .eq('id', baseLeadId)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

async function loadTarget(supabase: any, leadId: string, baseLeadId: string) {
  if (leadId) {
    const lead = await loadLead(supabase, leadId);
    if (lead) return { kind: 'lead' as const, record: lead };
  }

  if (baseLeadId) {
    const baseLead = await loadBaseLead(supabase, baseLeadId);
    if (baseLead) {
      if (baseLead.routed_lead_id) {
        const routedLead = await loadLead(supabase, baseLead.routed_lead_id);
        if (routedLead) return { kind: 'lead' as const, record: routedLead, baseLead };
      }
      return { kind: 'base' as const, record: baseLead };
    }
  }

  return null;
}

export async function GET(request: Request) {
  try {
    const supabase = getAdminClient();
    const master = await requireMaster(request, supabase);
    if (!master) return NextResponse.json({ error: 'Acesso restrito ao perfil Master.' }, { status: 403 });

    const url = new URL(request.url);
    const leadId = cleanText(url.searchParams.get('lead_id'), 80);
    const baseLeadId = cleanText(url.searchParams.get('base_lead_id'), 80);
    if (!leadId && !baseLeadId) return NextResponse.json({ error: 'Informe o lead ou o lead da Base Master.' }, { status: 400 });

    const target = await loadTarget(supabase, leadId, baseLeadId);
    if (!target) return NextResponse.json({ error: 'Lead não encontrado.' }, { status: 404 });

    const { data: vehicles, error } = await supabase
      .from('site_vehicles')
      .select('id,store_id,store_name,brand,model,version,year,manufacture_year,model_year,price,mileage,status,image_url,image_urls,show_on_landing')
      .eq('status', 'disponivel')
      .eq('show_on_landing', true)
      .gt('price', 0)
      .order('brand', { ascending: true })
      .order('model', { ascending: true })
      .limit(400);

    if (error) throw error;

    const record = target.record;
    return NextResponse.json({
      lead: {
        id: record.id,
        kind: target.kind,
        interested_vehicle_id: target.kind === 'lead' ? record.interested_vehicle_id || null : record.vehicle_id || null,
        interested_vehicle: target.kind === 'lead' ? record.interested_vehicle || null : record.vehicle_name || null
      },
      vehicles: (vehicles || []).map((vehicle: any) => ({
        ...vehicle,
        display_name: vehicleName(vehicle),
        image_url: vehicle.image_url || vehicle.image_urls?.[0] || null
      }))
    }, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Não foi possível carregar o estoque do portal.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const supabase = getAdminClient();
    const master = await requireMaster(request, supabase);
    if (!master) return NextResponse.json({ error: 'Acesso restrito ao perfil Master.' }, { status: 403 });

    const body = await request.json();
    const leadId = cleanText(body.lead_id, 80);
    const baseLeadId = cleanText(body.base_lead_id, 80);
    const vehicleId = cleanText(body.vehicle_id, 80);

    if ((!leadId && !baseLeadId) || !vehicleId) {
      return NextResponse.json({ error: 'Informe o lead e o veículo do portal.' }, { status: 400 });
    }

    const target = await loadTarget(supabase, leadId, baseLeadId);
    if (!target) return NextResponse.json({ error: 'Lead não encontrado.' }, { status: 404 });

    const { data: vehicle, error: vehicleError } = await supabase
      .from('site_vehicles')
      .select('id,store_id,store_name,brand,model,version,year,model_year,price,status,image_url,image_urls,show_on_landing')
      .eq('id', vehicleId)
      .eq('status', 'disponivel')
      .eq('show_on_landing', true)
      .gt('price', 0)
      .maybeSingle();

    if (vehicleError) throw vehicleError;
    if (!vehicle) return NextResponse.json({ error: 'O veículo selecionado não está disponível no portal.' }, { status: 400 });

    const now = new Date().toISOString();
    const nextVehicle = vehicleName(vehicle);
    const actorName = master.full_name || master.email || 'Master';
    const activityLabel = `Veículo de interesse do portal vinculado: ${nextVehicle}`;
    const record = target.record;

    let updatedLead: any = null;
    let previousVehicle: string | null = null;
    let previousVehicleId: string | null = null;
    let storeName: string | null = null;
    let customerName: string | null = null;
    let customerPhone: string | null = null;
    let status: string | null = null;
    let eventId: string | null = null;

    if (target.kind === 'lead') {
      previousVehicle = record.interested_vehicle || null;
      previousVehicleId = record.interested_vehicle_id || null;
      customerName = record.customer_name || null;
      customerPhone = record.customer_phone || null;
      status = record.status || null;
      eventId = record.event_id || null;

      const { data, error: updateError } = await supabase
        .from('leads')
        .update({
          interested_vehicle_id: vehicle.id,
          interested_vehicle: nextVehicle,
          interested_vehicle_price: vehicle.price || null,
          updated_at: now,
          last_activity_at: now,
          last_activity_type: 'vehicle_interest_updated',
          last_activity_label: activityLabel,
          last_activity_by_name: actorName
        })
        .eq('id', record.id)
        .select('id,interested_vehicle_id,interested_vehicle,interested_vehicle_price,updated_at')
        .single();

      if (updateError) throw updateError;
      updatedLead = data;

      if (record.assigned_store_id) {
        const { data: store } = await supabase.from('stores').select('store_name').eq('id', record.assigned_store_id).maybeSingle();
        storeName = store?.store_name || null;
      }
    } else {
      previousVehicle = record.vehicle_name || null;
      previousVehicleId = record.vehicle_id || null;
      customerName = record.name || null;
      customerPhone = record.phone || null;
      status = record.status || null;
      eventId = record.event_id || null;
      storeName = record.assigned_store_name || null;

      const { data, error: updateError } = await supabase
        .from('leads_base')
        .update({
          vehicle_id: vehicle.id,
          vehicle_name: nextVehicle,
          vehicle_price: vehicle.price || null,
          updated_at: now
        })
        .eq('id', record.id)
        .select('id,vehicle_id,vehicle_name,vehicle_price,updated_at')
        .single();

      if (updateError) throw updateError;
      updatedLead = data;
    }

    const metadata = {
      previous_vehicle: previousVehicle,
      previous_vehicle_id: previousVehicleId,
      vehicle_id: vehicle.id,
      vehicle_name: nextVehicle,
      vehicle_price: vehicle.price || null,
      vehicle_store_id: vehicle.store_id || null,
      vehicle_store_name: vehicle.store_name || null,
      actor_role: 'master',
      target_kind: target.kind,
      registered_from: 'master_whatsapp_portal_stock'
    };

    await Promise.allSettled([
      supabase.from('lead_activity_logs').insert({
        lead_id: target.kind === 'lead' ? record.id : null,
        base_lead_id: target.kind === 'base' ? record.id : target.baseLead?.id || null,
        store_id: record.assigned_store_id || null,
        store_name: storeName,
        user_id: master.id,
        user_name: actorName,
        activity_type: 'vehicle_interest_updated',
        activity_label: activityLabel,
        from_status: status,
        to_status: status,
        customer_name: customerName,
        customer_phone: customerPhone,
        vehicle_name: nextVehicle,
        notes: previousVehicle ? `Interesse anterior: ${previousVehicle}.` : null,
        metadata
      }),
      supabase.from('audit_logs').insert({
        event_id: eventId,
        user_id: master.id,
        user_role: 'master',
        action_type: 'vehicle_interest_updated',
        entity_type: target.kind === 'lead' ? 'leads' : 'leads_base',
        entity_id: record.id,
        old_value: {
          interested_vehicle_id: previousVehicleId,
          interested_vehicle: previousVehicle
        },
        new_value: {
          interested_vehicle_id: vehicle.id,
          interested_vehicle: nextVehicle,
          interested_vehicle_price: vehicle.price || null
        }
      })
    ]);

    return NextResponse.json({
      success: true,
      message: target.kind === 'base'
        ? 'Veículo do portal vinculado ao lead da Base Master.'
        : 'Veículo do portal vinculado ao lead.',
      lead: updatedLead,
      target_kind: target.kind,
      vehicle: { ...vehicle, display_name: nextVehicle }
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Não foi possível atualizar o veículo de interesse.' }, { status: 500 });
  }
}
