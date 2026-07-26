import { NextResponse } from 'next/server';
import { createAdminClient, getProfileFromToken, readBearerToken } from '@/lib/server/storeTeam';

export const runtime = 'nodejs';

type Row = Record<string, any>;

function normalize(value: unknown) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function isInsidePeriod(item: Row, dateFrom: string, dateTo: string, fields: string[]) {
  if (!dateFrom && !dateTo) return true;
  const rawDate = fields.map((field) => item?.[field]).find(Boolean);
  if (!rawDate) return true;
  const dateValue = String(rawDate).slice(0, 10);
  if (dateFrom && dateValue < dateFrom) return false;
  if (dateTo && dateValue > dateTo) return false;
  return true;
}

function isActiveStore(store: Row) {
  return !['deleted', 'excluido', 'inactive', 'inativo'].includes(normalize(store?.status));
}

function isActiveSiteVehicle(vehicle: Row) {
  const status = normalize(vehicle?.status);
  if (vehicle?.show_on_landing === false) return false;
  return !['oculto', 'deleted', 'excluido', 'rejected', 'duplicate', 'vendido', 'sold', 'reservado', 'reserved', 'inactive', 'inativo'].includes(status);
}

function isPublishedStockLink(link: Row) {
  const status = normalize(link?.status);
  const metadata = link?.metadata || {};
  if (metadata.store_removed === true) return false;
  if (['rejected', 'duplicate', 'deleted', 'excluido'].includes(status)) return false;
  return status === 'published' || Boolean(link?.imported_vehicle_id);
}

function buildAvailableStockRows({
  stores,
  siteVehicles,
  submissions,
  selectedEventId,
  selectedStoreId
}: {
  stores: Row[];
  siteVehicles: Row[];
  submissions: Row[];
  selectedEventId: string;
  selectedStoreId: string;
}) {
  const visibleStores = stores.filter(isActiveStore).filter((store) => {
    if (selectedEventId !== 'all' && store.event_id !== selectedEventId) return false;
    if (selectedStoreId !== 'all' && store.id !== selectedStoreId) return false;
    return true;
  });

  const storeById = new Map(visibleStores.map((store) => [store.id, store]));
  const storeByName = new Map(visibleStores.map((store) => [normalize(store.store_name), store]));
  const vehicleById = new Map(siteVehicles.map((vehicle) => [vehicle.id, vehicle]));

  const linkedRows = submissions
    .filter(isPublishedStockLink)
    .map((link) => {
      const store = storeById.get(link.store_id);
      if (!store) return null;

      if (link.imported_vehicle_id) {
        const vehicle = vehicleById.get(link.imported_vehicle_id);
        if (!vehicle || !isActiveSiteVehicle(vehicle)) return null;
      }

      return {
        id: link.imported_vehicle_id || link.id,
        store_id: store.id,
        event_id: store.event_id
      };
    })
    .filter(Boolean) as Row[];

  const linkedVehicleIds = new Set(linkedRows.map((item) => item.id).filter(Boolean));

  const manualRows = siteVehicles
    .filter(isActiveSiteVehicle)
    .filter((vehicle) => !linkedVehicleIds.has(vehicle.id))
    .map((vehicle) => {
      const store = storeByName.get(normalize(vehicle.store_name));
      if (!store) return null;
      return { id: vehicle.id, store_id: store.id, event_id: store.event_id };
    })
    .filter(Boolean) as Row[];

  const unique = new Map<string, Row>();
  [...linkedRows, ...manualRows].forEach((item) => {
    const key = `${item.store_id}:${item.id}`;
    if (!unique.has(key)) unique.set(key, item);
  });

  return Array.from(unique.values());
}

function memberName(userMap: Map<string, Row>, id: unknown, fallback?: unknown) {
  const user = id ? userMap.get(String(id)) : null;
  return String(user?.full_name || user?.email || fallback || '').trim();
}

function buildRanking(rows: Row[], resolveName: (row: Row) => string) {
  const grouped = new Map<string, { name: string; sales: number; revenue: number }>();

  rows.forEach((row) => {
    const name = resolveName(row);
    if (!name) return;
    const key = normalize(name);
    const current = grouped.get(key) || { name, sales: 0, revenue: 0 };
    current.sales += 1;
    current.revenue += Number(row.sale_value || 0);
    grouped.set(key, current);
  });

  return Array.from(grouped.values())
    .sort((a, b) => b.sales - a.sales || b.revenue - a.revenue || a.name.localeCompare(b.name, 'pt-BR'))
    .slice(0, 5)
    .map((item) => `${item.name} — ${item.sales} venda${item.sales === 1 ? '' : 's'} · ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.revenue)}`);
}

export async function GET(request: Request) {
  try {
    const supabase: any = createAdminClient();
    const token = readBearerToken(request);
    if (!token) return NextResponse.json({ error: 'Sessão não encontrada.' }, { status: 401 });

    const profile = await getProfileFromToken(supabase, token);
    if (!profile || profile.status !== 'active' || profile.role !== 'master') {
      return NextResponse.json({ error: 'Acesso exclusivo do Master.' }, { status: 403 });
    }

    const url = new URL(request.url);
    const selectedEventId = url.searchParams.get('event_id') || 'all';
    const selectedStoreId = url.searchParams.get('store_id') || 'all';
    const dateFrom = url.searchParams.get('date_from') || '';
    const dateTo = url.searchParams.get('date_to') || '';

    const [
      eventsResult,
      storesResult,
      leadsResult,
      salesResult,
      siteVehiclesResult,
      submissionsResult,
      financeResult,
      surveysResult,
      activityResult,
      usersResult,
      prospectorsResult
    ] = await Promise.all([
      supabase.from('events').select('id,event_name,status,created_at').neq('status', 'deleted').order('created_at', { ascending: false }),
      supabase.from('stores').select('id,event_id,store_name,status,portal_enabled').neq('status', 'deleted').order('store_name'),
      supabase.from('leads').select('id,event_id,assigned_store_id,customer_phone,status,scheduled_at,vehicle_category_interest,created_at'),
      supabase.from('sales').select('id,event_id,lead_id,store_id,seller_name,seller_user_id,pre_sales_user_id,captured_by_user_id,prospector_id,financing_bank,payment_type,sale_value,vehicle_category,confirmed_at,created_at'),
      supabase.from('site_vehicles').select('id,status,show_on_landing,store_name'),
      supabase.from('store_vehicle_link_submissions').select('id,event_id,store_id,status,imported_vehicle_id,metadata'),
      supabase.from('financial_entries').select('id,event_id,movement_type,sponsor_bank,amount,payment_date,created_at,status').neq('status', 'deleted'),
      supabase.from('street_surveys').select('id,event_id,assigned_store_id,created_at'),
      supabase.from('lead_activity_logs').select('lead_id,activity_type,created_at'),
      supabase.from('users').select('id,full_name,email'),
      supabase.from('prospectors').select('id,user_id,full_name')
    ]);

    const requiredResults = [eventsResult, storesResult, leadsResult, salesResult, siteVehiclesResult, submissionsResult, financeResult, surveysResult, activityResult, usersResult, prospectorsResult];
    const firstError = requiredResults.find((result) => result.error)?.error;
    if (firstError) throw firstError;

    const eventRows = eventsResult.data || [];
    const allStores = storesResult.data || [];
    const allLeads = leadsResult.data || [];
    const allSales = salesResult.data || [];
    const allSurveys = surveysResult.data || [];
    const allActivities = activityResult.data || [];
    const userMap = new Map((usersResult.data || []).map((user: Row) => [String(user.id), user]));
    const prospectorMap = new Map((prospectorsResult.data || []).map((prospector: Row) => [String(prospector.id), prospector]));

    const visibleStores = allStores.filter(isActiveStore).filter((store: Row) => selectedEventId === 'all' || store.event_id === selectedEventId);
    const rankingStores = visibleStores.filter((store: Row) => selectedStoreId === 'all' || store.id === selectedStoreId);

    const leadRows = allLeads
      .filter((lead: Row) => selectedEventId === 'all' || lead.event_id === selectedEventId)
      .filter((lead: Row) => selectedStoreId === 'all' || lead.assigned_store_id === selectedStoreId)
      .filter((lead: Row) => isInsidePeriod(lead, dateFrom, dateTo, ['created_at']));

    const saleRows = allSales
      .filter((sale: Row) => selectedEventId === 'all' || sale.event_id === selectedEventId)
      .filter((sale: Row) => selectedStoreId === 'all' || sale.store_id === selectedStoreId)
      .filter((sale: Row) => isInsidePeriod(sale, dateFrom, dateTo, ['confirmed_at', 'created_at']));

    const surveyRows = allSurveys
      .filter((survey: Row) => selectedEventId === 'all' || survey.event_id === selectedEventId)
      .filter((survey: Row) => selectedStoreId === 'all' || survey.assigned_store_id === selectedStoreId)
      .filter((survey: Row) => isInsidePeriod(survey, dateFrom, dateTo, ['created_at']));

    const financeRows = (financeResult.data || [])
      .filter((item: Row) => selectedEventId === 'all' || item.event_id === selectedEventId)
      .filter((item: Row) => isInsidePeriod(item, dateFrom, dateTo, ['payment_date', 'created_at']));

    const stockRows = buildAvailableStockRows({
      stores: allStores,
      siteVehicles: siteVehiclesResult.data || [],
      submissions: submissionsResult.data || [],
      selectedEventId,
      selectedStoreId
    });

    const filteredLeadIds = new Set(leadRows.map((lead: Row) => String(lead.id)));
    const lifecycleActivities = allActivities.filter((activity: Row) => filteredLeadIds.has(String(activity.lead_id)));
    const periodActivities = lifecycleActivities.filter((activity: Row) => isInsidePeriod(activity, dateFrom, dateTo, ['created_at']));

    const totalLeads = leadRows.length;
    const surveysCount = surveyRows.length;
    const leadsWithPhone = leadRows.filter((lead: Row) => Boolean(String(lead.customer_phone || '').trim())).length;
    const directedToStore = leadRows.filter((lead: Row) => Boolean(lead.assigned_store_id)).length;
    const salesCount = saleRows.length;
    const conversionRate = leadsWithPhone > 0 ? (salesCount / leadsWithPhone) * 100 : 0;
    const totalRevenue = saleRows.reduce((sum: number, sale: Row) => sum + Number(sale.sale_value || 0), 0);

    const financedSales = saleRows.filter((sale: Row) => normalize(sale.payment_type) === 'financed');
    const validFinancedBanks = financedSales
      .map((sale: Row) => String(sale.financing_bank || '').trim())
      .filter((bank: string) => bank && !['nao informado', 'nao se aplica'].includes(normalize(bank)));
    const financedBanksCount = new Set(validFinancedBanks.map(normalize)).size;

    const startedTypes = new Set(['status_changed', 'whatsapp_clicked', 'phone_viewed', 'schedule_created', 'showed_up_marked', 'sale_confirmed', 'lead_transferred', 'lead_edited']);
    const startedLeadIds = new Set<string>();
    leadRows.forEach((lead: Row) => {
      if (normalize(lead.status) !== 'new_lead') startedLeadIds.add(String(lead.id));
    });
    lifecycleActivities.forEach((activity: Row) => {
      if (startedTypes.has(String(activity.activity_type))) startedLeadIds.add(String(activity.lead_id));
    });

    const scheduledLeadIds = new Set<string>();
    leadRows.forEach((lead: Row) => {
      if (lead.scheduled_at || ['scheduled', 'showed_up', 'no_show', 'appointment_cancelled', 'sale_confirmed'].includes(normalize(lead.status))) {
        scheduledLeadIds.add(String(lead.id));
      }
    });
    lifecycleActivities.forEach((activity: Row) => {
      if (['schedule_created', 'showed_up_marked', 'sale_confirmed'].includes(String(activity.activity_type))) scheduledLeadIds.add(String(activity.lead_id));
    });

    const showedLeadIds = new Set<string>();
    leadRows.forEach((lead: Row) => {
      if (['showed_up', 'sale_confirmed'].includes(normalize(lead.status))) showedLeadIds.add(String(lead.id));
    });
    lifecycleActivities.forEach((activity: Row) => {
      if (['showed_up_marked', 'sale_confirmed'].includes(String(activity.activity_type))) showedLeadIds.add(String(activity.lead_id));
    });

    const soldLeadIds = new Set(saleRows.map((sale: Row) => String(sale.lead_id)).filter(Boolean));
    const percent = (count: number) => totalLeads > 0 ? (count / totalLeads) * 100 : 0;
    const funnel = [
      { label: 'Leads captados', count: totalLeads, percent: percent(totalLeads), color: '#0B84F3' },
      { label: 'Com telefone', count: leadsWithPhone, percent: percent(leadsWithPhone), color: '#FF941A' },
      { label: 'Direcionados', count: directedToStore, percent: percent(directedToStore), color: '#EE2737' },
      { label: 'Atendimento iniciado', count: startedLeadIds.size, percent: percent(startedLeadIds.size), color: '#168AE5' },
      { label: 'Agendamento', count: scheduledLeadIds.size, percent: percent(scheduledLeadIds.size), color: '#15A85A' },
      { label: 'Comparecimento', count: showedLeadIds.size, percent: percent(showedLeadIds.size), color: '#00A86B' },
      { label: 'Venda', count: soldLeadIds.size, percent: percent(soldLeadIds.size), color: '#E30613' }
    ];

    const leadById = new Map(leadRows.map((lead: Row) => [String(lead.id), lead]));
    const categoryGroups = new Map<string, { label: string; leads: number; sales: number }>();
    leadRows.forEach((lead: Row) => {
      const raw = String(lead.vehicle_category_interest || '').trim();
      if (!raw || ['nao informado', 'outro', 'outros'].includes(normalize(raw))) return;
      const key = normalize(raw);
      const current = categoryGroups.get(key) || { label: raw, leads: 0, sales: 0 };
      current.leads += 1;
      categoryGroups.set(key, current);
    });
    saleRows.forEach((sale: Row) => {
      const lead = leadById.get(String(sale.lead_id));
      const raw = String(sale.vehicle_category || lead?.vehicle_category_interest || '').trim();
      if (!raw || ['nao informado', 'outro', 'outros'].includes(normalize(raw))) return;
      const key = normalize(raw);
      const current = categoryGroups.get(key) || { label: raw, leads: 0, sales: 0 };
      current.sales += 1;
      categoryGroups.set(key, current);
    });
    const categories = Array.from(categoryGroups.values())
      .map((item) => ({ ...item, conversion: item.leads > 0 ? (item.sales / item.leads) * 100 : 0 }))
      .sort((a, b) => b.leads - a.leads || b.sales - a.sales)
      .slice(0, 8);

    const hourCounts = Array.from({ length: 24 }, (_, hour) => ({ hour, count: 0 }));
    const heatSource = periodActivities.length ? periodActivities : leadRows;
    heatSource.forEach((row: Row) => {
      const raw = row.created_at;
      if (!raw) return;
      const hour = new Date(raw).getHours();
      if (Number.isInteger(hour) && hour >= 0 && hour < 24) hourCounts[hour].count += 1;
    });

    const storeRanking = rankingStores
      .map((store: Row) => {
        const rows = saleRows.filter((sale: Row) => sale.store_id === store.id);
        const revenue = rows.reduce((sum: number, sale: Row) => sum + Number(sale.sale_value || 0), 0);
        return { name: store.store_name, sales: rows.length, revenue };
      })
      .sort((a: Row, b: Row) => b.sales - a.sales || b.revenue - a.revenue || String(a.name).localeCompare(String(b.name), 'pt-BR'))
      .slice(0, 5)
      .map((item: Row) => `${item.name} — ${item.sales} venda${item.sales === 1 ? '' : 's'} · ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.revenue)}`);

    const sellerRanking = buildRanking(saleRows, (sale) => memberName(userMap, sale.seller_user_id, sale.seller_name));
    const preSalesRanking = buildRanking(saleRows, (sale) => memberName(userMap, sale.pre_sales_user_id));
    const prospectorRanking = buildRanking(saleRows, (sale) => {
      const byUser = memberName(userMap, sale.captured_by_user_id);
      if (byUser) return byUser;
      const prospector = sale.prospector_id ? prospectorMap.get(String(sale.prospector_id)) : null;
      return String(prospector?.full_name || '').trim();
    });

    const selectedEvent = eventRows.find((event: Row) => event.id === selectedEventId);
    const sponsorship = financeRows
      .filter((item: Row) => normalize(item.movement_type) !== 'expense' && normalize(item.sponsor_bank) === 'bradesco')
      .reduce((sum: number, item: Row) => sum + Number(item.amount || 0), 0);
    const goalValue = Math.floor(sponsorship / 10000) * 1000000;
    const done = financedSales
      .filter((sale: Row) => normalize(sale.financing_bank) === 'bradesco')
      .reduce((sum: number, sale: Row) => sum + Number(sale.sale_value || 0), 0);
    const goalProgress = goalValue > 0 ? Math.min(100, (done / goalValue) * 100) : 0;

    return NextResponse.json({
      events: eventRows,
      stores: visibleStores,
      summary: {
        totalLeads,
        surveysCount,
        leadsWithPhone,
        salesCount,
        conversionRate,
        totalRevenue,
        financedBanksCount,
        financedSalesCount: financedSales.length,
        directedToStore,
        startedCount: startedLeadIds.size,
        totalCarsInEvent: stockRows.length
      },
      goal: {
        sponsorship,
        goal: goalValue,
        done,
        progress: goalProgress,
        label: selectedEventId === 'all' ? 'Todos os eventos' : selectedEvent?.event_name || 'Evento selecionado'
      },
      funnel,
      categories,
      heatmap: hourCounts,
      heatmapSource: periodActivities.length ? 'Atividades registradas' : 'Criação dos leads',
      rankings: {
        stores: storeRanking,
        sellers: sellerRanking,
        preSales: preSalesRanking,
        prospectors: prospectorRanking
      },
      updatedAt: new Date().toISOString()
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Não foi possível calcular os indicadores reais.' }, { status: 500 });
  }
}
