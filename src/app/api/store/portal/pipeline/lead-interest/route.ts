import { NextResponse } from 'next/server';
import { cleanText } from '@/lib/server/storeTeam';
import { authorizeStorePortal, canAccessStoreLead } from '@/lib/server/storePortal';

export const runtime = 'nodejs';

function vehicleName(vehicle: any) {
  return [vehicle?.brand, vehicle?.model, vehicle?.version, vehicle?.year]
    .map((value) => cleanText(value, 120))
    .filter(Boolean)
    .join(' ');
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const slug = cleanText(body.slug, 120);
    const leadId = cleanText(body.lead_id, 80);
    const vehicleId = cleanText(body.vehicle_id, 80) || null;

    if (!slug || !leadId) {
      return NextResponse.json({ error: 'Informe a loja e o lead.' }, { status: 400 });
    }

    const context = await authorizeStorePortal(request, slug);
    if ('error' in context) return context.error;

    const { data: lead, error: leadError } = await context.supabase
      .from('leads')
      .select('id,event_id,assigned_store_id,assigned_user_id,assigned_user_role,pre_sales_user_id,seller_user_id,captured_by_user_id,customer_name,customer_phone,interested_vehicle,interested_vehicle_id,status')
      .eq('id', leadId)
      .maybeSingle();

    if (leadError) throw leadError;
    if (!lead || lead.assigned_store_id !== context.store.id || !canAccessStoreLead(context.profile, context.role, lead)) {
      return NextResponse.json({ error: 'Lead não encontrado na carteira deste usuário.' }, { status: 404 });
    }

    let vehicle: any = null;
    if (vehicleId) {
      const { data, error } = await context.supabase
        .from('site_vehicles')
        .select('id,store_id,brand,model,version,year,price,status,image_url')
        .eq('id', vehicleId)
        .eq('store_id', context.store.id)
        .in('status', ['disponivel', 'oculto'])
        .maybeSingle();

      if (error) throw error;
      if (!data) {
        return NextResponse.json({ error: 'O veículo selecionado não está disponível no estoque desta loja.' }, { status: 400 });
      }
      vehicle = data;
    }

    const now = new Date().toISOString();
    const actorName = context.profile.full_name || context.profile.email || 'Usuário da loja';
    const previousVehicle = lead.interested_vehicle || null;
    const nextVehicle = vehicle ? vehicleName(vehicle) : null;
    const activityLabel = vehicle
      ? `Veículo de interesse vinculado: ${nextVehicle}`
      : 'Vínculo com veículo do estoque removido';

    const { data: updatedLead, error: updateError } = await context.supabase
      .from('leads')
      .update({
        interested_vehicle_id: vehicle?.id || null,
        interested_vehicle: nextVehicle,
        interested_vehicle_price: vehicle?.price || null,
        updated_at: now,
        last_activity_at: now,
        last_activity_type: 'vehicle_interest_updated',
        last_activity_label: activityLabel,
        last_activity_by_name: actorName
      })
      .eq('id', lead.id)
      .eq('assigned_store_id', context.store.id)
      .select('id,interested_vehicle_id,interested_vehicle,interested_vehicle_price,updated_at')
      .single();

    if (updateError) throw updateError;

    const metadata = {
      previous_vehicle: previousVehicle,
      previous_vehicle_id: lead.interested_vehicle_id || null,
      vehicle_id: vehicle?.id || null,
      vehicle_name: nextVehicle,
      vehicle_price: vehicle?.price || null,
      actor_role: context.role,
      registered_from: 'pipeline_lead_workspace'
    };

    await Promise.allSettled([
      context.supabase.from('lead_activity_logs').insert({
        lead_id: lead.id,
        store_id: context.store.id,
        store_name: context.store.store_name,
        user_id: context.profile.id,
        user_name: actorName,
        activity_type: 'vehicle_interest_updated',
        activity_label: activityLabel,
        from_status: lead.status,
        to_status: lead.status,
        customer_name: lead.customer_name,
        customer_phone: lead.customer_phone,
        vehicle_name: nextVehicle,
        notes: previousVehicle ? `Interesse anterior: ${previousVehicle}.` : null,
        metadata
      }),
      context.supabase.from('lead_activities').insert({
        event_id: lead.event_id || context.store.event_id || null,
        lead_id: lead.id,
        user_id: context.profile.id,
        activity_type: 'vehicle_interest_updated',
        description: activityLabel,
        metadata
      }),
      context.supabase.from('audit_logs').insert({
        event_id: lead.event_id || context.store.event_id || null,
        user_id: context.profile.id,
        user_role: context.role,
        action_type: 'vehicle_interest_updated',
        entity_type: 'leads',
        entity_id: lead.id,
        old_value: {
          interested_vehicle_id: lead.interested_vehicle_id || null,
          interested_vehicle: previousVehicle
        },
        new_value: {
          interested_vehicle_id: vehicle?.id || null,
          interested_vehicle: nextVehicle,
          interested_vehicle_price: vehicle?.price || null
        }
      })
    ]);

    return NextResponse.json({
      success: true,
      message: vehicle ? 'Veículo do estoque vinculado ao lead.' : 'Vínculo com o veículo removido.',
      lead: updatedLead,
      vehicle
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Não foi possível atualizar o veículo de interesse.' }, { status: 500 });
  }
}
