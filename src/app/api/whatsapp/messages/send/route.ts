import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

function cleanText(value: unknown) {
  return String(value || '').trim();
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

function canAccessConversation(profile: any, conversation: any) {
  if (!profile || !conversation) return false;
  if (profile.role === 'master') return true;
  return profile.store_id && profile.store_id === conversation.store_id;
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
      return NextResponse.json({ error: 'Usuário sem permissão para enviar WhatsApp.' }, { status: 403 });
    }

    const body = await request.json();
    const conversationId = cleanText(body.conversation_id);
    const messageBody = cleanText(body.body);

    if (!conversationId || !messageBody) {
      return NextResponse.json({ error: 'Informe a conversa e a mensagem.' }, { status: 400 });
    }

    const { data: conversation, error: conversationError } = await supabase
      .from('whatsapp_conversations')
      .select('*, whatsapp_contacts(*), whatsapp_numbers(*)')
      .eq('id', conversationId)
      .maybeSingle();

    if (conversationError) {
      return NextResponse.json({ error: conversationError.message }, { status: 400 });
    }

    if (!conversation || !canAccessConversation(profile, conversation)) {
      return NextResponse.json({ error: 'Conversa não encontrada ou sem permissão.' }, { status: 404 });
    }

    const number = conversation.whatsapp_numbers;
    const contact = conversation.whatsapp_contacts;

    if (!number?.access_token || !number?.phone_number_id) {
      return NextResponse.json({ error: 'Número WhatsApp sem token ou Phone Number ID.' }, { status: 400 });
    }

    const graphVersion = number.graph_version || 'v20.0';
    const response = await fetch(`https://graph.facebook.com/${graphVersion}/${number.phone_number_id}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${number.access_token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: contact.wa_id || contact.phone,
        type: 'text',
        text: {
          preview_url: false,
          body: messageBody
        }
      })
    });

    const result = await response.json();

    if (!response.ok) {
      return NextResponse.json(
        { error: result?.error?.message || 'Erro ao enviar mensagem pelo WhatsApp.', meta_error: result?.error || result },
        { status: 400 }
      );
    }

    const waMessageId = result?.messages?.[0]?.id || null;
    const sentAt = new Date().toISOString();

    const { data: savedMessage, error: saveError } = await supabase
      .from('whatsapp_messages')
      .insert({
        store_id: conversation.store_id,
        whatsapp_number_id: conversation.whatsapp_number_id,
        conversation_id: conversation.id,
        contact_id: conversation.contact_id,
        lead_id: conversation.lead_id,
        base_lead_id: conversation.base_lead_id,
        wa_message_id: waMessageId,
        direction: 'outbound',
        message_type: 'text',
        body: messageBody,
        status: 'sent',
        raw_payload: result,
        sent_at: sentAt
      })
      .select('*')
      .single();

    if (saveError) {
      return NextResponse.json({ error: saveError.message }, { status: 400 });
    }

    await supabase
      .from('whatsapp_conversations')
      .update({
        last_message: messageBody,
        last_message_at: sentAt,
        unread_count: 0,
        updated_at: sentAt
      })
      .eq('id', conversation.id);

    return NextResponse.json({
      success: true,
      message: savedMessage,
      meta: result
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Erro ao enviar mensagem WhatsApp.' },
      { status: 500 }
    );
  }
}
