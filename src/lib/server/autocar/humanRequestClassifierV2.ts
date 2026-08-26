import { createAutocarStructuredResponse } from '@/lib/server/autocar/client';

export const AUTOCAR_HUMAN_REQUEST_CLASSIFIER_VERSION = 'autocar-human-request-classifier-v2-preview';

const schema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    customer_requested_human: { type: 'boolean' },
    confidence: { type: 'number' },
    reason: { type: 'string' }
  },
  required: ['customer_requested_human', 'confidence', 'reason']
};

export async function classifyAutocarHumanRequestV2(input: {
  currentInbound: string;
  recentConversation?: Array<{ direction?: string; body?: string }>;
}) {
  const currentInbound = String(input.currentInbound || '').trim().slice(0, 3000);
  if (!currentInbound) {
    return {
      version: AUTOCAR_HUMAN_REQUEST_CLASSIFIER_VERSION,
      customer_requested_human: false,
      confidence: 1,
      reason: 'Mensagem atual vazia; nenhum pedido humano foi classificado.'
    };
  }

  const recentConversation = (Array.isArray(input.recentConversation) ? input.recentConversation : [])
    .slice(-6)
    .map((item) => ({
      direction: String(item?.direction || '').slice(0, 20),
      body: String(item?.body || '').trim().slice(0, 1200)
    }));

  const result = await createAutocarStructuredResponse({
    task: 'semantic_extraction',
    instructions: [
      'Classifique exclusivamente se a MENSAGEM ATUAL do cliente contém um pedido semântico para transferir ou envolver uma pessoa humana no atendimento.',
      'A mensagem atual tem prioridade absoluta. O histórico serve somente para resolver referência direta e inequívoca; nunca carregue uma intenção antiga para uma saudação ou nova pergunta independente.',
      'Marque true para pedidos como falar com vendedor, consultor, gerente, atendente, pessoa, humano, ligação/retorno de alguém da equipe, ou equivalentes semanticamente claros.',
      'Marque false quando o cliente apenas pergunta preço, desconto, parcela, financiamento, troca, estoque, revisões, garantia, documentos, localização, fotos, agendamento ou faz uma saudação, mesmo que a resposta dependa de validação humana.',
      'Perguntar se existe vendedor disponível não é por si só pedir transferência; é necessário haver intenção de falar com alguém.',
      'Não infira pedido humano apenas porque a AUTOCAR não sabe um dado, porque uma policy protege uma ação ou porque o caso é complexo.',
      'confidence deve ficar entre 0 e 1. reason deve ser curto, descritivo e não conter cadeia de pensamento privada.'
    ].join(' '),
    input: {
      mensagem_atual: currentInbound,
      contexto_recente_auxiliar: recentConversation
    },
    schemaName: 'autocar_human_request_v2',
    schema,
    maxOutputTokens: 250,
    includeReadTools: false
  });

  return {
    version: AUTOCAR_HUMAN_REQUEST_CLASSIFIER_VERSION,
    customer_requested_human: result.parsed.customer_requested_human === true,
    confidence: Math.max(0, Math.min(1, Number(result.parsed.confidence || 0))),
    reason: String(result.parsed.reason || '').trim().slice(0, 300),
    model_routing: result.routing
  };
}
