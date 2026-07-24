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

    const [{ data: conversations, error: conversationsError }, { data: stores, error: storesError }, { data: numbers, error: numbersError }] = await Promise.all([
      supabase
        .from('whatsapp_conversations')
        .select('*')
        .order('last_message_at', { ascending: false })
        .limit(300),
      supabase
        .from('stores')
        .select('id, store_name, slug, status')
        .order('store_name', { ascending: true }),
      supabase
        .from('whatsapp_numbers')
        .select('id, label, phone_number, phone_number_id, status, is_active, store_id')
        .neq('status', 'archived')
        .order('label', { ascending: true })
    ]);

    if (conversationsError) {
      return NextResponse.json({ error: conversationsError.message }, { status: 400 });
    }

    if (storesError) {
      return NextResponse.json({ error: storesError.message }, { status: 400 });
    }

    if (numbersError) {
      return NextResponse.json({ error: numbersError.message }, { status: 400 });
    }

    const contactIds = unique((conversations || []).map((item: any) => item.contact_id));
    const numberIds = unique((conversations || []).map((item: any) => item.whatsapp_number_id));
    const leadIds = unique((conversations || []).map((item: any) => item.lead_id));
    const baseLeadIds = unique((conversations || []).map((item: any) => item.base_lead_id));

    const [contactsResponse, numberRowsResponse, leadsResponse, baseLeadsResponse] = await Promise.all([
      contactIds.length
        ? supabase.from('whatsapp_contacts').select('*').in('id', contactIds)
        : Promise.resolve({ data: [], error: null }),
      numberIds.length
        ? supabase.from('whatsapp_numbers').select('id, label, phone_number, phone_number_id, status, is_active, store_id').in('id', numberIds)
        : Promise.resolve({ data: [], error: null }),
      leadIds.length
        ? supabase.from('leads').select('id, customer_name, customer_phone, status, interested_vehicle, origin, scheduled_at, assigned_store_id, created_at').in('id', leadIds)
        : Promise.resolve({ data: [], error: null }),
      baseLeadIds.length
        ? supabase.from('leads_base').select('id, name, phone, status, source, campaign_name, assigned_store_id, assigned_store_name, routed_lead_id, created_at').in('id', baseLeadIds)
        : Promise.resolve({ data: [], error: null })
    ]);

    const loadError = contactsResponse.error || numberRowsResponse.error || leadsResponse.error || baseLeadsResponse.error;

    if (loadError) {
      return NextResponse.json({ error: loadError.message }, { status: 400 });
    }

    const contactsById = buildMap(contactsResponse.data || []);
    const numbersById = buildMap(numberRowsResponse.data || []);
    const leadsById = buildMap(leadsResponse.data || []);
    const baseLeadsById = buildMap(baseLeadsResponse.data || []);
    const storesById = buildMap(stores || []);

    const enrichedConversations = (conversations || []).map((conversation: any) => {
      const contact = contactsById[conversation.contact_id] || null;
      const number = numbersById[conversation.whatsapp_number_id] || null;
      const lead = leadsById[conversation.lead_id] || null;
      const baseLead = baseLeadsById[conversation.base_lead_id] || null;
      const storeId = conversation.store_id || lead?.assigned_store_id || baseLead?.assigned_store_id || number?.store_id || null;

      return {
        ...conversation,
        contact,
        number,
        lead,
        base_lead: baseLead,
        store: storeId ? storesById[storeId] || null : null
      };
    });

    let messages: any[] = [];

    if (conversationId) {
      const allowed = enrichedConversations.some((conversation: any) => conversation.id === conversationId);

      if (!allowed) {
        return NextResponse.json({ error: 'Conversa não encontrada.' }, { status: 404 });
      }

      const { data: messageRows, error: messagesError } = await supabase
        .from('whatsapp_messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true })
        .limit(300);

      if (messagesError) {
        return NextResponse.json({ error: messagesError.message }, { status: 400 });
      }

      messages = messageRows || [];
    }

    return NextResponse.json({
      success: true,
      conversations: enrichedConversations,
      messages,
      selected_conversation_id: conversationId || null,
      stores: stores || [],
      numbers: numbers || []
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

    if (!conversationId) {
      return NextResponse.json({ error: 'Informe a conversa.' }, { status: 400 });
    }

    if (action === 'mark-read') {
      const { error } = await supabase
        .from('whatsapp_conversations')
        .update({ unread_count: 0, updated_at: new Date().toISOString() })
        .eq('id', conversationId);

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
