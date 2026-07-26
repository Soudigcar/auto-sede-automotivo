import { NextResponse } from 'next/server';
import { createAdminClient, getProfileFromToken, readBearerToken } from '@/lib/server/storeTeam';

export const runtime = 'nodejs';

type AnyRow = Record<string, any>;

function normalized(value: unknown) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function insidePeriod(row: AnyRow, from: string, to: string, fields: string[]) {
  if (!from && !to) return true;
  const raw = fields.map((field) => row?.[field]).find(Boolean);
  if (!raw) return true;
  const date = String(raw).slice(0, 10);
  return (!from || date >= from) && (!to || date <= to);
}

function activeStore(row: AnyRow) {
  return !['deleted', 'excluido', 'inactive', 'inativo'].includes(normalized(row.status));
}

function activeVehicle(row: AnyRow) {
  if (row.show_on_landing === false) return false;
  return !['oculto', 'deleted', 'excluido', 'rejected', 'duplicate', 'vendido', 'sold', 'reservado', 'reserved', 'inactive', 'inativo'].includes(normalized(row.status));
}

function publishedLink(row: AnyRow) {
  if (row?.metadata?.store_removed === true) return false;
  const status = normalized(row.status);
  if (['rejected', 'duplicate', 'deleted', 'excluido'].includes(status)) return false;
  return status === 'published' || Boolean(row.imported_vehicle_id);
}

function currency(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

function buildStock(stores: AnyRow[], vehicles: AnyRow[], links: AnyRow[], eventId: string, storeId: string) {
  const visibleStores = stores.filter(activeStore).filter((store) => {
    if (eventId !== 'all' && store.event_id !== eventId) return false;
    if (storeId !== 'all' && store.id !== storeId) return false;
    return true;
  });

  const storeById = new Map<string, AnyRow>();
  const storeByName = new Map<string, AnyRow>();
  const vehicleById = new Map<string, AnyRow>();
  visibleStores.forEach((store) => {
    storeById.set(String(store.id), store);
    storeByName.set(normalized(store.store_name), store);
  });
  vehicles.forEach((vehicle) => vehicleById.set(String(vehicle.id), vehicle));

  const rows: AnyRow[] = [];
  links.filter(publishedLink).forEach((link) => {
    const store = storeById.get(String(link.store_id));
    if (!store) return;
    if (link.imported_vehicle_id) {
      const vehicle = vehicleById.get(String(link.imported_vehicle_id));
      if (!vehicle || !activeVehicle(vehicle)) return;
    }
    rows.push({ id: link.imported_vehicle_id || link.id, store_id: store.id });
  });

  const linkedIds = new Set(rows.map((row) => String(row.id)));
  vehicles.filter(activeVehicle).forEach((vehicle) => {
    if (linkedIds.has(String(vehicle.id))) return;
    const store = storeByName.get(normalized(vehicle.store_name));
    if (!store) return;
    rows.push({ id: vehicle.id, store_id: store.id });
  });

  const unique = new Map<string, AnyRow>();
  rows.forEach((row) => unique.set(`${row.store_id}:${row.id}`, row));
  return Array.from(unique.values());
}

function buildRanking(sales: AnyRow[], nameResolver: (sale: AnyRow) => string) {
  const groups = new Map<string, { name: string; sales: number; revenue: number }>();
  sales.forEach((sale) => {
    const name = nameResolver(sale).trim();
    if (!name) return;
    const key = normalized(name);
    const item = groups.get(key) || { name, sales: 0, revenue: 0 };
    item.sales += 1;
    item.revenue += Number(sale.sale_value || 0);
    groups.set(key, item);
  });
  return Array.from(groups.values())
    .sort((a, b) => b.sales - a.sales || b.revenue - a.revenue || a.name.localeCompare(b.name, 'pt-BR'))
    .slice(0, 5)
    .map((item) => `${item.name} — ${item.sales} venda${item.sales === 1 ? '' : 's'} · ${currency(item.revenue)}`);
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
    const eventId = url.searchParams.get('event_id') || 'all';
    const storeId = url.searchParams.get('store_id') || 'all';
    const from = url.searchParams.get('date_from') || '';
    const to = url.searchParams.get('date_to') || '';

    const results: any[] = await Promise.all([
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

    const errorResult = results.find((result) => result.error);
    if (errorResult?.error) throw errorResult.error;

    const [eventsResult, storesResult, leadsResult, salesResult, vehiclesResult, linksResult, financeResult, surveysResult, activitiesResult, usersResult, prospectorsResult] = results;
    const events: AnyRow[] = eventsResult.data || [];
    const stores: AnyRow[] = storesResult.data || [];
    const leads: AnyRow[] = leadsResult.data || [];
    const sales: AnyRow[] = salesResult.data || [];
    const activities: AnyRow[] = activitiesResult.data || [];

    const users = new Map<string, AnyRow>();
    (usersResult.data || []).forEach((user: AnyRow) => users.set(String(user.id), user));
    const prospectors = new Map<string, AnyRow>();
    (prospectorsResult.data || []).forEach((prospector: AnyRow) => prospectors.set(String(prospector.id), prospector));
    const userName = (id: unknown, fallback: unknown = '') => {
      const user = id ? users.get(String(id)) : null;
      return String(user?.full_name || user?.email || fallback || '');
    };

    const visibleStores = stores.filter(activeStore).filter((store) => eventId === 'all' || store.event_id === eventId);
    const rankingStores = visibleStores.filter((store) => storeId === 'all' || store.id === storeId);

    const filteredLeads = leads
      .filter((lead) => eventId === 'all' || lead.event_id === eventId)
      .filter((lead) => storeId === 'all' || lead.assigned_store_id === storeId)
      .filter((lead) => insidePeriod(lead, from, to, ['created_at']));
    const filteredSales = sales
      .filter((sale) => eventId === 'all' || sale.event_id === eventId)
      .filter((sale) => storeId === 'all' || sale.store_id === storeId)
      .filter((sale) => insidePeriod(sale, from, to, ['confirmed_at', 'created_at']));
    const filteredSurveys: AnyRow[] = (surveysResult.data || [])
      .filter((survey: AnyRow) => eventId === 'all' || survey.event_id === eventId)
      .filter((survey: AnyRow) => storeId === 'all' || survey.assigned_store_id === storeId)
      .filter((survey: AnyRow) => insidePeriod(survey, from, to, ['created_at']));
    const filteredFinance: AnyRow[] = (financeResult.data || [])
      .filter((entry: AnyRow) => eventId === 'all' || entry.event_id === eventId)
      .filter((entry: AnyRow) => insidePeriod(entry, from, to, ['payment_date', 'created_at']));

    const stock = buildStock(stores, vehiclesResult.data || [], linksResult.data || [], eventId, storeId);
    const leadIds = new Set(filteredLeads.map((lead) => String(lead.id)));
    const lifecycleActivities = activities.filter((activity) => leadIds.has(String(activity.lead_id)));
    const periodActivities = lifecycleActivities.filter((activity) => insidePeriod(activity, from, to, ['created_at']));

    const totalLeads = filteredLeads.length;
    const surveysCount = filteredSurveys.length;
    const leadsWithPhone = filteredLeads.filter((lead) => String(lead.customer_phone || '').trim()).length;
    const directedToStore = filteredLeads.filter((lead) => lead.assigned_store_id).length;
    const salesCount = filteredSales.length;
    const conversionRate = leadsWithPhone ? (salesCount / leadsWithPhone) * 100 : 0;
    const totalRevenue = filteredSales.reduce((sum, sale) => sum + Number(sale.sale_value || 0), 0);
    const financedSales = filteredSales.filter((sale) => normalized(sale.payment_type) === 'financed');
    const financedBanks = financedSales
      .map((sale) => String(sale.financing_bank || '').trim())
      .filter((bank) => bank && !['nao informado', 'nao se aplica'].includes(normalized(bank)));

    const started = new Set<string>();
    const scheduled = new Set<string>();
    const showed = new Set<string>();
    const startedTypes = new Set(['status_changed', 'whatsapp_clicked', 'phone_viewed', 'schedule_created', 'showed_up_marked', 'sale_confirmed', 'lead_transferred', 'lead_edited']);
    filteredLeads.forEach((lead) => {
      const status = normalized(lead.status);
      if (status !== 'new_lead') started.add(String(lead.id));
      if (lead.scheduled_at || ['scheduled', 'showed_up', 'no_show', 'appointment_cancelled', 'sale_confirmed'].includes(status)) scheduled.add(String(lead.id));
      if (['showed_up', 'sale_confirmed'].includes(status)) showed.add(String(lead.id));
    });
    lifecycleActivities.forEach((activity) => {
      const type = String(activity.activity_type || '');
      const id = String(activity.lead_id);
      if (startedTypes.has(type)) started.add(id);
      if (['schedule_created', 'showed_up_marked', 'sale_confirmed'].includes(type)) scheduled.add(id);
      if (['showed_up_marked', 'sale_confirmed'].includes(type)) showed.add(id);
    });

    const sold = new Set(filteredSales.map((sale) => String(sale.lead_id)).filter(Boolean));
    const percent = (count: number) => totalLeads ? (count / totalLeads) * 100 : 0;
    const funnel = [
      { label: 'Leads captados', count: totalLeads, percent: percent(totalLeads), color: '#0B84F3' },
      { label: 'Com telefone', count: leadsWithPhone, percent: percent(leadsWithPhone), color: '#FF941A' },
      { label: 'Direcionados', count: directedToStore, percent: percent(directedToStore), color: '#EE2737' },
      { label: 'Atendimento iniciado', count: started.size, percent: percent(started.size), color: '#168AE5' },
      { label: 'Agendamento', count: scheduled.size, percent: percent(scheduled.size), color: '#15A85A' },
      { label: 'Comparecimento', count: showed.size, percent: percent(showed.size), color: '#00A86B' },
      { label: 'Venda', count: sold.size, percent: percent(sold.size), color: '#E30613' }
    ];

    const leadById = new Map<string, AnyRow>();
    filteredLeads.forEach((lead) => leadById.set(String(lead.id), lead));
    const categoryMap = new Map<string, { label: string; leads: number; sales: number }>();
    filteredLeads.forEach((lead) => {
      const label = String(lead.vehicle_category_interest || '').trim();
      if (!label || ['nao informado', 'outro', 'outros'].includes(normalized(label))) return;
      const key = normalized(label);
      const item = categoryMap.get(key) || { label, leads: 0, sales: 0 };
      item.leads += 1;
      categoryMap.set(key, item);
    });
    filteredSales.forEach((sale) => {
      const lead = leadById.get(String(sale.lead_id));
      const label = String(sale.vehicle_category || lead?.vehicle_category_interest || '').trim();
      if (!label || ['nao informado', 'outro', 'outros'].includes(normalized(label))) return;
      const key = normalized(label);
      const item = categoryMap.get(key) || { label, leads: 0, sales: 0 };
      item.sales += 1;
      categoryMap.set(key, item);
    });
    const categories = Array.from(categoryMap.values())
      .map((item) => ({ ...item, conversion: item.leads ? (item.sales / item.leads) * 100 : 0 }))
      .sort((a, b) => b.leads - a.leads || b.sales - a.sales)
      .slice(0, 8);

    const hours = Array.from({ length: 24 }, (_, hour) => ({ hour, count: 0 }));
    const heatSource = periodActivities.length ? periodActivities : filteredLeads;
    heatSource.forEach((row) => {
      if (!row.created_at) return;
      const hour = new Date(row.created_at).getHours();
      if (hour >= 0 && hour < 24) hours[hour].count += 1;
    });

    const storeRanking = rankingStores
      .map((store) => {
        const rows = filteredSales.filter((sale) => sale.store_id === store.id);
        return { name: store.store_name, sales: rows.length, revenue: rows.reduce((sum, sale) => sum + Number(sale.sale_value || 0), 0) };
      })
      .sort((a, b) => b.sales - a.sales || b.revenue - a.revenue || String(a.name).localeCompare(String(b.name), 'pt-BR'))
      .slice(0, 5)
      .map((item) => `${item.name} — ${item.sales} venda${item.sales === 1 ? '' : 's'} · ${currency(item.revenue)}`);

    const sellers = buildRanking(filteredSales, (sale) => userName(sale.seller_user_id, sale.seller_name));
    const preSales = buildRanking(filteredSales, (sale) => userName(sale.pre_sales_user_id));
    const prospectorRanking = buildRanking(filteredSales, (sale) => {
      const byUser = userName(sale.captured_by_user_id);
      if (byUser) return byUser;
      const prospector = sale.prospector_id ? prospectors.get(String(sale.prospector_id)) : null;
      return String(prospector?.full_name || '');
    });

    const selectedEvent = events.find((event) => event.id === eventId);
    const sponsorship = filteredFinance
      .filter((entry) => normalized(entry.movement_type) !== 'expense' && normalized(entry.sponsor_bank) === 'bradesco')
      .reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
    const goalValue = Math.floor(sponsorship / 10000) * 1000000;
    const done = financedSales
      .filter((sale) => normalized(sale.financing_bank) === 'bradesco')
      .reduce((sum, sale) => sum + Number(sale.sale_value || 0), 0);

    return NextResponse.json({
      events,
      stores: visibleStores,
      summary: {
        totalLeads,
        surveysCount,
        leadsWithPhone,
        salesCount,
        conversionRate,
        totalRevenue,
        financedBanksCount: new Set(financedBanks.map(normalized)).size,
        financedSalesCount: financedSales.length,
        directedToStore,
        startedCount: started.size,
        totalCarsInEvent: stock.length
      },
      goal: {
        sponsorship,
        goal: goalValue,
        done,
        progress: goalValue ? Math.min(100, (done / goalValue) * 100) : 0,
        label: eventId === 'all' ? 'Todos os eventos' : selectedEvent?.event_name || 'Evento selecionado'
      },
      funnel,
      categories,
      heatmap: hours,
      heatmapSource: periodActivities.length ? 'Atividades registradas' : 'Criação dos leads',
      rankings: { stores: storeRanking, sellers, preSales, prospectors: prospectorRanking },
      updatedAt: new Date().toISOString()
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Não foi possível calcular os indicadores reais.' }, { status: 500 });
  }
}
