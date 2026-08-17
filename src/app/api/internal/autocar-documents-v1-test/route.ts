import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/server/storeTeam';
import { processAutocarShadowInbound } from '@/lib/server/autocar/autoShadow';
import { generateAutocarShadowReply } from '@/lib/server/autocar/shadowReply';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const TEST_BRANCH = 'feat/autocar-documents-v1';
const A4_STORE_ID = '239755c3-a2d4-4cdd-9502-f1595031c924';
const A4_CONVERSATION_ID = '0e7218c4-993e-43f8-ba1e-43b7d91e581a';
const A4_WHATSAPP_NUMBER_ID = '9209122f-c46f-4d68-89b8-cf74175c36e8';

function environmentPresent() {
  return {
    openai_api_key: Boolean(String(process.env.OPENAI_API_KEY || '').trim()),
    autocar_supabase_url: Boolean(String(process.env.AUTOCAR_KNOWLEDGE_SUPABASE_URL || '').trim()),
    autocar_supabase_service_role: Boolean(String(process.env.AUTOCAR_KNOWLEDGE_SUPABASE_SERVICE_ROLE_KEY || '').trim()),
    evolution_api_url: Boolean(String(process.env.EVOLUTION_API_URL || '').trim()),
    evolution_api_key: Boolean(String(process.env.EVOLUTION_API_KEY || '').trim())
  };
}

function guard() {
  if (process.env.VERCEL_ENV !== 'preview') return 'Rota disponível somente em Preview.';
  if (String(process.env.VERCEL_GIT_COMMIT_REF || '') !== TEST_BRANCH) return 'Rota restrita à branch Documents V1.';
  return null;
}

export async function GET(request: Request) {
  const blocked = guard();
  if (blocked) return NextResponse.json({ success: false, error: blocked }, { status: 404 });

  const supabase: any = createAdminClient();
  const url = new URL(request.url);
  const messageId = String(url.searchParams.get('message_id') || '').trim();

  if (!messageId) {
    const { data: latest, error } = await supabase
      .from('whatsapp_messages')
      .select('id,message_type,body,sent_at,created_at,raw_payload')
      .eq('store_id', A4_STORE_ID)
      .eq('conversation_id', A4_CONVERSATION_ID)
      .eq('whatsapp_number_id', A4_WHATSAPP_NUMBER_ID)
      .eq('direction', 'inbound')
      .eq('message_type', 'document')
      .order('sent_at', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    const raw = latest?.raw_payload || {};
    return NextResponse.json({
      success: true,
      test_scope: 'a4-single-pdf-preview',
      no_external_execution: true,
      environment_present: environmentPresent(),
      latest_document: latest ? {
        id: latest.id,
        message_type: latest.message_type,
        body: latest.body,
        sent_at: latest.sent_at || latest.created_at || null,
        provider_message_id: raw?.key?.id || null,
        file_name: raw?.message?.documentMessage?.fileName || null,
        mimetype: raw?.message?.documentMessage?.mimetype || null,
        has_document_analysis: Boolean(raw?.autocar_document_analysis)
      } : null
    });
  }

  const { data: message, error: messageError } = await supabase
    .from('whatsapp_messages')
    .select('id,message_type,direction,lead_id')
    .eq('id', messageId)
    .eq('store_id', A4_STORE_ID)
    .eq('conversation_id', A4_CONVERSATION_ID)
    .eq('whatsapp_number_id', A4_WHATSAPP_NUMBER_ID)
    .eq('direction', 'inbound')
    .eq('message_type', 'document')
    .maybeSingle();

  if (messageError) throw messageError;
  if (!message) return NextResponse.json({ success: false, error: 'PDF inbound não pertence ao escopo imutável do teste A4.' }, { status: 404 });

  try {
    const processed = await processAutocarShadowInbound({
      productionSupabase: supabase,
      storeId: A4_STORE_ID,
      conversation: {
        id: A4_CONVERSATION_ID,
        whatsapp_number_id: A4_WHATSAPP_NUMBER_ID,
        lead_id: message.lead_id || null
      },
      message: { id: message.id, message_type: 'document' },
      allowLivePilot: false
    });

    let shadowValidation: any = null;
    const documentReady = processed?.result?.document?.ready === true;
    if (documentReady && !processed?.result?.shadow) {
      const shadow = await generateAutocarShadowReply({
        productionSupabase: supabase,
        storeId: A4_STORE_ID,
        conversationId: A4_CONVERSATION_ID
      });
      shadowValidation = {
        ready: true,
        no_external_execution: true,
        response: shadow?.response || null,
        summary: shadow?.summary || null,
        model: shadow?.model || null,
        proposed_actions: Array.isArray(shadow?.proposed_actions) ? shadow.proposed_actions : []
      };
    }

    return NextResponse.json({
      success: true,
      test_scope: 'a4-single-pdf-preview',
      message_id: message.id,
      no_external_execution: true,
      environment_present: environmentPresent(),
      processed,
      shadow_validation: shadowValidation
    });
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      test_scope: 'a4-single-pdf-preview',
      message_id: message.id,
      no_external_execution: true,
      environment_present: environmentPresent(),
      error: String(error?.message || error || 'Falha no teste Documents V1.').slice(0, 1000)
    }, { status: 500 });
  }
}
