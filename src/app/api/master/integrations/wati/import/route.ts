import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const maxDuration = 60;

type LeadDraft = {
  name: string;
  phone: string;
  message: string;
  vehicle: string;
  campaign: string;
  conversationId: string;
  raw: any;
};

const defaultSettings = {
  source_name: 'WATI / Click-to-WhatsApp',
  api_endpoint: '',
  api_token: ''
};

function cleanText(value: unknown) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return '';
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function digits(value: unknown) {
  return cleanText(value).replace(/\D/g, '');
}

function normalizeApiEndpoint(value: unknown) {
  return cleanText(value)
    .replace(/\/+$/g, '')
    .replace(/\/api\/v\d+\/?$/i, '')
    .trim();
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

async function getMasterProfile(supabase: any, token: string) {
  const { data: authData, error: authError } = await supabase.auth.getUser(token);
  if (authError || !authData.user) return null;

  const { data: byAuth } = await supabase
    .from('users')
    .select('*')
    .eq('auth_user_id', authData.user.id)
    .maybeSingle();

  if (byAuth?.status === 'active' && byAuth?.role === 'master') return byAuth;

  if (authData.user.email) {
    const { data: byEmail } = await supabase
      .from('users')
      .select('*')
      .ilike('email', authData.user.email)
      .maybeSingle();

    if (byEmail?.status === 'active' && byEmail?.role === 'master') return byEmail;
  }

  return null;
}

function firstValue(payload: any, paths: string[]) {
  for (const path of paths) {
    const value = path.split('.').reduce((current: any, key: string) => {
      if (current === null || current === undefined) return undefined;
      return current[key];
    }, payload);

    if (Array.isArray(value) && value.length) {
      for (const item of value) {
        const itemText = cleanText(item);
        if (itemText) return itemText;
      }
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

function cleanVehicleCandidate(value: unknown) {
  return cleanText(value)
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/\b(tenho|interesse|quero|queria|gostaria|saber|mais|sobre|no|na|em|do|da|de|um|uma|o|a|carro|veiculo|veículo)\b/gi, ' ')
    .replace(/\b(valor|preco|preço|parcela|financiamento|entrada|disponivel|disponível|tem|qual|quanto|simular|comprar|ver|olhar)\b.*$/gi, '')
    .replace(/[^\p{L}\p{N}\s.\-/]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function titleVehicle(value: unknown) {
  const candidate = cleanVehicleCandidate(value);
  if (!candidate || candidate.length < 3) return '';

  return candidate
    .split(' ')
    .slice(0, 8)
    .map((word) => {
      if (/^\d+$/.test(word)) return word;
      if (/^[A-Z0-9\-]{2,}$/.test(word)) return word.toUpperCase();
      if (word.length <= 3 && /[a-z]/i.test(word)) return word.toUpperCase();
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ')
    .replace(/Hb20/gi, 'HB20')
    .replace(/Hrv/gi, 'HR-V')
    .replace(/Sw4/gi, 'SW4')
    .replace(/T-cross/gi, 'T-Cross')
    .trim();
}

function extractVehicleFromMessage(message: string) {
  const text = cleanText(message);
  if (!text || /^(oi|olá|ola|bom dia|boa tarde|boa noite|teste)$/i.test(text)) return '';

  const patterns = [
    /(?:tenho\s+interesse|interesse|interessado|interessada)\s+(?:no|na|em|pelo|pela|sobre|de|do|da)?\s*([^?.!,\n]{3,90})/i,
    /(?:quero|queria|gostaria)\s+(?:ver|olhar|saber\s+mais|simular|financiar|comprar)?\s*(?:o|a|um|uma|no|na|sobre|de|do|da)?\s+([^?.!,\n]{3,90})/i,
    /(?:modelo|veiculo|veículo|carro)\s*[:\-]\s*([^?.!,\n]{3,90})/i
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    const candidate = titleVehicle(match?.[1] || '');
    if (candidate) return candidate;
  }

  return '';
}

function extractContactsFromResponse(payload: any) {
  const candidates = [
    payload?.contacts,
    payload?.items,
    payload?.data,
    payload?.data?.contacts,
    payload?.data?.items,
    payload?.result,
    payload?.result?.contacts,
    payload?.result?.items,
    payload?.contact_list
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate;
  }

  return [];
}

function extractLeadFromContact(contact: any): LeadDraft {
  const phone = digits(
    firstValue(contact, [
      'waId', 'wa_id', 'whatsappNumber', 'whatsapp_number', 'phone', 'phoneNumber',
      'mobile', 'contactNo', 'number', 'fullPhoneNumber', 'contact.phone', 'contact.waId'
    ]) || findNestedValue(contact, ['waId', 'whatsappNumber', 'phone', 'phoneNumber', 'mobile', 'contactNo'])
  );

  const firstName = firstValue(contact, ['firstName', 'first_name']);
  const lastName = firstValue(contact, ['lastName', 'last_name']);
  const combinedName = [firstName, lastName].filter(Boolean).join(' ');
  const name = cleanText(
    combinedName ||
    firstValue(contact, ['fullName', 'name', 'contactName', 'profileName', 'pushName', 'displayName']) ||
    findNestedValue(contact, ['fullName', 'contactName', 'profileName', 'pushName', 'displayName', 'name']) ||
    phone ||
    'Lead WATI'
  );

  const message =
    firstValue(contact, [
      'lastMessage', 'lastMessageText', 'messageText', 'message', 'text', 'body',
      'lastMessage.text', 'lastMessage.body', 'lastMessage.message', 'conversation.lastMessage'
    ]) || findNestedValue(contact, ['lastMessageText', 'messageText', 'lastMessage', 'body', 'text', 'message']);

  const structuredVehicle =
    firstValue(contact, [
      'vehicle', 'vehicle_name', 'vehicleName', 'car', 'carro', 'interest', 'interested_vehicle',
      'customParams.vehicle', 'customParams.carro', 'attributes.vehicle', 'attributes.carro'
    ]) || findNestedValue(contact, ['vehicle', 'vehicle_name', 'vehicleName', 'carro', 'car', 'interested_vehicle']);

  const campaign =
    firstValue(contact, ['campaignName', 'campaign_name', 'campaign', 'sourceCampaign', 'adName', 'ad_name']) ||
    findNestedValue(contact, ['campaignName', 'campaign_name', 'campaign', 'adName', 'ad_name']);

  const conversationId =
    firstValue(contact, ['conversationId', 'conversation_id', 'chatId', 'ticketId', 'id']) ||
    findNestedValue(contact, ['conversationId', 'conversation_id', 'chatId', 'ticketId']);

  return {
    name,
    phone,
    message,
    vehicle: titleVehicle(structuredVehicle) || extractVehicleFromMessage(message),
    campaign,
    conversationId,
    raw: contact
  };
}

async function getIntegration(supabase: any) {
  const { data } = await supabase
    .from('marketing_integrations')
    .select('*')
    .eq('integration_type', 'wati_leads')
    .maybeSingle();

  return {
    ...(data || {}),
    settings: {
      ...defaultSettings,
      ...(data?.settings || {})
    }
  };
}

async function pickNextStore(supabase: any) {
  const { data, error } = await supabase.rpc('pick_next_lead_store', {
    p_routing_key: 'wati_leads'
  });

  if (error) throw new Error(`Erro ao escolher loja para importação WATI: ${error.message}`);
  return Array.isArray(data) && data.length ? data[0] : null;
}

async function claimLock(supabase: any, phone: string) {
  const { data, error } = await supabase.rpc('claim_lead_ingestion_lock', {
    p_source: 'wati_leads',
    p_dedup_key: phone,
    p_window_seconds: 120
  });

  if (error) throw new Error(`Erro ao criar trava anti-duplicidade WATI: ${error.message}`);
  return data !== false;
}

async function importOneLead(supabase: any, lead: LeadDraft, sourceName: string) {
  if (!lead.phone) return { status: 'skipped_no_phone', phone: '' };

  const lockClaimed = await claimLock(supabase, lead.phone);
  if (!lockClaimed) return { status: 'skipped_locked', phone: lead.phone };

  const { data: existing } = await supabase
    .from('leads_base')
    .select('id, phone, assigned_store_name, routed_lead_id')
    .eq('phone', lead.phone)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing?.id) {
    return {
      status: 'skipped_existing_base',
      phone: lead.phone,
      base_lead_id: existing.id,
      assigned_store_name: existing.assigned_store_name || null
    };
  }

  const selectedStore = await pickNextStore(supabase);
  const assignedAt = selectedStore?.store_id ? new Date().toISOString() : null;
  let routedLeadId = null;

  if (selectedStore?.store_id) {
    const { data: routedLead, error: routedError } = await supabase
      .from('leads')
      .insert({
        event_id: selectedStore.event_id || null,
        customer_name: lead.name || lead.phone,
        customer_phone: lead.phone,
        customer_bank: '',
        interested_vehicle: lead.vehicle || '',
        vehicle_category_interest: '',
        origin: sourceName,
        assigned_store_id: selectedStore.store_id,
        status: 'new_lead',
        notes: [
          `Lead importado automaticamente do WATI.`,
          lead.campaign ? `Campanha/anúncio: ${lead.campaign}.` : '',
          lead.vehicle ? `Interesse identificado: ${lead.vehicle}.` : '',
          lead.message ? `Última mensagem no WATI: ${lead.message}` : ''
        ].filter(Boolean).join(' ')
      })
      .select('id')
      .single();

    if (routedError) throw new Error(`Erro ao criar lead importado WATI no pipeline: ${routedError.message}`);
    routedLeadId = routedLead?.id || null;
  }

  const metadata = {
    source: 'wati_import',
    wati: {
      imported_at: new Date().toISOString(),
      last_message: lead.message || null,
      campaign: lead.campaign || null,
      conversation_id: lead.conversationId || null,
      extracted_vehicle: lead.vehicle || null,
      raw_contact: lead.raw
    },
    routing: {
      strategy: selectedStore?.store_id ? 'wati_import_round_robin' : 'wati_import_unassigned_no_store',
      assigned_store_id: selectedStore?.store_id || null,
      assigned_store_name: selectedStore?.store_name || null,
      assigned_at: assignedAt,
      routed_lead_id: routedLeadId
    }
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
      assigned_store_id: selectedStore?.store_id || null,
      assigned_store_name: selectedStore?.store_name || null,
      assigned_at: assignedAt,
      routed_lead_id: routedLeadId,
      routing_strategy: selectedStore?.store_id ? 'wati_import_round_robin' : 'wati_import_unassigned_no_store',
      notes: [
        `Lead importado automaticamente do WATI.`,
        lead.campaign ? `Campanha/anúncio: ${lead.campaign}.` : '',
        lead.vehicle ? `Interesse identificado: ${lead.vehicle}.` : '',
        lead.message ? `Última mensagem no WATI: ${lead.message}` : ''
      ].filter(Boolean).join(' '),
      metadata,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .select('id')
    .single();

  if (baseError) throw baseError;

  return {
    status: 'imported',
    phone: lead.phone,
    name: lead.name,
    base_lead_id: baseLead?.id || null,
    routed_lead_id: routedLeadId,
    assigned_store_name: selectedStore?.store_name || null
  };
}

async function fetchWatiContacts(apiEndpoint: string, apiToken: string, pageSize: number, pages: number) {
  const contacts: any[] = [];

  for (let pageNumber = 1; pageNumber <= pages; pageNumber += 1) {
    const url = new URL(`${apiEndpoint}/api/v1/getContacts`);
    url.searchParams.set('pageSize', String(pageSize));
    url.searchParams.set('pageNumber', String(pageNumber));

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiToken}`,
        Accept: 'application/json'
      }
    });

    const text = await response.text();
    let payload: any = {};

    try {
      payload = text ? JSON.parse(text) : {};
    } catch {
      payload = { raw: text };
    }

    if (!response.ok) {
      throw new Error(`WATI retornou erro ${response.status}: ${cleanText(payload?.message || payload?.error || text).slice(0, 300)}`);
    }

    const pageContacts = extractContactsFromResponse(payload);
    contacts.push(...pageContacts);

    if (pageContacts.length < pageSize) break;
  }

  return contacts;
}

export async function POST(request: Request) {
  try {
    const supabase = getAdminClient();
    const authorization = request.headers.get('authorization') || '';
    const token = authorization.replace(/^Bearer\s+/i, '').trim();

    if (!token) {
      return NextResponse.json({ error: 'Sessão não encontrada.' }, { status: 401 });
    }

    const masterProfile = await getMasterProfile(supabase, token);

    if (!masterProfile) {
      return NextResponse.json({ error: 'Apenas usuário Master pode importar contatos WATI.' }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const integration = await getIntegration(supabase);
    const settings = integration.settings || defaultSettings;
    const apiEndpoint = normalizeApiEndpoint(body.api_endpoint) || normalizeApiEndpoint(settings.api_endpoint);
    const apiToken = cleanText(body.api_token) || cleanText(settings.api_token);
    const sourceName = cleanText(settings.source_name) || defaultSettings.source_name;
    const pageSize = Math.max(1, Math.min(100, Number(body.page_size || 50)));
    const pages = Math.max(1, Math.min(5, Number(body.pages || 2)));

    if (!apiEndpoint) {
      return NextResponse.json({ error: 'Configure a URL/base da API WATI antes de importar.' }, { status: 400 });
    }

    if (!apiToken) {
      return NextResponse.json({ error: 'Configure a API Key/Token do WATI antes de importar.' }, { status: 400 });
    }

    const rawContacts = await fetchWatiContacts(apiEndpoint, apiToken, pageSize, pages);
    const extracted = rawContacts.map(extractLeadFromContact).filter((lead) => Boolean(lead.phone));
    const seen = new Set<string>();
    const uniqueLeads = extracted.filter((lead) => {
      if (seen.has(lead.phone)) return false;
      seen.add(lead.phone);
      return true;
    });

    const results = [];

    for (const lead of uniqueLeads) {
      try {
        results.push(await importOneLead(supabase, lead, sourceName));
      } catch (error: any) {
        results.push({ status: 'error', phone: lead.phone, name: lead.name, error: error?.message || 'Erro ao importar contato.' });
      }
    }

    const imported = results.filter((item: any) => item.status === 'imported');
    const existing = results.filter((item: any) => item.status === 'skipped_existing_base');
    const locked = results.filter((item: any) => item.status === 'skipped_locked');
    const errors = results.filter((item: any) => item.status === 'error');
    const summary = `Importados: ${imported.length}. Já existiam: ${existing.length}. Ignorados por trava: ${locked.length}. Erros: ${errors.length}.`;

    await supabase
      .from('marketing_integrations')
      .update({
        settings: {
          ...settings,
          api_endpoint: apiEndpoint,
          api_token: apiToken,
          last_import_at: new Date().toISOString(),
          last_import_summary: summary,
          last_error: errors[0]?.error || ''
        },
        updated_by: masterProfile.id,
        updated_at: new Date().toISOString()
      })
      .eq('integration_type', 'wati_leads');

    return NextResponse.json({
      success: true,
      fetched_contacts: rawContacts.length,
      extracted_contacts: extracted.length,
      processed_contacts: uniqueLeads.length,
      imported: imported.length,
      existing: existing.length,
      locked: locked.length,
      errors: errors.length,
      summary,
      results: results.slice(0, 100)
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || 'Erro ao importar contatos recentes do WATI.' },
      { status: 500 }
    );
  }
}
