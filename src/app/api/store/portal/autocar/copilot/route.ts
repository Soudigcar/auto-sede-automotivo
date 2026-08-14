import { NextResponse } from 'next/server';
import { analyzeAutocarCopilot } from '@/lib/server/autocar/copilot';
import { authorizeStorePortal, canAccessStoreLead } from '@/lib/server/storePortal';
import { cleanText } from '@/lib/server/storeTeam';
import { evolutionDisplayBody } from '@/lib/server/evolutionMessage';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const slug = cleanText(body?.slug, 120);
    const conversationId = cleanText(body?.conversation_id, 100);
    if (!slug || !conversationId) {
      return NextResponse.json({ error: 'Loja e conversa são obrigatórias.' }, { status: 400 });
    }

    const context = await authorizeStorePortal(request, slug);
    if ('error' in context) return context.error;
    if (!context.permissions.includes('view_whatsapp') || !context.permissions.includes('view_autocar')) {
      return NextResponse.json({ error: 'Usuário sem permissão para usar o Copilot AUTOCAR.' }, { status: 403 });
    }

    const { data: conversation, error: conversationError } = await context.supabase
      .from('whatsapp_conversations')
      .select('id,store_id,lead_id,base_lead_id')
      .eq('id', conversationId)
      .eq('store_id', context.store.id)
      .maybeSingle();
    if (conversationError) throw conversationError;
    if (!conversation) return NextResponse.json({ error: 'Conversa não encontrada nesta loja.' }, { status: 404 });

    const { data: lead, error: leadError } = conversation.lead_id
      ? await context.supabase.from('leads')
          .select('id,assigned_store_id,assigned_user_id,customer_name,customer_phone,status,interested_vehicle,interested_vehicle_id,interested_vehicle_price,scheduled_at,notes,origin')
          .eq('id', conversation.lead_id).eq('assigned_store_id', context.store.id).maybeSingle()
      : { data: null, error: null };
    if (leadError) throw leadError;

    if (context.role !== 'master' && context.role !== 'store') {
      if (!lead || !canAccessStoreLead(context.profile, context.role, lead)) {
        return NextResponse.json({ error: 'Este lead não está sob sua responsabilidade atual.' }, { status: 403 });
      }
    }

    const [{ data: baseLead, error: baseLeadError }, { data: commercial, error: commercialError }, { data: messages, error: messagesError }] = await Promise.all([
      conversation.base_lead_id
        ? context.supabase.from('leads_base').select('id,name,phone,status,source,campaign_name').eq('id', conversation.base_lead_id).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      lead?.id
        ? context.supabase.from('lead_commercial_details')
            .select('payment_type,financing_bank,has_down_payment,down_payment_value,financed_amount,installment_count,installment_value,has_trade_in,trade_vehicle_name,trade_vehicle_manufacture_year,trade_vehicle_model_year')
            .eq('lead_id', lead.id).eq('store_id', context.store.id).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      context.supabase.from('whatsapp_messages')
        .select('direction,message_type,body,raw_payload,sent_at,created_at')
        .eq('store_id', context.store.id)
        .eq('conversation_id', conversation.id)
        .order('sent_at', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(40)
    ]);
    if (baseLeadError) throw baseLeadError;
    if (commercialError) throw commercialError;
    if (messagesError) throw messagesError;

    const textMessages = (messages || []).reverse().map((message: any) => ({
      direction: String(message.direction || ''),
      message_type: String(message.message_type || 'text'),
      body: evolutionDisplayBody(message.body, message.raw_payload),
      sent_at: message.sent_at || message.created_at || null
    })).filter((message: any) => Boolean(String(message.body || '').trim()));

    const analysis = await analyzeAutocarCopilot({
      store: context.store,
      lead: lead || null,
      baseLead: baseLead || null,
      commercial: commercial || null,
      messages: textMessages
    });

    return NextResponse.json({
      success: true,
      generated_at: new Date().toISOString(),
      conversation_id: conversation.id,
      analysis
    });
  } catch (error: any) {
    console.error('AUTOCAR Copilot analysis error:', error?.message || error);
    return NextResponse.json({ error: error?.message || 'Não foi possível gerar a análise AUTOCAR.' }, { status: 500 });
  }
}
