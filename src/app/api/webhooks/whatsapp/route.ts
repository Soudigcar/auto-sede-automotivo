import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

const defaultVerifyToken = 'auto-controle-whatsapp-2026';

function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

  if (!supabaseUrl || !serviceKey) {
    throw new Error('Supabase Service Role não configurada no servidor.');
  }

  return createClient(supabaseUrl, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
}

function text(value: unknown) {
  return String(value || '').trim();
}

function normalizePhone(value: unknown) {
  return String(value || '').replace(/\D/g, '').trim();
}

function whatsappDate(timestamp: unknown) {
  const seconds = Number(timestamp || 0);
  if (!Number.isFinite(seconds) || seconds <= 0) return new Date().toISOString();
  return new Date(seconds * 1000).toISOString();
}

function getMessageBody(message: any) {
  if (!message) return '';

  if (message.type === 'text') return text(message.text?.body);
  if (message.type === 'button') return text(message.button?.text || message.button?.payload);
  if (message.type === 'interactive') {
    return text(
      message.interactive?.button_reply?.title ||
      message.interactive?.button_reply?.id ||
      message.interactive?.list_reply?.title ||
      message.interactive?.list_reply?.id
    );
  }
  if (message.type === 'image') return text(message.image?.caption) || '[Imagem recebida]';
  if (message.type === 'video') return text(message.video?.caption) || '[Vídeo recebido]';
  if (message.type === 'audio') return '[Áudio recebido]';
  if (message.type === 'document') return text(message.document?.filename) || '[Documento recebido]';
  if (message.type === 'sticker') return '[Figurinha recebida]';
  if (message.type === 'contacts') return '[Contato recebido]';
  if (message.type === 'location') return '[Localização recebida]';

  return `[Mensagem ${message.type || 'desconhecida'} recebida]`;
}

async function verifyToken(supabase: any, requestedToken: string) {
  if (!requestedToken) return false;
  if (requestedToken === defaultVerifyToken) return true;

  const { data } = await supabase
    .from('whatsapp_numbers')
    .select('id')
    .eq('verify_token', requestedToken)
    .limit(1);

  return Boolean(data?.length);
}

async function findOrCreateLead(supabase: any, numberConfig: any, contactName: string, phone: string, firstMessage: string) {
  const storeId = numberConfig.store_id || null;
  const store = numberConfig.stores || null;

  if (!storeId) {
    const { data: existingBase } = await supabase
      .from('leads_base')
      .select('id, routed_lead_id')
      .eq('phone', phone)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingBase?.id) {
      return { leadId: existingBase.routed_lead_id || null, baseLeadId: existingBase.id };
    }

    const { data: baseLead, error: baseError } = await supabase
      .from('leads_base')
      .insert({
        name: contactName || phone,
        phone,
        source: 'WhatsApp Oficial',
        campaign_name: numberConfig.label || 'WhatsApp Oficial',
        status: 'Novo lead',
        notes: firstMessage ? `Primeira mensagem: ${firstMessage}` : 'Lead criado automaticamente pelo WhatsApp Oficial.',
        routing_strategy: 'whatsapp_unassigned',
        metadata: {
          whatsapp: {
            phone_number_id: numberConfig.phone_number_id,
            number_label: numberConfig.label
          }
        }
      })
      .select('id')
      .single();

    if (baseError) throw baseError;

    return { leadId: null, baseLeadId: baseLead?.id || null };
  }

  const { data: existingLead } = await supabase
    .from('leads')
    .select('id')
    .eq('assigned_store_id', storeId)
    .eq('customer_phone', phone)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  let leadId = existingLead?.id || null;

  if (!leadId) {
    const { data: lead, error: leadError } = await supabase
      .from('leads')
      .insert({
        event_id: store?.event_id || null,
        customer_name: contactName || phone,
        customer_phone: phone,
        customer_bank: '',
        interested_vehicle: '',
        vehicle_category_interest: '',
        origin: 'WhatsApp Oficial',
        assigned_store_id: storeId,
        status: 'new_lead',
        notes: [
          'Lead criado automaticamente pelo WhatsApp Oficial.',
          numberConfig.label ? `Número: ${numberConfig.label}.` : '',
          firstMessage ? `Primeira mensagem: ${firstMessage}` : ''
        ].filter(Boolean).join(' ')
      })
      .select('id')
      .single();

    if (leadError) throw leadError;
    leadId = lead?.id || null;
  }

  const { data: existingBase } = await supabase
    .from('leads_base')
    .select('id')
    .eq('phone', phone)
    .eq('assigned_store_id', storeId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  let baseLeadId = existingBase?.id || null;

  if (!baseLeadId) {
    const { data: baseLead, error: baseError } = await supabase
      .from('leads_base')
      .insert({
        name: contactName || phone,
        phone,
        source: 'WhatsApp Oficial',
        campaign_name: numberConfig.label || 'WhatsApp Oficial',
        status: 'Novo lead',
        assigned_store_id: storeId,
        assigned_store_name: store?.store_name || null,
        assigned_at: new Date().toISOString(),
        routed_lead_id: leadId,
        routing_strategy: 'whatsapp_phone_number_store',
        notes: firstMessage ? `Primeira mensagem: ${firstMessage}` : 'Lead criado automaticamente pelo WhatsApp Oficial.',
        metadata: {
          whatsapp: {
            phone_number_id: numberConfig.phone_number_id,
            number_label: numberConfig.label,
            store_id: storeId,
            store_name: store?.store_name || null
          }
        }
      })
      .select('id')
      .single();

    if (baseError) throw baseError;
    baseLeadId = baseLead?.id || null;
  }

  return { leadId, baseLeadId };
}

async function processInboundMessage(supabase: any, value: any, message: any) {
  const phoneNumberId = text(value?.metadata?.phone_number_id);
  const contact = Array.isArray(value?.contacts) ? value.contacts.find((item: any) => item?.wa_id === message?.from) || value.contacts[0] : null;
  const waId = normalizePhone(contact?.wa_id || message?.from);
  const phone = normalizePhone(message?.from || contact?.wa_id);
  const profileName = text(contact?.profile?.name) || phone;
  const messageBody = getMessageBody(message);
  const sentAt = whatsappDate(message?.timestamp);

  if (!phoneNumberId || !phone || !message?.id) {
    return { skipped: true, reason: 'Payload sem phone_number_id, telefone ou ID da mensagem.' };
  }

  const { data: numberConfig, error: numberError } = await supabase
    .from('whatsapp_numbers')
    .select('*, stores(id, store_name, slug, event_id)')
    .eq('phone_number_id', phoneNumberId)
    .maybeSingle();

  if (numberError) throw numberError;

  if (!numberConfig || !numberConfig.is_active) {
    return { skipped: true, reason: 'Número WhatsApp não cadastrado ou inativo.', phone_number_id: phoneNumberId };
  }

  const { leadId, baseLeadId } = await findOrCreateLead(supabase, numberConfig, profileName, phone, messageBody);

  const contactPayload = {
    store_id: numberConfig.store_id || null,
    lead_id: leadId,
    base_lead_id: baseLeadId,
    whatsapp_number_id: numberConfig.id,
    wa_id: waId || phone,
    phone,
    profile_name: profileName,
    last_seen_at: new Date().toISOString(),
    metadata: { last_message_id: message.id }
  };

  const { data: contactRow, error: contactError } = await supabase
    .from('whatsapp_contacts')
    .upsert(contactPayload, { onConflict: 'whatsapp_number_id,wa_id' })
    .select('*')
    .single();

  if (contactError) throw contactError;

  const conversationPayload = {
    store_id: numberConfig.store_id || null,
    whatsapp_number_id: numberConfig.id,
    contact_id: contactRow.id,
    lead_id: leadId,
    base_lead_id: baseLeadId,
    status: 'open',
    last_message: messageBody,
    last_message_at: sentAt,
    unread_count: 1,
    updated_at: new Date().toISOString(),
    metadata: { profile_name: profileName, phone }
  };

  const { data: existingConversation } = await supabase
    .from('whatsapp_conversations')
    .select('id, unread_count')
    .eq('whatsapp_number_id', numberConfig.id)
    .eq('contact_id', contactRow.id)
    .maybeSingle();

  let conversation;

  if (existingConversation?.id) {
    const { data, error } = await supabase
      .from('whatsapp_conversations')
      .update({
        ...conversationPayload,
        unread_count: Number(existingConversation.unread_count || 0) + 1
      })
      .eq('id', existingConversation.id)
      .select('*')
      .single();

    if (error) throw error;
    conversation = data;
  } else {
    const { data, error } = await supabase
      .from('whatsapp_conversations')
      .insert(conversationPayload)
      .select('*')
      .single();

    if (error) throw error;
    conversation = data;
  }

  const { error: messageError } = await supabase
    .from('whatsapp_messages')
    .upsert({
      store_id: numberConfig.store_id || null,
      whatsapp_number_id: numberConfig.id,
      conversation_id: conversation.id,
      contact_id: contactRow.id,
      lead_id: leadId,
      base_lead_id: baseLeadId,
      wa_message_id: message.id,
      direction: 'inbound',
      message_type: message.type || 'text',
      body: messageBody,
      media_id: message.image?.id || message.video?.id || message.audio?.id || message.document?.id || message.sticker?.id || null,
      status: 'received',
      raw_payload: message,
      sent_at: sentAt
    }, { onConflict: 'wa_message_id' });

  if (messageError) throw messageError;

  await supabase
    .from('whatsapp_numbers')
    .update({ last_webhook_at: new Date().toISOString(), last_error: null, status: 'connected' })
    .eq('id', numberConfig.id);

  return {
    success: true,
    phone_number_id: phoneNumberId,
    store_id: numberConfig.store_id || null,
    lead_id: leadId,
    base_lead_id: baseLeadId,
    conversation_id: conversation.id
  };
}

async function processStatus(supabase: any, status: any) {
  const messageId = text(status?.id);
  const currentStatus = text(status?.status);

  if (!messageId || !currentStatus) return { skipped: true };

  const { error } = await supabase
    .from('whatsapp_messages')
    .update({ status: currentStatus })
    .eq('wa_message_id', messageId);

  if (error) throw error;

  return { success: true, message_id: messageId, status: currentStatus };
}

export async function GET(request: Request) {
  try {
    const supabase = getAdminClient();
    const url = new URL(request.url);
    const mode = url.searchParams.get('hub.mode') || '';
    const requestedToken = url.searchParams.get('hub.verify_token') || '';
    const challenge = url.searchParams.get('hub.challenge') || '';

    if (mode === 'subscribe' && await verifyToken(supabase, requestedToken)) {
      return new Response(challenge, {
        status: 200,
        headers: { 'Content-Type': 'text/plain' }
      });
    }

    return NextResponse.json({ error: 'Token de verificação inválido.' }, { status: 403 });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Erro no webhook WhatsApp.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const results: any[] = [];

  try {
    const supabase = getAdminClient();
    const payload = await request.json();
    const entries = Array.isArray(payload?.entry) ? payload.entry : [];

    for (const entry of entries) {
      const changes = Array.isArray(entry?.changes) ? entry.changes : [];

      for (const change of changes) {
        const value = change?.value || {};
        const messages = Array.isArray(value?.messages) ? value.messages : [];
        const statuses = Array.isArray(value?.statuses) ? value.statuses : [];

        for (const message of messages) {
          try {
            results.push(await processInboundMessage(supabase, value, message));
          } catch (error: any) {
            results.push({ error: error?.message || 'Erro ao processar mensagem.' });
          }
        }

        for (const status of statuses) {
          try {
            results.push(await processStatus(supabase, status));
          } catch (error: any) {
            results.push({ error: error?.message || 'Erro ao processar status.' });
          }
        }
      }
    }

    return NextResponse.json({ success: true, results });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || 'Erro ao receber webhook WhatsApp.', results },
      { status: 200 }
    );
  }
}
