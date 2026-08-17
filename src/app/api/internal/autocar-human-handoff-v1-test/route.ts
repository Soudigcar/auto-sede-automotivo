import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/server/storeTeam';
import { generateAutocarShadowReply } from '@/lib/server/autocar/shadowReply';
import { attemptAutocarHumanHandoffPilot } from '@/lib/server/autocar/liveHumanHandoffPilot';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const TEST_BRANCH = 'feat/autocar-human-handoff-v1';
const A4_STORE_ID = '239755c3-a2d4-4cdd-9502-f1595031c924';
const A4_CONVERSATION_ID = '0e7218c4-993e-43f8-ba1e-43b7d91e581a';
const A4_WHATSAPP_NUMBER_ID = '9209122f-c46f-4d68-89b8-cf74175c36e8';
const TEST_MESSAGE_ID = '1e17a3a3-6876-43a1-aa2e-601cc91bcfb5';

function guard() {
  if (process.env.VERCEL_ENV !== 'preview') return 'Rota disponível somente em Preview.';
  if (String(process.env.VERCEL_GIT_COMMIT_REF || '') !== TEST_BRANCH) return 'Rota restrita à branch Human Handoff V1.';
  return null;
}

function safeActions(shadow: any) {
  return (Array.isArray(shadow?.proposed_actions) ? shadow.proposed_actions : []).map((action: any) => ({
    capability: String(action?.capability || ''),
    reason: String(action?.reason || '').slice(0, 500),
    effect: String(action?.decision?.effect || ''),
    source: String(action?.decision?.source || '')
  }));
}

export async function GET() {
  const blocked = guard();
  if (blocked) return NextResponse.json({ success: false, error: blocked }, { status: 404 });

  const supabase: any = createAdminClient();

  const [{ data: message, error: messageError }, { data: latestInbound, error: latestError }, { data: integration, error: integrationError }] = await Promise.all([
    supabase.from('whatsapp_messages')
      .select('id,message_type,direction,lead_id,sent_at,created_at')
      .eq('id', TEST_MESSAGE_ID)
      .eq('store_id', A4_STORE_ID)
      .eq('conversation_id', A4_CONVERSATION_ID)
      .eq('whatsapp_number_id', A4_WHATSAPP_NUMBER_ID)
      .eq('direction', 'inbound')
      .maybeSingle(),
    supabase.from('whatsapp_messages')
      .select('id,message_type,sent_at,created_at')
      .eq('store_id', A4_STORE_ID)
      .eq('conversation_id', A4_CONVERSATION_ID)
      .eq('whatsapp_number_id', A4_WHATSAPP_NUMBER_ID)
      .eq('direction', 'inbound')
      .order('sent_at', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.from('store_whatsapp_integrations')
      .select('instance_name,status,scope')
      .eq('store_id', A4_STORE_ID)
      .eq('crm_number_id', A4_WHATSAPP_NUMBER_ID)
      .eq('scope', 'store')
      .maybeSingle()
  ]);

  if (messageError) throw messageError;
  if (latestError) throw latestError;
  if (integrationError) throw integrationError;

  if (!message) {
    return NextResponse.json({ success: false, error: 'Mensagem controlada não pertence ao escopo A4.' }, { status: 404 });
  }

  if (latestInbound?.id !== TEST_MESSAGE_ID) {
    return NextResponse.json({
      success: false,
      aborted: true,
      reason: 'Existe mensagem inbound mais recente; teste abortado sem executar handoff.',
      expected_message_id: TEST_MESSAGE_ID,
      latest_inbound_id: latestInbound?.id || null
    }, { status: 409 });
  }

  const shadow = await generateAutocarShadowReply({
    productionSupabase: supabase,
    storeId: A4_STORE_ID,
    conversationId: A4_CONVERSATION_ID
  });
  const actions = safeActions(shadow);
  const requiresHandoff = actions.some((action: any) => action.capability === 'transfer_lead' || action.effect === 'handoff' || action.effect === 'approval');

  if (!requiresHandoff) {
    return NextResponse.json({
      success: false,
      aborted: true,
      reason: 'Shadow não solicitou handoff/approval; nenhuma gravação de handoff foi executada.',
      message_id: TEST_MESSAGE_ID,
      shadow: {
        model: shadow?.model || null,
        summary: String(shadow?.summary || '').slice(0, 1000),
        actions
      }
    }, { status: 409 });
  }

  const result = await attemptAutocarHumanHandoffPilot({
    productionSupabase: supabase,
    storeId: A4_STORE_ID,
    conversationId: A4_CONVERSATION_ID,
    whatsappNumberId: A4_WHATSAPP_NUMBER_ID,
    inboundMessageId: TEST_MESSAGE_ID,
    integration: integration || {},
    shadowResult: {
      result: {
        effectiveMode: 'autopilot',
        shadow
      }
    }
  });

  return NextResponse.json({
    success: true,
    test_scope: 'a4-human-handoff-preview',
    message_id: TEST_MESSAGE_ID,
    shadow: {
      model: shadow?.model || null,
      summary: String(shadow?.summary || '').slice(0, 1000),
      actions
    },
    handoff: {
      handed_off: result?.handed_off === true,
      sent: result?.sent === true,
      duplicate: result?.duplicate === true,
      reason: String(result?.reason || '').slice(0, 1000),
      claim_id: result?.claim?.id || null,
      claim_status: result?.claim?.status || null,
      runtime: result?.runtime ? {
        effective_mode: result.runtime.effective_mode,
        human_state: result.runtime.human_state,
        pause_reason: String(result.runtime.pause_reason || '').slice(0, 1000),
        paused_at: result.runtime.paused_at || null
      } : null,
      acknowledgement: result?.acknowledgement ? {
        sent: result.acknowledgement.sent === true,
        failed: result.acknowledgement.failed === true,
        production_outbound_message_id: result.acknowledgement.production_outbound_message_id || null,
        sent_at: result.acknowledgement.sent_at || null,
        reason: String(result.acknowledgement.reason || '').slice(0, 500)
      } : null
    }
  });
}
