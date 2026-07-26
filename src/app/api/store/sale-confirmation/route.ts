import { NextResponse } from 'next/server';
import { cleanText, createAdminClient, getProfileFromToken, readBearerToken } from '@/lib/server/storeTeam';

export const runtime = 'nodejs';

const allowedRoles = ['master', 'store', 'pre_sales', 'seller', 'prospector'];
const paymentTypes = ['cash', 'financed', 'consortium', 'other'];

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

async function getContext(request: Request) {
  const supabase: any = createAdminClient();
  const token = readBearerToken(request);

  if (!token) {
    return { error: NextResponse.json({ error: 'Sessão não encontrada.' }, { status: 401 }) } as const;
  }

  const profile = await getProfileFromToken(supabase, token);
  if (!profile || profile.status !== 'active' || !allowedRoles.includes(profile.role)) {
    return { error: NextResponse.json({ error: 'Usuário sem permissão para confirmar vendas.' }, { status: 403 }) } as const;
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
    .select('id,lead_id,store_id,seller_name,seller_user_id,pre_sales_user_id,captured_by_user_id,customer_bank,financing_bank,payment_type,sale_value,vehicle_category,sale_vehicle_name,has_trade_in,installment_count,has_down_payment,down_payment_value,financed_amount,installment_value,confirmed_by,confirmed_at,created_at')
    .eq('lead_id', leadId)
    .maybeSingle();

  if (error) throw error;
  return data || null;
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
    if (!canAccessLead(profile, lead)) return NextResponse.json({ error: 'Você não tem permissão para confirmar esta venda.' }, { status: 403 });

    const store = await loadStore(supabase, lead.assigned_store_id);
    if (!store) return NextResponse.json({ error: 'Loja indisponível.' }, { status: 404 });

    const [sellers, sale] = await Promise.all([
      loadSellers(supabase, store.id),
      loadSale(supabase, lead.id)
    ]);

    const suggestedSellerId = sale?.seller_user_id || lead.seller_user_id || (profile.role === 'seller' ? profile.id : null);

    return NextResponse.json({
      lead: {
        id: lead.id,
        customer_name: lead.customer_name,
        customer_phone: lead.customer_phone,
        interested_vehicle: lead.interested_vehicle,
        interested_vehicle_price: lead.interested_vehicle_price,
        customer_bank: lead.customer_bank,
        vehicle_category_interest: lead.vehicle_category_interest,
        status: lead.status,
        assigned_store_id: lead.assigned_store_id
      },
      store,
      sellers,
      suggested_seller_id: suggestedSellerId,
      sale
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Não foi possível preparar a confirmação da venda.' }, { status: 500 });
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
    const hasTradeIn = body.has_trade_in;
    const saleValue = moneyValue(body.sale_value);
    const installmentCount = integerValue(body.installment_count);
    const hasDownPayment = paymentType === 'cash' ? false : body.has_down_payment;
    const downPaymentValue = moneyValue(body.down_payment_value);
    const financedAmount = moneyValue(body.financed_amount);
    const installmentValue = moneyValue(body.installment_value);

    if (!leadId) return NextResponse.json({ error: 'Informe o lead.' }, { status: 400 });
    if (!sellerUserId) return NextResponse.json({ error: 'Selecione o vendedor responsável pelo fechamento.' }, { status: 400 });
    if (!paymentTypes.includes(paymentType)) return NextResponse.json({ error: 'Selecione a forma de pagamento.' }, { status: 400 });
    if (paymentType === 'financed' && !financingBankInput) return NextResponse.json({ error: 'Selecione o banco do financiamento.' }, { status: 400 });
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

    const { data: seller, error: sellerError } = await supabase
      .from('users')
      .select('id,full_name,email,role,status,store_id')
      .eq('id', sellerUserId)
      .eq('store_id', lead.assigned_store_id)
      .eq('role', 'seller')
      .eq('status', 'active')
      .maybeSingle();

    if (sellerError) throw sellerError;
    if (!seller) return NextResponse.json({ error: 'O vendedor selecionado não está ativo nesta loja.' }, { status: 400 });

    const actorName = profile.full_name || profile.email || 'Usuário';
    const normalizedBank = paymentType === 'cash'
      ? 'Não se aplica'
      : paymentType === 'financed'
        ? financingBankInput
        : paymentType === 'consortium'
          ? financingBankInput || 'Consórcio'
          : financingBankInput || 'Outro';

    const { data: saleId, error: rpcError } = await supabase.rpc('confirm_lead_sale_record', {
      p_lead_id: lead.id,
      p_store_id: lead.assigned_store_id,
      p_seller_user_id: seller.id,
      p_payment_type: paymentType,
      p_financing_bank: normalizedBank,
      p_has_trade_in: hasTradeIn,
      p_sale_value: saleValue,
      p_installment_count: paymentType === 'cash' ? null : installmentCount,
      p_has_down_payment: paymentType === 'cash' ? false : hasDownPayment,
      p_down_payment_value: hasDownPayment === true ? downPaymentValue : null,
      p_financed_amount: financedAmount,
      p_installment_value: installmentValue,
      p_confirmed_by: profile.id,
      p_actor_name: actorName
    });

    if (rpcError) throw rpcError;

    const paymentLabel = paymentDescription(paymentType, normalizedBank);
    const installmentsLabel = installmentCount ? `${installmentCount} parcela(s)` : 'Sem parcelamento';
    const entryLabel = hasDownPayment ? `Entrada de R$ ${Number(downPaymentValue || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : 'Sem entrada';
    const tradeLabel = hasTradeIn ? 'Com veículo na troca' : 'Sem veículo na troca';
    const sellerName = seller.full_name || seller.email || 'Vendedor';
    const activityLabel = `Venda confirmada por ${sellerName}`;
    const now = new Date().toISOString();

    await Promise.allSettled([
      supabase.from('lead_activity_logs').insert({
        lead_id: lead.id,
        store_id: lead.assigned_store_id,
        store_name: null,
        user_id: profile.id,
        user_name: actorName,
        activity_type: 'sale_confirmed',
        activity_label: activityLabel,
        from_status: lead.status,
        to_status: 'sale_confirmed',
        customer_name: lead.customer_name,
        customer_phone: lead.customer_phone,
        vehicle_name: lead.interested_vehicle,
        notes: `${paymentLabel}. ${installmentsLabel}. ${entryLabel}. ${tradeLabel}.`,
        metadata: {
          sale_id: saleId,
          seller_user_id: seller.id,
          seller_name: sellerName,
          payment_type: paymentType,
          financing_bank: normalizedBank,
          has_trade_in: hasTradeIn,
          sale_value: saleValue,
          installment_count: installmentCount,
          has_down_payment: hasDownPayment,
          down_payment_value: downPaymentValue,
          financed_amount: financedAmount,
          installment_value: installmentValue,
          confirmed_by_role: profile.role,
          confirmed_at: now
        }
      }),
      supabase.from('lead_activities').insert({
        event_id: lead.event_id || null,
        lead_id: lead.id,
        user_id: profile.id,
        activity_type: 'sale_confirmed',
        description: `${actorName} confirmou a venda. Vendedor: ${sellerName}. ${paymentLabel}. ${installmentsLabel}. ${entryLabel}. ${tradeLabel}.`,
        metadata: { sale_id: saleId, payment_type: paymentType, installment_count: installmentCount, has_down_payment: hasDownPayment }
      }),
      supabase.from('audit_logs').insert({
        event_id: lead.event_id || null,
        user_id: profile.id,
        action_type: 'sale_confirmed',
        entity_type: 'sales',
        entity_id: saleId,
        new_value: {
          lead_id: lead.id,
          store_id: lead.assigned_store_id,
          seller_user_id: seller.id,
          payment_type: paymentType,
          financing_bank: normalizedBank,
          has_trade_in: hasTradeIn,
          sale_value: saleValue,
          installment_count: installmentCount,
          has_down_payment: hasDownPayment,
          down_payment_value: downPaymentValue,
          financed_amount: financedAmount,
          installment_value: installmentValue,
          confirmed_by: profile.id
        }
      })
    ]);

    const sale = await loadSale(supabase, lead.id);

    return NextResponse.json({
      success: true,
      message: `Venda confirmada com ${sellerName} como vendedor responsável.`,
      sale
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Não foi possível confirmar a venda.' }, { status: 500 });
  }
}
