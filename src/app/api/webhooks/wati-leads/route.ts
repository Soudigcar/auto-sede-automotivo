import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const maxDuration = 60;

const defaultSettings = {
  verify_token: 'auto-controle-wati-leads-2026',
  source_name: 'WATI / Click-to-WhatsApp',
  routing_mode: 'round_robin'
};

function cleanText(value: unknown) {
  return String(value || '').replace(/\s+/g, ' ').trim();
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
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
}

async function getIntegration(supabase: any) {
  const { data } = await supabase
    .from('marketing_integrations')
    .select('*')
    .eq('integration_type', 'wati_leads')
    .maybeSingle();

  return {
    ...(data || {}),
    is_active: Boolean(data?.is_active),
    settings: {
      ...defaultSettings,
      ...(data?.settings || {})
    }
  };
}

function extractToken(request: Request, url: URL) {
  const authorization = request.headers.get('authorization') || '';
  const bearer = authorization.replace(/^Bearer\s+/i, '').trim();

  return cleanText(
    url.searchParams.get('token') ||
    url.searchParams.get('verify_token') ||
    request.headers.get('x-wati-token') ||
    request.headers.get('x-webhook-token') ||
    request.headers.get('x-auto-controle-token') ||
    bearer
  );
}

function validToken(receivedToken: string, expectedToken: string) {
  return Boolean(receivedToken && expectedToken && receivedToken === expectedToken);
}

function firstValue(payload: any, paths: string[]) {
  for (const path of paths) {
    const value = path.split('.').reduce((current: any, key: string) => {
      if (current === null || current === undefined) return undefined;
      return current[key];
    }, payload);

    if (Array.isArray(value) && value.length) {
      const first = cleanText(value[0]);
      if (first) return first;
    }

    const textValue = cleanText(value);
    if (textValue) return textValue;
  }

  return '';
}

function findNestedValue(payload: any, keys: string[]) {
  const queue = [payload];
  const normalizedKeys = keys.map((key) => key.toLowerCase());
  const visited = new Set<any>();

  while (queue.length) {
    const current = queue.shift();

    if (!current || typeof current !== 'object' || visited.has(current)) continue;
    visited.add(current);

    for (const [key, value] of Object.entries(current)) {
      if (normalizedKeys.includes(key.toLowerCase())) {
        const textValue = cleanText(value);
        if (textValue) return textValue;
      }

      if (value && typeof value === 'object') queue.push(value);
    }
  }

  return '';
}

function extractLead(payload: any) {
  const data = payload?.data || payload?.event || payload?.message || payload;

  const phone = digits(
    firstValue(data, [
      'waId',
      'wa_id',
      'whatsappNumber',
      'whatsapp_number',
      'phone',
      'phoneNumber',
      'mobile',
      'from',
      'senderPhone',
      'sender.phone',
      'sender.waId',
      'contact.phone',
      'contact.waId',
      'customer.phone',
      'customer.whatsapp',
      'customer.mobile',
      'contact.attributes.phone'
    ]) || findNestedValue(payload, ['waId', 'whatsappNumber', 'phone', 'phoneNumber', 'mobile', 'from'])
  );

  const name =
    firstValue(data, [
      'name',
      'contactName',
      'senderName',
      'sender.name',
      'contact.name',
      'contact.fullName',
      'customer.name',
      'customer.fullName',
      'profileName'
    ]) || findNestedValue(payload, ['contactName', 'senderName', 'profileName', 'fullName', 'name']) || phone || 'Lead WATI';

  const message =
    firstValue(data, [
      'text',
      'message',
      'body',
      'messageText',
      'lastMessage',
      'lastMessageText',
      'text.body',
      'message.text',
      'payload.text',
      'payload.body'
    ]) || findNestedValue(payload, ['messageText', 'lastMessage', 'body', 'text', 'message']);

  const vehicle =
    firstValue(data, [
      'vehicle',
      'vehicle_name',
      'car',
      'carro',
      'interest',
      'interested_vehicle',
      'customParams.vehicle',
      'customParams.carro',
      'attributes.vehicle',
      'attributes.carro'
    ]) || findNestedValue(payload, ['vehicle', 'vehicle_name', 'carro', 'car', 'interested_vehicle']);

  const campaign =
    firstValue(data, [
      'campaignName',
      'campaign_name',
      'campaign',
      'sourceCampaign',
      'adName',
      'ad_name',
      'ctwa.campaign_name'
    ]) || findNestedValue(payload, ['campaignName', 'campaign_name', 'campaign', 'adName', 'ad_name']);

  const conversationId =
    firstValue(data, [
      'conversationId',
      'conversation_id',
      'chatId',
      'ticketId',
      'id'
    ]) || findNestedValue(payload, ['conversationId', 'conversation_id', 'chatId', 'ticketId']);

  return {
    name,
    phone,
    message,
    vehicle,
    campaign,
    conversationId
  };
}

async function pickNextStore(supabase: any) {
  const { data, error } = await supabase.rpc('pick_next_lead_store', {
    p_routing_key: 'wati_leads'
  });

  if (error) {
    throw new Error(`Erro ao escolher loja para o lead WATI: ${error.message}`);
  }

  return Array.isArray(data) && data.length ? data[0] : null;
}

async function routeLeadToStore(supabase: any, lead: any, sourceName: string) {
  const selectedStore = await pickNextStore(supabase);

  if (!selectedStore?.store_id) {
    return {
      routedLeadId: null,
      assignedStoreId: null,
      assignedStoreName: '',
      assignedAt: null,
      routingStrategy: 'wati_unassigned_no_store'
    };
  }

  const assignedAt = new Date().toISOString();

  const { data: routedLead, error: routedLeadError } = await supabase
    .from('leads')
    .insert({
      event_id: selectedStore.event_id || null,
      customer_name: lead.name || lead.phone,
      customer_phone: lead.phone,
      customer_bank: '',
      interested_vehicle: lead.vehicle || '',
      vehicle_category_interest: '',
      origin: 'WhatsApp Oficial',
      assigned_store_id: selectedStore.store_id,
      status: 'new_lead',
      notes: [
        `Lead criado automaticamente pelo ${sourceName}.`,
        lead.campaign ? `Campanha/anúncio: ${lead.campaign}.` : '',
        lead.vehicle ? `Interesse informado: ${lead.vehicle}.` : '',
        lead.message ? `Primeira mensagem: ${lead.message}` : ''
      ].filter(Boolean).join(' ')
    })
    .select('id')
    .single();

  if (routedLeadError) {
    throw new Error(`Erro ao criar lead WATI no pipeline da loja: ${routedLeadError.message}`);
  }

  return {
    routedLeadId: routedLead?.id || null,
    assignedStoreId: selectedStore.store_id,
    assignedStoreName: selectedStore.store_name || '',
    assignedAt,
    routingStrategy: 'wati_round_robin'
  };
}

async function upsertLeadBase(supabase: any, lead: any, sourceName: string, payload: any) {
  const { data: existing } = await supabase
    .from('leads_base')
    .select('id, phone, assigned_store_id, assigned_store_name, assigned_at, routed_lead_id, routing_strategy, metadata, notes')
    .eq('phone', lead.phone)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  let route = null;

  if (existing?.id && (!existing.assigned_store_id || !existing.routed_lead_id)) {
    route = await routeLeadToStore(supabase, lead, sourceName);
  }

  if (existing?.id) {
    const metadata = {
      ...(existing.metadata || {}),
      wati: {
        ...(existing.metadata?.wati || {}),
        last_webhook_at: new Date().toISOString(),
        last_message: lead.message || null,
        campaign: lead.campaign || null,
        conversation_id: lead.conversationId || null,
        raw_payload: payload
      },
      routing: route ? {
        strategy: route.routingStrategy,
        assigned_store_id: route.assignedStoreId,
        assigned_store_name: route.assignedStoreName,
        assigned_at: route.assignedAt,
        routed_lead_id: route.routedLeadId
      } : existing.metadata?.routing
    };

    const updates: any = {
      updated_at: new Date().toISOString(),
      metadata,
      notes: [
        existing.notes || '',
        lead.message ? `Última mensagem WATI: ${lead.message}` : ''
      ].filter(Boolean).join('\n').slice(0, 4000)
    };

    if (lead.name && (!existing.metadata?.wati?.name || existing.name === existing.phone)) updates.name = lead.name;
    if (lead.vehicle) updates.vehicle_name = lead.vehicle;
    if (lead.campaign) updates.campaign_name = lead.campaign;

    if (route) {
      updates.assigned_store_id = route.assignedStoreId;
      updates.assigned_store_name = route.assignedStoreName || null;
      updates.assigned_at = route.assignedAt;
      updates.routed_lead_id = route.routedLeadId;
      updates.routing_strategy = route.routingStrategy;
    }

    const { error } = await supabase
      .from('leads_base')
      .update(updates)
      .eq('id', existing.id);

    if (error) throw error;

    return {
      status: route ? 'duplicate_routed' : 'duplicate_updated',
      id: existing.id,
      assigned_store_id: updates.assigned_store_id || existing.assigned_store_id || null,
      assigned_store_name: updates.assigned_store_name || existing.assigned_store_name || null,
      routed_lead_id: updates.routed_lead_id || existing.routed_lead_id || null,
      routing_strategy: updates.routing_strategy || existing.routing_strategy || null
    };
  }

  route = await routeLeadToStore(supabase, lead, sourceName);

  const metadata = {
    source: 'wati_leads',
    wati: {
      first_webhook_at: new Date().toISOString(),
      last_webhook_at: new Date().toISOString(),
      first_message: lead.message || null,
      campaign: lead.campaign || null,
      conversation_id: lead.conversationId || null,
      raw_payload: payload
    },
    routing: {
      strategy: route.routingStrategy,
      assigned_store_id: route.assignedStoreId,
      assigned_store_name: route.assignedStoreName,
      assigned_at: route.assignedAt,
      routed_lead_id: route.routedLeadId
    }
  };

  const { data, error } = await supabase
    .from('leads_base')
    .insert({
      name: lead.name || lead.phone,
      phone: lead.phone,
      cpf: '',
      email: '',
      source: sourceName,
      campaign_id: null,
      campaign_name: lead.campaign || sourceName,
      vehicle_id: null,
      vehicle_name: lead.vehicle || '',
      vehicle_price: 0,
      down_payment: 0,
      financed_amount: 0,
      installments: 0,
      estimated_installment: 0,
      interest_rate: 1.89,
      status: 'Novo lead',
      assigned_store_id: route.assignedStoreId,
      assigned_store_name: route.assignedStoreName || null,
      assigned_at: route.assignedAt,
      routed_lead_id: route.routedLeadId,
      routing_strategy: route.routingStrategy,
      notes: [
        `Lead recebido automaticamente pelo ${sourceName}.`,
        lead.campaign ? `Campanha/anúncio: ${lead.campaign}.` : '',
        lead.vehicle ? `Interesse informado: ${lead.vehicle}.` : '',
        lead.message ? `Primeira mensagem: ${lead.message}` : ''
      ].filter(Boolean).join(' '),
      metadata,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .select('id')
    .single();

  if (error) throw error;

  return {
    status: 'inserted',
    id: data?.id || null,
    assigned_store_id: route.assignedStoreId,
    assigned_store_name: route.assignedStoreName,
    routed_lead_id: route.routedLeadId,
    routing_strategy: route.routingStrategy
  };
}

async function updateIntegrationStatus(supabase: any, settings: any, lastError = '') {
  await supabase
    .from('marketing_integrations')
    .update({
      settings: {
        ...settings,
        last_webhook_at: new Date().toISOString(),
        last_error: lastError
      },
      updated_at: new Date().toISOString()
    })
    .eq('integration_type', 'wati_leads');
}

export async function GET(request: Request) {
  try {
    const supabase = getAdminClient();
    const integration = await getIntegration(supabase);
    const settings = integration.settings || defaultSettings;
    const url = new URL(request.url);
    const receivedToken = extractToken(request, url);

    if (!validToken(receivedToken, cleanText(settings.verify_token))) {
      return NextResponse.json({ error: 'Token de verificação inválido.' }, { status: 403 });
    }

    return NextResponse.json({ success: true, status: 'wati_webhook_ready' });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Erro ao verificar webhook WATI.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const supabase = getAdminClient();
    const integration = await getIntegration(supabase);

    if (!integration?.is_active) {
      return NextResponse.json({ success: true, ignored: true, reason: 'wati_integration_inactive' });
    }

    const settings = integration.settings || defaultSettings;
    const url = new URL(request.url);
    const receivedToken = extractToken(request, url);

    if (!validToken(receivedToken, cleanText(settings.verify_token))) {
      await updateIntegrationStatus(supabase, settings, 'Token inválido recebido no webhook WATI.');
      return NextResponse.json({ error: 'Token de verificação inválido.' }, { status: 403 });
    }

    const payload = await request.json();
    const lead = extractLead(payload);

    if (!lead.phone) {
      await updateIntegrationStatus(supabase, settings, 'Payload WATI sem telefone.');
      return NextResponse.json({ success: false, error: 'Payload WATI sem telefone.', extracted: lead }, { status: 200 });
    }

    const sourceName = cleanText(settings.source_name) || defaultSettings.source_name;
    const result = await upsertLeadBase(supabase, lead, sourceName, payload);

    await updateIntegrationStatus(supabase, settings, '');

    return NextResponse.json({
      success: true,
      extracted: lead,
      result
    });
  } catch (error: any) {
    try {
      const supabase = getAdminClient();
      const integration = await getIntegration(supabase);
      await updateIntegrationStatus(supabase, integration.settings || defaultSettings, error?.message || 'Erro ao receber webhook WATI.');
    } catch {}

    return NextResponse.json(
      { success: false, error: error?.message || 'Erro ao receber webhook WATI.' },
      { status: 200 }
    );
  }
}
