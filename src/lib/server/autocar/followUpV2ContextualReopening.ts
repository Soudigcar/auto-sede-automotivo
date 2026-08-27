import { createAutocarStructuredResponse } from '@/lib/server/autocar/client';
import { buildAutocarIntelligenceContext, serializeAutocarIntelligenceContext } from '@/lib/server/autocar/intelligenceCore';

export type FollowUpReopeningSource = {
  store: { id: string; store_name: string; city?: string | null; state?: string | null };
  lead: any | null;
  baseLead?: any | null;
  commercial: any | null;
  messages: Array<{ direction: string; message_type: string; body: string; sent_at?: string | null }>;
  inventorySupabase?: any;
  scenarioKey: string;
};

export type FollowUpReopeningPlan = {
  is_commercial_conversation: boolean;
  block_reason: string | null;
  last_topic: string;
  customer_last_intent: string;
  store_last_action: string;
  pending_thread: string;
  reopening_hook: string;
  commercial_objective: string;
  avoid_repeating: string[];
  suggested_message: string;
};

const reopeningSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    is_commercial_conversation: { type: 'boolean' },
    block_reason: { type: ['string', 'null'] },
    last_topic: { type: 'string' },
    customer_last_intent: { type: 'string' },
    store_last_action: { type: 'string' },
    pending_thread: { type: 'string' },
    reopening_hook: { type: 'string' },
    commercial_objective: { type: 'string' },
    avoid_repeating: { type: 'array', items: { type: 'string' } },
    suggested_message: { type: 'string' }
  },
  required: [
    'is_commercial_conversation', 'block_reason', 'last_topic', 'customer_last_intent',
    'store_last_action', 'pending_thread', 'reopening_hook', 'commercial_objective',
    'avoid_repeating', 'suggested_message'
  ]
};

function compactMessages(messages: FollowUpReopeningSource['messages']) {
  const usable = messages.filter((message) => String(message.body || '').trim()).slice(-24);
  return usable.map((message, index) => ({
    recency_rank: usable.length - index,
    recency_weight: index >= usable.length - 4 ? 'MAXIMO' : index >= usable.length - 10 ? 'ALTO' : 'MEMORIA',
    speaker: message.direction === 'outbound' ? 'LOJA' : 'CLIENTE',
    type: message.message_type || 'text',
    text: String(message.body || '').trim().slice(0, 2500),
    sent_at: message.sent_at || null
  }));
}

export function looksLikeNonLeadAutomation(messages: FollowUpReopeningSource['messages']) {
  const inbound = messages
    .filter((message) => message.direction !== 'outbound')
    .slice(-8)
    .map((message) => String(message.body || '').toLowerCase())
    .join(' ');
  if (!inbound) return false;
  const automationSignals = [
    'powered by wati.io', 'webinar de produto', 'garanta sua vaga', 'estamos ao vivo agora',
    'wati ai', 'wati mcp', 'product marketing', 'opções: entrar agora'
  ];
  return automationSignals.filter((signal) => inbound.includes(signal)).length >= 2;
}

export async function generateContextualFollowUpReopening(source: FollowUpReopeningSource) {
  const recent = compactMessages(source.messages);
  if (!recent.length) throw new Error('Conversa sem contexto textual suficiente para reabertura.');
  if (looksLikeNonLeadAutomation(source.messages)) {
    return {
      plan: {
        is_commercial_conversation: false,
        block_reason: 'Mensagem automatizada/promocional sem evidência de intenção de compra automotiva.',
        last_topic: '', customer_last_intent: '', store_last_action: '', pending_thread: '', reopening_hook: '', commercial_objective: '', avoid_repeating: [], suggested_message: ''
      } satisfies FollowUpReopeningPlan,
      model: null,
      usage: {}
    };
  }

  const lastCustomer = [...source.messages].reverse().find((message) => message.direction !== 'outbound' && String(message.body || '').trim());
  const intelligence = await buildAutocarIntelligenceContext({
    storeId: source.store.id,
    query: String(lastCustomer?.body || recent.at(-1)?.text || '').slice(0, 6000),
    mode: 'copilot',
    inventorySupabase: source.inventorySupabase
  });

  const result = await createAutocarStructuredResponse({
    task: 'commercial_reply',
    schemaName: 'autocar_follow_up_contextual_reopening',
    schema: reopeningSchema,
    maxOutputTokens: 1200,
    instructions: [
      intelligence.hardPolicyInstructions,
      'Você é a inteligência de REABERTURA CONTEXTUAL do Smart Follow-up AUTOCAR para lojas de veículos.',
      'Sua tarefa NÃO é iniciar uma conversa nova. É continuar exatamente do ponto comercial em que a conversa parou.',
      'Dê peso máximo às últimas 2 a 4 mensagens, peso alto às últimas 5 a 10 e use o restante apenas como memória.',
      'Identifique o último assunto concreto, a última intenção/pergunta do cliente, a última ação da loja e a pendência deixada pelo silêncio.',
      'O reopening_hook deve nascer dessa pendência. Nunca use uma abertura genérica se existe um gancho específico.',
      'Nunca repita semanticamente a última pergunta, CTA ou argumento da loja. Se uma pergunta foi ignorada, mude a estratégia de retomada.',
      'A mensagem deve soar como continuação natural de WhatsApp: curta, humana, específica e comercialmente útil.',
      'Evite frases como "Como posso ajudar?" ou "Está procurando algum veículo?" quando a conversa já contém contexto.',
      'Não diga "esse é o link" se o link já foi enviado; prefira perguntar se o cliente conseguiu ver/analisar e ofereça o próximo passo.',
      'Não invente estoque, preço, financiamento, aprovação, desconto ou qualquer fato ausente.',
      'Se a conversa parecer spam, automação de terceiro, mensagem promocional, contato errado ou não houver intenção automotiva plausível, marque is_commercial_conversation=false e deixe suggested_message vazio.',
      'Se houver intenção comercial, suggested_message deve ter no máximo 2 frases e no máximo uma pergunta principal.',
      'O objetivo é reabrir a conversa e avançar um próximo passo coerente: esclarecer pendência, visita, test-drive, simulação ou qualificação, conforme o contexto real.'
    ].join(' '),
    input: {
      scenario: source.scenarioKey,
      store: { name: source.store.store_name, city: source.store.city || null, state: source.store.state || null },
      crm: {
        customer_name: source.lead?.customer_name || source.baseLead?.name || null,
        vehicle_interest: source.lead?.interested_vehicle || null,
        status: source.lead?.status || source.baseLead?.status || null,
        scheduled_at: source.lead?.scheduled_at || null,
        payment_type: source.commercial?.payment_type || null,
        financing_bank: source.commercial?.financing_bank || null
      },
      recent_conversation_weighted: recent,
      autocar_intelligence: serializeAutocarIntelligenceContext(intelligence)
    }
  });

  const plan = result.parsed as FollowUpReopeningPlan;
  if (!plan.is_commercial_conversation) plan.suggested_message = '';
  return {
    plan,
    model: result.routing.model,
    routing: result.routing,
    usage: {
      input_tokens: Number(result.payload?.usage?.input_tokens || 0),
      output_tokens: Number(result.payload?.usage?.output_tokens || 0)
    }
  };
}
