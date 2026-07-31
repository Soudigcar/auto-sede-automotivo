import { NextResponse } from 'next/server';
import { getAdminClient, requireMaster } from '@/lib/server/masterApi';

export const runtime = 'nodejs';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: Request) {
  try {
    const supabase = getAdminClient();
    const master = await requireMaster(request, supabase);

    if (!master) {
      return NextResponse.json({ error: 'Acesso restrito ao perfil Master.' }, { status: 403 });
    }

    const url = new URL(request.url);
    const requestedScope = String(url.searchParams.get('event_scope') || 'auto').trim();

    const { data: eventRows, error: eventError } = await supabase
      .from('events')
      .select('id,event_name,status,start_date,end_date,state,city,location,created_at')
      .neq('status', 'deleted')
      .order('start_date', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false });

    if (eventError) throw eventError;

    const events = eventRows || [];
    const eventMap = new Map(events.map((event: any) => [event.id, event]));
    const activeEventIds = events.filter((event: any) => event.status === 'active').map((event: any) => event.id);

    let resolvedScope = requestedScope;

    if (resolvedScope === 'auto') {
      resolvedScope = activeEventIds.length === 1 ? activeEventIds[0] : 'active';
    }

    const isNamedScope = ['all', 'active', 'unassigned'].includes(resolvedScope);
    if (!isNamedScope && (!UUID_PATTERN.test(resolvedScope) || !eventMap.has(resolvedScope))) {
      resolvedScope = activeEventIds.length === 1 ? activeEventIds[0] : 'active';
    }

    const [storeResult, participationResult] = await Promise.all([
      supabase
        .from('stores')
        .select('id,store_name,status,portal_enabled,slug')
        .order('store_name', { ascending: true }),
      supabase
        .from('store_event_participations')
        .select('event_id,store_id,status')
    ]);

    if (storeResult.error) throw storeResult.error;
    if (participationResult.error) throw participationResult.error;

    let leads: any[] = [];

    if (!(resolvedScope === 'active' && activeEventIds.length === 0)) {
      let leadQuery = supabase
        .from('leads')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1000);

      if (resolvedScope === 'active') {
        leadQuery = leadQuery.in('event_id', activeEventIds);
      } else if (resolvedScope === 'unassigned') {
        leadQuery = leadQuery.is('event_id', null);
      } else if (UUID_PATTERN.test(resolvedScope)) {
        leadQuery = leadQuery.eq('event_id', resolvedScope);
      }

      const leadResult = await leadQuery;
      if (leadResult.error) throw leadResult.error;
      leads = leadResult.data || [];
    }

    const allStores = (storeResult.data || []).filter((store: any) => {
      const status = String(store.status || '').toLowerCase();
      return status !== 'deleted' && status !== 'excluido';
    });

    const participations = participationResult.data || [];
    const allowedStoreIds = new Set<string>();

    if (resolvedScope === 'active') {
      for (const participation of participations) {
        if (activeEventIds.includes(participation.event_id) && participation.status === 'active') {
          allowedStoreIds.add(participation.store_id);
        }
      }
    } else if (UUID_PATTERN.test(resolvedScope)) {
      for (const participation of participations) {
        if (participation.event_id === resolvedScope && ['active', 'inactive'].includes(participation.status)) {
          allowedStoreIds.add(participation.store_id);
        }
      }
    }

    for (const lead of leads) {
      if (lead.assigned_store_id) allowedStoreIds.add(lead.assigned_store_id);
    }

    const stores = ['all', 'unassigned'].includes(resolvedScope)
      ? allStores
      : allStores.filter((store: any) => allowedStoreIds.has(store.id));

    const storeNames = new Map(allStores.map((store: any) => [store.id, store.store_name]));
    const leadIds = leads.map((lead: any) => lead.id).filter(Boolean);

    let activities: any[] = [];

    if (leadIds.length) {
      const { data, error } = await supabase
        .from('lead_activity_logs')
        .select('*')
        .in('lead_id', leadIds)
        .order('created_at', { ascending: false })
        .limit(5000);

      if (error) throw error;
      activities = data || [];
    }

    const selectedEvent = UUID_PATTERN.test(resolvedScope) ? eventMap.get(resolvedScope) || null : null;
    const historicalScope = Boolean(selectedEvent && selectedEvent.status !== 'active');

    return NextResponse.json({
      success: true,
      generated_at: new Date().toISOString(),
      requested_event_scope: requestedScope,
      resolved_event_scope: resolvedScope,
      historical_scope: historicalScope,
      active_event_ids: activeEventIds,
      events,
      leads: leads.map((lead: any) => ({
        ...lead,
        event_name: lead.event_id ? eventMap.get(lead.event_id)?.event_name || 'Evento não identificado' : 'Sem evento / campanha geral',
        event_status: lead.event_id ? eventMap.get(lead.event_id)?.status || null : null,
        assigned_store_name: storeNames.get(lead.assigned_store_id) || 'Loja não identificada'
      })),
      activities,
      stores
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Erro ao carregar monitoramento de leads.' },
      { status: 500 }
    );
  }
}
