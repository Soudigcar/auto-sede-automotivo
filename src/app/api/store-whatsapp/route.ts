import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { asStorePortalRole, canAccessStoreConversation } from '@/lib/server/storePortal';
import { getEvolutionProfilePictureUrl } from '@/lib/server/evolution';
import { evolutionDisplayBody } from '@/lib/server/evolutionMessage';
import { readManagedEvolutionState } from '@/lib/server/managedWhatsappEvolution';
import { publicWhatsappNumber } from '@/lib/server/storeWhatsappChannel';
import { collapseWhatsappConversations, includeRequestedConversation } from '@/lib/server/storeWhatsappInbox';
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

const PROFILE_PICTURE_CACHE_MS = 24 * 60 * 60 * 1_000;
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

function profilePictureMetadata(contact: any) {
  const metadata = contact?.metadata && typeof contact.metadata === 'object'
    ? contact.metadata
    : {};
  const url = cleanText(metadata.profile_picture_url || metadata.profilePictureUrl);
  const updatedAt = cleanText(metadata.profile_picture_updated_at);

  return { metadata, url, updatedAt };
}

function hasFreshProfilePicture(url: string, updatedAt: string) {
  if (!url || !updatedAt) return false;
  const timestamp = Date.parse(updatedAt);
  return Number.isFinite(timestamp) && Date.now() - timestamp < PROFILE_PICTURE_CACHE_MS;
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

async function getProfile(supabase: any, token: string) {
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

  if (!profile || profile.status !== 'active' || !asStorePortalRole(profile.role)) return null;

  return profile;
}

function canAccessStore(profile: any, store: any) {
  if (!profile || !store) return false;
  if (profile.role === 'master') return true;
  return Boolean(profile.store_id && profile.store_id === store.id);
}

function canAccessConversation(profile: any, store: any, conversation: any, lead: any) {
  const role = asStorePortalRole(profile?.role);
  if (!role || !canAccessStore(profile, store)) return false;
  return canAccessStoreConversation(profile, role, conversation, lead);
}

function unique(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter(Boolean))) as string[];
}

function buildMap(rows: any[]) {
  return Object.fromEntries((rows || []).map((row) => [row.id, row]));
}

async function getStore(supabase: any, slug: string) {
  const { data, error } = await supabase
    .from('stores')
    .select('id, store_name, slug, status, event_id')
    .eq('slug', slug)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function GET(request: Request) {
  try {
    const supabase = getAdminClient();
    const url = new URL(request.url);
    const slug = cleanText(url.searchParams.get('slug'));
    const conversationId = cleanText(url.searchParams.get('conversation_id'));
    const authorization = request.headers.get('authorization') || '';
    const token = authorization.replace(/^Bearer\s+/i, '').trim();

    if (!token) {
      return NextResponse.json({ error: 'Sessão não encontrada.' }, { status: 401 });
    }

    if (!slug) {
      return NextResponse.json({ error: 'Informe a loja.' }, { status: 400 });
    }

    const profile = await getProfile(supabase, token);

    if (!profile) {
      return NextResponse.json({ error: 'Usuário sem permissão para acessar WhatsApp.' }, { status: 403 });
    }

    const store = await getStore(supabase, slug);

    if (!store || !canAccessStore(profile, store)) {
      return NextResponse.json({ error: 'Loja não encontrada ou sem permissão.' }, { status: 404 });
    }

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

      return {
        ...conversation,
        contact: contact ? { ...contact, profile_name: displayName } : null,
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
        .order('sent_at', { ascending: true })
        .order('created_at', { ascending: true })
        .limit(250);

      if (messagesError) {
        return NextResponse.json({ error: messagesError.message }, { status: 400 });
      }

      messages = (messageRows || []).map((message: any) => ({
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
    const supabase = getAdminClient();
    const authorization = request.headers.get('authorization') || '';
    const token = authorization.replace(/^Bearer\s+/i, '').trim();

    if (!token) {
      return NextResponse.json({ error: 'Sessão não encontrada.' }, { status: 401 });
    }

    const profile = await getProfile(supabase, token);

    if (!profile) {
      return NextResponse.json({ error: 'Usuário sem permissão para alterar conversa.' }, { status: 403 });
    }

    const body = await request.json();
    const action = cleanText(body.action);
    const slug = cleanText(body.slug);
    const conversationId = cleanText(body.conversation_id);

    if (!slug || !conversationId) {
      return NextResponse.json({ error: 'Informe loja e conversa.' }, { status: 400 });
    }

    const store = await getStore(supabase, slug);

    if (!store || !canAccessStore(profile, store)) {
      return NextResponse.json({ error: 'Loja não encontrada ou sem permissão.' }, { status: 404 });
    }

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

    if (action === 'load-profile-picture') {
      if (!conversation.contact_id || !conversation.whatsapp_number_id) {
        return NextResponse.json({ success: true, profile_picture_url: null });
      }

      const { data: contact, error: contactError } = await supabase
        .from('whatsapp_contacts')
        .select('id, wa_id, phone, metadata')
        .eq('id', conversation.contact_id)
        .eq('store_id', store.id)
        .maybeSingle();

      if (contactError) {
        return NextResponse.json({ error: contactError.message }, { status: 400 });
      }

      if (!contact) {
        return NextResponse.json({ error: 'Contato da conversa não encontrado.' }, { status: 404 });
      }

      const cached = profilePictureMetadata(contact);
      if (hasFreshProfilePicture(cached.url, cached.updatedAt)) {
        return NextResponse.json({
          success: true,
          profile_picture_url: cached.url,
          profile_picture_updated_at: cached.updatedAt,
          cached: true
        });
      }

      const { data: integration, error: integrationError } = await supabase
        .from('store_whatsapp_integrations')
        .select('instance_name')
        .eq('crm_number_id', conversation.whatsapp_number_id)
        .eq('store_id', store.id)
        .eq('scope', 'store')
        .maybeSingle();

      if (integrationError) {
        return NextResponse.json({ error: integrationError.message }, { status: 400 });
      }

      let profilePictureUrl = cached.url;
      const refreshedAt = new Date().toISOString();

      if (integration?.instance_name) {
        try {
          profilePictureUrl =
            (await getEvolutionProfilePictureUrl(
              integration.instance_name,
              contact.wa_id || contact.phone
            )) || cached.url;
        } catch (profilePictureError: any) {
          console.warn('[Store WhatsApp] Foto do contato indisponível na Evolution.', {
            conversationId,
            contactId: contact.id,
            error: profilePictureError?.message || String(profilePictureError)
          });
        }
      }

      if (profilePictureUrl && process.env.VERCEL_ENV === 'production') {
        const { error: cacheError } = await supabase
          .from('whatsapp_contacts')
          .update({
            metadata: {
              ...cached.metadata,
              profile_picture_url: profilePictureUrl,
              profile_picture_updated_at: refreshedAt
            }
          })
          .eq('id', contact.id)
          .eq('store_id', store.id);

        if (cacheError) {
          console.warn('[Store WhatsApp] Não foi possível armazenar o cache da foto.', {
            conversationId,
            contactId: contact.id,
            error: cacheError.message
          });
        }
      }

      return NextResponse.json({
        success: true,
        profile_picture_url: profilePictureUrl || null,
        profile_picture_updated_at: profilePictureUrl ? refreshedAt : null,
        cached: Boolean(cached.url && profilePictureUrl === cached.url)
      });
    }

    if (action === 'mark-read') {
      const { error } = await supabase
        .from('whatsapp_conversations')
        .update({ unread_count: 0, updated_at: new Date().toISOString() })
        .eq('id', conversationId)
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
