import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getMetaServerConfig, stripStoredMetaSecrets } from '@/lib/server/metaServerConfig';
import { RequestSecurityError, publicError, readRawBody, safeEqual, verifySha256Hmac } from '@/lib/server/requestSecurity';

export const runtime = 'nodejs';
export const maxDuration = 60;

const defaults = {
  page_id: '',
  graph_version: 'v20.0',
  form_mappings: [] as any[]
};

const clean = (value: unknown) => String(value || '').replace(/\s+/g, ' ').trim();
const digits = (value: unknown) => clean(value).replace(/\D/g, '');
const today = () => new Date().toISOString().slice(0, 10);

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) throw new Error('Supabase Service Role não configurada no servidor.');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function normalizeKey(value: unknown) {
  return clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

async function integration(supabase: any) {
  const { data } = await supabase.from('marketing_integrations').select('*').eq('integration_type', 'meta_leads').maybeSingle();
  return { ...(data || {}), settings: { ...defaults, ...stripStoredMetaSecrets(data?.settings) } };
}

function mappings(settings: any) {
  if (!Array.isArray(settings?.form_mappings)) return [];
  return settings.form_mappings.map((item: any) => ({
    name: clean(item?.name), form_id: digits(item?.form_id), event_id: clean(item?.event_id), event_name: clean(item?.event_name), is_active: Boolean(item?.is_active)
  })).filter((item: any) => item.form_id);
}

function mappingFor(settings: any, event: any, metaLead?: any) {
  const formId = digits(event?.form_id || metaLead?.form_id);
  return mappings(settings).find((item: any) => item.is_active && item.form_id === formId) || null;
}

async function validEvent(supabase: any, eventId: string) {
  if (!eventId) return null;
  const { data, error } = await supabase.from('events').select('id,event_name,status,start_date,end_date').eq('id', eventId).maybeSingle();
  if (error || !data || data.status !== 'active' || (data.end_date && data.end_date < today())) return null;
  return { ...data, name: data.event_name };
}

function extract(metaLead: any) {
  const map: Record<string, string> = {};
  for (const field of Array.isArray(metaLead?.field_data) ? metaLead.field_data : []) {
    const key = normalizeKey(field?.name);
    const value = clean(Array.isArray(field?.values) ? field.values[0] : '');
    if (key && value) map[key] = value;
  }
  const pick = (keys: string[]) => keys.map(normalizeKey).map((key) => map[key]).find(Boolean) || '';
  const first = pick(['first_name', 'primeiro_nome']);
  const last = pick(['last_name', 'sobrenome']);
  return {
    name: pick(['full_name','fullname','nome_completo','nome','name']) || [first,last].filter(Boolean).join(' ') || 'Lead Facebook',
    phone: pick(['phone_number','phone','telefone','celular','whatsapp','whatsapp_number','numero_do_whatsapp','numero_whatsapp','numero_de_telefone']),
    email: pick(['email','e_mail','e-mail']),
    cpf: pick(['cpf','numero_do_cpf']),
    vehicle: pick(['vehicle','veiculo','carro','modelo','modelo_de_interesse','veiculo_de_interesse','carro_de_interesse']),
    city: pick(['city','cidade']),
    fieldMap: map
  };
}

async function pageToken(settings: any) {
  const version = clean(settings.graph_version) || defaults.graph_version;
  const saved = getMetaServerConfig().pageAccessToken;
  const pageId = clean(settings.page_id);
  if (!saved || !pageId) return saved;
  const url = new URL(`https://graph.facebook.com/${version}/${pageId}`);
  url.searchParams.set('fields', 'id,name,access_token');
  const response = await fetch(url.toString(), { cache: 'no-store', headers: { authorization: `Bearer ${saved}` } });
  const data = await response.json();
  return response.ok && data?.access_token ? clean(data.access_token) : saved;
}

async function fetchLead(id: string, settings: any) {
  const token = await pageToken(settings);
  if (!token) throw new Error('Page Access Token não configurado.');
  const version = clean(settings.graph_version) || defaults.graph_version;
  const url = new URL(`https://graph.facebook.com/${version}/${id}`);
  url.searchParams.set('fields', 'created_time,id,ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,form_id,field_data');
  const response = await fetch(url.toString(), { cache: 'no-store', headers: { authorization: `Bearer ${token}` } });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error?.message || 'Erro ao buscar dados do lead na Meta.');
  return data;
}

function webhookEvents(body: any) {
  const events: any[] = [];
  for (const entry of Array.isArray(body?.entry) ? body.entry : []) {
    for (const change of Array.isArray(entry?.changes) ? entry.changes : []) {
      if (change?.field !== 'leadgen') continue;
      const value = change?.value || {};
      const leadgenId = clean(value.leadgen_id || value.lead_id || value.id);
      if (!leadgenId) continue;
      events.push({ leadgen_id: leadgenId, page_id: clean(value.page_id || entry.id), form_id: digits(value.form_id), ad_id: clean(value.ad_id), campaign_id: clean(value.campaign_id), created_time: value.created_time || null });
    }
  }
  return events;
}

async function ingest(supabase: any, settings: any, event: any) {
  let mapping = mappingFor(settings, event);
  if (!mapping) return { leadgen_id: event.leadgen_id, form_id: event.form_id || null, status: 'ignored_form_not_mapped' };
  const eventRecord = await validEvent(supabase, mapping.event_id);
  if (!eventRecord) return { leadgen_id: event.leadgen_id, form_id: mapping.form_id, status: 'ignored_event_inactive' };

  const duplicateMetadata = { meta_leadgen_id: event.leadgen_id };
  const { data: existing } = await supabase.from('leads_base').select('id,routed_lead_id,assigned_store_id').contains('metadata', duplicateMetadata).limit(1);
  if (existing?.length) return { leadgen_id: event.leadgen_id, id: existing[0].id, status: 'duplicate' };

  const metaLead = await fetchLead(event.leadgen_id, settings);
  mapping = mappingFor(settings, event, metaLead);
  if (!mapping) return { leadgen_id: event.leadgen_id, status: 'ignored_form_not_mapped' };
  const lead = extract(metaLead);
  const phone = digits(lead.phone);
  const { data: picked, error: pickError } = await supabase.rpc('pick_next_lead_store_by_event', { p_event_id: eventRecord.id, p_routing_key: `facebook_lead_form:${mapping.form_id}` });
  if (pickError) throw new Error(`Erro ao escolher loja do evento: ${pickError.message}`);
  const store = Array.isArray(picked) && picked.length ? picked[0] : null;
  if (!store?.store_id) throw new Error('Nenhuma loja ativa disponível para o evento.');

  const assignedAt = new Date().toISOString();
  const { data: routed, error: routeError } = await supabase.from('leads').insert({
    event_id: eventRecord.id,
    customer_name: lead.name,
    customer_phone: phone,
    customer_bank: '',
    interested_vehicle: lead.vehicle || '',
    vehicle_category_interest: '',
    origin: 'Facebook Lead Ads',
    assigned_store_id: store.store_id,
    status: 'new_lead',
    notes: ['Lead criado automaticamente pelo formulário do Facebook/Instagram.', `Formulário: ${mapping.name || mapping.form_id}.`, `Evento: ${eventRecord.name}.`, metaLead.campaign_name ? `Campanha Meta: ${metaLead.campaign_name}.` : '', lead.vehicle ? `Interesse informado: ${lead.vehicle}.` : '', lead.city ? `Cidade: ${lead.city}.` : ''].filter(Boolean).join(' ')
  }).select('id').single();
  if (routeError) throw new Error(`Erro ao criar lead no pipeline da loja: ${routeError.message}`);

  const metadata = {
    source: 'facebook_lead_ads', event_id: eventRecord.id, event_name: eventRecord.name, form_mapping_name: mapping.name || null,
    meta_leadgen_id: event.leadgen_id, meta_page_id: event.page_id || null, meta_form_id: mapping.form_id,
    meta_ad_id: event.ad_id || metaLead.ad_id || null, meta_ad_name: metaLead.ad_name || null,
    meta_adset_id: metaLead.adset_id || null, meta_adset_name: metaLead.adset_name || null,
    meta_campaign_id: event.campaign_id || metaLead.campaign_id || null, meta_campaign_name: metaLead.campaign_name || null,
    meta_created_time: metaLead.created_time || event.created_time || null, city: lead.city || null, field_map: lead.fieldMap,
    routing: { strategy: 'facebook_event_round_robin', assigned_store_id: store.store_id, assigned_store_name: store.store_name, assigned_at: assignedAt, routed_lead_id: routed?.id || null },
    webhook_audit: {
      leadgen_id: event.leadgen_id,
      form_id: mapping.form_id,
      page_id: event.page_id || null,
      received_at: assignedAt,
      field_names: Object.keys(lead.fieldMap || {}).slice(0, 40)
    }
  };

  const { data: base, error: baseError } = await supabase.from('leads_base').insert({
    event_id: eventRecord.id, name: lead.name, phone, cpf: digits(lead.cpf), email: lead.email,
    source: 'Facebook Lead Ads', campaign_id: null,
    campaign_name: metaLead.campaign_name || mapping.name || 'Facebook Lead Form', vehicle_id: null, vehicle_name: lead.vehicle,
    vehicle_price: 0, down_payment: 0, financed_amount: 0, installments: 0, estimated_installment: 0, interest_rate: 1.89,
    status: 'Novo lead', assigned_store_id: store.store_id, assigned_store_name: store.store_name || null, assigned_at: assignedAt,
    routed_lead_id: routed?.id || null, routing_strategy: 'facebook_event_round_robin',
    notes: ['Lead recebido automaticamente pelo formulário do Facebook/Instagram.', `Formulário: ${mapping.name || mapping.form_id}.`, `Evento: ${eventRecord.name}.`, lead.vehicle ? `Interesse informado: ${lead.vehicle}.` : '', lead.city ? `Cidade: ${lead.city}.` : ''].filter(Boolean).join(' '),
    metadata, created_at: assignedAt, updated_at: assignedAt
  }).select('id').single();

  if (baseError) {
    if (routed?.id) await supabase.from('leads').delete().eq('id', routed.id);
    throw baseError;
  }
  return { leadgen_id: event.leadgen_id, id: base?.id || null, status: 'inserted', form_id: mapping.form_id, event_id: eventRecord.id, assigned_store_id: store.store_id, routed_lead_id: routed?.id || null };
}

export async function GET(request: Request) {
  try {
    const supabase = admin();
    const current = await integration(supabase);
    const settings = current.settings || {};
    const url = new URL(request.url);
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');
    const verify = getMetaServerConfig().verifyToken;
    if (mode === 'subscribe' && safeEqual(token, verify) && challenge) return new Response(challenge, { status: 200, headers: { 'Content-Type': 'text/plain' } });
    return NextResponse.json({ error: 'Token de verificação inválido.' }, { status: 403 });
  } catch (error: unknown) {
    const safe = publicError(error, 'Erro ao verificar webhook.');
    return NextResponse.json({ error: safe.message }, { status: safe.status });
  }
}

export async function POST(request: Request) {
  try {
    const supabase = admin();
    const current = await integration(supabase);
    if (!current?.is_active) return NextResponse.json({ success: true, ignored: true, reason: 'integration_inactive' });
    const settings = current.settings || {};
    const rawBody = await readRawBody(request, 512 * 1024);
    const appSecret = clean(process.env.META_APP_SECRET);
    if (!appSecret) return NextResponse.json({ error: 'Webhook da Meta sem segredo configurado.' }, { status: 503 });
    if (!verifySha256Hmac(rawBody, request.headers.get('x-hub-signature-256'), appSecret)) {
      return NextResponse.json({ error: 'Assinatura do webhook inválida.' }, { status: 401 });
    }
    let payload: any;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      throw new RequestSecurityError('Payload JSON inválido.', 400);
    }
    const events = webhookEvents(payload);
    const results: any[] = [];
    for (const event of events) {
      try {
        if (settings.page_id && event.page_id && settings.page_id !== event.page_id) {
          results.push({ leadgen_id: event.leadgen_id, status: 'ignored_page' });
          continue;
        }
        results.push(await ingest(supabase, settings, event));
      } catch {
        results.push({ leadgen_id: event.leadgen_id, status: 'error', error: 'Erro ao processar lead.' });
      }
    }
    return NextResponse.json({ success: true, processed: results.length, results });
  } catch (error: unknown) {
    const safe = publicError(error, 'Erro ao processar webhook da Meta.');
    return NextResponse.json({ error: safe.message }, { status: safe.status });
  }
}
