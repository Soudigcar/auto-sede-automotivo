import { cleanText } from '@/lib/server/storeTeam';
import { getAutocarDevClient } from '@/lib/server/autocar/devAdmin';
import type { AutocarMode } from '@/lib/server/autocar/types';

export type AutocarExecutionContext = {
  storeId: string;
  agentId: string | null;
  integrationId: string;
  whatsappNumberId: string;
  conversationId: string;
  leadId: string | null;
  triggerMessageId: string | null;
  mode: AutocarMode;
};

type ResolveAutocarContextInput = {
  supabase: any;
  conversationId: string;
  triggerMessageId?: string | null;
};

export async function resolveAutocarExecutionContext(input: ResolveAutocarContextInput): Promise<AutocarExecutionContext> {
  const conversationId = cleanText(input.conversationId, 100);
  const triggerMessageId = cleanText(input.triggerMessageId, 100) || null;
  if (!conversationId) throw new Error('Conversa obrigatória para resolver o contexto AUTOCAR.');

  const { data: conversation, error: conversationError } = await input.supabase
    .from('whatsapp_conversations')
    .select('id,store_id,whatsapp_number_id,lead_id')
    .eq('id', conversationId)
    .maybeSingle();
  if (conversationError) throw conversationError;
  if (!conversation?.store_id) throw new Error('AUTOCAR aceita somente conversas vinculadas a uma loja.');

  const { data: integration, error: integrationError } = await input.supabase
    .from('store_whatsapp_integrations')
    .select('id,store_id,crm_number_id,scope,status')
    .eq('crm_number_id', conversation.whatsapp_number_id)
    .eq('store_id', conversation.store_id)
    .eq('scope', 'store')
    .maybeSingle();
  if (integrationError) throw integrationError;
  if (!integration) throw new Error('Integração WhatsApp da loja não encontrada para a conversa AUTOCAR.');

  if (triggerMessageId) {
    const { data: message, error: messageError } = await input.supabase
      .from('whatsapp_messages')
      .select('id')
      .eq('id', triggerMessageId)
      .eq('store_id', conversation.store_id)
      .eq('conversation_id', conversation.id)
      .maybeSingle();
    if (messageError) throw messageError;
    if (!message) throw new Error('Mensagem de gatilho não pertence à conversa AUTOCAR.');
  }

  const autocar = getAutocarDevClient();
  const { data: agent, error: agentError } = await autocar
    .from('ai_store_agents')
    .select('id,store_id,mode,status,master_enabled,master_autopilot_allowed,store_selected_mode')
    .eq('store_id', conversation.store_id)
    .maybeSingle();
  if (agentError) throw agentError;

  const activeAgent = agent?.status === 'active' && agent?.master_enabled === true ? agent : null;
  const mode: AutocarMode = activeAgent?.mode === 'copilot' || activeAgent?.mode === 'autopilot'
    ? activeAgent.mode
    : 'off';

  return {
    storeId: conversation.store_id,
    agentId: activeAgent?.id || null,
    integrationId: integration.id,
    whatsappNumberId: conversation.whatsapp_number_id,
    conversationId: conversation.id,
    leadId: conversation.lead_id || null,
    triggerMessageId,
    mode
  };
}
