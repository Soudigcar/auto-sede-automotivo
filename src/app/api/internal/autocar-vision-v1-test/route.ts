import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/server/storeTeam';
import { processAutocarShadowInbound } from '@/lib/server/autocar/autoShadow';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const STORE_ID = '239755c3-a2d4-4cdd-9502-f1595031c924';
const CONVERSATION_ID = '0e7218c4-993e-43f8-ba1e-43b7d91e581a';
const MESSAGE_ID = '774ea580-7b23-4dd5-b4a5-4875e9a5def6';
const EXPECTED_BRANCH = 'feat/autocar-vision-v1';

export async function GET() {
  try {
    if (process.env.VERCEL_ENV !== 'preview' || process.env.VERCEL_GIT_COMMIT_REF !== EXPECTED_BRANCH) {
      return NextResponse.json({ error: 'Gatilho disponível somente no Preview autorizado da Vision V1.' }, { status: 404 });
    }

    const supabase = createAdminClient();
    const [{ data: conversation, error: conversationError }, { data: message, error: messageError }] = await Promise.all([
      supabase.from('whatsapp_conversations')
        .select('id,store_id,whatsapp_number_id,lead_id')
        .eq('id', CONVERSATION_ID)
        .eq('store_id', STORE_ID)
        .maybeSingle(),
      supabase.from('whatsapp_messages')
        .select('id,store_id,conversation_id,direction,message_type')
        .eq('id', MESSAGE_ID)
        .eq('store_id', STORE_ID)
        .eq('conversation_id', CONVERSATION_ID)
        .maybeSingle()
    ]);

    if (conversationError) throw conversationError;
    if (messageError) throw messageError;
    if (!conversation || !message) {
      return NextResponse.json({ error: 'Conversa ou imagem autorizada não encontrada.' }, { status: 404 });
    }
    if (message.direction !== 'inbound' || message.message_type !== 'image') {
      return NextResponse.json({ error: 'A mensagem autorizada não é uma imagem inbound.' }, { status: 400 });
    }

    const result = await processAutocarShadowInbound({
      productionSupabase: supabase,
      storeId: STORE_ID,
      conversation,
      message,
      allowLivePilot: false
    });

    const vision = result?.result?.vision || result?.result?.claim?.result?.vision || null;
    const shadow = result?.result?.shadow || null;

    return NextResponse.json({
      success: result?.success === true,
      test_scope: 'a4-single-image-preview',
      message_id: MESSAGE_ID,
      no_external_execution: true,
      vision: vision ? {
        ready: vision.ready === true,
        version: vision.version || null,
        model: vision.model || null,
        bytes: vision.bytes || null,
        mimetype: vision.mimetype || null,
        usage: vision.usage || null,
        analysis: vision.analysis || null
      } : null,
      shadow: shadow ? {
        response: shadow.response || null,
        summary: shadow.summary || null,
        next_best_action: shadow.next_best_action || null,
        model: shadow.model || null
      } : null,
      duplicate: Boolean(result?.result?.duplicate),
      error: result?.error || null
    }, { status: result?.error ? 500 : 200 });
  } catch (error: any) {
    return NextResponse.json({
      error: String(error?.message || error || 'Falha no teste controlado Vision V1.').slice(0, 1000),
      no_external_execution: true
    }, { status: 500 });
  }
}
