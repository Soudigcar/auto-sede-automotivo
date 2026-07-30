import { NextResponse } from 'next/server';
import { cleanText, createAdminClient, getProfileFromToken, readBearerToken } from '@/lib/server/storeTeam';

export const runtime = 'nodejs';

const editableRoles = ['master', 'store', 'pre_sales', 'seller'];
const paymentTypes = ['cash', 'financed', 'consortium', 'other'];

function canAccessLead(profile: any, lead: any) {
  if (profile.role === 'master') return true;
  if (!profile.store_id || profile.store_id !== lead.assigned_store_id) return false;
  if (profile.role === 'store') return true;
  if (profile.role === 'pre_sales') return lead.pre_sales_user_id === profile.id || lead.assigned_user_id === profile.id;
  if (profile.role === 'seller') return lead.seller_user_id === profile.id || lead.assigned_user_id === profile.id;
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

function commercialResponse(commercial: any, sale: any) {
  if (sale) return { ...sale, is_confirmed: sale.status === 'confirmed', commercial_id: commercial?.id || null };
  return {
    id: commercial?.id || 'lead-commercial-draft',
    payment_type: commercial?.payment_type || null,
    financing_bank: commercial?.financing_bank || null,
    sale_value: commercial?.negotiated_value ?? null,
    has_trade_in: commercial?.has_trade_in ?? null,
    installment_count: commercial?.installment_count ?? null,
    has_down_payment: commercial?.has_down_payment ?? null,
    down_payment_value: commercial?.down_payment_value ?? null,
    financed_amount: commercial?.financed_amount ?? null,
    installment_value: commercial?.installment_value ?? null,
    is_confirmed: false,
    commercial_id: commercial?.id || null
  };
}

async function loadCommercial(supabase: any, leadId: string, storeId: string) {
  const { data, error } = await supabase
    .from('lead_commercial_details')
    .select('*')
    .eq('lead_id', leadId)
    .eq('store_id', storeId)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

async function loadSale(supabase: any, leadId: string, storeId: string) {
  const { data, error } = await supabase
    .from('sales')
    .select('*')
    .eq('lead_id', leadId)
    .eq('store_id', storeId)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

export async function POST(request: Request) {
  try {
    const supabase: any = createAdminClient();
    const token = readBearerToken(request);
    if (!token) return NextResponse.json({ error: 'Sessão não encontrada.' }, { status: 401 });

    const profile = await getProfileFromToken(supabase, token);
    if (!profile || profile.status !== 'active' || !editableRoles.includes(profile.role)) {
      return NextResponse.json({ error: 'Usuário sem permissão para editar condições comerciais.' }, { status: 403 });
    }

    const body = await request.json();
    const leadId = cleanText(body.lead_id, 80);
    if (!leadId) return NextResponse.json({ error: 'Informe o lead.' }, { status: 400 });

    const { data: lead, error: leadError } = await supabase
      .from('leads')
      .select('id,event_id,assigned_store_id,assigned_user_id,pre_sales_user_id,seller_user_id,captured_by_user_id,customer_name,customer_phone,interested_vehicle,status')
      .eq('id', leadId)
      .maybeSingle();
    if (leadError) throw leadError;
    if (!lead || !lead.assigned_store_id) return NextResponse.json({ error: 'Lead não encontrado.' }, { status: 404 });
    if (!canAccessLead(profile, lead)) return NextResponse.json({ error: 'Você não tem permissão para editar as condições deste lead.' }, { status: 403 });

    const [currentCommercial, currentSale] = await Promise.all([
      loadCommercial(supabase, lead.id, lead.assigned_store_id),
      loadSale(supabase, lead.id, lead.assigned_store_id)
    ]);

    const paymentType = cleanText(body.payment_type, 30);
    if (!paymentType) {
      return NextResponse.json({
        success: true,
        skipped: true,
        sale: commercialResponse(currentCommercial, currentSale),
        message: 'Dados do lead salvos. Condições comerciais não foram alteradas.'
      });
    }
    if (!paymentTypes.includes(paymentType)) return NextResponse.json({ error: 'Selecione uma forma de pagamento válida.' }, { status: 400 });

    if (currentSale?.status === 'confirmed') {
      if (profile.role === 'pre_sales') {
        return NextResponse.json({ error: 'Pré-vendas não pode alterar uma venda já confirmada.' }, { status: 403 });
      }
      if (profile.role === 'seller' && currentSale.seller_user_id !== profile.id) {
        return NextResponse.json({ error: 'O vendedor só pode alterar a própria venda.' }, { status: 403 });
      }
    }

    const financingBank = cleanText(body.financing_bank, 160);
    const installmentCount = integerValue(body.installment_count);
    const hasDownPayment = paymentType === 'cash' ? false : body.has_down_payment;
    const downPaymentValue = moneyValue(body.down_payment_value);
    const negotiatedValue = moneyValue(body.sale_value);
    const financedAmount = moneyValue(body.financed_amount);
    const installmentValue = moneyValue(body.installment_value);
    const hasTradeIn = typeof body.has_trade_in === 'boolean'
      ? body.has_trade_in
      : currentCommercial?.has_trade_in ?? currentSale?.has_trade_in ?? null;

    if (negotiatedValue !== null && (!Number.isFinite(negotiatedValue) || negotiatedValue < 0)) return NextResponse.json({ error: 'Informe um valor negociado válido.' }, { status: 400 });
    if (paymentType === 'financed' && !financingBank) return NextResponse.json({ error: 'Informe o banco do financiamento.' }, { status: 400 });
    if (['financed', 'consortium'].includes(paymentType) && (!Number.isInteger(installmentCount) || Number(installmentCount) < 1 || Number(installmentCount) > 120)) {
      return NextResponse.json({ error: 'Informe uma quantidade de parcelas entre 1 e 120.' }, { status: 400 });
    }
    if (paymentType !== 'cash' && typeof hasDownPayment !== 'boolean') return NextResponse.json({ error: 'Informe se houve entrada.' }, { status: 400 });
    if (hasDownPayment === true && (downPaymentValue === null || !Number.isFinite(downPaymentValue) || downPaymentValue <= 0)) {
      return NextResponse.json({ error: 'Informe um valor de entrada maior que zero.' }, { status: 400 });
    }
    if (negotiatedValue !== null && downPaymentValue !== null && downPaymentValue > negotiatedValue) {
      return NextResponse.json({ error: 'O valor da entrada não pode ser maior que o valor negociado.' }, { status: 400 });
    }
    if (financedAmount !== null && (!Number.isFinite(financedAmount) || financedAmount < 0)) return NextResponse.json({ error: 'Informe um valor financiado válido.' }, { status: 400 });
    if (installmentValue !== null && (!Number.isFinite(installmentValue) || installmentValue < 0)) return NextResponse.json({ error: 'Informe um valor de parcela válido.' }, { status: 400 });
    if (typeof hasTradeIn !== 'boolean') return NextResponse.json({ error: 'Informe se haverá veículo na troca.' }, { status: 400 });

    const actorName = profile.full_name || profile.email || 'Usuário da loja';
    const { data: commercialId, error: rpcError } = await supabase.rpc('store_update_commercial_transaction', {
      p_lead_id: lead.id,
      p_store_id: lead.assigned_store_id,
      p_payment_type: paymentType,
      p_financing_bank: financingBank || null,
      p_sale_value: negotiatedValue,
      p_installment_count: paymentType === 'cash' ? null : installmentCount,
      p_has_down_payment: paymentType === 'cash' ? false : hasDownPayment,
      p_down_payment_value: hasDownPayment === true ? downPaymentValue : null,
      p_financed_amount: financedAmount,
      p_installment_value: installmentValue,
      p_has_trade_in: hasTradeIn,
      p_actor_user_id: profile.id,
      p_actor_name: actorName
    });
    if (rpcError) throw rpcError;

    const [updatedCommercial, updatedSale] = await Promise.all([
      loadCommercial(supabase, lead.id, lead.assigned_store_id),
      loadSale(supabase, lead.id, lead.assigned_store_id)
    ]);

    return NextResponse.json({
      success: true,
      commercial_id: commercialId,
      sale: commercialResponse(updatedCommercial, updatedSale),
      commercial: updatedCommercial,
      sale_confirmed: updatedSale?.status === 'confirmed',
      message: updatedSale?.status === 'confirmed'
        ? 'Dados comerciais da venda salvos com sucesso.'
        : 'Condições da negociação salvas com sucesso.'
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Não foi possível salvar as condições comerciais.' }, { status: 500 });
  }
}
