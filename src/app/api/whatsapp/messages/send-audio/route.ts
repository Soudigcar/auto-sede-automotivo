import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { evolutionMultipartRequest } from '@/lib/server/evolution';
import { asStorePortalRole, canAccessStoreConversation } from '@/lib/server/storePortal';
import { markAutocarHumanActive } from '@/lib/server/autocar/safeRuntime';
import { readManagedEvolutionState } from '@/lib/server/managedWhatsappEvolution';
import { resolveEvolutionAvailability } from '@/lib/server/storeWhatsappChannel';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_AUDIO_BYTES = 4 * 1024 * 1024;
const ALLOWED_AUDIO_MIME_PREFIX = 'audio/';

function cleanText(value: unknown, maxLength = 20_000) {
  return String(value || '').trim().slice(0, maxLength);
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

function normalizePhone(value: unknown) {
  return String(value || '').split('@')[0].split(':')[0].replace(/\D/g, '');
}

function safeFilename(value: unknown, mime: string) {
  const fallback = mime.includes('ogg') ? 'audio-whatsapp.ogg' : mime.includes('mp4') ? 'audio-whatsapp.m4a' : 'audio-whatsapp.webm';
  return cleanText(value, 180).replace(/[\r\n]/g, '').replace(/[\\/]/g, '_') || fallback;
}

function evolutionMessageId(result: any) {
  return result?.key?.id || result?.message?.key?.id || result?.data?.key?.id || result?.data?.message?.key?.id || result?.id || null;
}

export async function POST(request: Request) {
  try {
    const supabase = getAdminClient();
    const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
    if (!token) return NextResponse.json({ error: 'Sessão não encontrada.' }, { status: 401 });

    const profile = await getProfile(supabase, token);
    const role = asStorePortalRole(profile?.role);
    if (!profile || !role) return NextResponse.json({ error: 'Usuário sem permissão para enviar áudio no WhatsApp.' }, { status: 403 });

    const form = await request.formData();
    const conversationId = cleanText(form.get('conversation_id'), 120);
    const fileValue = form.get('file');
    if (!conversationId || !(fileValue instanceof File)) return NextResponse.json({ error: 'Informe a conversa e o áudio.' }, { status: 400 });
    if (!fileValue.size) return NextResponse.json({ error: 'O áudio gravado está vazio.' }, { status: 400 });
    if (fileValue.size > MAX_AUDIO_BYTES) return NextResponse.json({ error: 'O áudio excede o limite seguro de 4 MB.' }, { status: 413 });

    const mime = cleanText(fileValue.type, 160).toLowerCase();
    if (!mime.startsWith(ALLOWED_AUDIO_MIME_PREFIX)) return NextResponse.json({ error: 'O arquivo recebido não é um áudio válido.' }, { status: 415 });

    const { data: conversation, error: conversationError } = await supabase
      .from('whatsapp_conversations')
      .select('*')
      .eq('id', conversationId)
      .maybeSingle();
    if (conversationError) return NextResponse.json({ error: conversationError.message }, { status: 400 });

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

    if (!conversation || !canAccessStoreConversation(profile, role, conversation, lead)) {
      return NextResponse.json({ error: 'Conversa não encontrada ou sem permissão.' }, { status: 404 });
    }

    const [contactResponse, integrationResponse] = await Promise.all([
      supabase.from('whatsapp_contacts').select('id, phone, wa_id').eq('id', conversation.contact_id).maybeSingle(),
      supabase.from('store_whatsapp_integrations').select('instance_name, status, scope, provider').eq('crm_number_id', conversation.whatsapp_number_id).maybeSingle()
    ]);
    const relationError = contactResponse.error || integrationResponse.error;
    if (relationError) return NextResponse.json({ error: relationError.message }, { status: 400 });

    const contact = contactResponse.data;
    const integration = integrationResponse.data;
    if (!contact) return NextResponse.json({ error: 'Contato da conversa não encontrado.' }, { status: 404 });
    if (!integration || integration.provider !== 'evolution' || !integration.instance_name) {
      return NextResponse.json({ error: 'A gravação de voz está disponível para conversas conectadas pela Evolution.' }, { status: 409 });
    }

    const liveState = await readManagedEvolutionState(integration);
    const availability = resolveEvolutionAvailability(integration, liveState);
    if (!availability.connected) {
      const owner = integration.scope === 'master' ? 'central do Master' : 'da loja';
      return NextResponse.json({
        error: `WhatsApp ${owner} não está conectado neste momento. Aguarde a reconexão ou avise o Gestor.`,
        channel_status: availability.status
      }, { status: 409 });
    }

    const recipient = normalizePhone(contact.phone || contact.wa_id);
    if (!recipient) return NextResponse.json({ error: 'Contato sem telefone válido para envio.' }, { status: 400 });

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
          return NextResponse.json({ error: 'Não foi possível confirmar o atendimento humano antes do envio do áudio.' }, { status: 409 });
        }
      } catch (error: any) {
        return NextResponse.json({
          error: 'Não foi possível assumir a conversa com segurança antes do envio do áudio.',
          detail: String(error?.message || error || '').slice(0, 300)
        }, { status: 500 });
      }
    }

    const filename = safeFilename(fileValue.name, mime);
    const evolutionForm = new FormData();
    evolutionForm.set('number', recipient);
    evolutionForm.set('delay', '500');
    evolutionForm.set('encoding', 'true');
    evolutionForm.set('file', fileValue, filename);

    const result = await evolutionMultipartRequest(
      `/message/sendWhatsAppAudio/${encodeURIComponent(integration.instance_name)}`,
      evolutionForm
    );
    const waMessageId = evolutionMessageId(result);
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
      message_type: 'audio',
      body: '[Áudio]',
      status: 'sent',
      raw_payload: {
        ...(result && typeof result === 'object' ? result : { provider_result: result }),
        voice_note: true,
        source_mimetype: mime,
        metric_sender_type: 'human',
        metric_sender_user_id: profile.id,
        metric_sender_role: profile.role,
        metric_sender_source: 'crm'
      },
      sent_at: sentAt
    }).select('*').single();

    if (saveError) {
      if (waMessageId) {
        const { data: existing } = await supabase.from('whatsapp_messages').select('*').eq('wa_message_id', waMessageId).maybeSingle();
        if (existing) return NextResponse.json({ success: true, message: existing, provider: 'evolution', voice_note: true });
      }
      return NextResponse.json({ error: saveError.message }, { status: 400 });
    }

    await supabase.from('whatsapp_conversations').update({
      last_message: '[Áudio]',
      last_message_at: sentAt,
      unread_count: 0,
      updated_at: sentAt
    }).eq('id', conversation.id);

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
        console.warn('[AUTOCAR human takeover] Áudio enviado, mas não foi possível vincular a mensagem ao handoff.', {
          storeId: conversation.store_id,
          conversationId: conversation.id,
          error: error?.message || String(error)
        });
      }
    }

    return NextResponse.json({ success: true, message: savedMessage, provider: 'evolution', voice_note: true });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Erro ao enviar áudio pelo WhatsApp.' }, { status: 500 });
  }
}
