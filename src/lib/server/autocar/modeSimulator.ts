import { autocarModelName } from '@/lib/server/autocar/client';
import { getAutocarDevClient } from '@/lib/server/autocar/devAdmin';
import {
  autocarModeInstructions,
  buildAutocarIntelligenceContext,
  serializeAutocarIntelligenceContext,
  type AutocarIntelligenceMode
} from '@/lib/server/autocar/intelligenceCore';

function openAiKey() {
  const key = String(process.env.OPENAI_API_KEY || '').trim();
  if (!key) throw new Error('OPENAI_API_KEY não disponível no ambiente de Preview.');
  return key;
}

function outputText(payload: any) {
  if (typeof payload?.output_text === 'string' && payload.output_text.trim()) return payload.output_text.trim();
  for (const item of Array.isArray(payload?.output) ? payload.output : []) {
    for (const content of Array.isArray(item?.content) ? item.content : []) {
      if (content?.type === 'output_text' && typeof content.text === 'string') return content.text.trim();
    }
  }
  return '';
}

const schema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    response: { type: 'string' },
    reasoning_summary: { type: 'string' },
    next_action: { type: 'string' },
    execution_decision: { type: 'string', enum: ['suggest_only', 'would_execute', 'requires_approval', 'requires_handoff', 'blocked'] },
    execution_reason: { type: 'string' }
  },
  required: ['response', 'reasoning_summary', 'next_action', 'execution_decision', 'execution_reason']
};

export async function simulateAutocarMode(input: {
  storeId: string;
  customerInput: string;
  mode: AutocarIntelligenceMode;
  actorProfileId?: string | null;
  inventorySupabase?: any;
}) {
  const customerInput = String(input.customerInput || '').trim();
  if (!customerInput) throw new Error('Digite uma pergunta ou situação do cliente.');
  if (!input.storeId) throw new Error('Selecione uma loja para simular o contexto real da AUTOCAR.');

  const intelligence = await buildAutocarIntelligenceContext({
    storeId: input.storeId,
    query: customerInput,
    mode: input.mode,
    inventorySupabase: input.inventorySupabase
  });

  const instructions = [
    intelligence.hardPolicyInstructions,
    autocarModeInstructions(input.mode),
    'Você é o núcleo comercial AUTOCAR em uma simulação privada do Master.',
    'Use aprendizados aprovados, Método Venda Mais, Biblioteca Global e conhecimento específico da loja somente quando forem relevantes.',
    'O campo store_inventory é a fonte oficial do estoque interno da loja selecionada. O backend já determinou a loja; nunca escolha ou altere store_id.',
    'Interprete linguagem natural, abreviações, erros de digitação e variações de pontuação. Exemplos como HRV, HR-V e HR V podem representar o mesmo modelo quando isso for semanticamente plausível.',
    'Primeiro use matching_vehicles. Se a pré-busca não trouxer um candidato claro, examine inventory_index, que contém o inventário compacto real da loja e serve como fallback interpretativo.',
    'Só afirme disponibilidade quando o veículo estiver presente em matching_vehicles ou inventory_index. Nunca invente estoque, preço ou disponibilidade.',
    'Quando encontrar um candidato no inventory_index, use somente os dados daquele registro; não complete fatos ausentes por suposição.',
    'Portal/site é apenas vitrine; portal_url pode ser compartilhada quando existir, mas a disponibilidade vem do estoque interno.',
    'Nunca invente parcela, desconto, aprovação, avaliação ou condição não fornecida.',
    'Responda de forma natural, comercial e curta, em português do Brasil.',
    'execution_decision descreve apenas o que aconteceria no modo informado; nenhuma ação será realmente executada.',
    'No COPILOT, execution_decision deve ser suggest_only ou blocked.',
    'No AUTOPILOT, use would_execute apenas para resposta segura que não viole hard policies; use requires_approval/requires_handoff/blocked quando aplicável.',
    'reasoning_summary é um resumo operacional curto para o Master, nunca cadeia de pensamento privada.'
  ].join(' ');

  const model = autocarModelName();
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { Authorization: `Bearer ${openAiKey()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      store: false,
      max_output_tokens: 1100,
      instructions,
      input: JSON.stringify({
        mode: input.mode,
        customer_input: customerInput,
        intelligence: serializeAutocarIntelligenceContext(intelligence)
      }),
      text: { format: { type: 'json_schema', name: 'autocar_mode_simulation', strict: true, schema } }
    }),
    cache: 'no-store'
  });

  const raw = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(String(raw?.error?.message || `OpenAI respondeu com HTTP ${response.status}.`).slice(0, 500));
  const text = outputText(raw);
  if (!text) throw new Error('A OpenAI não retornou resposta para a simulação AUTOCAR.');

  let parsed: any;
  try { parsed = JSON.parse(text); } catch { throw new Error('A resposta estruturada do simulador não pôde ser interpretada.'); }

  const supabase: any = getAutocarDevClient();
  const { error } = await supabase.from('ai_training_simulations').insert({
    store_id: input.storeId,
    customer_input: customerInput,
    ai_response: String(parsed.response || '').trim(),
    evaluation: 'generated',
    reasoning_summary: String(parsed.reasoning_summary || '').trim() || null,
    next_action: String(parsed.next_action || '').trim() || null,
    context_snapshot: {
      simulation_mode: input.mode,
      execution_decision: parsed.execution_decision,
      execution_reason: parsed.execution_reason,
      training_ids: intelligence.training.map((item: any) => item.id),
      knowledge_document_ids: Array.from(new Set(intelligence.knowledge.map((item: any) => item.document_id))),
      inventory_vehicle_ids: intelligence.inventory?.matching_vehicles.map((item: any) => item.id) || [],
      inventory_source: intelligence.inventory?.source || null,
      hard_policies_applied: true,
      no_external_execution: true
    },
    model,
    input_tokens: Number(raw?.usage?.input_tokens || 0),
    output_tokens: Number(raw?.usage?.output_tokens || 0),
    actor_profile_id: input.actorProfileId || null
  });
  if (error) throw error;

  return {
    mode: input.mode,
    response: String(parsed.response || '').trim(),
    reasoning_summary: String(parsed.reasoning_summary || '').trim(),
    next_action: String(parsed.next_action || '').trim(),
    execution_decision: parsed.execution_decision,
    execution_reason: String(parsed.execution_reason || '').trim(),
    intelligence: {
      training_matches: intelligence.training.length,
      method_matches: intelligence.methodKnowledge.length,
      store_knowledge_matches: intelligence.storeKnowledge.length,
      inventory_available_count: intelligence.inventory?.available_count ?? 0,
      inventory_matches: intelligence.inventory?.matched_count ?? 0,
      hard_policies_applied: true
    },
    inventory_matches: intelligence.inventory?.matching_vehicles || [],
    model,
    usage: {
      input_tokens: Number(raw?.usage?.input_tokens || 0),
      output_tokens: Number(raw?.usage?.output_tokens || 0)
    }
  };
}
