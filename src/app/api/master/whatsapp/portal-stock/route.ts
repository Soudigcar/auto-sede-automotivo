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
    .select('id,event_id,assigned_store_id,customer_name,customer_phone,interested_vehicle,interested_vehicle_id,status')
    .eq('id', leadId)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

export async function GET(request: Request) {
  try {
    const supabase = getAdminClient();
    const master = await requireMaster(request, supabase);
    if (!master) return NextResponse.json({ error: 'Acesso restrito ao perfil Master.' }, { status: 403 });

    const leadId = cleanText(new URL(request.url).searchParams.get('lead_id'), 80);
    if (!leadId) return NextResponse.json({ error: 'Informe o lead.' }, { status: 400 });

    const lead = await loadLead(supabase, leadId);
    if (!lead) return NextResponse.json({ error: 'Lead não encontrado.' }, { status: 404 });

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

    return NextResponse.json({
      lead: {
        id: lead.id,
        interested_vehicle_id: lead.interested_vehicle_id || null,
        interested_vehicle: lead.interested_vehicle || null
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
    const vehicleId = cleanText(body.vehicle_id, 80);

    if (!leadId || !vehicleId) {
      return NextResponse.json({ error: 'Informe o lead e o veículo do portal.' }, { status: 400 });
    }

    const lead = await loadLead(supabase, leadId);
    if (!lead) return NextResponse.json({ error: 'Lead não encontrado.' }, { status: 404 });

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
    const previousVehicle = lead.interested_vehicle || null;
    const actorName = master.full_name || master.email || 'Master';
    const activityLabel = `Veículo de interesse do portal vinculado: ${nextVehicle}`;

    const { data: updatedLead, error: updateError } = await supabase
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
      .eq('id', lead.id)
      .select('id,interested_vehicle_id,interested_vehicle,interested_vehicle_price,updated_at')
      .single();

    if (updateError) throw updateError;

    let storeName: string | null = null;
    if (lead.assigned_store_id) {
      const { data: store } = await supabase.from('stores').select('store_name').eq('id', lead.assigned_store_id).maybeSingle();
      storeName = store?.store_name || null;
    }

    const metadata = {
      previous_vehicle: previousVehicle,
      previous_vehicle_id: lead.interested_vehicle_id || null,
      vehicle_id: vehicle.id,
      vehicle_name: nextVehicle,
      vehicle_price: vehicle.price || null,
      vehicle_store_id: vehicle.store_id || null,
      vehicle_store_name: vehicle.store_name || null,
      actor_role: 'master',
      registered_from: 'master_whatsapp_portal_stock'
    };

    await Promise.allSettled([
      supabase.from('lead_activity_logs').insert({
        lead_id: lead.id,
        store_id: lead.assigned_store_id || null,
        store_name: storeName,
        user_id: master.id,
        user_name: actorName,
        activity_type: 'vehicle_interest_updated',
        activity_label: activityLabel,
        from_status: lead.status || null,
        to_status: lead.status || null,
        customer_name: lead.customer_name || null,
        customer_phone: lead.customer_phone || null,
        vehicle_name: nextVehicle,
        notes: previousVehicle ? `Interesse anterior: ${previousVehicle}.` : null,
        metadata
      }),
      supabase.from('audit_logs').insert({
        event_id: lead.event_id || null,
        user_id: master.id,
        user_role: 'master',
        action_type: 'vehicle_interest_updated',
        entity_type: 'leads',
        entity_id: lead.id,
        old_value: {
          interested_vehicle_id: lead.interested_vehicle_id || null,
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
      message: 'Veículo do portal vinculado ao lead.',
      lead: updatedLead,
      vehicle: { ...vehicle, display_name: nextVehicle }
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Não foi possível atualizar o veículo de interesse.' }, { status: 500 });
  }
}
