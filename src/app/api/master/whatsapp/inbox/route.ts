import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getEvolutionProfilePictureUrl } from '@/lib/server/evolution';
import { evolutionDisplayBody } from '@/lib/server/evolutionMessage';
import { collapseWhatsappConversations, relatedWhatsappConversationIds } from '@/lib/server/storeWhatsappInbox';

export const runtime = 'nodejs';

function cleanText(value: unknown) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function noStoreJson(payload: unknown, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: { 'Cache-Control': 'private, no-store, max-age=0' }
  });
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

  let profile: any = null;

  const { data: byAuth } = await supabase
    .from('users')
    .select('*')
    .eq('auth_user_id', authData.user.id)
    .maybeSingle();

  profile = byAuth;

  if (!profile && authData.user.email) {
    const { data: byEmail } = await supabase
      .from('users')
      .select('*')
      .ilike('email', authData.user.email)
      .maybeSingle();

    profile = byEmail;
  }

  if (!profile || profile.status !== 'active' || profile.role !== 'master') return null;

  return profile;
}

function unique(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter(Boolean))) as string[];
}

function buildMap(rows: any[]) {
  return Object.fromEntries((rows || []).map((row) => [row.id, row]));
}

function whatsappProvider(number: any) {
  const configuredProvider = cleanText(number?.settings?.provider).toLowerCase();
  if (configuredProvider === 'evolution') return 'evolution';

  return cleanText(number?.phone_number_id).toLowerCase().startsWith('evolution:')
    ? 'evolution'
    : 'meta_cloud';
}

function publicWhatsappNumber(number: any, integration: any) {
  const provider = whatsappProvider(number);

  return {
    id: number.id,
    label: number.label,
    phone_number: number.phone_number,
    phone_number_id: number.phone_number_id,
    status: number.status,
    is_active: number.is_active,
    store_id: number.store_id,
    provider,
    integration_status: provider === 'evolution' ? integration?.status || 'disconnected' : number.status,
    instance_name: provider === 'evolution'
      ? integration?.instance_name || cleanText(number?.settings?.instance_name) || null
      : null
  };
}

function existingProfilePicture(contact: any) {
  const metadata = contact?.metadata || {};
  return cleanText(
    contact?.profile_picture_url ||
    contact?.profile_picture ||
    contact?.avatar_url ||
    contact?.photo_url ||
    metadata?.profile_picture_url ||
    metadata?.profilePictureUrl ||
    metadata?.avatar_url ||
    metadata?.photo_url
  ) || null;
}

async function resolveEvolutionProfilePictures(conversations: any[], contactsById: Record<string, any>, numbersById: Record<string, any>) {
  const jobs = new Map<string, { contactId: string; instanceName: string; phone: string }>();

  for (const conversation of conversations || []) {
    const contact = contactsById[conversation.contact_id];
    const number = numbersById[conversation.whatsapp_number_id];

    if (!contact || existingProfilePicture(contact)) continue;
    if (number?.provider !== 'evolution' || number?.integration_status !== 'connected' || !number?.instance_name) continue;

    const phone = cleanText(contact.phone || contact.wa_id).split('@')[0].split(':')[0].replace(/\D/g, '');
    if (phone.length < 8) continue;

    jobs.set(contact.id, {
      contactId: contact.id,
      instanceName: number.instance_name,
      phone
    });
  }

  const entries = Array.from(jobs.values()).slice(0, 80);
  const resolved: Record<string, string> = {};

  for (let index = 0; index < entries.length; index += 8) {
    const chunk = entries.slice(index, index + 8);
    const results = await Promise.all(
      chunk.map(async (job) => {
        try {
          const url = await getEvolutionProfilePictureUrl(job.instanceName, job.phone);
          return url ? [job.contactId, url] as const : null;
        } catch {
          return null;
        }
      })
    );

    for (const result of results) {
      if (result) resolved[result[0]] = result[1];
    }
  }

  return resolved;
}

export async function GET(request: Request) {
  try {
    const supabase = getAdminClient();
    const url = new URL(request.url);
    const conversationId = cleanText(url.searchParams.get('conversation_id'));
    const authorization = request.headers.get('authorization') || '';
    const token = authorization.replace(/^Bearer\s+/i, '').trim();

    if (!token) {
      return NextResponse.json({ error: 'Sessão não encontrada.' }, { status: 401 });
    }

    const masterProfile = await getMasterProfile(supabase, token);

    if (!masterProfile) {
      return NextResponse.json({ error: 'Apenas usuário Master pode acessar o Inbox WhatsApp.' }, { status: 403 });
    }

    const { data: centralNumbers, error: numbersError } = await supabase
      .from('whatsapp_numbers')
      .select('id, label, phone_number, phone_number_id, status, is_active, store_id, settings')
      .is('store_id', null)
      .neq('status', 'archived')
      .order('label', { ascending: true });

    if (numbersError) {
      return NextResponse.json({ error: numbersError.message }, { status: 400 });
    }

    const centralNumberIds = unique((centralNumbers || []).map((item: any) => item.id));

    if (!centralNumberIds.length) {
      return NextResponse.json({
        success: true,
        conversations: [],
        messages: [],
        selected_conversation_id: conversationId || null,
        numbers: [],
        scope: 'central_master'
      });
    }

    const [conversationsResponse, integrationsResponse] = await Promise.all([
      supabase
        .from('whatsapp_conversations')
        .select('*')
        .in('whatsapp_number_id', centralNumberIds)
        .order('last_message_at', { ascending: false })
        .limit(300),
      supabase
        .from('store_whatsapp_integrations')
        .select('crm_number_id, instance_name, status, scope')
        .in('crm_number_id', centralNumberIds)
    ]);

    const conversations = conversationsResponse.data;
    const conversationsError = conversationsResponse.error;
    const integrationsError = integrationsResponse.error;

    const inboxLoadError = conversationsError || integrationsError;
    if (inboxLoadError) {
      return NextResponse.json({ error: inboxLoadError.message }, { status: 400 });
    }

    const integrationsByNumberId = Object.fromEntries(
      (integrationsResponse.data || []).map((integration: any) => [integration.crm_number_id, integration])
    );
    const publicCentralNumbers = (centralNumbers || []).map((number: any) =>
      publicWhatsappNumber(number, integrationsByNumberId[number.id] || null)
    );

    const contactIds = unique((conversations || []).map((item: any) => item.contact_id));
    const leadIds = unique((conversations || []).map((item: any) => item.lead_id));
    const baseLeadIds = unique((conversations || []).map((item: any) => item.base_lead_id));

    const [contactsResponse, leadsResponse, baseLeadsResponse] = await Promise.all([
      contactIds.length
        ? supabase.from('whatsapp_contacts').select('*').in('id', contactIds)
        : Promise.resolve({ data: [], error: null }),
      leadIds.length
        ? supabase.from('leads').select('id, customer_name, customer_phone, status, interested_vehicle, origin, scheduled_at, assigned_store_id, created_at').in('id', leadIds)
        : Promise.resolve({ data: [], error: null }),
      baseLeadIds.length
        ? supabase.from('leads_base').select('id, name, phone, status, source, campaign_name, assigned_store_id, assigned_store_name, routed_lead_id, created_at').in('id', baseLeadIds)
        : Promise.resolve({ data: [], error: null })
    ]);

    const loadError = contactsResponse.error || leadsResponse.error || baseLeadsResponse.error;

    if (loadError) {
      return NextResponse.json({ error: loadError.message }, { status: 400 });
    }

    const contactsById = buildMap(contactsResponse.data || []);
    const numbersById = buildMap(publicCentralNumbers);
    const leadsById = buildMap(leadsResponse.data || []);
    const baseLeadsById = buildMap(baseLeadsResponse.data || []);

    const liveProfilePictures = await resolveEvolutionProfilePictures(conversations || [], contactsById, numbersById);

    for (const [contactId, profilePictureUrl] of Object.entries(liveProfilePictures)) {
      if (contactsById[contactId]) {
        contactsById[contactId] = {
          ...contactsById[contactId],
          profile_picture_url: profilePictureUrl
        };
      }
    }

    const assignedStoreIds = unique([
      ...(leadsResponse.data || []).map((lead: any) => lead.assigned_store_id),
      ...(baseLeadsResponse.data || []).map((lead: any) => lead.assigned_store_id)
    ]);

    const storesResponse = assignedStoreIds.length
      ? await supabase.from('stores').select('id, store_name, slug, status').in('id', assignedStoreIds)
      : { data: [], error: null };

    if (storesResponse.error) {
      return NextResponse.json({ error: storesResponse.error.message }, { status: 400 });
    }

    const storesById = buildMap(storesResponse.data || []);

    const enrichedConversations = (conversations || []).map((conversation: any) => {
      const contact = contactsById[conversation.contact_id] || null;
      const number = numbersById[conversation.whatsapp_number_id] || null;
      const lead = leadsById[conversation.lead_id] || null;
      const baseLead = baseLeadsById[conversation.base_lead_id] || null;
      const assignedStoreId = lead?.assigned_store_id || baseLead?.assigned_store_id || null;

      return {
        ...conversation,
        contact,
        number,
        lead,
        base_lead: baseLead,
        store: assignedStoreId ? storesById[assignedStoreId] || null : null
      };
    });
    const collapsedConversations = collapseWhatsappConversations(enrichedConversations);
    const selectedConversation = conversationId
      ? collapsedConversations.find((conversation) => conversation.related_conversation_ids.includes(conversationId)) || null
      : null;

    let messages: any[] = [];

    if (conversationId) {
      if (!selectedConversation) {
        return NextResponse.json({ error: 'Conversa não encontrada no Inbox central do Master.' }, { status: 404 });
      }

      const { data: messageRows, error: messagesError } = await supabase
        .from('whatsapp_messages')
        .select('*')
        .in('conversation_id', selectedConversation.related_conversation_ids)
        .order('created_at', { ascending: false })
        .limit(300);

      if (messagesError) {
        return NextResponse.json({ error: messagesError.message }, { status: 400 });
      }

      messages = [...(messageRows || [])].reverse().map((message: any) => ({
        ...message,
        body: evolutionDisplayBody(message.body, message.raw_payload)
      }));
    }

    return noStoreJson({
      success: true,
      conversations: collapsedConversations,
      messages,
      selected_conversation_id: selectedConversation?.id || null,
      numbers: publicCentralNumbers,
      scope: 'central_master'
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Erro ao carregar Inbox WhatsApp Master.' },
      { status: 500 }
    );
  }
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
      return NextResponse.json({ error: 'Apenas usuário Master pode alterar o Inbox WhatsApp.' }, { status: 403 });
    }

    const body = await request.json();
    const action = cleanText(body.action);
    const conversationId = cleanText(body.conversation_id);
    const requestedRelatedConversationIds = unique([
      conversationId,
      ...(Array.isArray(body.related_conversation_ids)
        ? body.related_conversation_ids.map((value: unknown) => cleanText(value))
        : [])
    ]).slice(0, 300);

    if (!conversationId) {
      return NextResponse.json({ error: 'Informe a conversa.' }, { status: 400 });
    }

    const { data: conversation, error: conversationError } = await supabase
      .from('whatsapp_conversations')
      .select('id, whatsapp_number_id, contact_id, lead_id, base_lead_id, whatsapp_numbers(id, store_id)')
      .eq('id', conversationId)
      .maybeSingle();

    if (conversationError) {
      return NextResponse.json({ error: conversationError.message }, { status: 400 });
    }

    if (!conversation) {
      return NextResponse.json({ error: 'Conversa não pertence ao Inbox central do Master.' }, { status: 404 });
    }

    const numberRelation = (conversation as any).whatsapp_numbers;
    const linkedNumber = Array.isArray(numberRelation) ? numberRelation[0] : numberRelation;

    if (linkedNumber?.store_id) {
      return NextResponse.json({ error: 'Conversa não pertence ao Inbox central do Master.' }, { status: 404 });
    }

    if (action === 'mark-read') {
      const { data: relatedRows, error: relatedRowsError } = await supabase
        .from('whatsapp_conversations')
        .select('id, whatsapp_number_id, contact_id, lead_id, base_lead_id, last_message_at, updated_at, unread_count, status')
        .in('id', requestedRelatedConversationIds)
        .eq('whatsapp_number_id', conversation.whatsapp_number_id);

      if (relatedRowsError) {
        return NextResponse.json({ error: relatedRowsError.message }, { status: 400 });
      }

      const relatedContactIds = unique((relatedRows || []).map((item: any) => item.contact_id));
      const relatedLeadIds = unique((relatedRows || []).map((item: any) => item.lead_id));
      const relatedBaseLeadIds = unique((relatedRows || []).map((item: any) => item.base_lead_id));
      const [relatedContactsResponse, relatedLeadsResponse, relatedBaseLeadsResponse] = await Promise.all([
        relatedContactIds.length
          ? supabase.from('whatsapp_contacts').select('id, phone, profile_name').in('id', relatedContactIds)
          : Promise.resolve({ data: [], error: null }),
        relatedLeadIds.length
          ? supabase.from('leads').select('id, customer_phone, customer_name').in('id', relatedLeadIds)
          : Promise.resolve({ data: [], error: null }),
        relatedBaseLeadIds.length
          ? supabase.from('leads_base').select('id, phone, name').in('id', relatedBaseLeadIds)
          : Promise.resolve({ data: [], error: null })
      ]);
      const relatedLoadError = relatedContactsResponse.error || relatedLeadsResponse.error || relatedBaseLeadsResponse.error;
      if (relatedLoadError) {
        return NextResponse.json({ error: relatedLoadError.message }, { status: 400 });
      }

      const relatedContactsById = buildMap(relatedContactsResponse.data || []);
      const relatedLeadsById = buildMap(relatedLeadsResponse.data || []);
      const relatedBaseLeadsById = buildMap(relatedBaseLeadsResponse.data || []);
      const enrichedRelatedRows = (relatedRows || []).map((item: any) => ({
        ...item,
        contact: relatedContactsById[item.contact_id] || null,
        lead: relatedLeadsById[item.lead_id] || null,
        base_lead: relatedBaseLeadsById[item.base_lead_id] || null
      }));
      const idsToMarkRead = relatedWhatsappConversationIds(enrichedRelatedRows, conversationId);

      const { error } = await supabase
        .from('whatsapp_conversations')
        .update({ unread_count: 0, updated_at: new Date().toISOString() })
        .in('id', idsToMarkRead)
        .eq('whatsapp_number_id', conversation.whatsapp_number_id);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Ação inválida.' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Erro ao alterar Inbox WhatsApp Master.' },
      { status: 500 }
    );
  }
}
