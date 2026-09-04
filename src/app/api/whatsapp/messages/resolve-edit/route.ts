import { NextResponse } from 'next/server';
import { asStorePortalRole, canAccessStoreConversation } from '@/lib/server/storePortal';
import { decryptEvolutionMessageEdit, evolutionMessageEditFallback, evolutionSecretMessageEditTarget } from '@/lib/server/evolutionSecretMessageEdit';
import { createAdminClient, getProfileFromToken, readBearerToken } from '@/lib/server/storeTeam';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function response(payload: unknown, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: { 'Cache-Control': 'private, no-store, max-age=0' }
  });
}

export async function GET(request: Request) {
  try {
    const token = readBearerToken(request);
    if (!token) return response({ error: 'Sessão não encontrada.' }, 401);

    const messageId = String(new URL(request.url).searchParams.get('message_id') || '').trim();
    if (!messageId) return response({ error: 'Informe a mensagem.' }, 400);

    const supabase = createAdminClient();
    const profile = await getProfileFromToken(supabase, token);
    if (!profile || profile.status !== 'active') return response({ error: 'Acesso não autorizado.' }, 403);

    const { data: editMessage, error: editError } = await supabase
      .from('whatsapp_messages')
      .select('id,store_id,conversation_id,whatsapp_number_id,wa_message_id,direction,message_type,body,status,sent_at,created_at,raw_payload')
      .eq('id', messageId)
      .maybeSingle();

    if (editError) throw editError;
    if (!editMessage) return response({ error: 'Mensagem não encontrada.' }, 404);

    const targetProviderId = evolutionSecretMessageEditTarget(editMessage.raw_payload);
    if (!targetProviderId) return response({ error: 'A mensagem não é uma edição compatível.' }, 422);

    const role = asStorePortalRole(profile.role);
    if (!role) return response({ error: 'Acesso não autorizado.' }, 403);

    if (editMessage.store_id) {
      if (profile.role !== 'master' && profile.store_id !== editMessage.store_id) {
        return response({ error: 'Acesso não autorizado.' }, 403);
      }

      const { data: conversation, error: conversationError } = await supabase
        .from('whatsapp_conversations')
        .select('id,store_id,lead_id')
        .eq('id', editMessage.conversation_id)
        .maybeSingle();
      if (conversationError) throw conversationError;

      let lead: any = null;
      if (conversation?.lead_id) {
        const { data, error } = await supabase
          .from('leads')
          .select('id,assigned_store_id,assigned_user_id')
          .eq('id', conversation.lead_id)
          .maybeSingle();
        if (error) throw error;
        lead = data;
      }

      if (!conversation || !canAccessStoreConversation(profile, role, conversation, lead)) {
        return response({ error: 'Acesso não autorizado.' }, 403);
      }
    } else if (profile.role !== 'master') {
      return response({ error: 'Apenas o Master pode acessar esta mensagem.' }, 403);
    }

    const { data: candidates, error: originalError } = await supabase
      .from('whatsapp_messages')
      .select('id,store_id,conversation_id,whatsapp_number_id,wa_message_id,direction,message_type,body,status,sent_at,created_at,raw_payload')
      .eq('whatsapp_number_id', editMessage.whatsapp_number_id)
      .ilike('wa_message_id', `%${targetProviderId}`)
      .order('sent_at', { ascending: false })
      .limit(5);

    if (originalError) throw originalError;
    const originalMessage = (candidates || []).find((item: any) => {
      const providerId = String(item.wa_message_id || '').split(':').pop();
      return providerId === targetProviderId;
    }) || null;

    if (!originalMessage) {
      return response({
        success: true,
        edited: true,
        content_unavailable: true,
        body: evolutionMessageEditFallback,
        target_message_id: null
      });
    }

    const { data: number, error: numberError } = await supabase
      .from('whatsapp_numbers')
      .select('phone_number')
      .eq('id', editMessage.whatsapp_number_id)
      .maybeSingle();
    if (numberError) throw numberError;

    const decrypted = decryptEvolutionMessageEdit(editMessage, originalMessage, number?.phone_number || null);

    return response({
      success: true,
      edited: true,
      content_unavailable: !decrypted,
      body: decrypted?.body || originalMessage.body || evolutionMessageEditFallback,
      message_type: decrypted?.messageType || originalMessage.message_type || 'text',
      target_message_id: originalMessage.id,
      edited_at: editMessage.sent_at || editMessage.created_at || null
    });
  } catch (error: any) {
    console.error('[WhatsApp edit resolver] Falha ao resolver edição.', {
      error: String(error?.message || 'erro').slice(0, 300)
    });
    return response({ error: 'Não foi possível recuperar a edição desta mensagem.' }, 500);
  }
}
