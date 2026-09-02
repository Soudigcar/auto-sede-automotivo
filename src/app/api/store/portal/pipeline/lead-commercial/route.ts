import { NextResponse } from 'next/server';
import { normalizeFinancingPaymentType } from '@/lib/financingSimulationV1';
import { cleanText } from '@/lib/server/storeTeam';
import { authorizeStorePortal, canAccessStoreLead } from '@/lib/server/storePortal';

export const runtime = 'nodejs';
function digits(value: unknown) { return String(value || '').replace(/\D/g, ''); }
function legacyPaymentType(value: unknown) { return value === 'consortium' ? 'credit_letter' : value || null; }

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const slug = cleanText(url.searchParams.get('slug'), 120);
    const leadId = cleanText(url.searchParams.get('lead_id'), 80);
    if (!slug || !leadId) return NextResponse.json({ error: 'Informe a loja e o lead.' }, { status: 400 });
    const context = await authorizeStorePortal(request, slug);
    if ('error' in context) return context.error;
    const { data: lead, error: leadError } = await context.supabase.from('leads')
      .select('id,assigned_store_id,assigned_user_id,assigned_user_role,pre_sales_user_id,seller_user_id,captured_by_user_id')
      .eq('id', leadId).maybeSingle();
    if (leadError) throw leadError;
    if (!lead || lead.assigned_store_id !== context.store.id || !canAccessStoreLead(context.profile, context.role, lead)) {
      return NextResponse.json({ error: 'Lead não encontrado na carteira deste usuário.' }, { status: 404 });
    }
    const { data, error } = await context.supabase.from('lead_commercial_details')
      .select('lead_id,payment_type,has_trade_in,has_driver_license,cpf,birth_date,trade_vehicle_configuration_id,trade_vehicle_name,trade_vehicle_manufacture_year,trade_vehicle_model_year')
      .eq('lead_id', leadId).maybeSingle();
    if (error) throw error;
    return NextResponse.json({ details: data ? { ...data, payment_type: legacyPaymentType(data.payment_type) } : null });
  } catch (error: any) {
    const message = String(error?.message || 'Não foi possível carregar os dados comerciais.');
    if (message.includes('has_driver_license') || message.includes('trade_vehicle_configuration_id')) {
      return NextResponse.json({ error: 'A migration dos novos campos comerciais ainda não foi aplicada.' }, { status: 503 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const slug = cleanText(body.slug, 120);
    const leadId = cleanText(body.lead_id, 80);
    if (!slug || !leadId) return NextResponse.json({ error: 'Informe a loja e o lead.' }, { status: 400 });
    const context = await authorizeStorePortal(request, slug);
    if ('error' in context) return context.error;
    const { data: lead, error: leadError } = await context.supabase.from('leads')
      .select('id,event_id,assigned_store_id,assigned_user_id,assigned_user_role,pre_sales_user_id,seller_user_id,captured_by_user_id,status,customer_name')
      .eq('id', leadId).maybeSingle();
    if (leadError) throw leadError;
    if (!lead || lead.assigned_store_id !== context.store.id || !canAccessStoreLead(context.profile, context.role, lead)) {
      return NextResponse.json({ error: 'Lead não encontrado na carteira deste usuário.' }, { status: 404 });
    }
    const cpf = digits(body.cpf);
    if (cpf && cpf.length !== 11) return NextResponse.json({ error: 'Informe um CPF com 11 dígitos.' }, { status: 400 });
    const rawPaymentType = cleanText(body.payment_type, 40) || null;
    const paymentType = normalizeFinancingPaymentType(rawPaymentType);
    if (rawPaymentType && !paymentType) return NextResponse.json({ error: 'Forma de pagamento inválida.' }, { status: 400 });
    const payload = {
      lead_id: lead.id, store_id: context.store.id,
      has_driver_license: typeof body.has_driver_license === 'boolean' ? body.has_driver_license : null,
      cpf: cpf || null, birth_date: cleanText(body.birth_date, 20) || null, payment_type: paymentType,
      has_trade_in: typeof body.has_trade_in === 'boolean' ? body.has_trade_in : null,
      trade_vehicle_configuration_id: cleanText(body.trade_vehicle_configuration_id, 80) || null,
      trade_vehicle_name: cleanText(body.trade_vehicle_name, 300) || null,
      trade_vehicle_manufacture_year: Number(body.trade_vehicle_manufacture_year) || null,
      trade_vehicle_model_year: Number(body.trade_vehicle_model_year) || null,
      updated_by: context.profile.id, updated_at: new Date().toISOString()
    };
    if (!payload.has_trade_in) {
      payload.trade_vehicle_configuration_id = null; payload.trade_vehicle_name = null;
      payload.trade_vehicle_manufacture_year = null; payload.trade_vehicle_model_year = null;
    }
    const { data, error } = await context.supabase.from('lead_commercial_details')
      .upsert(payload, { onConflict: 'lead_id' }).select('*').single();
    if (error) throw error;
    const actorName = context.profile.full_name || context.profile.email || 'Usuário da loja';
    await Promise.allSettled([
      context.supabase.from('lead_activity_logs').insert({
        lead_id: lead.id, store_id: context.store.id, store_name: context.store.store_name,
        user_id: context.profile.id, user_name: actorName, activity_type: 'commercial_details_updated',
        activity_label: 'Dados comerciais atualizados', from_status: lead.status, to_status: lead.status,
        customer_name: lead.customer_name,
        metadata: { payment_type: paymentType, has_trade_in: payload.has_trade_in, has_driver_license: payload.has_driver_license, registered_from: 'pipeline_lead_workspace' }
      }),
      context.supabase.from('audit_logs').insert({
        event_id: lead.event_id || context.store.event_id || null, user_id: context.profile.id,
        user_role: context.role, action_type: 'commercial_details_updated', entity_type: 'lead_commercial_details', entity_id: data.id,
        new_value: { payment_type: paymentType, has_trade_in: payload.has_trade_in, has_driver_license: payload.has_driver_license, birth_date_present: Boolean(payload.birth_date), trade_vehicle_name: payload.trade_vehicle_name }
      })
    ]);
    return NextResponse.json({ success: true, message: 'Dados pessoais e comerciais salvos.', details: { ...data, payment_type: legacyPaymentType(data.payment_type) } });
  } catch (error: any) {
    const message = String(error?.message || 'Não foi possível salvar os dados comerciais.');
    if (message.includes('has_driver_license') || message.includes('trade_vehicle_configuration_id')) {
      return NextResponse.json({ error: 'A migration dos novos campos comerciais ainda não foi aplicada.' }, { status: 503 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
