import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendEvolutionText } from '@/lib/server/evolution';
import { asStorePortalRole, canAccessStoreConversation } from '@/lib/server/storePortal';
import { markAutocarHumanActive } from '@/lib/server/autocar/safeRuntime';
import { readManagedEvolutionState } from '@/lib/server/managedWhatsappEvolution';
import { resolveEvolutionAvailability } from '@/lib/server/storeWhatsappChannel';

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
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

async function getProfile(supabase: any, token: string) {
  const { data: authData, error: authError } = await supabase.auth.getUser(token);
  if (authError || !authData.user) return null;

  let profile: any = null;
  const { data: byAuth } = await supabase.from('users').select('*').eq('auth_user_id', authData.user.id).maybeSingle();
  profile = byAuth;

  if (!profile && authData.user.email) {
    const { data: byEmail } = await supabase.from('users').select('*').ilike('email', authData.user.email).maybeSingle();
    profile = byEmail;
  }

  if (!profile || profile.status !== 'active' || !asStorePortalRole(profile.role)) return null;
  return profile;
}

function canAccessConversation(profile: any, conversation: any, lead: any) {
  const role = asStorePortalRole(profile?.role);
  if (!role) return false;
  return canAccessStoreConversation(profile, role, conversation, lead);
}

function normalizePhone(value: unknown) {
  return String(value || '').split('@')[0].split(':')[0].replace(/\D/g, '');
}

export async function POST(request: Request) {
  try {
    const supabase = getAdminClient();
    const authorization = request.headers.get('authorization') || '';
    const token = authorization.replace(/^Bearer\s+/i, '').trim();
    if (!token) return NextResponse.json({ error: 'Sessão não encontrada.' }, { status: 401 });

    const profile = await getProfile(supabase, token);
    if (!profile) return NextResponse.json({ error: 'Usuário sem permissão para enviar WhatsApp.' }, { status: 403 });

    const body = await request.json();
    const conversationId = cleanText(body.conversation_id);
    const messageBody = cleanText(body.body);
    if (!conversationId || !messageBody) return NextResponse.json({ error: 'Informe a conversa e a mensagem.' }, { status: 400 });

    const { data: conversation, error: conversationError } = await supabase.from('whatsapp_conversations').select('*').eq('id', conversationId).maybeSingle();
    if (conversationError) return NextResponse.json({ error: conversationError.message }, { status: 400 });

    let lead: any = null;
    if (conversation?.lead_id) {
      const { data, error } = await supabase.from('leads').select('id, assigned_store_id, assigned_user_id').eq('id', conversation.lead_id).maybeSingle();
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      lead = data;
    }

    if (!conversation || !canAccessConversation(profile, conversation, lead)) {
      return NextResponse.json({ error: 'Conversa não encontrada ou sem permissão.' }, { status: 404 });
    }

    const [numberResponse, contactResponse, integrationResponse] = await Promise.all([
      supabase.from('whatsapp_numbers').select('*').eq('id', conversation.whatsapp_number_id).maybeSingle(),
      supabase.from('whatsapp_contacts').select('*').eq('id', conversation.contact_id).maybeSingle(),
      supabase.from('store_whatsapp_integrations').select('instance_name, status, scope').eq('crm_number_id', conversation.whatsapp_number_id).maybeSingle()
    ]);

    const relationError = numberResponse.error || contactResponse.error || integrationResponse.error;
    if (relationError) return NextResponse.json({ error: relationError.message }, { status: 400 });

    const number = numberResponse.data;
    const contact = contactResponse.data;
    const integration = integrationResponse.data;
    if (!number || !contact) return NextResponse.json({ error: 'Número ou contato da conversa não foi encontrado.' }, { status: 404 });

    const configuredProvider = String(number?.settings?.provider || '').trim().toLowerCase();
    const provider = integration || configuredProvider === 'evolution' || String(number.phone_number_id || '').startsWith('evolution:') ? 'evolution' : 'meta_cloud';
    let result: any = null;
    let waMessageId: string | null = null;

    if (provider === 'evolution') {
      const liveState = integration ? await readManagedEvolutionState(integration) : null;
      const availability = resolveEvolutionAvailability(integration, liveState);
      if (!availability.connected) {
        const owner = integration?.scope === 'master' ? 'central da Master' : 'da loja';
        return NextResponse.json({
          error: `WhatsApp ${owner} não está conectado neste momento. Aguarde a reconexão ou avise o Gestor.`,
          channel_status: availability.status
        }, { status: 409 });
      }
      const recipient = normalizePhone(contact?.phone || contact?.wa_id);
      if (!recipient) return NextResponse.json({ error: 'Contato sem telefone válido para envio.' }, { status: 400 });
    } else if (!number?.access_token || !number?.phone_number_id) {
      return NextResponse.json({ error: 'Número WhatsApp sem token ou Phone Number ID.' }, { status: 400 });
    }

    if (conversation.store_id) {
      try {
        const takeover = await markAutocarHumanActive({
          productionSupabase: supabase,
          storeId: conversation.store_id,
          conversationId: conversation.id,
          whatsappNumberId: conversation.whatsapp_number_id,
          leadId: conversation.lead_id || null,
          messageId: null,
          profileId: profile.id || null,
          source: 'inbox'
        });
        if (takeover?.human_state !== 'human_active') {
          return NextResponse.json({ error: 'Não foi possível confirmar o atendimento humano antes do envio.' }, { status: 409 });
        }
      } catch (error: any) {
        return NextResponse.json({
          error: 'Não foi possível assumir a conversa com segurança antes do envio.',
          detail: String(error?.message || error || '').slice(0, 300)
        }, { status: 500 });
      }
    }

    if (provider === 'evolution') {
      const recipient = normalizePhone(contact?.phone || contact?.wa_id);
      result = await sendEvolutionText(integration!.instance_name, recipient, messageBody);
      waMessageId = result?.key?.id || result?.message?.key?.id || result?.id || null;
    } else {
      const graphVersion = number.graph_version || 'v20.0';
      const response = await fetch(`https://graph.facebook.com/${graphVersion}/${number.phone_number_id}/messages`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${number.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', to: contact.wa_id || contact.phone, type: 'text', text: { preview_url: false, body: messageBody } })
      });
      result = await response.json();
      if (!response.ok) return NextResponse.json({ error: result?.error?.message || 'Erro ao enviar mensagem pelo WhatsApp.', meta_error: result?.error || result }, { status: 400 });
      waMessageId = result?.messages?.[0]?.id || null;
    }

    const sentAt = new Date().toISOString();
    const { data: savedMessage, error: saveError } = await supabase.from('whatsapp_messages').insert({
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
      raw_payload: {
        ...(result && typeof result === 'object' ? result : { provider_result: result }),
        metric_sender_type: 'human',
        metric_sender_user_id: profile.id,
        metric_sender_role: profile.role,
        metric_sender_source: 'crm'
      },
      sent_at: sentAt
    }).select('*').single();
    if (saveError) return NextResponse.json({ error: saveError.message }, { status: 400 });

    await supabase.from('whatsapp_conversations').update({ last_message: messageBody, last_message_at: sentAt, unread_count: 0, updated_at: sentAt }).eq('id', conversation.id);

    if (conversation.store_id) {
      try {
        await markAutocarHumanActive({
          productionSupabase: supabase,
          storeId: conversation.store_id,
          conversationId: conversation.id,
          whatsappNumberId: conversation.whatsapp_number_id,
          leadId: conversation.lead_id || null,
          messageId: savedMessage.id,
          profileId: profile.id || null,
          source: 'inbox'
        });
      } catch (error: any) {
        console.warn('[AUTOCAR human takeover] Atendimento humano já confirmado, mas não foi possível vincular a mensagem enviada.', {
          storeId: conversation.store_id,
          conversationId: conversation.id,
          error: error?.message || String(error)
        });
      }
    }

    return NextResponse.json({ success: true, message: savedMessage, provider, meta: result });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Erro ao enviar mensagem WhatsApp.' }, { status: 500 });
  }
}
