import { NextResponse } from 'next/server';
import { asStorePortalRole, authorizeStoreWhatsappPortal, canAccessStoreConversation } from '@/lib/server/storePortal';
import { evolutionDisplayBody } from '@/lib/server/evolutionMessage';
import { readManagedEvolutionState } from '@/lib/server/managedWhatsappEvolution';
import { publicWhatsappNumber } from '@/lib/server/storeWhatsappChannel';
import { collapseWhatsappConversations, includeRequestedConversation, relatedWhatsappConversationIds } from '@/lib/server/storeWhatsappInbox';
import { whatsappCustomerDisplayName } from '@/lib/server/whatsappCustomerIdentity';

export const runtime = 'nodejs';

function cleanText(value: unknown) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function noStoreJson(payload: unknown, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: {
      'Cache-Control': 'private, no-store, max-age=0'
    }
  });
}

function shortId(value: unknown) {
  return cleanText(value).slice(0, 8) || null;
}

const EVOLUTION_STATE_CACHE_MS = 10_000;
type EvolutionLiveState = Awaited<ReturnType<typeof readManagedEvolutionState>>;
const evolutionStateCache = new Map<string, { expiresAt: number; state: EvolutionLiveState }>();

async function readEvolutionStateCached(integration: any) {
  const instanceName = cleanText(integration?.instance_name);
  if (!instanceName) return readManagedEvolutionState(integration);

  const cached = evolutionStateCache.get(instanceName);
  if (cached && cached.expiresAt > Date.now()) return cached.state;

  const state = await readManagedEvolutionState(integration);
  evolutionStateCache.set(instanceName, {
    expiresAt: Date.now() + EVOLUTION_STATE_CACHE_MS,
    state
  });
  return state;
}

function canAccessConversation(profile: any, store: any, conversation: any, lead: any) {
  const role = asStorePortalRole(profile?.role);
  if (!role || conversation?.store_id !== store?.id) return false;
  return canAccessStoreConversation(profile, role, conversation, lead);
}

function unique(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter(Boolean))) as string[];
}

function buildMap(rows: any[]) {
  return Object.fromEntries((rows || []).map((row) => [row.id, row]));
}

const externalProfilePictureKeys = [
  'profile_picture_url',
  'profilePictureUrl',
  'profile_picture',
  'avatar_url',
  'photo_url'
] as const;

function withoutExternalProfilePicture(value: any) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const sanitized = { ...value };
  const metadata = sanitized.metadata && typeof sanitized.metadata === 'object' && !Array.isArray(sanitized.metadata)
    ? { ...sanitized.metadata }
    : sanitized.metadata;

  for (const key of externalProfilePictureKeys) {
    delete sanitized[key];
    if (metadata && typeof metadata === 'object') delete metadata[key];
  }
  if (metadata !== undefined) sanitized.metadata = metadata;
  return sanitized;
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const slug = cleanText(url.searchParams.get('slug'));
    const conversationId = cleanText(url.searchParams.get('conversation_id'));

    if (!slug) {
      return NextResponse.json({ error: 'Informe a loja.' }, { status: 400 });
    }

    const context = await authorizeStoreWhatsappPortal(request, slug);
    if ('error' in context) return context.error;
    const { supabase, profile, store } = context;

    const [recentConversationsResponse, requestedConversationResponse] = await Promise.all([
      supabase
        .from('whatsapp_conversations')
        .select('*')
        .eq('store_id', store.id)
        .order('last_message_at', { ascending: false })
        .limit(100),
      conversationId
        ? supabase
            .from('whatsapp_conversations')
            .select('*')
            .eq('id', conversationId)
            .eq('store_id', store.id)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null })
    ]);

    const storeConversations = recentConversationsResponse.data || [];
    const conversationsError = recentConversationsResponse.error || requestedConversationResponse.error;

    if (conversationsError) {
      return noStoreJson({ error: conversationsError.message }, 400);
    }

    const requestedConversation = requestedConversationResponse.data || null;
    if (conversationId && !requestedConversation) {
      console.warn('[Store WhatsApp] Conversa solicitada ausente do escopo da loja.', {
        reason: 'missing_or_store_mismatch',
        profile: shortId(profile.id),
        role: profile.role,
        store: shortId(store.id),
        conversation: shortId(conversationId)
      });
      return noStoreJson({ error: 'Conversa não encontrada nesta loja.' }, 404);
    }

    const conversationCandidates = includeRequestedConversation(storeConversations, requestedConversation);

    const allLeadIds = unique(conversationCandidates.map((item: any) => item.lead_id));
    const { data: accessLeads, error: accessLeadsError } = allLeadIds.length
      ? await supabase
          .from('leads')
          .select('id, assigned_store_id, assigned_user_id')
          .in('id', allLeadIds)
      : { data: [], error: null };

    if (accessLeadsError) {
      return NextResponse.json({ error: accessLeadsError.message }, { status: 400 });
    }

    const accessLeadsById = buildMap(accessLeads || []);
    const conversations = conversationCandidates.filter((conversation: any) =>
      canAccessConversation(profile, store, conversation, accessLeadsById[conversation.lead_id])
    );

    const contactIds = unique(conversations.map((item: any) => item.contact_id));
    const numberIds = unique(conversations.map((item: any) => item.whatsapp_number_id));
    const leadIds = unique(conversations.map((item: any) => item.lead_id));
    const baseLeadIds = unique(conversations.map((item: any) => item.base_lead_id));

    const [contactsResponse, numbersResponse, integrationsResponse, leadsResponse, baseLeadsResponse] = await Promise.all([
      contactIds.length
        ? supabase.from('whatsapp_contacts').select('*').in('id', contactIds)
        : Promise.resolve({ data: [], error: null }),
      numberIds.length
        ? supabase.from('whatsapp_numbers').select('id, label, phone_number, phone_number_id, status, is_active, settings').in('id', numberIds)
        : Promise.resolve({ data: [], error: null }),
      numberIds.length
        ? supabase.from('store_whatsapp_integrations').select('crm_number_id, instance_name, profile_name, status, scope').in('crm_number_id', numberIds).eq('scope', 'store')
        : Promise.resolve({ data: [], error: null }),
      leadIds.length
        ? supabase.from('leads').select('id, customer_name, customer_phone, status, interested_vehicle, origin, scheduled_at, created_at').in('id', leadIds)
        : Promise.resolve({ data: [], error: null }),
      baseLeadIds.length
        ? supabase.from('leads_base').select('id, name, phone, status, source, campaign_name, created_at').in('id', baseLeadIds)
        : Promise.resolve({ data: [], error: null })
    ]);

    const loadError = contactsResponse.error || numbersResponse.error || integrationsResponse.error || leadsResponse.error || baseLeadsResponse.error;

    if (loadError) {
      return NextResponse.json({ error: loadError.message }, { status: 400 });
    }

    const contactsById = buildMap(contactsResponse.data || []);
    const integrationsByNumberId = Object.fromEntries(
      (integrationsResponse.data || []).map((integration: any) => [integration.crm_number_id, integration])
    );
    const liveStatesByNumberId = Object.fromEntries(await Promise.all(
      (integrationsResponse.data || []).map(async (integration: any) => [
        integration.crm_number_id,
        await readEvolutionStateCached(integration)
      ])
    ));
    const publicNumbers = (numbersResponse.data || []).map((number: any) => {
      const integration = integrationsByNumberId[number.id] || null;
      return publicWhatsappNumber(number, integration, liveStatesByNumberId[number.id] || null);
    });
    const numbersById = buildMap(publicNumbers);
    const leadsById = buildMap(leadsResponse.data || []);
    const baseLeadsById = buildMap(baseLeadsResponse.data || []);

    const enrichedConversations = conversations.map((conversation: any) => {
      const contact = contactsById[conversation.contact_id] || null;
      const number = numbersById[conversation.whatsapp_number_id] || null;
      const integration = integrationsByNumberId[conversation.whatsapp_number_id] || null;
      const lead = leadsById[conversation.lead_id] || null;
      const baseLead = baseLeadsById[conversation.base_lead_id] || null;
      const phone = contact?.phone || lead?.customer_phone || baseLead?.phone || '';
      const businessNames = [store.store_name, integration?.profile_name, number?.label];
      const displayName = whatsappCustomerDisplayName(
        [contact?.profile_name, lead?.customer_name, baseLead?.name],
        phone,
        businessNames
      );

      const evolutionConversation = number?.provider === 'evolution';
      const publicConversation = evolutionConversation
        ? withoutExternalProfilePicture(conversation)
        : conversation;
      const publicContact = evolutionConversation
        ? withoutExternalProfilePicture(contact)
        : contact;

      return {
        ...publicConversation,
        contact: publicContact ? { ...publicContact, profile_name: displayName } : null,
        number,
        lead: lead ? { ...lead, customer_name: displayName } : null,
        base_lead: baseLead ? { ...baseLead, name: displayName } : null
      };
    });
    const collapsedConversations = collapseWhatsappConversations(enrichedConversations);
    const selectedConversation = conversationId
      ? collapsedConversations.find((conversation) => conversation.related_conversation_ids.includes(conversationId)) || null
      : null;

    let messages: any[] = [];

    if (conversationId) {
      if (!selectedConversation) {
        const requestedLead = requestedConversation?.lead_id
          ? accessLeadsById[requestedConversation.lead_id]
          : null;
        console.warn('[Store WhatsApp] Conversa solicitada negada pelo escopo operacional.', {
          reason: requestedConversation?.lead_id && !requestedLead ? 'missing_lead' : 'responsibility_scope',
          profile: shortId(profile.id),
          role: profile.role,
          store: shortId(store.id),
          conversation: shortId(conversationId),
          conversationStoreMatches: requestedConversation?.store_id === store.id,
          leadStoreMatches: requestedLead?.assigned_store_id === store.id,
          leadAssigneeMatches: requestedLead?.assigned_user_id === profile.id
        });
        return noStoreJson({ error: 'Conversa não encontrada nesta loja.' }, 404);
      }

      const { data: messageRows, error: messagesError } = await supabase
        .from('whatsapp_messages')
        .select('*')
        .in('conversation_id', selectedConversation.related_conversation_ids)
        .eq('store_id', store.id)
        .order('sent_at', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(250);

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
      store,
      conversations: collapsedConversations,
      messages,
      selected_conversation_id: selectedConversation?.id || null
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Erro ao carregar conversas WhatsApp.' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const action = cleanText(body.action);
    const slug = cleanText(body.slug);
    const conversationId = cleanText(body.conversation_id);
    const requestedRelatedConversationIds = unique([
      conversationId,
      ...(Array.isArray(body.related_conversation_ids)
        ? body.related_conversation_ids.map((value: unknown) => cleanText(value))
        : [])
    ]).slice(0, 300);

    if (!slug || !conversationId) {
      return NextResponse.json({ error: 'Informe loja e conversa.' }, { status: 400 });
    }

    const context = await authorizeStoreWhatsappPortal(request, slug);
    if ('error' in context) return context.error;
    const { supabase, profile, store } = context;

    const { data: conversation, error: conversationError } = await supabase
      .from('whatsapp_conversations')
      .select('id, store_id, lead_id, contact_id, whatsapp_number_id')
      .eq('id', conversationId)
      .eq('store_id', store.id)
      .maybeSingle();

    if (conversationError) {
      return NextResponse.json({ error: conversationError.message }, { status: 400 });
    }

    let lead: any = null;
    if (conversation?.lead_id) {
      const { data, error } = await supabase
        .from('leads')
        .select('id, assigned_store_id, assigned_user_id')
        .eq('id', conversation.lead_id)
        .maybeSingle();
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      lead = data;
    }

    if (!conversation || !canAccessConversation(profile, store, conversation, lead)) {
      return NextResponse.json({ error: 'Conversa não encontrada nesta loja.' }, { status: 404 });
    }

    if (action === 'mark-read') {
      const { data: relatedRows, error: relatedRowsError } = await supabase
        .from('whatsapp_conversations')
        .select('id, store_id, lead_id, base_lead_id, contact_id, whatsapp_number_id, last_message_at, updated_at, unread_count, status')
        .in('id', requestedRelatedConversationIds)
        .eq('store_id', store.id);

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
          ? supabase.from('leads').select('id, assigned_store_id, assigned_user_id, customer_phone, customer_name').in('id', relatedLeadIds)
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
      const authorizedRelatedRows = (relatedRows || [])
        .filter((item: any) => canAccessConversation(profile, store, item, relatedLeadsById[item.lead_id]))
        .map((item: any) => ({
          ...item,
          contact: relatedContactsById[item.contact_id] || null,
          lead: relatedLeadsById[item.lead_id] || null,
          base_lead: relatedBaseLeadsById[item.base_lead_id] || null
        }));
      const idsToMarkRead = relatedWhatsappConversationIds(authorizedRelatedRows, conversationId);

      const { error } = await supabase
        .from('whatsapp_conversations')
        .update({ unread_count: 0, updated_at: new Date().toISOString() })
        .in('id', idsToMarkRead)
        .eq('store_id', store.id);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Ação inválida.' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Erro ao alterar conversa WhatsApp.' },
      { status: 500 }
    );
  }
}
