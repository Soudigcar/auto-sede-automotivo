import { NextResponse } from 'next/server';
import { authorizeStorePortal } from '@/lib/server/storePortal';
import { cleanText } from '@/lib/server/storeTeam';
import { getAutocarDevClient } from '@/lib/server/autocar/devAdmin';
import { markAutocarHumanActive, resumeAutocarConversation } from '@/lib/server/autocar/safeRuntime';
import { processAutocarShadowInbound } from '@/lib/server/autocar/autoShadow';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

async function contextFor(request: Request, slug: string) {
  const context = await authorizeStorePortal(request, slug);
  if ('error' in context) return context;
  if (!context.permissions.includes('view_autocar')) {
    return { error: NextResponse.json({ error: 'Usuário sem permissão para visualizar a AUTOCAR.' }, { status: 403 }) } as const;
  }
  return context;
}

async function canonicalConversation(context: any, conversationId: string) {
  const { data, error } = await context.supabase.from('whatsapp_conversations')
    .select('id,store_id,whatsapp_number_id,lead_id')
    .eq('id', conversationId)
    .eq('store_id', context.store.id)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Conversa não encontrada nesta loja.');
  return data;
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const slug = cleanText(url.searchParams.get('slug'), 120);
    const conversationId = cleanText(url.searchParams.get('conversation_id'), 100);
    const context = await contextFor(request, slug);
    if ('error' in context) return context.error;
    if (!conversationId) return NextResponse.json({ error: 'Conversa obrigatória.' }, { status: 400 });

    await canonicalConversation(context, conversationId);
    const autocar = getAutocarDevClient();
    const [runtimeState, claims] = await Promise.all([
      autocar.from('ai_runtime_conversations').select('*')
        .eq('store_id', context.store.id).eq('production_conversation_id', conversationId).maybeSingle(),
      autocar.from('ai_runtime_message_claims').select('*')
        .eq('store_id', context.store.id).eq('production_conversation_id', conversationId)
        .order('created_at', { ascending: false }).limit(20)
    ]);
    if (runtimeState.error) throw runtimeState.error;
    if (claims.error) throw claims.error;

    return NextResponse.json({
      success: true,
      shadow_mode: true,
      no_external_execution: true,
      can_manage_autocar: context.permissions.includes('manage_autocar'),
      runtime: runtimeState.data || null,
      claims: claims.data || []
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Não foi possível consultar o runtime AUTOCAR.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const slug = cleanText(body?.slug, 120);
    const conversationId = cleanText(body?.conversation_id, 100);
    const action = cleanText(body?.action, 60).toLowerCase();
    const context = await contextFor(request, slug);
    if ('error' in context) return context.error;
    if (!conversationId) return NextResponse.json({ error: 'Conversa obrigatória.' }, { status: 400 });

    const conversation = await canonicalConversation(context, conversationId);

    if (action === 'process-inbound' || action === 'process-latest-inbound') {
      if (!context.permissions.includes('manage_autocar')) {
        return NextResponse.json({ error: 'Somente Gestor ou Master pode executar o Shadow Mode.' }, { status: 403 });
      }

      let message: any = null;
      if (action === 'process-latest-inbound') {
        const { data, error } = await context.supabase.from('whatsapp_messages')
          .select('id,direction,message_type,sent_at,created_at')
          .eq('store_id', context.store.id)
          .eq('conversation_id', conversation.id)
          .eq('direction', 'inbound')
          .order('sent_at', { ascending: false })
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (error) throw error;
        message = data;
      } else {
        const messageId = cleanText(body?.message_id, 100);
        if (!messageId) return NextResponse.json({ error: 'Mensagem obrigatória.' }, { status: 400 });
        const { data, error } = await context.supabase.from('whatsapp_messages')
          .select('id,direction,message_type,sent_at,created_at')
          .eq('id', messageId)
          .eq('store_id', context.store.id)
          .eq('conversation_id', conversation.id)
          .maybeSingle();
        if (error) throw error;
        message = data;
      }

      if (!message || message.direction !== 'inbound') {
        return NextResponse.json({ error: 'A conversa não possui uma mensagem inbound real para testar.' }, { status: 400 });
      }

      const result = await processAutocarShadowInbound({
        productionSupabase: context.supabase,
        storeId: context.store.id,
        conversation,
        message,
        allowLivePilot: false
      });
      return NextResponse.json(result, { status: result.error ? 500 : 200 });
    }

    if (action === 'human-active') {
      if (!context.permissions.includes('manage_autocar')) {
        return NextResponse.json({ error: 'Somente Gestor ou Master pode assumir a conversa pelo controle AUTOCAR.' }, { status: 403 });
      }
      const state = await markAutocarHumanActive({
        productionSupabase: context.supabase,
        storeId: context.store.id,
        conversationId: conversation.id,
        whatsappNumberId: conversation.whatsapp_number_id,
        leadId: conversation.lead_id,
        messageId: cleanText(body?.message_id, 100) || null,
        profileId: context.profile.id,
        source: 'inbox'
      });
      return NextResponse.json({ success: true, shadow_mode: true, no_external_execution: true, runtime: state });
    }

    if (action === 'resume') {
      if (!context.permissions.includes('manage_autocar')) {
        return NextResponse.json({ error: 'Somente Gestor ou Master pode reativar a AUTOCAR nesta conversa.' }, { status: 403 });
      }
      const state = await resumeAutocarConversation({
        productionSupabase: context.supabase,
        storeId: context.store.id,
        conversationId: conversation.id,
        whatsappNumberId: conversation.whatsapp_number_id,
        leadId: conversation.lead_id
      });
      return NextResponse.json({ success: true, shadow_mode: true, no_external_execution: true, runtime: state });
    }

    return NextResponse.json({ error: 'Ação de runtime AUTOCAR inválida.' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Não foi possível executar o runtime AUTOCAR.' }, { status: 500 });
  }
}
