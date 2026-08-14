import { NextResponse } from 'next/server';
import { cleanText, createAdminClient, getProfileFromToken, readBearerToken } from '@/lib/server/storeTeam';
import { asStorePortalRole, canAccessStoreLead } from '@/lib/server/storePortal';

export const runtime = 'nodejs';

const portalRoles = ['master', 'store', 'pre_sales', 'seller', 'prospector'];
const confirmRoles = ['master', 'store', 'seller'];
const cancelRoles = ['master', 'store'];
const paymentTypes = ['cash', 'financed', 'consortium', 'other'];
const vehicleModes = ['portal', 'outside_portal'];

function canAccessLead(profile: any, lead: any) {
  const role = asStorePortalRole(profile?.role);
  return Boolean(role && canAccessStoreLead(profile, role, lead));
}

function moneyValue(value: unknown) {
  if (value === '' || value === null || value === undefined) return null;
  const parsed = Number(String(value).replace(/\s/g, '').replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function integerValue(value: unknown) {
  if (value === '' || value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : Number.NaN;
}

function vehicleName(vehicle: any) {
  return [vehicle?.brand, vehicle?.model, vehicle?.version, vehicle?.year]
    .map((item) => cleanText(item, 100))
    .filter(Boolean)
    .join(' ');
}

async function getContext(request: Request) {
  const supabase: any = createAdminClient();
  const token = readBearerToken(request);
  if (!token) return { error: NextResponse.json({ error: 'Sessão não encontrada.' }, { status: 401 }) } as const;

  const profile = await getProfileFromToken(supabase, token);
  if (!profile || profile.status !== 'active' || !portalRoles.includes(profile.role)) {
    return { error: NextResponse.json({ error: 'Usuário sem permissão para acessar condições comerciais.' }, { status: 403 }) } as const;
  }

  return { supabase, profile } as const;
}

async function loadLead(supabase: any, leadId: string) {
  const { data, error } = await supabase
    .from('leads')
    .select('id,event_id,assigned_store_id,assigned_user_id,assigned_user_role,pre_sales_user_id,seller_user_id,captured_by_user_id,prospector_id,customer_name,customer_phone,customer_bank,interested_vehicle,interested_vehicle_id,interested_vehicle_price,vehicle_category_interest,status')
    .eq('id', leadId)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

async function loadStore(supabase: any, storeId: string) {
  const { data, error } = await supabase
    .from('stores')
    .select('id,store_name,slug,event_id,status,portal_enabled')
    .eq('id', storeId)
    .maybeSingle();
  if (error) throw error;
  if (!data || data.status !== 'active' || !data.portal_enabled) return null;
  return data;
}

async function loadSellers(supabase: any, storeId: string) {
  const { data, error } = await supabase
    .from('users')
    .select('id,full_name,email,role,status,store_id')
    .eq('store_id', storeId)
    .eq('role', 'seller')
    .eq('status', 'active')
    .order('full_name', { ascending: true });
  if (error) throw error;
  return (data || []).map((seller: any) => ({
    id: seller.id,
    full_name: seller.full_name || seller.email || 'Vendedor sem nome',
    email: seller.email || null
  }));
}

async function loadSale(supabase: any, leadId: string) {
  const { data, error } = await supabase
    .from('sales')
    .select('id,lead_id,store_id,vehicle_id,status,cancelled_at,cancelled_by,cancellation_reason,seller_name,seller_user_id,pre_sales_user_id,captured_by_user_id,customer_bank,financing_bank,payment_type,sale_value,vehicle_category,sale_vehicle_name,has_trade_in,installment_count,has_down_payment,down_payment_value,financed_amount,installment_value,confirmed_by,confirmed_at,created_at')
    .eq('lead_id', leadId)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

async function loadCommercial(supabase: any, leadId: string) {
  const { data, error } = await supabase
    .from('lead_commercial_details')
    .select('id,lead_id,store_id,payment_type,financing_bank,negotiated_value,installment_count,has_down_payment,down_payment_value,financed_amount,installment_value,has_trade_in,updated_by,created_at,updated_at')
    .eq('lead_id', leadId)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

async function loadVehicles(supabase: any, storeId: string, selectedIds: string[]) {
  const { data, error } = await supabase
    .from('site_vehicles')
    .select('id,store_id,brand,model,version,year,price,status,show_on_landing,sold_lead_id')
    .eq('store_id', storeId)
    .neq('status', 'excluido')
    .order('brand', { ascending: true })
    .order('model', { ascending: true });
  if (error) throw error;
  return (data || [])
    .filter((vehicle: any) => vehicle.status !== 'vendido' || selectedIds.includes(vehicle.id))
    .map((vehicle: any) => ({ ...vehicle, name: vehicleName(vehicle) }));
}

function commercialResponse(sale: any, commercial: any) {
  if (sale) return { ...sale, is_confirmed: sale.status === 'confirmed', commercial_id: commercial?.id || null };
  return {
    id: commercial?.id || 'lead-commercial-draft',
    lead_id: commercial?.lead_id || null,
    store_id: commercial?.store_id || null,
    payment_type: commercial?.payment_type || null,
    financing_bank: commercial?.financing_bank || null,
    sale_value: commercial?.negotiated_value ?? null,
    has_trade_in: commercial?.has_trade_in ?? null,
    installment_count: commercial?.installment_count ?? null,
    has_down_payment: commercial?.has_down_payment ?? null,
    down_payment_value: commercial?.down_payment_value ?? null,
    financed_amount: commercial?.financed_amount ?? null,
    installment_value: commercial?.installment_value ?? null,
    vehicle_id: null,
    is_confirmed: false,
    commercial_id: commercial?.id || null,
    updated_at: commercial?.updated_at || null
  };
}

export async function GET(request: Request) {
  try {
    const context = await getContext(request);
    if ('error' in context) return context.error;

    const leadId = cleanText(new URL(request.url).searchParams.get('lead_id'), 80);
    if (!leadId) return NextResponse.json({ error: 'Informe o lead.' }, { status: 400 });

    const { supabase, profile } = context;
    const lead = await loadLead(supabase, leadId);
    if (!lead || !lead.assigned_store_id) return NextResponse.json({ error: 'Lead não encontrado.' }, { status: 404 });
    if (!canAccessLead(profile, lead)) return NextResponse.json({ error: 'Você não tem permissão para acessar este lead.' }, { status: 403 });

    const store = await loadStore(supabase, lead.assigned_store_id);
    if (!store) return NextResponse.json({ error: 'Loja indisponível.' }, { status: 404 });

    const [sellers, sale, commercial] = await Promise.all([
      loadSellers(supabase, store.id),
      loadSale(supabase, lead.id),
      loadCommercial(supabase, lead.id)
    ]);
    const vehicles = await loadVehicles(supabase, store.id, [lead.interested_vehicle_id, sale?.vehicle_id].filter(Boolean));

    return NextResponse.json({
      lead,
      store,
      sellers,
      vehicles,
      permissions: {
        can_confirm: confirmRoles.includes(profile.role),
        can_cancel: cancelRoles.includes(profile.role),
        can_edit_confirmed: ['master', 'store', 'seller'].includes(profile.role)
      },
      suggested_seller_id: sale?.seller_user_id || lead.seller_user_id || (profile.role === 'seller' ? profile.id : null),
      sale: commercialResponse(sale, commercial),
      sale_confirmed: sale?.status === 'confirmed',
      commercial
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Não foi possível carregar as condições comerciais.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const context = await getContext(request);
    if ('error' in context) return context.error;
    const { supabase, profile } = context;

    if (!confirmRoles.includes(profile.role)) {
      return NextResponse.json({ error: 'Somente Gestor, Master ou Vendedor responsável pode confirmar vendas.' }, { status: 403 });
    }

    const body = await request.json();
    const leadId = cleanText(body.lead_id, 80);
    const sellerUserId = cleanText(body.seller_user_id, 80);
    const paymentType = cleanText(body.payment_type, 30);
    const financingBank = cleanText(body.financing_bank, 160);
    const vehicleMode = cleanText(body.vehicle_mode, 30) || 'portal';
    const vehicleId = cleanText(body.vehicle_id, 80) || null;
    const outsideVehicleName = cleanText(body.vehicle_name, 220) || null;
    const hasTradeIn = body.has_trade_in;
    const saleValue = moneyValue(body.sale_value);
    const installmentCount = integerValue(body.installment_count);
    const hasDownPayment = paymentType === 'cash' ? false : body.has_down_payment;
    const downPaymentValue = moneyValue(body.down_payment_value);
    const financedAmount = moneyValue(body.financed_amount);
    const installmentValue = moneyValue(body.installment_value);

    if (!leadId) return NextResponse.json({ error: 'Informe o lead.' }, { status: 400 });
    if (!sellerUserId) return NextResponse.json({ error: 'Selecione o vendedor responsável pelo fechamento.' }, { status: 400 });
    if (!vehicleModes.includes(vehicleMode)) return NextResponse.json({ error: 'Informe onde está o veículo vendido.' }, { status: 400 });
    if (vehicleMode === 'portal' && !vehicleId) return NextResponse.json({ error: 'Selecione o veículo vendido no estoque da loja.' }, { status: 400 });
    if (!paymentTypes.includes(paymentType)) return NextResponse.json({ error: 'Selecione a forma de pagamento.' }, { status: 400 });
    if (paymentType === 'financed' && !financingBank) return NextResponse.json({ error: 'Selecione o banco do financiamento.' }, { status: 400 });
    if (['financed', 'consortium'].includes(paymentType) && (!Number.isInteger(installmentCount) || Number(installmentCount) < 1 || Number(installmentCount) > 120)) {
      return NextResponse.json({ error: 'Informe uma quantidade de parcelas entre 1 e 120.' }, { status: 400 });
    }
    if (paymentType !== 'cash' && typeof hasDownPayment !== 'boolean') return NextResponse.json({ error: 'Informe se houve entrada.' }, { status: 400 });
    if (hasDownPayment === true && (downPaymentValue === null || !Number.isFinite(downPaymentValue) || downPaymentValue <= 0)) {
      return NextResponse.json({ error: 'Informe um valor de entrada maior que zero.' }, { status: 400 });
    }
    if (typeof hasTradeIn !== 'boolean') return NextResponse.json({ error: 'Informe se houve veículo na troca.' }, { status: 400 });
    if (saleValue !== null && (!Number.isFinite(saleValue) || saleValue < 0)) return NextResponse.json({ error: 'Informe um valor de venda válido.' }, { status: 400 });
    if (saleValue !== null && downPaymentValue !== null && downPaymentValue > saleValue) return NextResponse.json({ error: 'O valor da entrada não pode ser maior que o valor da venda.' }, { status: 400 });
    if (financedAmount !== null && (!Number.isFinite(financedAmount) || financedAmount < 0)) return NextResponse.json({ error: 'Informe um valor financiado válido.' }, { status: 400 });
    if (installmentValue !== null && (!Number.isFinite(installmentValue) || installmentValue < 0)) return NextResponse.json({ error: 'Informe um valor de parcela válido.' }, { status: 400 });

    const lead = await loadLead(supabase, leadId);
    if (!lead || !lead.assigned_store_id) return NextResponse.json({ error: 'Lead não encontrado.' }, { status: 404 });
    if (!canAccessLead(profile, lead)) return NextResponse.json({ error: 'Você não tem permissão para confirmar esta venda.' }, { status: 403 });
    if (profile.role === 'seller' && sellerUserId !== profile.id) {
      return NextResponse.json({ error: 'O vendedor só pode confirmar a própria venda.' }, { status: 403 });
    }

    const actorName = profile.full_name || profile.email || 'Usuário';
    const { data: saleId, error: rpcError } = await supabase.rpc('store_confirm_sale_transaction', {
      p_lead_id: lead.id,
      p_store_id: lead.assigned_store_id,
      p_seller_user_id: sellerUserId,
      p_vehicle_mode: vehicleMode,
      p_vehicle_id: vehicleId,
      p_vehicle_name: outsideVehicleName,
      p_payment_type: paymentType,
      p_financing_bank: financingBank || null,
      p_has_trade_in: hasTradeIn,
      p_sale_value: saleValue,
      p_installment_count: paymentType === 'cash' ? null : installmentCount,
      p_has_down_payment: paymentType === 'cash' ? false : hasDownPayment,
      p_down_payment_value: hasDownPayment === true ? downPaymentValue : null,
      p_financed_amount: financedAmount,
      p_installment_value: installmentValue,
      p_actor_user_id: profile.id,
      p_actor_name: actorName
    });
    if (rpcError) throw rpcError;

    const [sale, commercial] = await Promise.all([loadSale(supabase, lead.id), loadCommercial(supabase, lead.id)]);
    return NextResponse.json({
      success: true,
      sale_id: saleId,
      message: vehicleMode === 'portal'
        ? 'Venda confirmada e veículo retirado do marketplace.'
        : 'Venda confirmada para veículo informado fora do portal.',
      listing_removed: vehicleMode === 'portal',
      sale: commercialResponse(sale, commercial),
      sale_confirmed: true,
      commercial
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Não foi possível confirmar a venda.' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const context = await getContext(request);
    if ('error' in context) return context.error;
    const { supabase, profile } = context;

    if (!cancelRoles.includes(profile.role)) {
      return NextResponse.json({ error: 'Somente Gestor da Loja ou Master pode cancelar vendas.' }, { status: 403 });
    }

    const body = await request.json();
    const leadId = cleanText(body.lead_id, 80);
    const reason = cleanText(body.reason, 1000);
    if (!leadId) return NextResponse.json({ error: 'Informe o lead.' }, { status: 400 });
    if (reason.length < 3) return NextResponse.json({ error: 'Informe o motivo do cancelamento.' }, { status: 400 });

    const lead = await loadLead(supabase, leadId);
    if (!lead || !lead.assigned_store_id) return NextResponse.json({ error: 'Lead não encontrado.' }, { status: 404 });
    if (!canAccessLead(profile, lead)) return NextResponse.json({ error: 'Você não tem permissão para cancelar esta venda.' }, { status: 403 });

    const actorName = profile.full_name || profile.email || 'Usuário';
    const { data: saleId, error: rpcError } = await supabase.rpc('store_cancel_sale_transaction', {
      p_lead_id: lead.id,
      p_store_id: lead.assigned_store_id,
      p_reason: reason,
      p_actor_user_id: profile.id,
      p_actor_name: actorName
    });
    if (rpcError) throw rpcError;

    return NextResponse.json({
      success: true,
      sale_id: saleId,
      message: lead.interested_vehicle_id
        ? 'Venda cancelada, lead reaberto e veículo restaurado no marketplace.'
        : 'Venda cancelada e lead reaberto em Compareceu.'
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Não foi possível cancelar a venda.' }, { status: 500 });
  }
}
