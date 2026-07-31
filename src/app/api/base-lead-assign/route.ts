import { NextResponse } from 'next/server';
import { getAdminClient, requireMaster } from '@/lib/server/masterApi';

export const runtime = 'nodejs';

function cleanText(value: unknown) {
  return String(value || '').trim();
}

export async function POST(request: Request) {
  try {
    const supabase = getAdminClient();
    const master = await requireMaster(request, supabase);

    if (!master) {
      return NextResponse.json({ error: 'Acesso restrito ao Master.' }, { status: 403 });
    }

    const body = await request.json();
    const leadId = cleanText(body.lead_id);
    const storeId = cleanText(body.store_id);

    if (!leadId || !storeId) {
      return NextResponse.json({ error: 'Lead e loja são obrigatórios.' }, { status: 400 });
    }

    const { data: leadBase } = await supabase
      .from('leads_base')
      .select('*')
      .eq('id', leadId)
      .maybeSingle();

    if (!leadBase) {
      return NextResponse.json({ error: 'Lead da Base não encontrado.' }, { status: 404 });
    }

    const { data: store } = await supabase
      .from('stores')
      .select('id,store_name,status,portal_enabled')
      .eq('id', storeId)
      .maybeSingle();

    const storeStatus = String(store?.status || '').toLowerCase();

    if (!store || storeStatus === 'deleted' || storeStatus === 'excluido') {
      return NextResponse.json({ error: 'Loja válida não encontrada.' }, { status: 404 });
    }

    if (leadBase.event_id) {
      const [{ data: event }, { data: participation }] = await Promise.all([
        supabase
          .from('events')
          .select('id,event_name,status')
          .eq('id', leadBase.event_id)
          .neq('status', 'deleted')
          .maybeSingle(),
        supabase
          .from('store_event_participations')
          .select('id,status')
          .eq('event_id', leadBase.event_id)
          .eq('store_id', store.id)
          .in('status', ['active', 'inactive'])
          .maybeSingle()
      ]);

      if (!event) {
        return NextResponse.json({ error: 'O evento deste lead não foi encontrado.' }, { status: 409 });
      }

      if (!participation) {
        return NextResponse.json(
          { error: `A loja ${store.store_name} não participa do evento ${event.event_name}.` },
          { status: 409 }
        );
      }
    }

    let routedLeadId = leadBase.routed_lead_id || null;

    if (routedLeadId) {
      const { data: currentRoutedLead } = await supabase
        .from('leads')
        .select('id,event_id')
        .eq('id', routedLeadId)
        .maybeSingle();

      if (currentRoutedLead?.id) {
        if (leadBase.event_id && currentRoutedLead.event_id && currentRoutedLead.event_id !== leadBase.event_id) {
          return NextResponse.json({ error: 'O lead operacional está vinculado a outro evento. Redirecionamento bloqueado.' }, { status: 409 });
        }

        const { error: routedUpdateError } = await supabase
          .from('leads')
          .update({
            event_id: leadBase.event_id || currentRoutedLead.event_id || null,
            assigned_store_id: store.id,
            updated_at: new Date().toISOString()
          })
          .eq('id', routedLeadId);

        if (routedUpdateError) {
          return NextResponse.json({ error: routedUpdateError.message }, { status: 500 });
        }
      } else {
        routedLeadId = null;
      }
    }

    if (!routedLeadId) {
      const { data: createdLead, error: createdLeadError } = await supabase
        .from('leads')
        .insert({
          event_id: leadBase.event_id || null,
          customer_name: leadBase.name,
          customer_phone: leadBase.phone,
          customer_bank: '',
          interested_vehicle: leadBase.vehicle_name || '',
          vehicle_category_interest: '',
          origin: 'manual',
          assigned_store_id: store.id,
          status: 'new_lead',
          notes: 'Lead redirecionado manualmente pela Base Master.'
        })
        .select('id')
        .single();

      if (createdLeadError || !createdLead?.id) {
        return NextResponse.json(
          { error: createdLeadError?.message || 'Erro ao criar lead no pipeline da loja.' },
          { status: 500 }
        );
      }

      routedLeadId = createdLead.id;
    }

    const assignedAt = new Date().toISOString();
    const metadata = {
      ...(leadBase.metadata || {}),
      event_id: leadBase.event_id || null,
      routing: {
        ...(leadBase.metadata?.routing || {}),
        strategy: 'manual_override',
        previous_store_id: leadBase.assigned_store_id || null,
        previous_store_name: leadBase.assigned_store_name || null,
        assigned_store_id: store.id,
        assigned_store_name: store.store_name,
        assigned_at: assignedAt,
        routed_lead_id: routedLeadId
      }
    };

    const { error: updateError } = await supabase
      .from('leads_base')
      .update({
        event_id: leadBase.event_id || null,
        assigned_store_id: store.id,
        assigned_store_name: store.store_name,
        assigned_at: assignedAt,
        routed_lead_id: routedLeadId,
        routing_strategy: 'manual_override',
        metadata,
        updated_at: assignedAt
      })
      .eq('id', leadBase.id);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      event_id: leadBase.event_id || null,
      assigned_store_id: store.id,
      assigned_store_name: store.store_name,
      routed_lead_id: routedLeadId
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Erro ao redirecionar lead.' },
      { status: 500 }
    );
  }
}
