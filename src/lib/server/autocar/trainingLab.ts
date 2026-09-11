import { createHash } from 'node:crypto';
import { autocarModelName } from '@/lib/server/autocar/client';
import {
  buildCommercialTrainingEmbeddingTextV3,
  commercialTrainingV3Instructions,
  encodeCommercialTrainingV3Envelope,
  normalizeCommercialTrainingScenarioV3,
  resolveCommercialTrainingScopeV3,
  serializeCommercialTrainingGuidanceV3,
  type AutocarTrainingScope,
  type CommercialTrainingScenarioLike
} from '@/lib/server/autocar/commercialTrainingV3';
import { getAutocarDevClient } from '@/lib/server/autocar/devAdmin';
import { searchAutocarKnowledge } from '@/lib/server/autocar/knowledgeLibrary';

const EMBEDDING_MODEL = 'text-embedding-3-small';
const EMBEDDING_DIMENSIONS = 1536;

export type TrainingScenarioInput = {
  scope?: AutocarTrainingScope;
  storeId?: string | null;
  situation: string;
  intent?: string | null;
  technique?: string | null;
  referenceResponse?: string | null;
  idealResponse?: string | null;
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

function trainingStorageValue(input: TrainingScenarioInput) {
  const technique = String(input.technique || '').trim();
  const legacyIdeal = String(input.idealResponse || '').trim();
  if (technique) {
    return encodeCommercialTrainingV3Envelope({
      technique,
      referenceResponse: String(input.referenceResponse || legacyIdeal || '').trim() || null
    });
  }
  if (legacyIdeal) return legacyIdeal;
  throw new Error('Técnica comercial é obrigatória no treinamento V3.');
}

function applyTrainingTarget(query: any, target: { scope: AutocarTrainingScope; storeId: string | null }) {
  const scoped = query.eq('scope', target.scope);
  return target.scope === 'store'
    ? scoped.eq('store_id', target.storeId)
    : scoped.is('store_id', null);
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
  if (!cleanSituation) throw new Error('Situação do cliente é obrigatória.');

  const target = resolveCommercialTrainingScopeV3(input.scope || 'global', input.storeId || null);
  const status = input.status === 'approved' ? 'approved' : 'draft';
  const payload = {
    scope: target.scope,
    store_id: target.storeId,
    situation: cleanSituation,
    intent: String(input.intent || '').trim() || null,
    ideal_response: trainingStorageValue(input),
    objective: String(input.objective || '').trim() || null,
    next_action: String(input.nextAction || '').trim() || null,
    restrictions: normalizeList(input.restrictions),
    tags: normalizeList(input.tags),
    examples: normalizeList(input.examples),
    priority: Math.max(1, Math.min(Number(input.priority || 100), 1000)),
    status,
    embedding: null,
    updated_by_profile_id: input.actorProfileId,
    updated_at: new Date().toISOString()
  };

  if (scenarioId) {
    const { data: current, error: currentError } = await supabase.from('ai_training_scenarios')
      .select('id,scope,store_id,version').eq('id', scenarioId).maybeSingle();
    if (currentError) throw currentError;
    if (!current) throw new Error('Aprendizado não encontrado.');
    const currentTarget = resolveCommercialTrainingScopeV3(current.scope, current.store_id);
    if (currentTarget.scope !== target.scope || currentTarget.storeId !== target.storeId) {
      throw new Error('O escopo de um aprendizado existente não pode ser trocado. Crie um novo rascunho para outro escopo.');
    }
    let updateQuery = supabase.from('ai_training_scenarios')
      .update({ ...payload, version: Number(current.version || 1) + 1 })
      .eq('id', scenarioId);
    updateQuery = applyTrainingTarget(updateQuery, target);
    const { data, error } = await updateQuery.select('*').single();
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

export async function prepareTrainingScenarioForApproval(scenarioId: string, actorProfileId: string) {
  const supabase: any = getAutocarDevClient();
  const { data: current, error: currentError } = await supabase.from('ai_training_scenarios')
    .select('id,scope,store_id,situation,intent,ideal_response,objective,next_action,restrictions,tags,examples,priority,status,version,updated_at')
    .eq('id', scenarioId)
    .maybeSingle();
  if (currentError) throw currentError;
  if (!current) throw new Error('Aprendizado não encontrado.');
  if (current.status === 'archived') throw new Error('Aprendizado arquivado não pode ser aprovado.');

  const target = resolveCommercialTrainingScopeV3(current.scope, current.store_id);
  const expectedVersion = Number(current.version || 1);
  const expectedUpdatedAt = String(current.updated_at || '');
  if (!expectedUpdatedAt) throw new Error('Aprendizado sem versão temporal válida para aprovação.');

  const values = await embedding(buildCommercialTrainingEmbeddingTextV3(current));
  const preparedAt = new Date().toISOString();
  let updateQuery = supabase.from('ai_training_scenarios').update({
    embedding: vectorLiteral(values),
    updated_by_profile_id: actorProfileId,
    updated_at: preparedAt
  })
    .eq('id', scenarioId)
    .eq('version', expectedVersion)
    .eq('updated_at', expectedUpdatedAt)
    .neq('status', 'archived');
  updateQuery = applyTrainingTarget(updateQuery, target);
  const { data, error } = await updateQuery.select('*').maybeSingle();
  if (error) throw error;
  if (!data) {
    throw new Error('O aprendizado foi alterado enquanto o embedding era gerado. Recarregue a tela e tente aprovar novamente.');
  }
  return data;
}

export async function archiveTrainingScenario(id: string, actorProfileId: string) {
  const supabase: any = getAutocarDevClient();
  const { data: current, error: findError } = await supabase.from('ai_training_scenarios')
    .select('id,scope,store_id').eq('id', id).maybeSingle();
  if (findError) throw findError;
  if (!current) throw new Error('Aprendizado não encontrado.');
  const target = resolveCommercialTrainingScopeV3(current.scope, current.store_id);
  let updateQuery = supabase.from('ai_training_scenarios').update({
    status: 'archived', updated_by_profile_id: actorProfileId, updated_at: new Date().toISOString()
  }).eq('id', id);
  updateQuery = applyTrainingTarget(updateQuery, target);
  const { error } = await updateQuery;
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

async function generateTrainingSimulation(input: {
  customerInput: string;
  conversationContext?: string[];
  training: CommercialTrainingScenarioLike[];
  knowledge: any[];
}) {
  const instructions = [
    'Você é a AUTOCAR em um laboratório privado de treinamento comercial automotivo.',
    'Não está falando com um cliente real e não deve executar ações externas.',
    'Responda como um vendedor automotivo humano, natural, consultivo e objetivo, em português do Brasil.',
    commercialTrainingV3Instructions(),
    'Use depois o Método Venda Mais e a Biblioteca Global recuperados, sem contrariar o contrato de treinamento V3.',
    'Nunca invente estoque, preço, desconto, aprovação de crédito, condição financeira ou avaliação de troca.',
    'Nunca prometa aprovação financeira, nunca confirme venda e nunca faça avaliação definitiva de troca.',
    'Quando faltar informação, faça uma pergunta de alto valor comercial em vez de inventar.',
    'Não mencione IA, embeddings, documentos, treinamento ou fontes ao cliente.',
    'O campo reasoning_summary deve explicar ao Master, de forma curta e sem cadeia de pensamento privada, quais técnicas, regras e objetivos comerciais orientaram a resposta.'
  ].join(' ');

  const trainingGuidance = serializeCommercialTrainingGuidanceV3(input.training);
  const modelInput = JSON.stringify({
    customer_input: input.customerInput,
    conversation_context: (input.conversationContext || []).slice(-12),
    commercial_training_v3: trainingGuidance,
    retrieved_knowledge: input.knowledge.map((item: any) => ({
      title: item.title,
      scope: item.scope,
      excerpt: item.content,
      similarity: item.similarity
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

  return {
    parsed,
    raw,
    model,
    trainingGuidance
  };
}

export async function simulateCommercialTrainingV3Preview(input: {
  customerInput: string;
  situation?: string | null;
  scope?: AutocarTrainingScope;
  storeId?: string | null;
  intent?: string | null;
  technique: string;
  referenceResponse?: string | null;
  objective?: string | null;
  nextAction?: string | null;
  restrictions?: string[];
  tags?: string[];
  examples?: string[];
  conversationContext?: string[];
}) {
  const customerInput = String(input.customerInput || '').trim();
  if (!customerInput) throw new Error('Digite uma pergunta ou situação do cliente.');
  const target = resolveCommercialTrainingScopeV3(input.scope || 'global', input.storeId || null);
  const syntheticScenario: CommercialTrainingScenarioLike = {
    id: 'synthetic-commercial-training-v3',
    scope: target.scope,
    store_id: target.storeId,
    situation: String(input.situation || customerInput).trim(),
    intent: String(input.intent || '').trim() || null,
    ideal_response: encodeCommercialTrainingV3Envelope({
      technique: input.technique,
      referenceResponse: input.referenceResponse || null
    }),
    objective: String(input.objective || '').trim() || null,
    next_action: String(input.nextAction || '').trim() || null,
    restrictions: normalizeList(input.restrictions),
    tags: normalizeList(input.tags),
    examples: normalizeList(input.examples),
    similarity: 1
  };

  const generated = await generateTrainingSimulation({
    customerInput,
    conversationContext: normalizeList(input.conversationContext, 12),
    training: [syntheticScenario],
    knowledge: []
  });

  return {
    simulation: null,
    preview_synthetic: true,
    external_execution: false,
    response: generated.parsed.response,
    reasoning_summary: generated.parsed.reasoning_summary,
    next_action: generated.parsed.next_action,
    applied_training: generated.parsed.applied_training || [],
    applied_knowledge: generated.parsed.applied_knowledge || [],
    training_guidance: generated.trainingGuidance,
    model: generated.model,
    input_tokens: Number(generated.raw?.usage?.input_tokens || 0),
    output_tokens: Number(generated.raw?.usage?.output_tokens || 0)
  };
}

export async function simulateTraining(input: {
  customerInput: string;
  storeId?: string | null;
  actorProfileId: string;
  conversationContext?: string[];
  persistSimulation?: boolean;
}) {
  const customerInput = String(input.customerInput || '').trim();
  if (!customerInput) throw new Error('Digite uma pergunta ou situação do cliente.');
  const storeId = input.storeId || null;

  const [training, knowledge] = await Promise.all([
    searchTrainingScenarios(customerInput, storeId, 5),
    storeId ? searchAutocarKnowledge(storeId, customerInput, 7) : searchAutocarKnowledge('00000000-0000-0000-0000-000000000000', customerInput, 7)
  ]);

  const generated = await generateTrainingSimulation({
    customerInput,
    conversationContext: normalizeList(input.conversationContext, 12),
    training,
    knowledge
  });

  let simulation = null;
  if (input.persistSimulation !== false) {
    const supabase: any = getAutocarDevClient();
    const { data, error } = await supabase.from('ai_training_simulations').insert({
      store_id: storeId,
      customer_input: customerInput,
      ai_response: String(generated.parsed.response || '').trim(),
      evaluation: 'generated',
      reasoning_summary: String(generated.parsed.reasoning_summary || '').trim() || null,
      next_action: String(generated.parsed.next_action || '').trim() || null,
      context_snapshot: {
        training_ids: training.map((item: any) => item.id),
        knowledge_document_ids: Array.from(new Set(knowledge.map((item: any) => item.document_id))),
        training_version: 3,
        fingerprint: createHash('sha256').update(customerInput + JSON.stringify(training.map((item: any) => item.id))).digest('hex')
      },
      model: generated.model,
      input_tokens: Number(generated.raw?.usage?.input_tokens || 0),
      output_tokens: Number(generated.raw?.usage?.output_tokens || 0),
      actor_profile_id: input.actorProfileId
    }).select('*').single();
    if (error) throw error;
    simulation = data;
  }

  return {
    simulation,
    response: generated.parsed.response,
    reasoning_summary: generated.parsed.reasoning_summary,
    next_action: generated.parsed.next_action,
    applied_training: generated.parsed.applied_training || [],
    applied_knowledge: generated.parsed.applied_knowledge || [],
    retrieved_training: generated.trainingGuidance,
    retrieved_knowledge: knowledge.map((item: any) => ({ document_id: item.document_id, title: item.title, scope: item.scope, similarity: item.similarity }))
  };
}

export async function reviewTrainingSimulation(input: {
  simulationId: string;
  evaluation: 'approved' | 'corrected' | 'rejected';
  correctedResponse?: string | null;
  saveAsLearning?: boolean;
  scope?: AutocarTrainingScope;
  storeId?: string | null;
  situation?: string | null;
  intent?: string | null;
  technique?: string | null;
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
    const technique = String(input.technique || '').trim();
    if (!technique) throw new Error('Descreva a técnica comercial que deve ser aprendida com esta revisão.');
    const scope: AutocarTrainingScope = input.scope || (simulation.store_id ? 'store' : 'global');
    learning = await saveTrainingScenario({
      scope,
      storeId: scope === 'store' ? String(input.storeId || simulation.store_id || '').trim() : null,
      situation: String(input.situation || simulation.customer_input).trim(),
      intent: input.intent || null,
      technique,
      referenceResponse: corrected || simulation.ai_response,
      objective: input.objective || null,
      nextAction: input.nextAction || simulation.next_action || null,
      restrictions: input.restrictions || [],
      tags: input.tags || [],
      examples: [simulation.customer_input],
      priority: 100,
      status: 'draft',
      actorProfileId: input.actorProfileId
    });
  }

  return { simulation: updated, learning };
}
