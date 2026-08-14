import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { evolutionRequest } from '@/lib/server/evolution';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SUPPORTED_MEDIA_TYPES = new Set(['image', 'video', 'audio', 'document']);

function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!supabaseUrl || !serviceKey) throw new Error('Supabase Service Role não configurada no servidor.');
  return createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false }
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

function mediaPayload(rawPayload: any, messageType: string) {
  const message = rawPayload?.message || {};
  if (messageType === 'image') return message.imageMessage || null;
  if (messageType === 'video') return message.videoMessage || null;
  if (messageType === 'audio') return message.audioMessage || null;
  if (messageType === 'document') return message.documentMessage || null;
  return null;
}

function fallbackMime(messageType: string) {
  if (messageType === 'image') return 'image/jpeg';
  if (messageType === 'video') return 'video/mp4';
  if (messageType === 'audio') return 'audio/ogg';
  return 'application/octet-stream';
}

function sanitizeFilename(value: unknown) {
  return String(value || 'arquivo')
    .replace(/[\r\n"]/g, '')
    .replace(/[^a-zA-Z0-9._()\- à-úÀ-Ú]/g, '_')
    .slice(0, 180) || 'arquivo';
}

function resolveBase64(result: any) {
  const candidate = result?.base64 || result?.data?.base64 || result?.media || result?.data || '';
  if (typeof candidate !== 'string') return '';
  const marker = ';base64,';
  const markerIndex = candidate.indexOf(marker);
  return markerIndex >= 0 ? candidate.slice(markerIndex + marker.length) : candidate;
}

export async function GET(request: Request) {
  try {
    const supabase = getAdminClient();
    const url = new URL(request.url);
    const messageId = String(url.searchParams.get('message_id') || '').trim();
    const download = url.searchParams.get('download') === '1';
    const authorization = request.headers.get('authorization') || '';
    const token = authorization.replace(/^Bearer\s+/i, '').trim();

    if (!token) return NextResponse.json({ error: 'Sessão não encontrada.' }, { status: 401 });
    if (!messageId) return NextResponse.json({ error: 'Informe a mensagem.' }, { status: 400 });

    const profile = await getProfile(supabase, token);
    if (!profile) return NextResponse.json({ error: 'Usuário sem permissão para acessar mídia do WhatsApp.' }, { status: 403 });

    const { data: message, error: messageError } = await supabase
      .from('whatsapp_messages')
      .select('id, store_id, whatsapp_number_id, message_type, body, media_url, raw_payload')
      .eq('id', messageId)
      .maybeSingle();

    if (messageError) return NextResponse.json({ error: messageError.message }, { status: 400 });
    if (!message) return NextResponse.json({ error: 'Mensagem não encontrada.' }, { status: 404 });
    if (profile.role !== 'master' && (!profile.store_id || profile.store_id !== message.store_id)) {
      return NextResponse.json({ error: 'Mensagem não encontrada ou sem permissão.' }, { status: 404 });
    }

    const messageType = String(message.message_type || '').toLowerCase();
    if (!SUPPORTED_MEDIA_TYPES.has(messageType)) {
      return NextResponse.json({ error: 'Esta mensagem não possui mídia compatível.' }, { status: 415 });
    }

    const { data: integration, error: integrationError } = await supabase
      .from('store_whatsapp_integrations')
      .select('instance_name, status, provider')
      .eq('crm_number_id', message.whatsapp_number_id)
      .maybeSingle();

    if (integrationError) return NextResponse.json({ error: integrationError.message }, { status: 400 });
    if (!integration?.instance_name || integration.provider !== 'evolution') {
      return NextResponse.json({ error: 'Mídia disponível apenas para conversas Evolution nesta etapa.' }, { status: 409 });
    }
    if (integration.status !== 'connected') {
      return NextResponse.json({ error: 'WhatsApp está desconectado. Reconecte para recuperar esta mídia.' }, { status: 409 });
    }
    if (!message.raw_payload) {
      return NextResponse.json({ error: 'Payload original da mídia não está disponível.' }, { status: 404 });
    }

    const result = await evolutionRequest(`/chat/getBase64FromMediaMessage/${encodeURIComponent(integration.instance_name)}`, {
      method: 'POST',
      body: {
        message: message.raw_payload,
        convertToMp4: messageType === 'video'
      }
    });

    const base64 = resolveBase64(result);
    if (!base64) return NextResponse.json({ error: 'A Evolution não retornou o conteúdo desta mídia.' }, { status: 502 });

    const source = mediaPayload(message.raw_payload, messageType) || {};
    const mime = String(result?.mimetype || result?.data?.mimetype || source?.mimetype || fallbackMime(messageType));
    const filename = sanitizeFilename(source?.fileName || source?.title || (messageType === 'document' ? message.body : `${messageType}-${message.id}`));
    const buffer = Buffer.from(base64, 'base64');

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': mime,
        'Content-Length': String(buffer.byteLength),
        'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${filename}"`,
        'Cache-Control': 'private, max-age=300'
      }
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Erro ao recuperar mídia do WhatsApp.' }, { status: 500 });
  }
}
