import { createHash } from 'node:crypto';
import { autocarModelName } from '@/lib/server/autocar/client';
import { getAutocarDevClient } from '@/lib/server/autocar/devAdmin';
import { searchAutocarKnowledge } from '@/lib/server/autocar/knowledgeLibrary';

const EMBEDDING_MODEL = 'text-embedding-3-small';
const EMBEDDING_DIMENSIONS = 1536;

export type TrainingScenarioInput = {
  situation: string;
  intent?: string | null;
  idealResponse: string;
  objective?: string | null;
  nextAction?: string | null;
  restrictions?: string[];
  tags?: string[];
  examples?: string[];
  priority?: number;
  status?: 'draft' | 'approved';
  actorProfileId: string;
};

function openAiKey() {
  const key = String(process.env.OPENAI_API_KEY || '').trim();
  if (!key) throw new Error('OPENAI_API_KEY não disponível no ambiente de Preview.');
  return key;
}

function normalizeList(values: unknown, max = 20) {
  return (Array.isArray(values) ? values : [])
    .map((value) => String(value || '').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .slice(0, max);
}

function vectorLiteral(values: number[]) {
  return `[${values.map((value) => Number(value).toFixed(8)).join(',')}]`;
}

async function embedding(input: string) {
  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: { Authorization: `Bearer ${openAiKey()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input, dimensions: EMBEDDING_DIMENSIONS }),
    cache: 'no-store'
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(String(payload?.error?.message || `OpenAI embeddings respondeu com HTTP ${response.status}.`).slice(0, 500));
  const values = payload?.data?.[0]?.embedding;
  if (!Array.isArray(values)) throw new Error('A OpenAI não retornou embedding para o treinamento.');
  return values as number[];
}

function scenarioEmbeddingText(input: Omit<TrainingScenarioInput, 'actorProfileId'>) {
  return [
    `Situação do cliente: ${input.situation}`,
    input.intent ? `Intenção: ${input.intent}` : '',
    `Resposta ideal: ${input.idealResponse}`,
    input.objective ? `Objetivo comercial: ${input.objective}` : '',
    input.nextAction ? `Próxima ação: ${input.nextAction}` : '',
    normalizeList(input.restrictions).length ? `Restrições: ${normalizeList(input.restrictions).join(' | ')}` : '',
    normalizeList(input.tags).length ? `Tags: ${normalizeList(input.tags).join(', ')}` : '',
    normalizeList(input.examples).length ? `Exemplos: ${normalizeList(input.examples).join(' | ')}` : ''
  ].filter(Boolean).join('\n');
}

export async function listTrainingLab() {
  const supabase: any = getAutocarDevClient();
  const [scenariosResult, simulationsResult] = await Promise.all([
    supabase.from('ai_training_scenarios')
      .select('id,scope,store_id,situation,intent,ideal_response,objective,next_action,restrictions,tags,examples,priority,status,version,created_at,updated_at')
      .neq('status', 'archived')
      .order('priority', { ascending: true })
      .order('updated_at', { ascending: false }),
    supabase.from('ai_training_simulations')
      .select('id,scenario_id,store_id,customer_input,ai_response,corrected_response,evaluation,reasoning_summary,next_action,context_snapshot,model,input_tokens,output_tokens,created_at,updated_at')
      .order('created_at', { ascending: false })
      .limit(30)
  ]);
  if (scenariosResult.error) throw scenariosResult.error;
  if (simulationsResult.error) throw simulationsResult.error;
  return { scenarios: scenariosResult.data || [], simulations: simulationsResult.data || [] };
}

export async function saveTrainingScenario(input: TrainingScenarioInput, scenarioId?: string | null) {
  const supabase: any = getAutocarDevClient();
  const cleanSituation = String(input.situation || '').trim();
  const cleanIdeal = String(input.idealResponse || '').trim();
  if (!cleanSituation || !cleanIdeal) throw new Error('Situação e resposta ideal são obrigatórias.');

  const status = input.status === 'approved' ? 'approved' : 'draft';
  const values = await embedding(scenarioEmbeddingText({ ...input, status }));
  const payload = {
    scope: 'global',
    store_id: null,
    situation: cleanSituation,
    intent: String(input.intent || '').trim() || null,
    ideal_response: cleanIdeal,
    objective: String(input.objective || '').trim() || null,
    next_action: String(input.nextAction || '').trim() || null,
    restrictions: normalizeList(input.restrictions),
    tags: normalizeList(input.tags),
    examples: normalizeList(input.examples),
    priority: Math.max(1, Math.min(Number(input.priority || 100), 1000)),
    status,
    embedding: vectorLiteral(values),
    updated_by_profile_id: input.actorProfileId,
    updated_at: new Date().toISOString()
  };

  if (scenarioId) {
    const { data: current, error: currentError } = await supabase.from('ai_training_scenarios')
      .select('id,version').eq('id', scenarioId).eq('scope', 'global').maybeSingle();
    if (currentError) throw currentError;
    if (!current) throw new Error('Aprendizado não encontrado.');
    const { data, error } = await supabase.from('ai_training_scenarios')
      .update({ ...payload, version: Number(current.version || 1) + 1 })
      .eq('id', scenarioId).select('*').single();
    if (error) throw error;
    return data;
  }

  const { data, error } = await supabase.from('ai_training_scenarios').insert({
    ...payload,
    created_by_profile_id: input.actorProfileId
  }).select('*').single();
  if (error) throw error;
  return data;
}

export async function archiveTrainingScenario(id: string, actorProfileId: string) {
  const supabase: any = getAutocarDevClient();
  const { error } = await supabase.from('ai_training_scenarios').update({
    status: 'archived', updated_by_profile_id: actorProfileId, updated_at: new Date().toISOString()
  }).eq('id', id).eq('scope', 'global');
  if (error) throw error;
}

export async function searchTrainingScenarios(query: string, storeId: string | null, matchCount = 5) {
  const clean = String(query || '').trim();
  if (!clean) return [];
  const values = await embedding(clean);
  const supabase: any = getAutocarDevClient();
  const { data, error } = await supabase.rpc('match_autocar_training', {
    p_store_id: storeId,
    p_query_embedding: vectorLiteral(values),
    p_match_count: matchCount
  });
  if (error) throw error;
  return data || [];
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

const simulationSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    response: { type: 'string' },
    reasoning_summary: { type: 'string' },
    next_action: { type: 'string' },
    applied_training: { type: 'array', items: { type: 'string' } },
    applied_knowledge: { type: 'array', items: { type: 'string' } }
  },
  required: ['response', 'reasoning_summary', 'next_action', 'applied_training', 'applied_knowledge']
};

export async function simulateTraining(input: { customerInput: string; storeId?: string | null; actorProfileId: string }) {
  const customerInput = String(input.customerInput || '').trim();
  if (!customerInput) throw new Error('Digite uma pergunta ou situação do cliente.');
  const storeId = input.storeId || null;

  const [training, knowledge] = await Promise.all([
    searchTrainingScenarios(customerInput, storeId, 5),
    storeId ? searchAutocarKnowledge(storeId, customerInput, 7) : searchAutocarKnowledge('00000000-0000-0000-0000-000000000000', customerInput, 7)
  ]);

  const instructions = [
    'Você é a AUTOCAR em um laboratório privado de treinamento comercial automotivo.',
    'Não está falando com um cliente real e não deve executar ações externas.',
    'Responda como um vendedor automotivo humano, natural, consultivo e objetivo, em português do Brasil.',
    'Use primeiro os treinamentos oficiais aprovados e depois o Método Venda Mais e a Biblioteca Global recuperados.',
    'Nunca invente estoque, preço, desconto, aprovação de crédito, condição financeira ou avaliação de troca.',
    'Nunca prometa aprovação financeira, nunca confirme venda e nunca faça avaliação definitiva de troca.',
    'Quando faltar informação, faça uma pergunta de alto valor comercial em vez de inventar.',
    'Não mencione IA, embeddings, documentos, treinamento ou fontes ao cliente.',
    'O campo reasoning_summary deve explicar ao Master, de forma curta e sem cadeia de pensamento privada, quais regras e objetivos comerciais orientaram a resposta.'
  ].join(' ');

  const modelInput = JSON.stringify({
    pergunta_ou_situacao_do_cliente: customerInput,
    treinamentos_aprovados: training.map((item: any) => ({
      situacao: item.situation,
      intencao: item.intent,
      resposta_ideal: item.ideal_response,
      objetivo: item.objective,
      proxima_acao: item.next_action,
      restricoes: item.restrictions,
      tags: item.tags,
      similaridade: item.similarity
    })),
    conhecimento_recuperado: knowledge.map((item: any) => ({
      titulo: item.title,
      escopo: item.scope,
      trecho: item.content,
      similaridade: item.similarity
    }))
  });

  const model = autocarModelName();
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { Authorization: `Bearer ${openAiKey()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      store: false,
      max_output_tokens: 1200,
      instructions,
      input: modelInput,
      text: { format: { type: 'json_schema', name: 'autocar_training_simulation', strict: true, schema: simulationSchema } }
    }),
    cache: 'no-store'
  });
  const raw = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(String(raw?.error?.message || `OpenAI respondeu com HTTP ${response.status}.`).slice(0, 500));
  const text = outputText(raw);
  if (!text) throw new Error('A OpenAI não retornou resposta para a simulação.');

  let parsed: any;
  try { parsed = JSON.parse(text); } catch { throw new Error('A resposta estruturada do simulador não pôde ser interpretada.'); }

  const supabase: any = getAutocarDevClient();
  const { data: simulation, error } = await supabase.from('ai_training_simulations').insert({
    store_id: storeId,
    customer_input: customerInput,
    ai_response: String(parsed.response || '').trim(),
    evaluation: 'generated',
    reasoning_summary: String(parsed.reasoning_summary || '').trim() || null,
    next_action: String(parsed.next_action || '').trim() || null,
    context_snapshot: {
      training_ids: training.map((item: any) => item.id),
      knowledge_document_ids: Array.from(new Set(knowledge.map((item: any) => item.document_id))),
      fingerprint: createHash('sha256').update(customerInput + JSON.stringify(training.map((item: any) => item.id))).digest('hex')
    },
    model,
    input_tokens: Number(raw?.usage?.input_tokens || 0),
    output_tokens: Number(raw?.usage?.output_tokens || 0),
    actor_profile_id: input.actorProfileId
  }).select('*').single();
  if (error) throw error;

  return {
    simulation,
    response: parsed.response,
    reasoning_summary: parsed.reasoning_summary,
    next_action: parsed.next_action,
    applied_training: parsed.applied_training || [],
    applied_knowledge: parsed.applied_knowledge || [],
    retrieved_training: training,
    retrieved_knowledge: knowledge.map((item: any) => ({ document_id: item.document_id, title: item.title, scope: item.scope, similarity: item.similarity }))
  };
}

export async function reviewTrainingSimulation(input: {
  simulationId: string;
  evaluation: 'approved' | 'corrected' | 'rejected';
  correctedResponse?: string | null;
  saveAsLearning?: boolean;
  situation?: string | null;
  intent?: string | null;
  objective?: string | null;
  nextAction?: string | null;
  restrictions?: string[];
  tags?: string[];
  actorProfileId: string;
}) {
  const supabase: any = getAutocarDevClient();
  const { data: simulation, error: findError } = await supabase.from('ai_training_simulations')
    .select('*').eq('id', input.simulationId).maybeSingle();
  if (findError) throw findError;
  if (!simulation) throw new Error('Simulação não encontrada.');

  const corrected = String(input.correctedResponse || '').trim() || null;
  if (input.evaluation === 'corrected' && !corrected) throw new Error('Informe a resposta corrigida.');

  const { data: updated, error } = await supabase.from('ai_training_simulations').update({
    evaluation: input.evaluation,
    corrected_response: corrected,
    updated_at: new Date().toISOString()
  }).eq('id', input.simulationId).select('*').single();
  if (error) throw error;

  let learning = null;
  if (input.saveAsLearning && input.evaluation !== 'rejected') {
    learning = await saveTrainingScenario({
      situation: String(input.situation || simulation.customer_input).trim(),
      intent: input.intent || null,
      idealResponse: corrected || simulation.ai_response,
      objective: input.objective || null,
      nextAction: input.nextAction || simulation.next_action || null,
      restrictions: input.restrictions || [],
      tags: input.tags || [],
      examples: [simulation.customer_input],
      priority: 100,
      status: 'approved',
      actorProfileId: input.actorProfileId
    });
  }

  return { simulation: updated, learning };
}
