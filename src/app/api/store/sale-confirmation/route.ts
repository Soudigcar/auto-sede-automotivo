import { NextResponse } from 'next/server';
import { cleanText, createAdminClient, getProfileFromToken, readBearerToken } from '@/lib/server/storeTeam';

export const runtime = 'nodejs';

const allowedRoles = ['master', 'store', 'pre_sales', 'seller', 'prospector'];
const paymentTypes = ['cash', 'financed', 'consortium', 'other'];
const vehicleModes = ['portal', 'outside_portal'];

function canAccessLead(profile: any, lead: any) {
  if (profile.role === 'master') return true;
  if (!profile.store_id || profile.store_id !== lead.assigned_store_id) return false;
  if (profile.role === 'store') return true;
  if (profile.role === 'pre_sales') return lead.pre_sales_user_id === profile.id || lead.assigned_user_id === profile.id;
  if (profile.role === 'seller') return lead.seller_user_id === profile.id || lead.assigned_user_id === profile.id;
  if (profile.role === 'prospector') return lead.captured_by_user_id === profile.id || lead.assigned_user_id === profile.id;
  return false;
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

function paymentDescription(type: string, bank: string) {
  if (type === 'cash') return 'À vista';
  if (type === 'financed') return `Financiado por ${bank}`;
  if (type === 'consortium') return `Consórcio${bank && bank !== 'Consórcio' ? ` — ${bank}` : ''}`;
  return `Outra forma${bank && bank !== 'Outro' ? ` — ${bank}` : ''}`;
}

function vehicleName(vehicle: any) {
  return [vehicle?.brand, vehicle?.model, vehicle?.version, vehicle?.year].map((item) => cleanText(item, 100)).filter(Boolean).join(' ');
}

async function getContext(request: Request) {
  const supabase: any = createAdminClient();
  const token = readBearerToken(request);
  if (!token) return { error: NextResponse.json({ error: 'Sessão não encontrada.' }, { status: 401 }) } as const;
  const profile = await getProfileFromToken(supabase, token);
  if (!profile || profile.status !== 'active' || !allowedRoles.includes(profile.role)) {
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
  const { data, error } = await supabase.from('stores').select('id,store_name,slug,event_id,status,portal_enabled').eq('id', storeId).maybeSingle();
  if (error) throw error;
  if (!data || data.status !== 'active' || !data.portal_enabled) return null;
  return data;
}

async function loadSellers(supabase: any, storeId: string) {
  const { data, error } = await supabase.from('users').select('id,full_name,email,role,status,store_id').eq('store_id', storeId).eq('role', 'seller').eq('status', 'active').order('full_name', { ascending: true });
  if (error) throw error;
  return (data || []).map((seller: any) => ({ id: seller.id, full_name: seller.full_name || seller.email || 'Vendedor sem nome', email: seller.email || null }));
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
  const { data, error } = await supabase.from('lead_commercial_details').select('id,lead_id,store_id,payment_type,financing_bank,negotiated_value,installment_count,has_down_payment,down_payment_value,financed_amount,installment_value,has_trade_in,updated_by,created_at,updated_at').eq('lead_id', leadId).maybeSingle();
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
  return (data || []).filter((vehicle: any) => vehicle.status !== 'vendido' || selectedIds.includes(vehicle.id)).map((vehicle: any) => ({ ...vehicle, name: vehicleName(vehicle) }));
}

function commercialResponse(sale: any, commercial: any) {
  if (sale) return { ...sale, is_confirmed: sale.status === 'confirmed', commercial_id: commercial?.id || null };
  return {
    id: commercial?.id || 'lead-commercial-draft', lead_id: commercial?.lead_id || null, store_id: commercial?.store_id || null,
    payment_type: commercial?.payment_type || null, financing_bank: commercial?.financing_bank || null,
    sale_value: commercial?.negotiated_value ?? null, has_trade_in: commercial?.has_trade_in ?? null,
    installment_count: commercial?.installment_count ?? null, has_down_payment: commercial?.has_down_payment ?? null,
    down_payment_value: commercial?.down_payment_value ?? null, financed_amount: commercial?.financed_amount ?? null,
    installment_value: commercial?.installment_value ?? null, vehicle_id: null, is_confirmed: false,
    commercial_id: commercial?.id || null, updated_at: commercial?.updated_at || null
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
    const [sellers, sale, commercial] = await Promise.all([loadSellers(supabase, store.id), loadSale(supabase, lead.id), loadCommercial(supabase, lead.id)]);
    const vehicles = await loadVehicles(supabase, store.id, [lead.interested_vehicle_id, sale?.vehicle_id].filter(Boolean));
    return NextResponse.json({
      lead: { ...lead }, store, sellers, vehicles,
      suggested_seller_id: sale?.seller_user_id || lead.seller_user_id || (profile.role === 'seller' ? profile.id : null),
      sale: commercialResponse(sale, commercial), sale_confirmed: sale?.status === 'confirmed', commercial
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
    const body = await request.json();
    const leadId = cleanText(body.lead_id, 80);
    const sellerUserId = cleanText(body.seller_user_id, 80);
    const paymentType = cleanText(body.payment_type, 30);
    const financingBankInput = cleanText(body.financing_bank, 160);
    const vehicleMode = cleanText(body.vehicle_mode, 30) || 'portal';
    const vehicleId = cleanText(body.vehicle_id, 80);
    const outsideVehicleName = cleanText(body.vehicle_name, 220);
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
    if (paymentType === 'financed' && !financingBankInput) return NextResponse.json({ error: 'Selecione o banco do financiamento.' }, { status: 400 });
    if (['financed', 'consortium'].includes(paymentType) && (!Number.isInteger(installmentCount) || Number(installmentCount) < 1 || Number(installmentCount) > 120)) return NextResponse.json({ error: 'Informe uma quantidade de parcelas entre 1 e 120.' }, { status: 400 });
    if (paymentType !== 'cash' && typeof hasDownPayment !== 'boolean') return NextResponse.json({ error: 'Informe se houve entrada.' }, { status: 400 });
    if (hasDownPayment === true && (downPaymentValue === null || !Number.isFinite(downPaymentValue) || downPaymentValue <= 0)) return NextResponse.json({ error: 'Informe um valor de entrada maior que zero.' }, { status: 400 });
    if (typeof hasTradeIn !== 'boolean') return NextResponse.json({ error: 'Informe se houve veículo na troca.' }, { status: 400 });
    if (saleValue !== null && (!Number.isFinite(saleValue) || saleValue < 0)) return NextResponse.json({ error: 'Informe um valor de venda válido.' }, { status: 400 });
    if (saleValue !== null && downPaymentValue !== null && downPaymentValue > saleValue) return NextResponse.json({ error: 'O valor da entrada não pode ser maior que o valor da venda.' }, { status: 400 });
    if (financedAmount !== null && (!Number.isFinite(financedAmount) || financedAmount < 0)) return NextResponse.json({ error: 'Informe um valor financiado válido.' }, { status: 400 });
    if (installmentValue !== null && (!Number.isFinite(installmentValue) || installmentValue < 0)) return NextResponse.json({ error: 'Informe um valor de parcela válido.' }, { status: 400 });

    const lead = await loadLead(supabase, leadId);
    if (!lead || !lead.assigned_store_id) return NextResponse.json({ error: 'Lead não encontrado.' }, { status: 404 });
    if (!canAccessLead(profile, lead)) return NextResponse.json({ error: 'Você não tem permissão para confirmar esta venda.' }, { status: 403 });

    let selectedVehicle: any = null;
    let selectedVehicleName = outsideVehicleName || cleanText(lead.interested_vehicle, 220);
    if (vehicleMode === 'portal') {
      const { data, error } = await supabase.from('site_vehicles').select('id,store_id,brand,model,version,year,price,status,sold_lead_id').eq('id', vehicleId).eq('store_id', lead.assigned_store_id).maybeSingle();
      if (error) throw error;
      if (!data) return NextResponse.json({ error: 'O veículo selecionado não pertence ao estoque desta loja.' }, { status: 400 });
      if (data.status === 'vendido' && data.sold_lead_id !== lead.id) return NextResponse.json({ error: 'Este veículo já está vinculado a outra venda.' }, { status: 409 });
      selectedVehicle = data;
      selectedVehicleName = vehicleName(data);
    } else if (!selectedVehicleName) {
      return NextResponse.json({ error: 'Informe qual veículo foi vendido fora do portal.' }, { status: 400 });
    }

    const { error: leadVehicleError } = await supabase.from('leads').update({
      interested_vehicle_id: selectedVehicle?.id || null,
      interested_vehicle: selectedVehicleName,
      interested_vehicle_price: selectedVehicle ? Number(selectedVehicle.price || 0) || null : lead.interested_vehicle_price,
      updated_at: new Date().toISOString()
    }).eq('id', lead.id);
    if (leadVehicleError) throw leadVehicleError;

    const { data: seller, error: sellerError } = await supabase.from('users').select('id,full_name,email,role,status,store_id').eq('id', sellerUserId).eq('store_id', lead.assigned_store_id).eq('role', 'seller').eq('status', 'active').maybeSingle();
    if (sellerError) throw sellerError;
    if (!seller) return NextResponse.json({ error: 'O vendedor selecionado não está ativo nesta loja.' }, { status: 400 });

    const actorName = profile.full_name || profile.email || 'Usuário';
    const normalizedBank = paymentType === 'cash' ? 'Não se aplica' : paymentType === 'financed' ? financingBankInput : paymentType === 'consortium' ? financingBankInput || 'Consórcio' : financingBankInput || 'Outro';
    const { data: saleId, error: rpcError } = await supabase.rpc('confirm_lead_sale_record', {
      p_lead_id: lead.id, p_store_id: lead.assigned_store_id, p_seller_user_id: seller.id,
      p_payment_type: paymentType, p_financing_bank: normalizedBank, p_has_trade_in: hasTradeIn,
      p_sale_value: saleValue, p_installment_count: paymentType === 'cash' ? null : installmentCount,
      p_has_down_payment: paymentType === 'cash' ? false : hasDownPayment,
      p_down_payment_value: hasDownPayment === true ? downPaymentValue : null,
      p_financed_amount: financedAmount, p_installment_value: installmentValue,
      p_confirmed_by: profile.id, p_actor_name: actorName
    });
    if (rpcError) throw rpcError;

    const paymentLabel = paymentDescription(paymentType, normalizedBank);
    const installmentsLabel = installmentCount ? `${installmentCount} parcela(s)` : 'Sem parcelamento';
    const entryLabel = hasDownPayment ? `Entrada de R$ ${Number(downPaymentValue || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : 'Sem entrada';
    const tradeLabel = hasTradeIn ? 'Com veículo na troca' : 'Sem veículo na troca';
    const sellerName = seller.full_name || seller.email || 'Vendedor';
    const now = new Date().toISOString();

    await Promise.allSettled([
      supabase.from('lead_activity_logs').insert({
        lead_id: lead.id, store_id: lead.assigned_store_id, store_name: null, user_id: profile.id, user_name: actorName,
        activity_type: 'sale_confirmed', activity_label: `Venda confirmada por ${sellerName}`, from_status: lead.status,
        to_status: 'sale_confirmed', customer_name: lead.customer_name, customer_phone: lead.customer_phone,
        vehicle_name: selectedVehicleName, notes: `${paymentLabel}. ${installmentsLabel}. ${entryLabel}. ${tradeLabel}.`,
        metadata: { sale_id: saleId, vehicle_id: selectedVehicle?.id || null, vehicle_mode: vehicleMode, seller_user_id: seller.id, seller_name: sellerName, payment_type: paymentType, financing_bank: normalizedBank, has_trade_in: hasTradeIn, sale_value: saleValue, installment_count: installmentCount, has_down_payment: hasDownPayment, down_payment_value: downPaymentValue, financed_amount: financedAmount, installment_value: installmentValue, confirmed_by_role: profile.role, confirmed_at: now }
      }),
      supabase.from('lead_activities').insert({ event_id: lead.event_id || null, lead_id: lead.id, user_id: profile.id, activity_type: 'sale_confirmed', description: `${actorName} confirmou a venda de ${selectedVehicleName}. Vendedor: ${sellerName}. ${paymentLabel}. ${installmentsLabel}. ${entryLabel}. ${tradeLabel}.`, metadata: { sale_id: saleId, vehicle_id: selectedVehicle?.id || null, vehicle_mode: vehicleMode } }),
      supabase.from('audit_logs').insert({ event_id: lead.event_id || null, user_id: profile.id, action_type: 'sale_confirmed', entity_type: 'sales', entity_id: saleId, new_value: { lead_id: lead.id, store_id: lead.assigned_store_id, vehicle_id: selectedVehicle?.id || null, vehicle_mode: vehicleMode, seller_user_id: seller.id, payment_type: paymentType, financing_bank: normalizedBank, sale_value: saleValue, confirmed_by: profile.id } })
    ]);

    const [sale, commercial] = await Promise.all([loadSale(supabase, lead.id), loadCommercial(supabase, lead.id)]);
    return NextResponse.json({ success: true, message: selectedVehicle ? `Venda confirmada. O anúncio de ${selectedVehicleName} foi retirado do marketplace.` : `Venda confirmada para ${selectedVehicleName}, informado como veículo fora do portal.`, listing_removed: Boolean(selectedVehicle), sale: commercialResponse(sale, commercial), sale_confirmed: true, commercial });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Não foi possível confirmar a venda.' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const context = await getContext(request);
    if ('error' in context) return context.error;
    const { supabase, profile } = context;
    const body = await request.json();
    const leadId = cleanText(body.lead_id, 80);
    const reason = cleanText(body.reason, 300) || 'Venda cancelada no pipeline';
    if (!leadId) return NextResponse.json({ error: 'Informe o lead.' }, { status: 400 });
    const lead = await loadLead(supabase, leadId);
    if (!lead || !lead.assigned_store_id) return NextResponse.json({ error: 'Lead não encontrado.' }, { status: 404 });
    if (!canAccessLead(profile, lead)) return NextResponse.json({ error: 'Você não tem permissão para cancelar esta venda.' }, { status: 403 });
    if (lead.status !== 'sale_confirmed') return NextResponse.json({ error: 'Este lead não possui uma venda confirmada ativa.' }, { status: 400 });
    const sale = await loadSale(supabase, lead.id);
    const actorName = profile.full_name || profile.email || 'Usuário';
    const { error: leadError } = await supabase.from('leads').update({ status: 'showed_up', updated_at: new Date().toISOString() }).eq('id', lead.id);
    if (leadError) throw leadError;
    if (sale?.id) {
      const { error: saleError } = await supabase.from('sales').update({ status: 'cancelled', cancelled_at: new Date().toISOString(), cancelled_by: profile.id, cancellation_reason: reason }).eq('id', sale.id);
      if (saleError) throw saleError;
    }
    await Promise.allSettled([
      supabase.from('lead_activity_logs').insert({ lead_id: lead.id, store_id: lead.assigned_store_id, user_id: profile.id, user_name: actorName, activity_type: 'sale_cancelled', activity_label: 'Venda cancelada', from_status: 'sale_confirmed', to_status: 'showed_up', customer_name: lead.customer_name, customer_phone: lead.customer_phone, vehicle_name: lead.interested_vehicle, notes: reason, metadata: { sale_id: sale?.id || null, vehicle_id: sale?.vehicle_id || lead.interested_vehicle_id || null } }),
      supabase.from('lead_activities').insert({ event_id: lead.event_id || null, lead_id: lead.id, user_id: profile.id, activity_type: 'sale_cancelled', description: `${actorName} cancelou a venda. Motivo: ${reason}.`, metadata: { sale_id: sale?.id || null } }),
      supabase.from('audit_logs').insert({ event_id: lead.event_id || null, user_id: profile.id, action_type: 'sale_cancelled', entity_type: 'sales', entity_id: sale?.id || null, old_value: { lead_status: 'sale_confirmed', sale_status: sale?.status || null }, new_value: { lead_status: 'showed_up', sale_status: 'cancelled', cancellation_reason: reason } })
    ]);
    return NextResponse.json({ success: true, message: lead.interested_vehicle_id ? 'Venda cancelada e veículo restaurado no marketplace.' : 'Venda cancelada e lead reaberto em Compareceu.' });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Não foi possível cancelar a venda.' }, { status: 500 });
  }
}
