import { NextResponse } from 'next/server';
import { createAdminClient, getProfileFromToken, readBearerToken } from '@/lib/server/storeTeam';

export const runtime = 'nodejs';

type Row = Record<string, any>;

function insidePeriod(value: unknown, from: string, to: string) {
  if (!from && !to) return true;
  if (!value) return true;
  const date = String(value).slice(0, 10);
  return (!from || date >= from) && (!to || date <= to);
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

    const [salesResult, leadsResult, storesResult, eventsResult, usersResult] = await Promise.all([
      supabase.from('sales').select('id,event_id,lead_id,store_id,seller_name,seller_user_id,financing_bank,payment_type,sale_value,sale_vehicle_name,has_trade_in,installment_count,has_down_payment,down_payment_value,financed_amount,installment_value,confirmed_at,created_at').order('confirmed_at', { ascending: false }).limit(2000),
      supabase.from('leads').select('id,customer_name,customer_phone,interested_vehicle'),
      supabase.from('stores').select('id,event_id,store_name,status').neq('status', 'deleted').order('store_name'),
      supabase.from('events').select('id,event_name,status').neq('status', 'deleted').order('created_at', { ascending: false }),
      supabase.from('users').select('id,full_name,email')
    ]);

    const errorResult = [salesResult, leadsResult, storesResult, eventsResult, usersResult].find((result) => result.error);
    if (errorResult?.error) throw errorResult.error;

    const leads = new Map<string, Row>();
    (leadsResult.data || []).forEach((lead: Row) => leads.set(String(lead.id), lead));
    const stores = new Map<string, Row>();
    (storesResult.data || []).forEach((store: Row) => stores.set(String(store.id), store));
    const events = new Map<string, Row>();
    (eventsResult.data || []).forEach((event: Row) => events.set(String(event.id), event));
    const users = new Map<string, Row>();
    (usersResult.data || []).forEach((user: Row) => users.set(String(user.id), user));

    const rows = (salesResult.data || [])
      .filter((sale: Row) => eventId === 'all' || sale.event_id === eventId)
      .filter((sale: Row) => storeId === 'all' || sale.store_id === storeId)
      .filter((sale: Row) => insidePeriod(sale.confirmed_at || sale.created_at, from, to))
      .map((sale: Row) => {
        const lead = leads.get(String(sale.lead_id)) || {};
        const store = stores.get(String(sale.store_id)) || {};
        const event = events.get(String(sale.event_id)) || {};
        const seller = users.get(String(sale.seller_user_id)) || {};
        return {
          id: sale.id,
          confirmed_at: sale.confirmed_at || sale.created_at,
          event_name: event.event_name || 'Evento não informado',
          store_name: store.store_name || 'Loja não informada',
          customer_name: lead.customer_name || 'Cliente não informado',
          customer_phone: lead.customer_phone || '',
          vehicle_name: sale.sale_vehicle_name || lead.interested_vehicle || 'Veículo não informado',
          seller_name: seller.full_name || sale.seller_name || seller.email || 'Vendedor não informado',
          payment_type: sale.payment_type || '',
          financing_bank: sale.financing_bank || '',
          sale_value: sale.sale_value,
          installment_count: sale.installment_count,
          has_down_payment: sale.has_down_payment,
          down_payment_value: sale.down_payment_value,
          financed_amount: sale.financed_amount,
          installment_value: sale.installment_value,
          has_trade_in: sale.has_trade_in
        };
      });

    const totalRevenue = rows.reduce((sum: number, row: Row) => sum + Number(row.sale_value || 0), 0);
    const financedSales = rows.filter((row: Row) => row.payment_type === 'financed').length;
    const withDownPayment = rows.filter((row: Row) => row.has_down_payment === true).length;
    const withTradeIn = rows.filter((row: Row) => row.has_trade_in === true).length;

    return NextResponse.json({
      rows,
      events: eventsResult.data || [],
      stores: storesResult.data || [],
      summary: {
        sales_count: rows.length,
        total_revenue: totalRevenue,
        financed_sales: financedSales,
        with_down_payment: withDownPayment,
        with_trade_in: withTradeIn
      },
      updated_at: new Date().toISOString()
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Não foi possível gerar o relatório comercial.' }, { status: 500 });
  }
}
