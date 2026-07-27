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

function paymentLabel(value: string) {
  if (value === 'cash') return 'À vista';
  if (value === 'financed') return 'Financiado';
  if (value === 'consortium') return 'Consórcio';
  if (value === 'other') return 'Outra forma';
  return 'Não informado';
}

function commercialResponse(commercial: any, sale: any) {
  if (sale) {
    return {
      ...sale,
      is_confirmed: true,
      commercial_id: commercial?.id || null
    };
  }

  return {
    id: commercial?.id || `lead-commercial-draft`,
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

export async function POST(request: Request) {
  try {
    const supabase: any = createAdminClient();
    const token = readBearerToken(request);
    if (!token) return NextResponse.json({ error: 'Sessão não encontrada.' }, { status: 401 });

    const profile = await getProfileFromToken(supabase, token);
    if (!profile || profile.status !== 'active' || !allowedRoles.includes(profile.role)) {
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

    const [{ data: currentCommercial, error: commercialError }, { data: currentSale, error: saleError }] = await Promise.all([
      supabase
        .from('lead_commercial_details')
        .select('*')
        .eq('lead_id', lead.id)
        .eq('store_id', lead.assigned_store_id)
        .maybeSingle(),
      supabase
        .from('sales')
        .select('*')
        .eq('lead_id', lead.id)
        .eq('store_id', lead.assigned_store_id)
        .maybeSingle()
    ]);
    if (commercialError) throw commercialError;
    if (saleError) throw saleError;

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

    const financingBankInput = cleanText(body.financing_bank, 160);
    const installmentCount = integerValue(body.installment_count);
    const hasDownPayment = paymentType === 'cash' ? false : body.has_down_payment;
    const downPaymentValueInput = moneyValue(body.down_payment_value);
    const negotiatedValue = moneyValue(body.sale_value);
    const financedAmountInput = moneyValue(body.financed_amount);
    const installmentValueInput = moneyValue(body.installment_value);
    const hasTradeIn = typeof body.has_trade_in === 'boolean'
      ? body.has_trade_in
      : currentCommercial?.has_trade_in ?? currentSale?.has_trade_in ?? null;

    if (negotiatedValue !== null && (!Number.isFinite(negotiatedValue) || negotiatedValue < 0)) return NextResponse.json({ error: 'Informe um valor negociado válido.' }, { status: 400 });
    if (paymentType === 'financed' && !financingBankInput) return NextResponse.json({ error: 'Informe o banco do financiamento.' }, { status: 400 });
    if (['financed', 'consortium'].includes(paymentType) && (!Number.isInteger(installmentCount) || Number(installmentCount) < 1 || Number(installmentCount) > 120)) {
      return NextResponse.json({ error: 'Informe uma quantidade de parcelas entre 1 e 120.' }, { status: 400 });
    }
    if (paymentType !== 'cash' && typeof hasDownPayment !== 'boolean') return NextResponse.json({ error: 'Informe se houve entrada.' }, { status: 400 });
    if (hasDownPayment === true && (downPaymentValueInput === null || !Number.isFinite(downPaymentValueInput) || downPaymentValueInput <= 0)) {
      return NextResponse.json({ error: 'Informe um valor de entrada maior que zero.' }, { status: 400 });
    }
    if (negotiatedValue !== null && downPaymentValueInput !== null && downPaymentValueInput > negotiatedValue) {
      return NextResponse.json({ error: 'O valor da entrada não pode ser maior que o valor negociado.' }, { status: 400 });
    }
    if (financedAmountInput !== null && (!Number.isFinite(financedAmountInput) || financedAmountInput < 0)) return NextResponse.json({ error: 'Informe um valor financiado válido.' }, { status: 400 });
    if (installmentValueInput !== null && (!Number.isFinite(installmentValueInput) || installmentValueInput < 0)) return NextResponse.json({ error: 'Informe um valor de parcela válido.' }, { status: 400 });
    if (typeof hasTradeIn !== 'boolean') return NextResponse.json({ error: 'Informe se haverá veículo na troca.' }, { status: 400 });

    const financingBank = paymentType === 'cash'
      ? 'Não se aplica'
      : paymentType === 'financed'
        ? financingBankInput
        : paymentType === 'consortium'
          ? financingBankInput || 'Consórcio'
          : financingBankInput || 'Outro';
    const normalizedInstallments = paymentType === 'cash' ? null : installmentCount;
    const normalizedDownPayment = paymentType === 'cash' ? false : Boolean(hasDownPayment);
    const downPaymentValue = normalizedDownPayment ? downPaymentValueInput : null;
    const financedAmount = ['financed', 'consortium'].includes(paymentType)
      ? (financedAmountInput ?? (negotiatedValue !== null ? Math.max(negotiatedValue - Number(downPaymentValue || 0), 0) : null))
      : financedAmountInput;
    const installmentValue = installmentValueInput ?? (
      financedAmount !== null && normalizedInstallments && normalizedInstallments > 0
        ? Math.round((financedAmount / normalizedInstallments) * 100) / 100
        : null
    );

    const commercialPayload = {
      lead_id: lead.id,
      store_id: lead.assigned_store_id,
      payment_type: paymentType,
      financing_bank: financingBank,
      negotiated_value: negotiatedValue,
      installment_count: normalizedInstallments,
      has_down_payment: normalizedDownPayment,
      down_payment_value: downPaymentValue,
      financed_amount: financedAmount,
      installment_value: installmentValue,
      has_trade_in: hasTradeIn,
      updated_by: profile.id,
      updated_at: new Date().toISOString()
    };

    const { data: updatedCommercial, error: commercialUpdateError } = await supabase
      .from('lead_commercial_details')
      .upsert(commercialPayload, { onConflict: 'lead_id' })
      .select('*')
      .single();
    if (commercialUpdateError) throw commercialUpdateError;

    let updatedSale = currentSale;
    if (currentSale) {
      const salePayload = {
        payment_type: paymentType,
        financing_bank: financingBank,
        sale_value: negotiatedValue,
        has_trade_in: hasTradeIn,
        installment_count: normalizedInstallments,
        has_down_payment: normalizedDownPayment,
        down_payment_value: downPaymentValue,
        financed_amount: financedAmount,
        installment_value: installmentValue
      };

      const { data, error } = await supabase
        .from('sales')
        .update(salePayload)
        .eq('id', currentSale.id)
        .eq('lead_id', lead.id)
        .eq('store_id', lead.assigned_store_id)
        .select('*')
        .single();
      if (error) throw error;
      updatedSale = data;
    }

    const actorName = profile.full_name || profile.email || 'Usuário da loja';
    const now = new Date().toISOString();
    const installmentsText = normalizedInstallments ? `${normalizedInstallments} parcela(s)` : 'sem parcelamento';
    const entryText = normalizedDownPayment
      ? `entrada de R$ ${Number(downPaymentValue || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : 'sem entrada';
    const activityType = currentSale ? 'sale_details_updated' : 'lead_commercial_updated';
    const activityLabel = currentSale ? 'Dados comerciais da venda atualizados' : 'Condições da negociação atualizadas';

    await Promise.allSettled([
      supabase.from('lead_activity_logs').insert({
        lead_id: lead.id,
        store_id: lead.assigned_store_id,
        user_id: profile.id,
        user_name: actorName,
        activity_type: activityType,
        activity_label: activityLabel,
        customer_name: lead.customer_name,
        customer_phone: lead.customer_phone,
        vehicle_name: lead.interested_vehicle,
        notes: `${paymentLabel(paymentType)}. ${installmentsText}. ${entryText}.`,
        metadata: {
          commercial_id: updatedCommercial.id,
          sale_id: updatedSale?.id || null,
          ...commercialPayload,
          updated_at: now
        }
      }),
      supabase.from('lead_activities').insert({
        event_id: lead.event_id || null,
        lead_id: lead.id,
        user_id: profile.id,
        activity_type: activityType,
        description: `${actorName} atualizou as condições comerciais: ${paymentLabel(paymentType)}, ${installmentsText}, ${entryText}.`,
        metadata: { commercial_id: updatedCommercial.id, sale_id: updatedSale?.id || null, ...commercialPayload }
      }),
      supabase.from('audit_logs').insert({
        event_id: lead.event_id || null,
        user_id: profile.id,
        action_type: activityType,
        entity_type: 'lead_commercial_details',
        entity_id: updatedCommercial.id,
        old_value: currentCommercial,
        new_value: updatedCommercial
      }),
      supabase.from('leads').update({
        last_activity_at: now,
        last_activity_type: activityType,
        last_activity_label: activityLabel,
        last_activity_by_name: actorName,
        updated_at: now
      }).eq('id', lead.id)
    ]);

    return NextResponse.json({
      success: true,
      sale: commercialResponse(updatedCommercial, updatedSale),
      commercial: updatedCommercial,
      sale_confirmed: Boolean(updatedSale),
      message: currentSale ? 'Dados comerciais da venda salvos com sucesso.' : 'Condições da negociação salvas com sucesso.'
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Não foi possível salvar as condições comerciais.' }, { status: 500 });
  }
}
