import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const maxDuration = 60;

const defaultSettings = {
  verify_token: '',
  source_name: 'Umbler Talk / WhatsApp',
  routing_mode: 'round_robin'
};

function cleanText(value: unknown) {
  if (value === null || value === undefined || typeof value === 'object') return '';
  return String(value).replace(/\s+/g, ' ').trim();
}

function digits(value: unknown) {
  return cleanText(value).replace(/\D/g, '');
}

function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

  if (!supabaseUrl || !serviceKey) {
    throw new Error('Supabase Service Role não configurada no servidor.');
  }

  return createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

async function getIntegration(supabase: any) {
  const { data } = await supabase
    .from('marketing_integrations')
    .select('*')
    .eq('integration_type', 'umbler_talk')
    .maybeSingle();

  return {
    ...(data || {}),
    is_active: Boolean(data?.is_active),
    settings: { ...defaultSettings, ...(data?.settings || {}) }
  };
}

function nested(payload: any, paths: string[]) {
  for (const path of paths) {
    const value = path.split('.').reduce((current: any, key) => current?.[key], payload);
    const text = cleanText(value);
    if (text) return text;
  }
  return '';
}

function findDeep(payload: any, keys: string[]) {
  const wanted = new Set(keys.map((key) => key.toLowerCase()));
  const queue = [payload];
  const visited = new Set<any>();

  while (queue.length) {
    const current = queue.shift();
    if (!current || typeof current !== 'object' || visited.has(current)) continue;
    visited.add(current);

    for (const [key, value] of Object.entries(current)) {
      if (wanted.has(key.toLowerCase())) {
        const text = cleanText(value);
        if (text) return text;
      }
      if (value && typeof value === 'object') queue.push(value);
    }
  }
  return '';
}

function extractLead(payload: any) {
  const data = payload?.data || payload?.event || payload?.message || payload;

  const phone = digits(
    nested(data, [
      'contact.phone', 'contact.number', 'contact.whatsapp', 'customer.phone', 'sender.phone',
      'sender.number', 'from', 'phone', 'phoneNumber', 'whatsappNumber', 'waId'
    ]) || findDeep(payload, ['phone', 'phoneNumber', 'whatsappNumber', 'waId', 'from'])
  );

  const name =
    nested(data, [
      'contact.name', 'contact.fullName', 'customer.name', 'sender.name', 'profile.name',
      'name', 'contactName', 'senderName'
    ]) || findDeep(payload, ['contactName', 'senderName', 'fullName', 'name']) || phone || 'Lead Umbler Talk';

  const message =
    nested(data, [
      'text.body', 'message.text', 'message.body', 'content.text', 'body', 'text', 'message'
    ]) || findDeep(payload, ['messageText', 'body', 'text', 'message']);

  const messageId =
    nested(data, ['message.id', 'messageId', 'message_id', 'id', 'externalId']) ||
    findDeep(payload, ['messageId', 'message_id', 'externalId']);

  const eventName =
    nested(payload, ['event', 'eventName', 'type', 'name']) || findDeep(payload, ['eventName', 'event_type']);

  const direction =
    nested(data, ['direction', 'message.direction', 'flow', 'type']) || findDeep(payload, ['direction', 'flow']);

  const channelId =
    nested(data, ['channel.id', 'channelId', 'channel_id', 'instance.id']) ||
    findDeep(payload, ['channelId', 'channel_id']);

  const chatId =
    nested(data, ['chat.id', 'chatId', 'chat_id', 'conversation.id', 'conversationId']) ||
    findDeep(payload, ['chatId', 'chat_id', 'conversationId']);

  return { phone, name, message, messageId, eventName, direction, channelId, chatId };
}

function isOutbound(payload: any, lead: ReturnType<typeof extractLead>) {
  const normalized = `${lead.direction} ${lead.eventName}`.toLowerCase();
  return (
    normalized.includes('outbound') ||
    normalized.includes('sent') ||
    normalized.includes('fromme') ||
    payload?.fromMe === true ||
    payload?.message?.fromMe === true ||
    payload?.data?.fromMe === true
  );
}

function isGroup(payload: any) {
  return Boolean(
    payload?.isGroup ||
    payload?.data?.isGroup ||
    payload?.chat?.isGroup ||
    payload?.data?.chat?.isGroup
  );
}

function extractToken(request: Request, url: URL) {
  const authorization = request.headers.get('authorization') || '';
  return cleanText(
    url.searchParams.get('token') ||
    request.headers.get('x-webhook-token') ||
    request.headers.get('x-umbler-token') ||
    request.headers.get('x-auto-controle-token') ||
    authorization.replace(/^Bearer\s+/i, '')
  );
}

async function updateIntegrationStatus(supabase: any, current: any, patch: Record<string, unknown>) {
  await supabase
    .from('marketing_integrations')
    .update({
      settings: { ...(current?.settings || {}), ...patch },
      updated_at: new Date().toISOString()
    })
    .eq('integration_type', 'umbler_talk');
}

async function claimLock(supabase: any, key: string) {
  const { data, error } = await supabase.rpc('claim_lead_ingestion_lock', {
    p_source: 'umbler_talk',
    p_dedup_key: key,
    p_window_seconds: 180
  });

  if (error) throw new Error(`Erro na trava anti-duplicidade: ${error.message}`);
  return data !== false;
}

async function pickNextStore(supabase: any) {
  const { data, error } = await supabase.rpc('pick_next_lead_store', {
    p_routing_key: 'umbler_talk'
  });

  if (error) throw new Error(`Erro ao escolher loja no rodízio: ${error.message}`);
  return Array.isArray(data) && data.length ? data[0] : null;
}

async function findExistingLead(supabase: any, phone: string) {
  const { data } = await supabase
    .from('leads_base')
    .select('id, routed_lead_id, assigned_store_id, assigned_store_name, metadata, notes')
    .eq('phone', phone)
    .eq('source', 'Umbler Talk / WhatsApp')
    .order('created_at', { ascending: false })
    .limit(1);

  return data?.[0] || null;
}

async function appendExistingLead(supabase: any, existing: any, lead: ReturnType<typeof extractLead>, payload: any) {
  const timestamp = new Date().toISOString();
  const previousMessages = Array.isArray(existing?.metadata?.messages) ? existing.metadata.messages : [];
  const messages = [
    ...previousMessages.slice(-19),
    {
      id: lead.messageId || null,
      text: lead.message || '',
      received_at: timestamp,
      channel_id: lead.channelId || null,
      chat_id: lead.chatId || null
    }
  ];

  await supabase
    .from('leads_base')
    .update({
      notes: [existing.notes || '', lead.message ? `Nova mensagem Umbler: ${lead.message}` : ''].filter(Boolean).join('\n'),
      metadata: { ...(existing.metadata || {}), messages, last_raw_webhook: payload },
      updated_at: timestamp
    })
    .eq('id', existing.id);

  if (existing.routed_lead_id && lead.message) {
    const { data: routed } = await supabase
      .from('leads')
      .select('notes')
      .eq('id', existing.routed_lead_id)
      .maybeSingle();

    await supabase
      .from('leads')
      .update({
        notes: [routed?.notes || '', `Nova mensagem Umbler: ${lead.message}`].filter(Boolean).join('\n'),
        updated_at: timestamp
      })
      .eq('id', existing.routed_lead_id);
  }

  return { status: 'existing_updated', id: existing.id, routed_lead_id: existing.routed_lead_id || null };
}

async function createLead(supabase: any, lead: ReturnType<typeof extractLead>, payload: any, sourceName: string) {
  const selectedStore = await pickNextStore(supabase);
  const assignedAt = selectedStore?.store_id ? new Date().toISOString() : null;

  let routedLeadId: string | null = null;

  if (selectedStore?.store_id) {
    const { data: routedLead, error } = await supabase
      .from('leads')
      .insert({
        event_id: selectedStore.event_id || null,
        customer_name: lead.name || lead.phone,
        customer_phone: lead.phone,
        customer_bank: '',
        interested_vehicle: '',
        vehicle_category_interest: '',
        origin: sourceName,
        assigned_store_id: selectedStore.store_id,
        status: 'new_lead',
        notes: [
          'Lead recebido automaticamente pela Umbler Talk.',
          lead.message ? `Primeira mensagem: ${lead.message}` : '',
          lead.channelId ? `Canal Umbler: ${lead.channelId}` : ''
        ].filter(Boolean).join(' ')
      })
      .select('id')
      .single();

    if (error) throw new Error(`Erro ao criar lead no pipeline: ${error.message}`);
    routedLeadId = routedLead?.id || null;
  }

  const metadata = {
    source: 'umbler_talk',
    message_id: lead.messageId || null,
    event_name: lead.eventName || null,
    channel_id: lead.channelId || null,
    chat_id: lead.chatId || null,
    routing: {
      strategy: selectedStore?.store_id ? 'umbler_talk_round_robin' : 'umbler_talk_unassigned_no_store',
      assigned_store_id: selectedStore?.store_id || null,
      assigned_store_name: selectedStore?.store_name || null,
      assigned_at: assignedAt,
      routed_lead_id: routedLeadId
    },
    messages: [{
      id: lead.messageId || null,
      text: lead.message || '',
      received_at: new Date().toISOString(),
      channel_id: lead.channelId || null,
      chat_id: lead.chatId || null
    }],
    raw_webhook: payload
  };

  const { data: baseLead, error: baseError } = await supabase
    .from('leads_base')
    .insert({
      name: lead.name || lead.phone,
      phone: lead.phone,
      cpf: '',
      email: '',
      source: sourceName,
      campaign_id: null,
      campaign_name: 'Umbler Talk',
      vehicle_id: null,
      vehicle_name: '',
      vehicle_price: 0,
      down_payment: 0,
      financed_amount: 0,
      installments: 0,
      estimated_installment: 0,
      interest_rate: 1.89,
      status: 'Novo lead',
      assigned_store_id: selectedStore?.store_id || null,
      assigned_store_name: selectedStore?.store_name || null,
      assigned_at: assignedAt,
      routed_lead_id: routedLeadId,
      routing_strategy: selectedStore?.store_id ? 'umbler_talk_round_robin' : 'umbler_talk_unassigned_no_store',
      notes: lead.message ? `Primeira mensagem Umbler: ${lead.message}` : 'Lead recebido pela Umbler Talk.',
      metadata,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .select('id')
    .single();

  if (baseError) throw new Error(`Erro ao criar lead na Base: ${baseError.message}`);

  return {
    status: 'inserted',
    id: baseLead?.id || null,
    routed_lead_id: routedLeadId,
    assigned_store_id: selectedStore?.store_id || null,
    assigned_store_name: selectedStore?.store_name || null
  };
}

export async function POST(request: Request) {
  const supabase = getAdminClient();
  const integration = await getIntegration(supabase);

  try {
    if (!integration.is_active) {
      return NextResponse.json({ ok: false, ignored: 'integration_inactive' }, { status: 202 });
    }

    const url = new URL(request.url);
    const receivedToken = extractToken(request, url);
    const expectedToken = cleanText(integration.settings.verify_token);

    if (!receivedToken || !expectedToken || receivedToken !== expectedToken) {
      return NextResponse.json({ error: 'Token inválido.' }, { status: 401 });
    }

    const payload = await request.json();
    const lead = extractLead(payload);

    if (isOutbound(payload, lead)) {
      return NextResponse.json({ ok: true, ignored: 'outbound_message' });
    }

    if (isGroup(payload)) {
      return NextResponse.json({ ok: true, ignored: 'group_message' });
    }

    if (!lead.phone || lead.phone.length < 10) {
      return NextResponse.json({ ok: true, ignored: 'phone_not_found' });
    }

    const dedupKey = lead.messageId || `${lead.phone}:${lead.message.slice(0, 80)}`;
    const claimed = await claimLock(supabase, dedupKey);

    if (!claimed) {
      return NextResponse.json({ ok: true, ignored: 'duplicate_event' });
    }

    const sourceName = cleanText(integration.settings.source_name) || defaultSettings.source_name;
    const existing = await findExistingLead(supabase, lead.phone);
    const result = existing
      ? await appendExistingLead(supabase, existing, lead, payload)
      : await createLead(supabase, lead, payload, sourceName);

    await updateIntegrationStatus(supabase, integration, {
      last_webhook_at: new Date().toISOString(),
      last_error: '',
      last_lead_phone: lead.phone,
      last_lead_id: result.id || ''
    });

    return NextResponse.json({ ok: true, result });
  } catch (error: any) {
    await updateIntegrationStatus(supabase, integration, {
      last_webhook_at: new Date().toISOString(),
      last_error: error?.message || 'Erro desconhecido ao processar webhook.'
    });

    return NextResponse.json({ error: error?.message || 'Erro ao processar Umbler Talk.' }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ ok: true, service: 'umbler-talk-webhook' });
}
