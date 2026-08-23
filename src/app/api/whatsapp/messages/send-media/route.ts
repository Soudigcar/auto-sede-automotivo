import { after, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendEvolutionMedia } from '@/lib/server/evolutionMedia';
import { asStorePortalRole, canAccessStoreLead } from '@/lib/server/storePortal';
import { markAutocarHumanActive } from '@/lib/server/autocar/safeRuntime';

export const runtime = 'nodejs';

function cleanText(value: unknown) {
  return String(value || '').trim();
}

function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!supabaseUrl || !serviceKey) throw new Error('Supabase Service Role não configurada no servidor.');
  return createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function getProfile(supabase: any, token: string) {
  const { data: authData, error: authError } = await supabase.auth.getUser(token);
  if (authError || !authData.user) return null;
  const { data: byAuth } = await supabase.from('users').select('*').eq('auth_user_id', authData.user.id).maybeSingle();
  if (byAuth?.status === 'active' && asStorePortalRole(byAuth.role)) return byAuth;
  if (authData.user.email) {
    const { data: byEmail } = await supabase.from('users').select('*').ilike('email', authData.user.email).maybeSingle();
    if (byEmail?.status === 'active' && asStorePortalRole(byEmail.role)) return byEmail;
  }
  return null;
}

function canAccessConversation(profile: any, conversation: any, lead: any) {
  const role = asStorePortalRole(profile?.role);
  if (!role || !profile || !conversation) return false;
  if (role === 'master') return true;
  if (!profile.store_id || profile.store_id !== conversation.store_id) return false;
  if (role === 'store') return true;
  if (!lead || conversation.lead_id !== lead.id) return false;
  return canAccessStoreLead(profile, role, lead);
}

function normalizePhone(value: unknown) {
  return String(value || '').split('@')[0].split(':')[0].replace(/\D/g, '');
}

function safeMediaUrls(value: unknown) {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map((item) => cleanText(item)).filter((url) => /^https:\/\//i.test(url)))).slice(0, 10);
}

export async function POST(request: Request) {
  try {
    const supabase = getAdminClient();
    const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
    if (!token) return NextResponse.json({ error: 'Sessão não encontrada.' }, { status: 401 });

    const profile = await getProfile(supabase, token);
    if (!profile) return NextResponse.json({ error: 'Usuário sem permissão para enviar WhatsApp.' }, { status: 403 });

    const body = await request.json();
    const conversationId = cleanText(body.conversation_id);
    const caption = cleanText(body.caption).slice(0, 500);
    const mediaUrls = safeMediaUrls(body.media_urls);
    if (!conversationId || !mediaUrls.length) return NextResponse.json({ error: 'Informe a conversa e ao menos uma foto válida.' }, { status: 400 });

    const { data: conversation, error: conversationError } = await supabase.from('whatsapp_conversations').select('*').eq('id', conversationId).maybeSingle();
    if (conversationError) throw conversationError;

    let lead: any = null;
    if (conversation?.lead_id) {
      const { data, error } = await supabase.from('leads').select('id, assigned_store_id, assigned_user_id').eq('id', conversation.lead_id).maybeSingle();
      if (error) throw error;
      lead = data;
    }

    if (!conversation || !canAccessConversation(profile, conversation, lead)) return NextResponse.json({ error: 'Conversa não encontrada ou sem permissão.' }, { status: 404 });

    const [numberResponse, contactResponse, integrationResponse] = await Promise.all([
      supabase.from('whatsapp_numbers').select('*').eq('id', conversation.whatsapp_number_id).maybeSingle(),
      supabase.from('whatsapp_contacts').select('*').eq('id', conversation.contact_id).maybeSingle(),
      supabase.from('store_whatsapp_integrations').select('instance_name,status,scope').eq('crm_number_id', conversation.whatsapp_number_id).maybeSingle()
    ]);
    const relationError = numberResponse.error || contactResponse.error || integrationResponse.error;
    if (relationError) throw relationError;

    const number = numberResponse.data;
    const contact = contactResponse.data;
    const integration = integrationResponse.data;
    if (!number || !contact) return NextResponse.json({ error: 'Número ou contato da conversa não foi encontrado.' }, { status: 404 });

    const configuredProvider = String(number?.settings?.provider || '').trim().toLowerCase();
    const provider = integration || configuredProvider === 'evolution' || String(number.phone_number_id || '').startsWith('evolution:') ? 'evolution' : 'meta_cloud';
    const recipient = normalizePhone(contact?.phone || contact?.wa_id);
    if (!recipient) return NextResponse.json({ error: 'Contato sem telefone válido para envio.' }, { status: 400 });
    if (provider === 'evolution' && (!integration || integration.status !== 'connected' || !integration.instance_name)) return NextResponse.json({ error: 'WhatsApp da loja está desconectado. Reconecte em Integrações.' }, { status: 409 });

    const sentAt = new Date().toISOString();
    const saved: any[] = [];

    for (let index = 0; index < mediaUrls.length; index += 1) {
      const mediaUrl = mediaUrls[index];
      const imageCaption = index === 0 ? caption : '';
      let result: any;
      let waMessageId: string | null = null;

      if (provider === 'evolution') {
        const instanceName = String(integration?.instance_name || '').trim();
        if (!instanceName) throw new Error('Instância Evolution não encontrada para esta conversa.');
        result = await sendEvolutionMedia(instanceName, recipient, mediaUrl, imageCaption);
        waMessageId = result?.key?.id || result?.message?.key?.id || result?.id || null;
      } else {
        if (!number?.access_token || !number?.phone_number_id) return NextResponse.json({ error: 'Número WhatsApp sem token ou Phone Number ID.' }, { status: 400 });
        const graphVersion = number.graph_version || 'v20.0';
        const response = await fetch(`https://graph.facebook.com/${graphVersion}/${number.phone_number_id}/messages`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${number.access_token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', to: contact.wa_id || contact.phone, type: 'image', image: { link: mediaUrl, ...(imageCaption ? { caption: imageCaption } : {}) } })
        });
        result = await response.json();
        if (!response.ok) throw new Error(result?.error?.message || 'Erro ao enviar imagem pelo WhatsApp.');
        waMessageId = result?.messages?.[0]?.id || null;
      }

      const { data: savedMessage, error: saveError } = await supabase.from('whatsapp_messages').insert({
        store_id: conversation.store_id,
        whatsapp_number_id: conversation.whatsapp_number_id,
        conversation_id: conversation.id,
        contact_id: conversation.contact_id,
        lead_id: conversation.lead_id,
        base_lead_id: conversation.base_lead_id,
        wa_message_id: waMessageId,
        direction: 'outbound',
        message_type: 'image',
        body: imageCaption || '[Imagem]',
        media_url: mediaUrl,
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
      if (saveError) throw saveError;
      saved.push(savedMessage);
    }

    await supabase.from('whatsapp_conversations').update({ last_message: `[${mediaUrls.length} foto${mediaUrls.length > 1 ? 's' : ''}] ${caption}`.trim(), last_message_at: sentAt, unread_count: 0, updated_at: sentAt }).eq('id', conversation.id);

    if (conversation.store_id && saved.length) {
      after(async () => {
        try {
          await markAutocarHumanActive({
            productionSupabase: supabase,
            storeId: conversation.store_id,
            conversationId: conversation.id,
            whatsappNumberId: conversation.whatsapp_number_id,
            leadId: conversation.lead_id || null,
            messageId: saved[saved.length - 1]?.id || null,
            profileId: profile.id || null,
            source: 'inbox'
          });
        } catch (error: any) {
          console.warn('[AUTOCAR human takeover] Falha best effort após envio humano de mídia.', {
            storeId: conversation.store_id,
            conversationId: conversation.id,
            error: error?.message || String(error)
          });
        }
      });
    }

    return NextResponse.json({ success: true, sent_count: saved.length, messages: saved, provider });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Erro ao enviar fotos pelo WhatsApp.' }, { status: 500 });
  }
}
