import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

function cleanText(value: unknown) {
  return String(value || '').replace(/\s+/g, ' ').trim();
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

  if (!profile || profile.status !== 'active') return null;

  return profile;
}

function canAccessStore(profile: any, store: any) {
  if (!profile || !store) return false;
  if (profile.role === 'master') return true;
  return Boolean(profile.store_id && profile.store_id === store.id);
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

    const { data: conversations, error: conversationsError } = await supabase
      .from('whatsapp_conversations')
      .select('*')
      .eq('store_id', store.id)
      .order('last_message_at', { ascending: false })
      .limit(100);

    if (conversationsError) {
      return NextResponse.json({ error: conversationsError.message }, { status: 400 });
    }

    const contactIds = unique((conversations || []).map((item: any) => item.contact_id));
    const numberIds = unique((conversations || []).map((item: any) => item.whatsapp_number_id));
    const leadIds = unique((conversations || []).map((item: any) => item.lead_id));
    const baseLeadIds = unique((conversations || []).map((item: any) => item.base_lead_id));

    const [contactsResponse, numbersResponse, leadsResponse, baseLeadsResponse] = await Promise.all([
      contactIds.length
        ? supabase.from('whatsapp_contacts').select('*').in('id', contactIds)
        : Promise.resolve({ data: [], error: null }),
      numberIds.length
        ? supabase.from('whatsapp_numbers').select('id, label, phone_number, phone_number_id, status, is_active').in('id', numberIds)
        : Promise.resolve({ data: [], error: null }),
      leadIds.length
        ? supabase.from('leads').select('id, customer_name, customer_phone, status, interested_vehicle, origin, scheduled_at, created_at').in('id', leadIds)
        : Promise.resolve({ data: [], error: null }),
      baseLeadIds.length
        ? supabase.from('leads_base').select('id, name, phone, status, source, campaign_name, created_at').in('id', baseLeadIds)
        : Promise.resolve({ data: [], error: null })
    ]);

    const loadError = contactsResponse.error || numbersResponse.error || leadsResponse.error || baseLeadsResponse.error;

    if (loadError) {
      return NextResponse.json({ error: loadError.message }, { status: 400 });
    }

    const contactsById = buildMap(contactsResponse.data || []);
    const numbersById = buildMap(numbersResponse.data || []);
    const leadsById = buildMap(leadsResponse.data || []);
    const baseLeadsById = buildMap(baseLeadsResponse.data || []);

    const enrichedConversations = (conversations || []).map((conversation: any) => ({
      ...conversation,
      contact: contactsById[conversation.contact_id] || null,
      number: numbersById[conversation.whatsapp_number_id] || null,
      lead: leadsById[conversation.lead_id] || null,
      base_lead: baseLeadsById[conversation.base_lead_id] || null
    }));

    let messages: any[] = [];

    if (conversationId) {
      const allowed = enrichedConversations.some((conversation: any) => conversation.id === conversationId);

      if (!allowed) {
        return NextResponse.json({ error: 'Conversa não encontrada nesta loja.' }, { status: 404 });
      }

      const { data: messageRows, error: messagesError } = await supabase
        .from('whatsapp_messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('sent_at', { ascending: true })
        .order('created_at', { ascending: true })
        .limit(250);

      if (messagesError) {
        return NextResponse.json({ error: messagesError.message }, { status: 400 });
      }

      messages = messageRows || [];

      await supabase
        .from('whatsapp_conversations')
        .update({ unread_count: 0, updated_at: new Date().toISOString() })
        .eq('id', conversationId)
        .eq('store_id', store.id);
    }

    return NextResponse.json({
      success: true,
      store,
      conversations: enrichedConversations,
      messages,
      selected_conversation_id: conversationId || null
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
