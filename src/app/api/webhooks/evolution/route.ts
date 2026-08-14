import { NextResponse } from 'next/server';
import {
  evolutionWebhookSignatureHeader,
  getEvolutionConnectionState,
  verifyEvolutionWebhookSignature
} from '@/lib/server/evolution';
import { evolutionMessageContent, evolutionMessageType } from '@/lib/server/evolutionMessage';
import { cleanText, createAdminClient } from '@/lib/server/storeTeam';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function normalizePhone(value: unknown) {
  const jid = cleanText(value, 180).split('@')[0].split(':')[0];
  return jid.replace(/\D/g, '');
}

function localPhone(value: unknown) {
  const digits = normalizePhone(value);
  return digits.startsWith('55') && (digits.length === 12 || digits.length === 13) ? digits.slice(2) : digits;
}

function normalizeStatus(value: unknown) {
  const state = cleanText(value, 40).toLowerCase();
  if (state === 'open' || state === 'connected') return 'connected';
  if (state === 'connecting') return 'connecting';
  if (state === 'close' || state === 'disconnected') return 'disconnected';
  return 'pending';
}

function messageDate(value: unknown) {
  let seconds = 0;

  if (typeof value === 'number') seconds = value;
  else if (typeof value === 'string') seconds = Number(value);
  else if (value && typeof value === 'object') {
    const timestamp = value as { low?: number; high?: number; toString?: () => string };
    seconds = Number(timestamp.toString?.() || timestamp.low || 0);
  }

  if (!Number.isFinite(seconds) || seconds <= 0) return new Date().toISOString();
  return new Date(seconds > 10_000_000_000 ? seconds : seconds * 1_000).toISOString();
}

async function reconcileConnectedStatusFromMessage(supabase: any, integration: any, now: string) {
  if (integration.status === 'connected') return false;

  try {
    const stateResult = await getEvolutionConnectionState(integration.instance_name);
    if (normalizeStatus(stateResult?.instance?.state) !== 'connected') return false;

    const connectedAt = integration.last_connected_at || now;
    const { error } = await supabase
      .from('store_whatsapp_integrations')
      .update({
        status: 'connected',
        last_connected_at: connectedAt,
        last_webhook_at: now,
        last_error: null,
        updated_at: now
      })
      .eq('id', integration.id);

    if (error) throw error;

    if (integration.crm_number_id) {
      const { error: numberError } = await supabase
        .from('whatsapp_numbers')
        .update({ status: 'connected', is_active: true, updated_at: now })
        .eq('id', integration.crm_number_id);

      if (numberError) throw numberError;
    }

    integration.status = 'connected';
    integration.last_connected_at = connectedAt;
    return true;
  } catch (error: any) {
    console.warn('[Evolution webhook] Falha ao reconciliar status conectado por mensagem.', {
      instanceName: integration.instance_name,
      error: error?.message || String(error)
    });
    return false;
  }
}

async function ensureCrmNumber(supabase: any, integration: any) {
  if (integration.crm_number_id) {
    const { data, error } = await supabase
      .from('whatsapp_numbers')
      .select('*')
      .eq('id', integration.crm_number_id)
      .maybeSingle();

    if (error) throw error;
    if (data) return data;
  }

  let store: any = null;
  if (integration.scope === 'store') {
    const { data, error } = await supabase
      .from('stores')
      .select('store_name')
      .eq('id', integration.store_id)
      .single();

    if (error) throw error;
    store = data;
  }

  const { data: number, error: numberError } = await supabase
    .from('whatsapp_numbers')
    .upsert({
      store_id: integration.store_id,
      label: integration.scope === 'master'
        ? 'Master · WhatsApp Evolution'
        : `${store.store_name} · WhatsApp Evolution`,
      phone_number: integration.phone_number,
      phone_number_id: `evolution:${integration.instance_name}`,
      verify_token: `managed:${integration.instance_name}`,
      graph_version: 'evolution-2.3.7',
      routing_mode: integration.scope === 'master' ? 'master_base' : 'store_pipeline',
      is_active: integration.status === 'connected',
      status: integration.status,
      settings: {
        provider: 'evolution',
        instance_name: integration.instance_name,
        scope: integration.scope
      }
    }, { onConflict: 'phone_number_id' })
    .select('*')
    .single();

  if (numberError) throw numberError;

  const { error: linkError } = await supabase
    .from('store_whatsapp_integrations')
    .update({ crm_number_id: number.id, updated_at: new Date().toISOString() })
    .eq('id', integration.id);

  if (linkError) throw linkError;
  return number;
}

async function findOrCreateLead(supabase: any, integration: any, contactName: string, phone: string, firstMessage: string) {
  const leadPhone = localPhone(phone);
  const phoneCandidates = Array.from(new Set([phone, leadPhone, `+${phone}`, `+55${leadPhone}`]));

  if (integration.scope === 'master') {
    const { data: exactBase, error: exactBaseError } = await supabase
      .from('leads_base')
      .select('id, phone, routed_lead_id')
      .is('assigned_store_id', null)
      .in('phone', phoneCandidates)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (exactBaseError) throw exactBaseError;
    if (exactBase?.id) {
      return { leadId: exactBase.routed_lead_id || null, baseLeadId: exactBase.id };
    }

    const { data: candidates, error: candidateError } = await supabase
      .from('leads_base')
      .select('id, phone, routed_lead_id')
      .is('assigned_store_id', null)
      .not('phone', 'is', null)
      .order('created_at', { ascending: false })
      .limit(2_000);

    if (candidateError) throw candidateError;
    const existing = candidates?.find((candidate: any) => localPhone(candidate.phone) === leadPhone);
    if (existing?.id) {
      return { leadId: existing.routed_lead_id || null, baseLeadId: existing.id };
    }

    const { data: baseLead, error: baseError } = await supabase
      .from('leads_base')
      .insert({
        name: contactName || phone,
        phone: leadPhone,
        source: 'WhatsApp Evolution',
        campaign_name: 'WhatsApp central da Master',
        status: 'Novo lead',
        routing_strategy: 'whatsapp_evolution_master',
        notes: firstMessage
          ? `Primeira mensagem: ${firstMessage}`
          : 'Lead criado pelo WhatsApp central da Master.',
        metadata: {
          whatsapp: {
            provider: 'evolution',
            instance_name: integration.instance_name,
            scope: 'master'
          }
        }
      })
      .select('id')
      .single();

    if (baseError) throw baseError;
    return { leadId: null, baseLeadId: baseLead?.id || null };
  }

  const { data: store, error: storeError } = await supabase
    .from('stores')
    .select('id, store_name, event_id')
    .eq('id', integration.store_id)
    .single();

  if (storeError) throw storeError;

  const { data: exactLead, error: exactLeadError } = await supabase
    .from('leads')
    .select('id, customer_phone')
    .eq('assigned_store_id', integration.store_id)
    .in('customer_phone', phoneCandidates)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (exactLeadError) throw exactLeadError;

  let leadId = exactLead?.id || null;

  if (!leadId) {
    const { data: candidates, error: candidateError } = await supabase
      .from('leads')
      .select('id, customer_phone')
      .eq('assigned_store_id', integration.store_id)
      .not('customer_phone', 'is', null)
      .order('created_at', { ascending: false })
      .limit(2_000);

    if (candidateError) throw candidateError;
    leadId = candidates?.find((candidate: any) => localPhone(candidate.customer_phone) === leadPhone)?.id || null;
  }

  if (!leadId) {
    const { data: lead, error: leadError } = await supabase
      .from('leads')
      .insert({
        event_id: store.event_id || null,
        customer_name: contactName || phone,
        customer_phone: leadPhone,
        customer_bank: '',
        interested_vehicle: '',
        vehicle_category_interest: '',
        origin: 'WhatsApp Oficial',
        assigned_store_id: integration.store_id,
        status: 'new_lead',
        notes: firstMessage
          ? `Lead criado automaticamente pelo WhatsApp Evolution. Primeira mensagem: ${firstMessage}`
          : 'Lead criado automaticamente pelo WhatsApp Evolution.'
      })
      .select('id')
      .single();

    if (leadError) throw leadError;
    leadId = lead?.id || null;
  }

  const { data: exactBase, error: exactBaseError } = await supabase
    .from('leads_base')
    .select('id, phone')
    .in('phone', phoneCandidates)
    .eq('assigned_store_id', integration.store_id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (exactBaseError) throw exactBaseError;

  let baseLeadId = exactBase?.id || null;

  if (!baseLeadId) {
    const { data: baseCandidates, error: baseCandidateError } = await supabase
      .from('leads_base')
      .select('id, phone')
      .eq('assigned_store_id', integration.store_id)
      .not('phone', 'is', null)
      .order('created_at', { ascending: false })
      .limit(2_000);

    if (baseCandidateError) throw baseCandidateError;
    baseLeadId = baseCandidates?.find((candidate: any) => localPhone(candidate.phone) === leadPhone)?.id || null;
  }

  if (!baseLeadId) {
    const { data: baseLead, error: baseError } = await supabase
      .from('leads_base')
      .insert({
        name: contactName || phone,
        phone: leadPhone,
        source: 'WhatsApp Evolution',
        campaign_name: 'WhatsApp da loja',
        status: 'Novo lead',
        assigned_store_id: integration.store_id,
        assigned_store_name: store.store_name,
        assigned_at: new Date().toISOString(),
        routed_lead_id: leadId,
        routing_strategy: 'whatsapp_evolution_store',
        notes: firstMessage ? `Primeira mensagem: ${firstMessage}` : 'Lead criado pelo WhatsApp Evolution.',
        metadata: {
          whatsapp: {
            provider: 'evolution',
            instance_name: integration.instance_name,
            store_id: integration.store_id
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

async function processMessage(supabase: any, integration: any, data: any) {
  const key = data?.key || {};
  const remoteJid = cleanText(key.remoteJidAlt || key.remoteJid, 180);
  const messageId = cleanText(key.id, 250);

  if (!remoteJid || !messageId) return { skipped: true, reason: 'Mensagem sem contato ou identificador.' };
  if (remoteJid.endsWith('@g.us') || remoteJid.includes('broadcast') || remoteJid.includes('newsletter')) {
    return { skipped: true, reason: 'Grupos, listas e canais não são importados.' };
  }

  const phone = normalizePhone(remoteJid);
  if (phone.length < 8) return { skipped: true, reason: 'Mensagem sem telefone resolvido.' };

  const { data: duplicate, error: duplicateError } = await supabase
    .from('whatsapp_messages')
    .select('id')
    .eq('wa_message_id', messageId)
    .maybeSingle();

  if (duplicateError) throw duplicateError;
  if (duplicate) return { skipped: true, reason: 'Mensagem já registrada.' };

  const fromMe = key.fromMe === true;
  const body = evolutionMessageContent(data);
  const sentAt = messageDate(data?.messageTimestamp);
  const profileName = fromMe ? phone : cleanText(data?.pushName, 180) || phone;
  const number = await ensureCrmNumber(supabase, integration);
  const { leadId, baseLeadId } = await findOrCreateLead(supabase, integration, profileName, phone, body);

  const { data: contact, error: contactError } = await supabase
    .from('whatsapp_contacts')
    .upsert({
      store_id: integration.store_id,
      lead_id: leadId,
      base_lead_id: baseLeadId,
      whatsapp_number_id: number.id,
      wa_id: remoteJid,
      phone,
      profile_name: profileName,
      last_seen_at: new Date().toISOString(),
      metadata: { provider: 'evolution', remote_jid: remoteJid, last_message_id: messageId }
    }, { onConflict: 'whatsapp_number_id,wa_id' })
    .select('*')
    .single();

  if (contactError) throw contactError;

  const { data: existingConversation, error: conversationReadError } = await supabase
    .from('whatsapp_conversations')
    .select('*')
    .eq('whatsapp_number_id', number.id)
    .eq('contact_id', contact.id)
    .maybeSingle();

  if (conversationReadError) throw conversationReadError;

  const conversationPayload = {
    store_id: integration.store_id,
    whatsapp_number_id: number.id,
    contact_id: contact.id,
    lead_id: leadId,
    base_lead_id: baseLeadId,
    status: 'open',
    last_message: body,
    last_message_at: sentAt,
    unread_count: fromMe ? (existingConversation?.unread_count || 0) : (existingConversation?.unread_count || 0) + 1,
    metadata: { provider: 'evolution', profile_name: profileName, phone },
    updated_at: new Date().toISOString()
  };

  let conversation = existingConversation;

  if (conversation) {
    const { data: updated, error } = await supabase
      .from('whatsapp_conversations')
      .update(conversationPayload)
      .eq('id', conversation.id)
      .select('*')
      .single();
    if (error) throw error;
    conversation = updated;
  } else {
    const { data: created, error } = await supabase
      .from('whatsapp_conversations')
      .insert(conversationPayload)
      .select('*')
      .single();
    if (error) throw error;
    conversation = created;
  }

  const { data: savedMessage, error: messageError } = await supabase
    .from('whatsapp_messages')
    .insert({
      store_id: integration.store_id,
      whatsapp_number_id: number.id,
      conversation_id: conversation.id,
      contact_id: contact.id,
      lead_id: leadId,
      base_lead_id: baseLeadId,
      wa_message_id: messageId,
      direction: fromMe ? 'outbound' : 'inbound',
      message_type: evolutionMessageType(data),
      body,
      status: fromMe ? 'sent' : 'received',
      raw_payload: data,
      sent_at: sentAt
    })
    .select('id')
    .single();

  if (messageError) throw messageError;
  return { success: true, message_id: savedMessage.id, direction: fromMe ? 'outbound' : 'inbound' };
}

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const instanceName = cleanText(payload?.instance, 160);
    if (!instanceName) return NextResponse.json({ error: 'Instância não informada.' }, { status: 400 });

    const supabase: any = createAdminClient();
    const { data: integration, error: integrationError } = await supabase
      .from('store_whatsapp_integrations')
      .select('*')
      .eq('instance_name', instanceName)
      .maybeSingle();

    if (integrationError) throw integrationError;
    if (!integration) return NextResponse.json({ error: 'Instância não reconhecida.' }, { status: 404 });

    const signature = request.headers.get(evolutionWebhookSignatureHeader()) || '';
    if (!verifyEvolutionWebhookSignature(instanceName, signature)) {
      return NextResponse.json({ error: 'Assinatura do webhook inválida.' }, { status: 401 });
    }

    const event = cleanText(payload?.event, 100).toLowerCase();
    const now = new Date().toISOString();

    if (event === 'connection.update') {
      const status = normalizeStatus(payload?.data?.state || payload?.data?.status);
      const update: Record<string, unknown> = {
        status,
        last_webhook_at: now,
        last_error: null,
        updated_at: now
      };

      if (status === 'connected') update.last_connected_at = now;
      if (status === 'disconnected') update.last_disconnected_at = now;

      const { error } = await supabase
        .from('store_whatsapp_integrations')
        .update(update)
        .eq('id', integration.id);

      if (error) throw error;

      if (integration.crm_number_id) {
        await supabase
          .from('whatsapp_numbers')
          .update({ status, is_active: status === 'connected', updated_at: now })
          .eq('id', integration.crm_number_id);
      }

      return NextResponse.json({ success: true, event, status });
    }

    if (event === 'messages.upsert') {
      const messages = Array.isArray(payload?.data?.messages)
        ? payload.data.messages
        : Array.isArray(payload?.data)
          ? payload.data
          : [payload?.data];
      const validMessages = messages.filter(Boolean);
      const hasIdentifiedMessage = validMessages.some((message: any) => {
        const key = message?.key || {};
        return Boolean(
          cleanText(key.id, 250) && cleanText(key.remoteJidAlt || key.remoteJid, 180)
        );
      });

      if (hasIdentifiedMessage) {
        await reconcileConnectedStatusFromMessage(supabase, integration, now);
      }

      const results = [];
      for (const message of validMessages) {
        results.push(await processMessage(supabase, integration, message));
      }

      await supabase
        .from('store_whatsapp_integrations')
        .update({ last_webhook_at: now, last_error: null, updated_at: now })
        .eq('id', integration.id);

      return NextResponse.json({ success: true, event, processed: results });
    }

    await supabase
      .from('store_whatsapp_integrations')
      .update({ last_webhook_at: now, updated_at: now })
      .eq('id', integration.id);

    return NextResponse.json({ success: true, ignored: true, event });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Erro ao processar webhook da Evolution API.' },
      { status: 500 }
    );
  }
}
