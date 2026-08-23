import { NextResponse } from 'next/server';
import { authorizeStorePortal, canAccessStoreLead } from '@/lib/server/storePortal';
import { cleanText } from '@/lib/server/storeTeam';

export const runtime = 'nodejs';

function brazilWhatsappId(value: unknown) {
  let digits = String(value || '').replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.startsWith('0') && digits.length >= 11) digits = digits.slice(1);
  if (digits.length === 10 || digits.length === 11) digits = `55${digits}`;
  return digits;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const slug = cleanText(body.slug, 120);
    const leadId = cleanText(body.lead_id, 80);
    if (!slug || !leadId) return NextResponse.json({ error: 'Informe a loja e o lead.' }, { status: 400 });

    const context = await authorizeStorePortal(request, slug);
    if ('error' in context) return context.error;

    const { data: lead, error: leadError } = await context.supabase
      .from('leads')
      .select('id, customer_name, customer_phone, assigned_store_id, assigned_user_id')
      .eq('id', leadId)
      .eq('assigned_store_id', context.store.id)
      .maybeSingle();

    if (leadError) throw leadError;
    if (!lead || !canAccessStoreLead(context.profile, context.role, lead)) {
      return NextResponse.json({ error: 'Lead não encontrado na carteira deste usuário.' }, { status: 404 });
    }

    const { data: linkedConversation, error: linkedError } = await context.supabase
      .from('whatsapp_conversations')
      .select('id')
      .eq('store_id', context.store.id)
      .eq('lead_id', lead.id)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (linkedError) throw linkedError;
    if (linkedConversation?.id) {
      return NextResponse.json({ success: true, conversation_id: linkedConversation.id, created: false });
    }

    const waId = brazilWhatsappId(lead.customer_phone);
    if (waId.length < 12 || waId.length > 13 || !waId.startsWith('55')) {
      return NextResponse.json({ error: 'Este lead não possui um WhatsApp brasileiro válido.' }, { status: 422 });
    }

    const { data: integration, error: integrationError } = await context.supabase
      .from('store_whatsapp_integrations')
      .select('id, crm_number_id')
      .eq('store_id', context.store.id)
      .eq('scope', 'store')
      .not('crm_number_id', 'is', null)
      .limit(1)
      .maybeSingle();

    if (integrationError) throw integrationError;
    if (!integration?.crm_number_id) {
      return NextResponse.json({ error: 'A loja ainda não possui um WhatsApp conectado ao CRM.' }, { status: 409 });
    }

    const { data: existingContact, error: contactLookupError } = await context.supabase
      .from('whatsapp_contacts')
      .select('id, lead_id')
      .eq('whatsapp_number_id', integration.crm_number_id)
      .eq('wa_id', waId)
      .maybeSingle();

    if (contactLookupError) throw contactLookupError;
    if (existingContact?.lead_id && existingContact.lead_id !== lead.id) {
      return NextResponse.json({ error: 'Este telefone já está vinculado a outro lead da loja.' }, { status: 409 });
    }

    let contactId = existingContact?.id || '';
    if (!contactId) {
      const { data: createdContact, error: createContactError } = await context.supabase
        .from('whatsapp_contacts')
        .insert({
          store_id: context.store.id,
          lead_id: lead.id,
          whatsapp_number_id: integration.crm_number_id,
          wa_id: waId,
          phone: waId,
          profile_name: cleanText(lead.customer_name, 250) || waId,
          metadata: { source: 'store_pipeline_outbound' }
        })
        .select('id')
        .single();
      if (createContactError) throw createContactError;
      contactId = createdContact.id;
    } else if (!existingContact.lead_id) {
      const { error: linkContactError } = await context.supabase
        .from('whatsapp_contacts')
        .update({ lead_id: lead.id, profile_name: cleanText(lead.customer_name, 250) || waId })
        .eq('id', contactId)
        .eq('store_id', context.store.id);
      if (linkContactError) throw linkContactError;
    }

    const { data: existingConversation, error: conversationLookupError } = await context.supabase
      .from('whatsapp_conversations')
      .select('id, lead_id')
      .eq('whatsapp_number_id', integration.crm_number_id)
      .eq('contact_id', contactId)
      .maybeSingle();

    if (conversationLookupError) throw conversationLookupError;
    if (existingConversation?.lead_id && existingConversation.lead_id !== lead.id) {
      return NextResponse.json({ error: 'A conversa deste telefone já pertence a outro lead.' }, { status: 409 });
    }

    if (existingConversation?.id) {
      const { error: linkConversationError } = await context.supabase
        .from('whatsapp_conversations')
        .update({ lead_id: lead.id, assigned_user_id: lead.assigned_user_id || null, status: 'open', updated_at: new Date().toISOString() })
        .eq('id', existingConversation.id)
        .eq('store_id', context.store.id);
      if (linkConversationError) throw linkConversationError;
      return NextResponse.json({ success: true, conversation_id: existingConversation.id, created: false });
    }

    const { data: conversation, error: createConversationError } = await context.supabase
      .from('whatsapp_conversations')
      .insert({
        store_id: context.store.id,
        whatsapp_number_id: integration.crm_number_id,
        contact_id: contactId,
        lead_id: lead.id,
        assigned_user_id: lead.assigned_user_id || null,
        status: 'open',
        metadata: { source: 'store_pipeline_outbound' }
      })
      .select('id')
      .single();

    if (createConversationError) throw createConversationError;
    return NextResponse.json({ success: true, conversation_id: conversation.id, created: true });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Não foi possível abrir a conversa no WhatsApp CRM.' }, { status: 500 });
  }
}
