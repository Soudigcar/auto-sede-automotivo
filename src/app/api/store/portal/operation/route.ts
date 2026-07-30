import { NextResponse } from 'next/server';
import { cleanText } from '@/lib/server/storeTeam';
import { authorizeStorePortal } from '@/lib/server/storePortal';

export const runtime = 'nodejs';

function increment(target: Record<string, number>, key: unknown) {
  const normalized = cleanText(key, 160) || 'Não informado';
  target[normalized] = (target[normalized] || 0) + 1;
}

function ranked(source: Record<string, number>) {
  return Object.entries(source)
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label, 'pt-BR'));
}

export async function GET(request: Request) {
  try {
    const slug = cleanText(new URL(request.url).searchParams.get('slug'), 120);
    const context = await authorizeStorePortal(request, slug);
    if ('error' in context) return context.error;

    if (!context.permissions.includes('manage_operation')) {
      return NextResponse.json({ error: 'Somente Gestor da Loja ou Master pode acessar a operação gerencial.' }, { status: 403 });
    }

    const { supabase, store } = context;
    const [salesResult, lossesResult, leadsResult, vehiclesResult] = await Promise.all([
      supabase
        .from('sales')
        .select('id,lead_id,vehicle_id,status,seller_name,seller_user_id,financing_bank,payment_type,sale_value,sale_vehicle_name,has_trade_in,installment_count,confirmed_at,cancelled_at,cancellation_reason')
        .eq('store_id', store.id)
        .order('confirmed_at', { ascending: false })
        .limit(300),
      supabase
        .from('losses')
        .select('id,lead_id,reason,description,lost_stage,registered_by,registered_at')
        .eq('store_id', store.id)
        .order('registered_at', { ascending: false })
        .limit(300),
      supabase
        .from('leads')
        .select('id,customer_name,interested_vehicle,status')
        .eq('assigned_store_id', store.id)
        .neq('status', 'deleted'),
      supabase
        .from('site_vehicles')
        .select('id,status,show_on_landing')
        .eq('store_id', store.id)
        .neq('status', 'excluido')
    ]);

    if (salesResult.error) throw salesResult.error;
    if (lossesResult.error) throw lossesResult.error;
    if (leadsResult.error) throw leadsResult.error;
    if (vehiclesResult.error) throw vehiclesResult.error;

    const sales = salesResult.data || [];
    const losses = lossesResult.data || [];
    const leads = leadsResult.data || [];
    const vehicles = vehiclesResult.data || [];
    const leadMap = new Map<string, any>(leads.map((lead: any) => [lead.id, lead]));

    const activeSales = sales.filter((sale: any) => sale.status === 'confirmed');
    const cancelledSales = sales.filter((sale: any) => sale.status === 'cancelled');
    const revenue = activeSales.reduce((total: number, sale: any) => total + Number(sale.sale_value || 0), 0);

    const paymentBreakdown: Record<string, number> = {};
    const bankBreakdown: Record<string, number> = {};
    const sellerBreakdown: Record<string, number> = {};
    const lossBreakdown: Record<string, number> = {};

    activeSales.forEach((sale: any) => {
      increment(paymentBreakdown, sale.payment_type);
      increment(bankBreakdown, sale.financing_bank);
      increment(sellerBreakdown, sale.seller_name);
    });
    losses.forEach((loss: any) => increment(lossBreakdown, loss.reason));

    return NextResponse.json({
      store: { id: store.id, store_name: store.store_name, slug: store.slug },
      generated_at: new Date().toISOString(),
      metrics: {
        active_leads: leads.filter((lead: any) => !['sale_confirmed', 'lost'].includes(lead.status)).length,
        confirmed_sales: activeSales.length,
        cancelled_sales: cancelledSales.length,
        losses: losses.length,
        revenue,
        average_ticket: activeSales.length ? revenue / activeSales.length : 0,
        available_vehicles: vehicles.filter((vehicle: any) => vehicle.status === 'disponivel').length,
        published_vehicles: vehicles.filter((vehicle: any) => vehicle.status === 'disponivel' && vehicle.show_on_landing).length
      },
      breakdowns: {
        payment_types: ranked(paymentBreakdown),
        banks: ranked(bankBreakdown),
        sellers: ranked(sellerBreakdown),
        loss_reasons: ranked(lossBreakdown)
      },
      recent_sales: sales.slice(0, 25).map((sale: any) => ({
        ...sale,
        customer_name: leadMap.get(sale.lead_id)?.customer_name || 'Cliente não identificado',
        vehicle_name: sale.sale_vehicle_name || leadMap.get(sale.lead_id)?.interested_vehicle || 'Veículo não informado'
      })),
      recent_losses: losses.slice(0, 25).map((loss: any) => ({
        ...loss,
        customer_name: leadMap.get(loss.lead_id)?.customer_name || 'Cliente não identificado',
        vehicle_name: leadMap.get(loss.lead_id)?.interested_vehicle || 'Veículo não informado'
      }))
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Não foi possível carregar a operação gerencial.' }, { status: 500 });
  }
}
