import { generateAutocarShadowReply } from '@/lib/server/autocar/shadowReply';
import { classifyAutocarHumanRequestV2 } from '@/lib/server/autocar/humanRequestClassifierV2';
import { resolveAutocarHandoffV2 } from '@/lib/server/autocar/handoffSemanticsV2';

export const AUTOCAR_INTELLIGENCE_REPLAY_VERSION = 'autocar-intelligence-replay-v2-preview';

function explicitTransferLanguage(value: unknown) {
  const text = String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  return /(vou|vamos|posso)\s+(te\s+)?(encaminhar|transferir|passar)\b|encaminh(ar|ando)\s+(seu|o)\s+atendimento|transferir\s+(para|pro|pra)\s+(um|uma|o|a)?\s*(vendedor|consultor|gerente|atendente|equipe)/i.test(text);
}

export function evaluateAutocarReplayV2(input: {
  customerRequestedHuman: boolean;
  shadow: any;
}) {
  const rawActions = Array.isArray(input.shadow?.proposed_actions) ? input.shadow.proposed_actions : [];
  const rawTransferActions = rawActions.filter((action: any) => String(action?.capability || '') === 'transfer_lead');
  const handoff = resolveAutocarHandoffV2({
    customerRequestedHuman: input.customerRequestedHuman,
    proposedActions: rawActions
  });
  const transferLanguageWithoutRequest = !input.customerRequestedHuman && explicitTransferLanguage(input.shadow?.response);
  const transferActionWithoutRequest = !input.customerRequestedHuman && rawTransferActions.length > 0;

  return {
    version: AUTOCAR_INTELLIGENCE_REPLAY_VERSION,
    pass: !(transferLanguageWithoutRequest || transferActionWithoutRequest),
    customer_requested_human: input.customerRequestedHuman,
    handoff,
    regression_flags: {
      transfer_action_without_customer_request: transferActionWithoutRequest,
      transfer_language_without_customer_request: transferLanguageWithoutRequest
    },
    raw_transfer_actions: rawTransferActions,
    effective_actions: input.customerRequestedHuman
      ? rawActions
      : rawActions.filter((action: any) => String(action?.capability || '') !== 'transfer_lead'),
    external_execution: false
  };
}

export async function replayAutocarConversationV2(input: {
  productionSupabase: any;
  storeId: string;
  conversationId: string;
}) {
  const { data: conversation, error: conversationError } = await input.productionSupabase
    .from('whatsapp_conversations')
    .select('id,store_id')
    .eq('id', input.conversationId)
    .eq('store_id', input.storeId)
    .maybeSingle();
  if (conversationError) throw conversationError;
  if (!conversation) throw new Error('Conversa não encontrada para replay AUTOCAR V2.');

  const { data: messages, error: messagesError } = await input.productionSupabase
    .from('whatsapp_messages')
    .select('id,direction,message_type,body,sent_at,created_at')
    .eq('store_id', input.storeId)
    .eq('conversation_id', input.conversationId)
    .order('sent_at', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(12);
  if (messagesError) throw messagesError;

  const transcript = (messages || []).reverse().map((message: any) => ({
    id: String(message.id || ''),
    direction: String(message.direction || ''),
    type: String(message.message_type || 'text'),
    body: String(message.body || '').trim().slice(0, 2000),
    sent_at: message.sent_at || message.created_at || null
  })).filter((message: any) => Boolean(message.body));
  const currentInbound = [...transcript].reverse().find((message: any) => message.direction === 'inbound');
  if (!currentInbound?.body) throw new Error('Replay exige uma mensagem inbound textual recente.');

  const humanRequest = await classifyAutocarHumanRequestV2({
    currentInbound: currentInbound.body,
    recentConversation: transcript.map((message: any) => ({ direction: message.direction, body: message.body }))
  });
  const shadow = await generateAutocarShadowReply({
    productionSupabase: input.productionSupabase,
    storeId: input.storeId,
    conversationId: input.conversationId
  });
  const evaluation = evaluateAutocarReplayV2({
    customerRequestedHuman: humanRequest.customer_requested_human,
    shadow
  });

  return {
    version: AUTOCAR_INTELLIGENCE_REPLAY_VERSION,
    store_id: input.storeId,
    conversation_id: input.conversationId,
    current_inbound: {
      id: currentInbound.id,
      body: currentInbound.body,
      sent_at: currentInbound.sent_at
    },
    human_request: humanRequest,
    shadow: {
      response: shadow.response,
      summary: shadow.summary,
      next_best_action: shadow.next_best_action,
      proposed_actions: shadow.proposed_actions,
      intelligence: shadow.intelligence,
      model: shadow.model,
      model_routing: shadow.model_routing,
      usage: shadow.usage
    },
    evaluation,
    no_external_execution: true
  };
}
