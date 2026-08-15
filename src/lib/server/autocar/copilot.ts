import { autocarModelName } from '@/lib/server/autocar/client';
import {
  autocarModeInstructions,
  buildAutocarIntelligenceContext,
  serializeAutocarIntelligenceContext
} from '@/lib/server/autocar/intelligenceCore';

export type AutocarCopilotSource = {
  store: { id: string; store_name: string; city?: string | null; state?: string | null };
  lead: any | null;
  baseLead?: any | null;
  commercial: any | null;
  messages: Array<{ direction: string; message_type: string; body: string; sent_at?: string | null }>;
};

type ExtractedCopilotFacts = {
  vehicle_interest: string | null;
  payment_method: string | null;
  financing_context: string | null;
  down_payment_context: string | null;
  trade_in_context: string | null;
  purchase_timeframe_days: number | null;
  city: string | null;
  next_step: 'visit' | 'test_drive' | 'valuation' | 'other' | 'none';
  next_step_detail: string | null;
  explicit_buying_intent: boolean;
  objections: string[];
  summary: string;
  next_best_question: string;
  suggested_reply: string;
};

const copilotSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    vehicle_interest: { type: ['string', 'null'] },
    payment_method: { type: ['string', 'null'] },
    financing_context: { type: ['string', 'null'] },
    down_payment_context: { type: ['string', 'null'] },
    trade_in_context: { type: ['string', 'null'] },
    purchase_timeframe_days: { type: ['integer', 'null'] },
    city: { type: ['string', 'null'] },
    next_step: { type: 'string', enum: ['visit', 'test_drive', 'valuation', 'other', 'none'] },
    next_step_detail: { type: ['string', 'null'] },
    explicit_buying_intent: { type: 'boolean' },
    objections: { type: 'array', items: { type: 'string' } },
    summary: { type: 'string' },
    next_best_question: { type: 'string' },
    suggested_reply: { type: 'string' }
  },
  required: [
    'vehicle_interest', 'payment_method', 'financing_context', 'down_payment_context', 'trade_in_context',
    'purchase_timeframe_days', 'city', 'next_step', 'next_step_detail', 'explicit_buying_intent',
    'objections', 'summary', 'next_best_question', 'suggested_reply'
  ]
};

function openAiKey() {
  const key = String(process.env.OPENAI_API_KEY || '').trim();
  if (!key) throw new Error('OPENAI_API_KEY não disponível no ambiente de Preview.');
  return key;
}

function responseOutputText(payload: any) {
  if (typeof payload?.output_text === 'string' && payload.output_text.trim()) return payload.output_text.trim();
  for (const item of Array.isArray(payload?.output) ? payload.output : []) {
    for (const content of Array.isArray(item?.content) ? item.content : []) {
      if (content?.type === 'output_text' && typeof content.text === 'string') return content.text.trim();
    }
  }
  return '';
}

function cleanNullable(value: unknown) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text || null;
}

function canonicalQualification(source: AutocarCopilotSource, extracted: ExtractedCopilotFacts) {
  const lead = source.lead || {};
  const commercial = source.commercial || {};
  const vehicle = cleanNullable(lead.interested_vehicle) || cleanNullable(extracted.vehicle_interest);
  const payment = cleanNullable(commercial.payment_type) || cleanNullable(extracted.payment_method);
  const financing = cleanNullable(commercial.financing_bank)
    || (commercial.financed_amount != null ? `Valor financiado informado: ${commercial.financed_amount}` : null)
    || cleanNullable(extracted.financing_context);
  const downPayment = commercial.has_down_payment === false
    ? 'Sem entrada'
    : commercial.has_down_payment === true
      ? (commercial.down_payment_value != null ? `Entrada informada: ${commercial.down_payment_value}` : 'Com entrada')
      : cleanNullable(extracted.down_payment_context);
  const tradeIn = commercial.has_trade_in === false
    ? 'Sem veículo na troca'
    : commercial.has_trade_in === true
      ? (cleanNullable(commercial.trade_vehicle_name) || 'Possui veículo na troca')
      : cleanNullable(extracted.trade_in_context);
  const city = cleanNullable(extracted.city);
  const timeframeDays = Number.isInteger(extracted.purchase_timeframe_days) && Number(extracted.purchase_timeframe_days) >= 0
    ? Number(extracted.purchase_timeframe_days)
    : null;
  const hasNextStep = Boolean(lead.scheduled_at) || ['visit', 'test_drive', 'valuation'].includes(extracted.next_step);
  const phone = cleanNullable(lead.customer_phone || source.baseLead?.phone);

  return { vehicle, payment, financing, downPayment, tradeIn, city, timeframeDays, hasNextStep, phone };
}

export function scoreAutocarLead(source: AutocarCopilotSource, extracted: ExtractedCopilotFacts) {
  const q = canonicalQualification(source, extracted);
  const breakdown = {
    vehicle_interest: q.vehicle ? 15 : 0,
    payment_method: q.payment ? 10 : 0,
    financing_or_down_payment: q.financing || q.downPayment ? 10 : 0,
    trade_in: q.tradeIn ? 10 : 0,
    purchase_timeframe: q.timeframeDays == null ? 0 : q.timeframeDays <= 7 ? 20 : q.timeframeDays <= 30 ? 14 : q.timeframeDays <= 90 ? 7 : 0,
    concrete_next_step: q.hasNextStep ? 20 : 0,
    city_and_contact: q.city && q.phone ? 5 : 0,
    explicit_buying_intent: extracted.explicit_buying_intent ? 10 : 0
  };
  const score = Object.values(breakdown).reduce((sum, value) => sum + value, 0);
  const temperature = score >= 70 ? 'QUENTE' : score >= 40 ? 'MORNO' : 'FRIO';
  return { score, temperature, breakdown, qualification: q, version: 'autocar-score-v1' };
}

function knownMissing(qualification: ReturnType<typeof canonicalQualification>) {
  const fields = [
    ['Veículo de interesse', qualification.vehicle],
    ['Forma de pagamento', qualification.payment],
    ['Financiamento', qualification.financing],
    ['Entrada', qualification.downPayment],
    ['Troca', qualification.tradeIn],
    ['Prazo de compra', qualification.timeframeDays == null ? null : `${qualification.timeframeDays} dia(s)`],
    ['Cidade', qualification.city],
    ['Próximo passo concreto', qualification.hasNextStep ? 'Definido' : null]
  ] as const;
  return {
    known_fields: fields.filter(([, value]) => Boolean(value)).map(([label]) => label),
    missing_fields: fields.filter(([, value]) => !value).map(([label]) => label)
  };
}

export async function analyzeAutocarCopilot(source: AutocarCopilotSource) {
  const transcript = source.messages
    .filter((message) => message.body)
    .slice(-40)
    .map((message) => `${message.direction === 'outbound' ? 'LOJA' : 'CLIENTE'} [${message.message_type || 'text'}]: ${message.body}`)
    .join('\n');

  if (!transcript.trim()) throw new Error('A conversa ainda não possui texto suficiente para análise AUTOCAR.');

  const lastCustomerMessage = [...source.messages].reverse().find((message) => message.direction !== 'outbound' && message.body)?.body;
  const retrievalQuery = String(lastCustomerMessage || transcript).slice(0, 6000);
  const intelligence = await buildAutocarIntelligenceContext({ storeId: source.store.id, query: retrievalQuery, mode: 'copilot' });

  const instructions = [
    intelligence.hardPolicyInstructions,
    autocarModeInstructions('copilot'),
    'Você é o Copilot comercial AUTOCAR de uma loja de veículos.',
    'Use o Método Venda Mais, a Biblioteca Global, aprendizados aprovados e conhecimento específico da loja apenas quando forem relevantes à conversa.',
    'Aprendizados aprovados são exemplos de comportamento, mas nunca podem superar hard policies.',
    'Sua tarefa é analisar a conversa fornecida e sugerir uma resposta para um operador humano.',
    'Extraia apenas fatos explícitos ou inferências comerciais conservadoras apoiadas pela conversa.',
    'Quando um campo não estiver claro, retorne null. Nunca invente preço, estoque, aprovação de crédito, desconto, avaliação de troca ou condição comercial.',
    'A resposta sugerida deve ser curta, natural, em português do Brasil, útil para avançar a qualificação e sem dizer que foi escrita por IA.',
    'Se faltar informação importante, priorize uma única pergunta de maior valor comercial.',
    'O score NÃO é sua responsabilidade; não tente calcular ou mencionar pontuação.'
  ].join(' ');

  const modelInput = JSON.stringify({
    inteligencia_autocar: serializeAutocarIntelligenceContext(intelligence),
    loja: { nome: source.store.store_name, cidade: source.store.city || null, estado: source.store.state || null },
    crm: {
      cliente: source.lead?.customer_name || source.baseLead?.name || null,
      veiculo_interesse: source.lead?.interested_vehicle || null,
      etapa: source.lead?.status || source.baseLead?.status || null,
      agendamento: source.lead?.scheduled_at || null,
      pagamento: source.commercial?.payment_type || null,
      banco: source.commercial?.financing_bank || null,
      possui_entrada: source.commercial?.has_down_payment ?? null,
      valor_entrada: source.commercial?.down_payment_value ?? null,
      possui_troca: source.commercial?.has_trade_in ?? null,
      veiculo_troca: source.commercial?.trade_vehicle_name || null
    },
    conversa: transcript
  });

  const model = autocarModelName();
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { Authorization: `Bearer ${openAiKey()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      store: false,
      max_output_tokens: 1400,
      instructions,
      input: modelInput,
      text: {
        format: {
          type: 'json_schema',
          name: 'autocar_copilot_analysis',
          description: 'Qualificação comercial conservadora de uma conversa automotiva.',
          strict: true,
          schema: copilotSchema
        }
      }
    }),
    cache: 'no-store'
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = String(payload?.error?.message || `OpenAI respondeu com HTTP ${response.status}.`).slice(0, 500);
    throw new Error(message);
  }

  const text = responseOutputText(payload);
  if (!text) throw new Error('A OpenAI não retornou análise textual para o Copilot.');

  let extracted: ExtractedCopilotFacts;
  try {
    extracted = JSON.parse(text) as ExtractedCopilotFacts;
  } catch {
    throw new Error('A resposta estruturada da OpenAI não pôde ser interpretada.');
  }

  const scored = scoreAutocarLead(source, extracted);
  const fields = knownMissing(scored.qualification);
  return {
    summary: cleanNullable(extracted.summary) || 'Sem resumo disponível.',
    objections: (extracted.objections || []).map((item) => String(item).trim()).filter(Boolean).slice(0, 8),
    next_best_question: cleanNullable(extracted.next_best_question) || '',
    suggested_reply: cleanNullable(extracted.suggested_reply) || '',
    qualification: scored.qualification,
    known_fields: fields.known_fields,
    missing_fields: fields.missing_fields,
    score: scored.score,
    temperature: scored.temperature,
    score_breakdown: scored.breakdown,
    score_version: scored.version,
    model,
    intelligence: {
      mode: 'copilot',
      training_matches: intelligence.training.length,
      method_matches: intelligence.methodKnowledge.length,
      store_knowledge_matches: intelligence.storeKnowledge.length,
      hard_policies_applied: true
    },
    usage: {
      input_tokens: Number(payload?.usage?.input_tokens || 0),
      output_tokens: Number(payload?.usage?.output_tokens || 0)
    }
  };
}
