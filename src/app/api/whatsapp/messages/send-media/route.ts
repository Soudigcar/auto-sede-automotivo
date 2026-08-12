import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { evolutionMultipartRequest } from '@/lib/server/evolution';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_MEDIA_BYTES = 4 * 1024 * 1024;
const BLOCKED_EXTENSIONS = [
  '.exe', '.msi', '.bat', '.cmd', '.com', '.scr', '.ps1', '.sh', '.apk', '.dmg', '.pkg'
];

function cleanText(value: unknown, maxLength = 20_000) {
  return String(value || '').trim().slice(0, maxLength);
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

  const { data: byAuth } = await supabase
    .from('users')
    .select('id, auth_user_id, email, role, store_id, status')
    .eq('auth_user_id', authData.user.id)
    .maybeSingle();

  if (byAuth?.status === 'active') return byAuth;

  if (authData.user.email) {
    const { data: byEmail } = await supabase
      .from('users')
      .select('id, auth_user_id, email, role, store_id, status')
      .ilike('email', authData.user.email)
      .maybeSingle();

    if (byEmail?.status === 'active') return byEmail;
  }

  return null;
}

function canAccessConversation(profile: any, conversation: any) {
  if (!profile || !conversation) return false;
  if (profile.role === 'master') return true;
  return Boolean(profile.store_id && profile.store_id === conversation.store_id);
}

function normalizePhone(value: unknown) {
  return String(value || '').split('@')[0].split(':')[0].replace(/\D/g, '');
}

function mediaTypeFor(file: File) {
  const mime = String(file.type || '').toLowerCase();
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  return 'document';
}

function fallbackMime(mediaType: string) {
  if (mediaType === 'image') return 'image/jpeg';
  if (mediaType === 'video') return 'video/mp4';
  if (mediaType === 'audio') return 'audio/mpeg';
  return 'application/octet-stream';
}

function safeFilename(value: unknown) {
  return cleanText(value, 180)
    .replace(/[\r\n]/g, '')
    .replace(/[\\/]/g, '_') || 'arquivo';
}

function isBlockedFilename(filename: string) {
  const normalized = filename.toLowerCase();
  return BLOCKED_EXTENSIONS.some((extension) => normalized.endsWith(extension));
}

function previewLabel(mediaType: string, filename: string, caption: string) {
  if (mediaType === 'image') return caption || '[Imagem]';
  if (mediaType === 'video') return caption || '[Vídeo]';
  if (mediaType === 'audio') return '[Áudio]';
  return caption || filename || '[Documento]';
}

function evolutionMessageId(result: any) {
  return result?.key?.id
    || result?.message?.key?.id
    || result?.data?.key?.id
    || result?.data?.message?.key?.id
    || result?.id
    || null;
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
      return NextResponse.json({ error: 'Usuário sem permissão para enviar mídia no WhatsApp.' }, { status: 403 });
    }

    const form = await request.formData();
    const conversationId = cleanText(form.get('conversation_id'), 120);
    const caption = cleanText(form.get('caption'), 2_000);
    const fileValue = form.get('file');

    if (!conversationId || !(fileValue instanceof File)) {
      return NextResponse.json({ error: 'Informe a conversa e o arquivo.' }, { status: 400 });
    }

    if (!fileValue.size) {
      return NextResponse.json({ error: 'O arquivo selecionado está vazio.' }, { status: 400 });
    }

    if (fileValue.size > MAX_MEDIA_BYTES) {
      return NextResponse.json({ error: 'O anexo excede o limite de 4 MB desta etapa.' }, { status: 413 });
    }

    const filename = safeFilename(fileValue.name);
    if (isBlockedFilename(filename)) {
      return NextResponse.json({ error: 'Este tipo de arquivo não é permitido no Inbox.' }, { status: 415 });
    }

    const { data: conversation, error: conversationError } = await supabase
      .from('whatsapp_conversations')
      .select('*')
      .eq('id', conversationId)
      .maybeSingle();

    if (conversationError) {
      return NextResponse.json({ error: conversationError.message }, { status: 400 });
    }

    if (!conversation || !canAccessConversation(profile, conversation)) {
      return NextResponse.json({ error: 'Conversa não encontrada ou sem permissão.' }, { status: 404 });
    }

    const [contactResponse, integrationResponse] = await Promise.all([
      supabase
        .from('whatsapp_contacts')
        .select('id, phone, wa_id')
        .eq('id', conversation.contact_id)
        .maybeSingle(),
      supabase
        .from('store_whatsapp_integrations')
        .select('instance_name, status, scope, provider')
        .eq('crm_number_id', conversation.whatsapp_number_id)
        .maybeSingle()
    ]);

    const relationError = contactResponse.error || integrationResponse.error;
    if (relationError) {
      return NextResponse.json({ error: relationError.message }, { status: 400 });
    }

    const contact = contactResponse.data;
    const integration = integrationResponse.data;

    if (!contact) {
      return NextResponse.json({ error: 'Contato da conversa não encontrado.' }, { status: 404 });
    }

    if (!integration || integration.provider !== 'evolution') {
      return NextResponse.json({ error: 'Envio de anexos está disponível para conversas Evolution nesta etapa.' }, { status: 409 });
    }

    if (integration.status !== 'connected') {
      const owner = integration.scope === 'master' ? 'central da Master' : 'da loja';
      return NextResponse.json({ error: `WhatsApp ${owner} está desconectado. Reconecte em Integrações.` }, { status: 409 });
    }

    const recipient = normalizePhone(contact.phone || contact.wa_id);
    if (!recipient) {
      return NextResponse.json({ error: 'Contato sem telefone válido para envio.' }, { status: 400 });
    }

    const mediaType = mediaTypeFor(fileValue);
    const mime = cleanText(fileValue.type, 160) || fallbackMime(mediaType);
    const evolutionForm = new FormData();
    evolutionForm.set('number', recipient);
    evolutionForm.set('mediatype', mediaType);
    evolutionForm.set('mimetype', mime);
    evolutionForm.set('delay', '500');
    if (caption && mediaType !== 'audio') evolutionForm.set('caption', caption);
    if (mediaType === 'document') evolutionForm.set('fileName', filename);
    evolutionForm.set('file', fileValue, filename);

    const result = await evolutionMultipartRequest(
      `/message/sendMedia/${encodeURIComponent(integration.instance_name)}`,
      evolutionForm
    );

    const waMessageId = evolutionMessageId(result);
    const sentAt = new Date().toISOString();
    const body = previewLabel(mediaType, filename, caption);

    let savedMessage: any = null;
    const { data: inserted, error: saveError } = await supabase
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
        message_type: mediaType,
        body,
        status: 'sent',
        raw_payload: result,
        sent_at: sentAt
      })
      .select('*')
      .single();

    if (saveError) {
      if (waMessageId) {
        const { data: existing } = await supabase
          .from('whatsapp_messages')
          .select('*')
          .eq('wa_message_id', waMessageId)
          .maybeSingle();
        savedMessage = existing || null;
      }

      if (!savedMessage) {
        return NextResponse.json({ error: saveError.message }, { status: 400 });
      }
    } else {
      savedMessage = inserted;
    }

    await supabase
      .from('whatsapp_conversations')
      .update({
        last_message: body,
        last_message_at: sentAt,
        unread_count: 0,
        updated_at: sentAt
      })
      .eq('id', conversation.id);

    return NextResponse.json({
      success: true,
      message: savedMessage,
      provider: 'evolution',
      media_type: mediaType
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Erro ao enviar mídia pelo WhatsApp.' },
      { status: 500 }
    );
  }
}
