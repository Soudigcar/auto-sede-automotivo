import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const maxDuration = 60;

const defaultSettings = {
  app_id: '',
  page_id: '',
  form_id: '',
  page_access_token: '',
  verify_token: 'auto-controle-meta-leads-2026',
  graph_version: 'v20.0',
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

function normalizeKey(value: unknown) {
  return cleanText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

async function getIntegration(supabase: any) {
  const { data } = await supabase
    .from('marketing_integrations')
    .select('*')
    .eq('integration_type', 'meta_leads')
    .maybeSingle();

  return {
    ...(data || {}),
    settings: {
      ...defaultSettings,
      ...(data?.settings || {})
    }
  };
}

function getFieldMap(metaLead: any) {
  const map: Record<string, string> = {};
  const fields = Array.isArray(metaLead?.field_data) ? metaLead.field_data : [];

  fields.forEach((field: any) => {
    const key = normalizeKey(field?.name);
    const values = Array.isArray(field?.values) ? field.values : [];
    const value = cleanText(values[0]);

    if (key && value) map[key] = value;
  });

  return map;
}

function pickField(fieldMap: Record<string, string>, candidates: string[]) {
  for (const candidate of candidates) {
    const key = normalizeKey(candidate);
    if (fieldMap[key]) return fieldMap[key];
  }

  return '';
}

function extractLead(metaLead: any) {
  const fieldMap = getFieldMap(metaLead);

  const firstName = pickField(fieldMap, ['first_name', 'primeiro_nome']);
  const lastName = pickField(fieldMap, ['last_name', 'sobrenome']);

  const name =
    pickField(fieldMap, ['full_name', 'fullname', 'nome_completo', 'nome', 'name']) ||
    [firstName, lastName].filter(Boolean).join(' ') ||
    'Lead Facebook';

  const phone = pickField(fieldMap, [
    'phone_number',
    'phone',
    'telefone',
    'celular',
    'whatsapp',
    'whatsapp_number',
    'whatsapp number',
    'numero_do_whatsapp',
    'número_do_whatsapp',
    'numero_whatsapp',
    'número_whatsapp',
    'numero_de_whatsapp',
    'número_de_whatsapp',
    'numero_de_telefone',
    'número_de_telefone'
  ]);

  const email = pickField(fieldMap, ['email', 'e_mail', 'e-mail']);
  const cpf = pickField(fieldMap, ['cpf', 'numero_do_cpf', 'número_do_cpf']);
  const vehicle = pickField(fieldMap, [
    'vehicle',
    'veiculo',
    'veículo',
    'carro',
    'modelo',
    'modelo_de_interesse',
    'veiculo_de_interesse',
    'veículo_de_interesse',
    'carro_de_interesse'
  ]);

  const city = pickField(fieldMap, ['city', 'cidade']);

  return {
    name,
    phone,
    email,
    cpf,
    vehicle,
    city,
    fieldMap
  };
}

async function graphGetWithToken(path: string, token: string, graphVersion: string, params: Record<string, string> = {}) {
  const url = new URL(`https://graph.facebook.com/${graphVersion}/${path.replace(/^\//, '')}`);
  url.searchParams.set('access_token', token);

  Object.entries(params).forEach(([key, value]) => {
    if (value) url.searchParams.set(key, value);
  });

  const response = await fetch(url.toString(), { cache: 'no-store' });
  const data = await response.json();

  return {
    ok: response.ok,
    status: response.status,
    data
  };
}

async function resolvePageAccessToken(settings: any) {
  const graphVersion = cleanText(settings.graph_version) || defaultSettings.graph_version;
  const savedToken = cleanText(settings.page_access_token);
  const pageId = cleanText(settings.page_id);

  if (!savedToken || !pageId) return savedToken;

  const pageCheck = await graphGetWithToken(`/${pageId}`, savedToken, graphVersion, {
    fields: 'id,name,access_token'
  });

  if (pageCheck.ok && pageCheck.data?.access_token) {
    return cleanText(pageCheck.data.access_token);
  }

  return savedToken;
}

async function fetchMetaLead(leadgenId: string, settings: any) {
  const graphVersion = cleanText(settings.graph_version) || defaultSettings.graph_version;
  const token = await resolvePageAccessToken(settings);

  if (!token) {
    throw new Error('Page Access Token não configurado.');
  }

  const url = new URL(`https://graph.facebook.com/${graphVersion}/${leadgenId}`);
  url.searchParams.set(
    'fields',
    'created_time,id,ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,form_id,field_data'
  );
  url.searchParams.set('access_token', token);

  const response = await fetch(url.toString(), {
    cache: 'no-store'
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data?.error?.message || 'Erro ao buscar dados do lead na Meta.');
  }

  return data;
}

function extractLeadgenEvents(body: any) {
  const events: any[] = [];

  const entries = Array.isArray(body?.entry) ? body.entry : [];

  entries.forEach((entry: any) => {
    const changes = Array.isArray(entry?.changes) ? entry.changes : [];

    changes.forEach((change: any) => {
      if (change?.field !== 'leadgen') return;

      const value = change?.value || {};
      const leadgenId = cleanText(value.leadgen_id || value.lead_id || value.id);

      if (!leadgenId) return;

      events.push({
        leadgen_id: leadgenId,
        page_id: cleanText(value.page_id || entry.id),
        form_id: cleanText(value.form_id),
        ad_id: cleanText(value.ad_id),
        campaign_id: cleanText(value.campaign_id),
        created_time: value.created_time || null,
        raw_change: change,
        raw_entry: entry
      });
    });
  });

  return events;
}

async function pickNextStore(supabase: any) {
  const { data, error } = await supabase.rpc('pick_next_lead_store', {
    p_routing_key: 'default'
  });

  if (error) {
    throw new Error(`Erro ao escolher loja para o lead: ${error.message}`);
  }

  return Array.isArray(data) && data.length ? data[0] : null;
}

async function routeLeadToStore(supabase: any, metaLead: any, extracted: any, normalizedPhone: string) {
  const selectedStore = await pickNextStore(supabase);

  if (!selectedStore?.store_id) {
    return {
      routedLeadId: null,
      assignedStoreId: null,
      assignedStoreName: '',
      assignedAt: null,
      routingStrategy: 'facebook_unassigned_no_store'
    };
  }

  const assignedAt = new Date().toISOString();

  const { data: routedLead, error: routedLeadError } = await supabase
    .from('leads')
    .insert({
      event_id: selectedStore.event_id || null,
      customer_name: extracted.name,
      customer_phone: normalizedPhone,
      customer_bank: '',
      interested_vehicle: extracted.vehicle || '',
      vehicle_category_interest: '',
      origin: 'Facebook Lead Ads',
      assigned_store_id: selectedStore.store_id,
      status: 'new_lead',
      notes: [
        'Lead criado automaticamente pelo formulário do Facebook/Instagram.',
        metaLead.campaign_name ? `Campanha: ${metaLead.campaign_name}.` : '',
        extracted.vehicle ? `Interesse informado: ${extracted.vehicle}.` : '',
        extracted.city ? `Cidade: ${extracted.city}.` : ''
      ].filter(Boolean).join(' ')
    })
    .select('id')
    .single();

  if (routedLeadError) {
    throw new Error(`Erro ao criar lead no pipeline da loja: ${routedLeadError.message}`);
  }

  return {
    routedLeadId: routedLead?.id || null,
    assignedStoreId: selectedStore.store_id,
    assignedStoreName: selectedStore.store_name || '',
    assignedAt,
    routingStrategy: 'facebook_round_robin'
  };
}

async function insertLeadBase(supabase: any, event: any, metaLead: any) {
  const extracted = extractLead(metaLead);
  const normalizedPhone = digits(extracted.phone);

  const duplicateMetadata = {
    meta_leadgen_id: event.leadgen_id
  };

  const { data: existing } = await supabase
    .from('leads_base')
    .select('id, phone, assigned_store_id, assigned_store_name, routed_lead_id, metadata')
    .contains('metadata', duplicateMetadata)
    .limit(1);

  if (existing?.length) {
    const current = existing[0];
    const updates: any = {
      updated_at: new Date().toISOString()
    };

    let route = null;

    if (!current.phone && normalizedPhone) {
      updates.phone = normalizedPhone;
    }

    if (!current.assigned_store_id && !current.routed_lead_id) {
      route = await routeLeadToStore(supabase, metaLead, extracted, normalizedPhone);
      updates.assigned_store_id = route.assignedStoreId;
      updates.assigned_store_name = route.assignedStoreName || null;
      updates.assigned_at = route.assignedAt;
      updates.routed_lead_id = route.routedLeadId;
      updates.routing_strategy = route.routingStrategy;
    }

    if (route) {
      updates.metadata = {
        ...(current.metadata || {}),
        routing: {
          strategy: route.routingStrategy,
          assigned_store_id: route.assignedStoreId,
          assigned_store_name: route.assignedStoreName,
          assigned_at: route.assignedAt,
          routed_lead_id: route.routedLeadId
        }
      };
    }

    await supabase
      .from('leads_base')
      .update(updates)
      .eq('id', current.id);

    return {
      status: Object.keys(updates).length > 1 ? 'duplicate_updated' : 'duplicate',
      id: current.id,
      phone: updates.phone || current.phone || null,
      assigned_store_id: updates.assigned_store_id || current.assigned_store_id || null,
      routed_lead_id: updates.routed_lead_id || current.routed_lead_id || null
    };
  }

  const route = await routeLeadToStore(supabase, metaLead, extracted, normalizedPhone);

  const metadata = {
    source: 'facebook_lead_ads',
    meta_leadgen_id: event.leadgen_id,
    meta_page_id: event.page_id || metaLead.page_id || null,
    meta_form_id: event.form_id || metaLead.form_id || null,
    meta_ad_id: event.ad_id || metaLead.ad_id || null,
    meta_ad_name: metaLead.ad_name || null,
    meta_adset_id: metaLead.adset_id || null,
    meta_adset_name: metaLead.adset_name || null,
    meta_campaign_id: event.campaign_id || metaLead.campaign_id || null,
    meta_campaign_name: metaLead.campaign_name || null,
    meta_created_time: metaLead.created_time || event.created_time || null,
    city: extracted.city || null,
    field_map: extracted.fieldMap,
    routing: {
      strategy: route.routingStrategy,
      assigned_store_id: route.assignedStoreId,
      assigned_store_name: route.assignedStoreName,
      assigned_at: route.assignedAt,
      routed_lead_id: route.routedLeadId
    },
    raw_meta_lead: metaLead,
    raw_webhook_event: event
  };

  const payload = {
    name: extracted.name,
    phone: normalizedPhone,
    cpf: digits(extracted.cpf),
    email: extracted.email,
    source: 'Facebook Lead Ads',
    campaign_id: null,
    campaign_name: metaLead.campaign_name || 'Facebook Lead Form',
    vehicle_id: null,
    vehicle_name: extracted.vehicle,
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
      'Lead recebido automaticamente pelo formulário do Facebook/Instagram.',
      extracted.vehicle ? `Interesse informado: ${extracted.vehicle}.` : '',
      extracted.city ? `Cidade: ${extracted.city}.` : ''
    ].filter(Boolean).join(' '),
    metadata,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  const { data, error } = await supabase
    .from('leads_base')
    .insert(payload)
    .select('id')
    .single();

  if (error) throw error;

  return {
    status: 'inserted',
    id: data?.id || null,
    phone: normalizedPhone || null,
    assigned_store_id: route.assignedStoreId,
    assigned_store_name: route.assignedStoreName,
    routed_lead_id: route.routedLeadId,
    routing_strategy: route.routingStrategy
  };
}

export async function GET(request: Request) {
  try {
    const supabase = getAdminClient();
    const integration = await getIntegration(supabase);
    const settings = integration.settings || {};

    const url = new URL(request.url);
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');

    const verifyToken =
      cleanText(settings.verify_token) ||
      cleanText(process.env.META_LEADS_VERIFY_TOKEN) ||
      defaultSettings.verify_token;

    if (mode === 'subscribe' && token === verifyToken && challenge) {
      return new Response(challenge, {
        status: 200,
        headers: {
          'Content-Type': 'text/plain'
        }
      });
    }

    return NextResponse.json({ error: 'Token de verificação inválido.' }, { status: 403 });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Erro ao verificar webhook.' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const supabase = getAdminClient();
    const integration = await getIntegration(supabase);

    if (!integration?.is_active) {
      return NextResponse.json({ success: true, ignored: true, reason: 'integration_inactive' });
    }

    const settings = integration.settings || {};
    const body = await request.json();
    const events = extractLeadgenEvents(body);
    const results: any[] = [];

    for (const event of events) {
      try {
        if (settings.page_id && event.page_id && settings.page_id !== event.page_id) {
          results.push({ leadgen_id: event.leadgen_id, status: 'ignored_page' });
          continue;
        }

        if (settings.form_id && event.form_id && settings.form_id !== event.form_id) {
          results.push({ leadgen_id: event.leadgen_id, status: 'ignored_form' });
          continue;
        }

        const metaLead = await fetchMetaLead(event.leadgen_id, settings);
        const inserted = await insertLeadBase(supabase, event, metaLead);

        results.push({
          leadgen_id: event.leadgen_id,
          ...inserted
        });
      } catch (error: any) {
        results.push({
          leadgen_id: event.leadgen_id,
          status: 'error',
          error: error?.message || 'Erro ao processar lead.'
        });
      }
    }

    return NextResponse.json({
      success: true,
      received: events.length,
      results
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Erro ao receber webhook da Meta.' },
      { status: 200 }
    );
  }
}
