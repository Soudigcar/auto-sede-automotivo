import { aiPlatformModelRegistry } from '@/lib/server/ai-platform/models/registry';
import { autocarHardPolicyManifest, evaluateAutocarPolicy } from '@/lib/server/autocar/policyEngine';
import {
  autocarCapabilities,
  autocarPolicyEffects,
  type AutocarCapability,
  type AutocarPolicyEffect
} from '@/lib/server/autocar/types';

type GlobalPolicyRow = {
  capability: AutocarCapability;
  effect: AutocarPolicyEffect;
  reason: string | null;
  is_active: boolean;
  version: number;
  created_at: string;
  updated_at: string;
};

type PricingRow = {
  model: string;
  input_brl_per_million: number | null;
  output_brl_per_million: number | null;
  audio_brl_per_minute: number | null;
  image_brl_per_unit: number | null;
  source_note: string | null;
  is_active: boolean;
  version: number;
  created_at: string;
  updated_at: string;
};

type UsageAccumulator = {
  claims: number;
  completed: number;
  skipped: number;
  failed: number;
  latencyTotal: number;
  latencySamples: number;
  attributedInputTokens: number;
  attributedOutputTokens: number;
  pricedTokens: number;
  unpricedTokens: number;
  unattributedTokens: number;
  estimatedCostBrl: number;
  unmeteredRoutedCalls: number;
  unmeteredAudioCalls: number;
  modelCalls: Record<string, number>;
  laneCalls: Record<string, number>;
  routingReasons: Record<string, number>;
  modelUsage: Record<string, { input: number; output: number; cost_brl: number; priced: boolean }>;
  solEscalations: number;
};

const REPORT_LIMIT = 2000;

function missingControlPlaneRelation(error: any) {
  const code = String(error?.code || '');
  const message = String(error?.message || error || '');
  return code === '42P01' || code === 'PGRST205' || /does not exist|could not find the table|schema cache/i.test(message);
}

function positive(value: unknown) {
  const number = Number(value || 0);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function nullableNonnegative(value: unknown) {
  if (value === '' || value === null || value === undefined) return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw new Error('Preço deve ser um número maior ou igual a zero.');
  return number;
}

function hardMap() {
  return new Map(autocarHardPolicyManifest().map((item) => [String(item.capability), item]));
}

export async function readAutocarGlobalPolicySnapshot(autocar: any) {
  const { data, error } = await autocar
    .from('ai_global_capability_policies')
    .select('capability,effect,reason,is_active,version,created_at,updated_at')
    .eq('is_active', true);

  if (error) {
    if (missingControlPlaneRelation(error)) {
      return {
        schemaReady: false,
        effects: {} as Partial<Record<AutocarCapability, AutocarPolicyEffect>>,
        rows: [] as GlobalPolicyRow[]
      };
    }
    throw error;
  }

  const rows = (data || []) as GlobalPolicyRow[];
  return {
    schemaReady: true,
    effects: Object.fromEntries(rows.map((row) => [row.capability, row.effect])) as Partial<Record<AutocarCapability, AutocarPolicyEffect>>,
    rows
  };
}

export function globalMasterPolicyInstructions(snapshot: Awaited<ReturnType<typeof readAutocarGlobalPolicySnapshot>>) {
  if (!snapshot.schemaReady) {
    return 'GLOBAL MASTER GOVERNANCE ainda não está provisionada neste ambiente. A simulação continua protegida pelo SAFE CORE, pelos gates atuais e sem qualquer execução externa.';
  }
  const restricted = snapshot.rows.filter((row) => row.effect !== 'allow');
  if (!restricted.length) return 'GLOBAL MASTER GOVERNANCE: nenhuma restrição adicional ativa além do SAFE CORE e dos padrões atuais.';
  return [
    'GLOBAL MASTER GOVERNANCE — teto adicional abaixo do SAFE CORE e acima de qualquer regra de loja.',
    ...restricted.map((row) => `${row.capability}: ${row.effect}${row.reason ? ` — ${row.reason}` : ''}.`),
    'Uma loja nunca pode tornar uma capacidade menos restritiva que esse teto.'
  ].join(' ');
}

export async function readAutocarMasterControlPlane(autocar: any) {
  const [policyResult, pricingResult] = await Promise.all([
    autocar.from('ai_global_capability_policies')
      .select('capability,effect,reason,is_active,version,created_at,updated_at')
      .order('capability'),
    autocar.from('ai_model_pricing')
      .select('model,input_brl_per_million,output_brl_per_million,audio_brl_per_minute,image_brl_per_unit,source_note,is_active,version,created_at,updated_at')
      .order('model')
  ]);

  const errors = [policyResult.error, pricingResult.error].filter(Boolean);
  const schemaReady = errors.length === 0;
  if (!schemaReady && !errors.every(missingControlPlaneRelation)) throw errors[0];

  const policies = schemaReady ? (policyResult.data || []) as GlobalPolicyRow[] : [];
  const pricing = schemaReady ? (pricingResult.data || []) as PricingRow[] : [];
  const policiesByCapability = new Map(policies.map((row) => [row.capability, row]));
  const hard = hardMap();
  const registry = aiPlatformModelRegistry();
  const pricingByModel = new Map(pricing.map((row) => [row.model, row]));

  const capabilities = autocarCapabilities.map((capability) => {
    const hardPolicy = hard.get(capability) || null;
    const globalPolicy = policiesByCapability.get(capability) || null;
    const defaultDecision = evaluateAutocarPolicy({ mode: 'autopilot', capability });
    const effectiveDecision = evaluateAutocarPolicy({
      mode: 'autopilot',
      capability,
      globalEffect: globalPolicy?.is_active ? globalPolicy.effect : null
    });
    return {
      capability,
      configurable: !hardPolicy,
      hard_policy: hardPolicy,
      default_effect: defaultDecision.effect,
      global_policy: globalPolicy,
      effective_ceiling: effectiveDecision.effect
    };
  });

  const registryModels = Object.entries(registry.lanes).map(([lane, entry]) => ({
    lane,
    model: entry.model,
    role: entry.role,
    pricing: pricingByModel.get(entry.model) || null
  }));
  const registryNames = new Set(registryModels.map((item) => item.model));
  const extraModels = pricing.filter((row) => !registryNames.has(row.model)).map((row) => ({
    lane: 'other',
    model: row.model,
    role: 'observed_or_auxiliary',
    pricing: row
  }));

  return {
    schema_ready: schemaReady,
    required_migration: schemaReady ? null : '20260823040800_autocar_master_control_plane_v2',
    hard_policies: Array.from(hard.values()),
    capabilities,
    model_registry: registry,
    model_pricing: [...registryModels, ...extraModels]
  };
}

async function currentGlobalPolicy(autocar: any, capability: AutocarCapability) {
  const { data, error } = await autocar.from('ai_global_capability_policies')
    .select('capability,effect,reason,is_active,version,created_at,updated_at')
    .eq('capability', capability).maybeSingle();
  if (error) {
    if (missingControlPlaneRelation(error)) throw new Error('Migration do Master Control Plane V2 ainda não aplicada neste ambiente AUTOCAR.');
    throw error;
  }
  return data as GlobalPolicyRow | null;
}

export async function setAutocarGlobalPolicy(autocar: any, input: {
  capability: AutocarCapability;
  effect: AutocarPolicyEffect | 'default';
  reason?: string | null;
  actorProfileId: string;
  expectedVersion: number;
}) {
  if (!autocarCapabilities.includes(input.capability)) throw new Error('Capability AUTOCAR inválida.');
  if (input.effect !== 'default' && !autocarPolicyEffects.includes(input.effect)) throw new Error('Efeito de policy inválido.');
  if (hardMap().has(input.capability)) throw new Error('SAFE CORE: esta capability é hard policy e não pode ser alterada pelo Master.');

  const current = await currentGlobalPolicy(autocar, input.capability);
  const currentVersion = Number(current?.version || 0);
  if (currentVersion !== input.expectedVersion) throw new Error('A regra global mudou desde a última leitura. Atualize a tela e tente novamente.');

  const patch = {
    effect: input.effect === 'default' ? (current?.effect || 'allow') : input.effect,
    reason: String(input.reason || '').trim().slice(0, 1000) || null,
    is_active: input.effect !== 'default',
    version: currentVersion + 1,
    updated_by_profile_id: input.actorProfileId,
    updated_at: new Date().toISOString()
  };

  if (current) {
    const { data, error } = await autocar.from('ai_global_capability_policies')
      .update(patch)
      .eq('capability', input.capability)
      .eq('version', currentVersion)
      .select('*').maybeSingle();
    if (error) throw error;
    if (!data) throw new Error('A regra global foi alterada em paralelo. Atualize a tela e tente novamente.');
    return data;
  }

  const { data, error } = await autocar.from('ai_global_capability_policies').insert({
    capability: input.capability,
    ...patch,
    created_by_profile_id: input.actorProfileId
  }).select('*').single();
  if (error) {
    if (error.code === '23505') throw new Error('A regra global foi criada em paralelo. Atualize a tela e tente novamente.');
    throw error;
  }
  return data;
}

async function currentPricing(autocar: any, model: string) {
  const { data, error } = await autocar.from('ai_model_pricing').select('*').eq('model', model).maybeSingle();
  if (error) {
    if (missingControlPlaneRelation(error)) throw new Error('Migration do Master Control Plane V2 ainda não aplicada neste ambiente AUTOCAR.');
    throw error;
  }
  return data as PricingRow | null;
}

export async function setAutocarModelPricing(autocar: any, input: {
  model: string;
  inputBrlPerMillion?: unknown;
  outputBrlPerMillion?: unknown;
  audioBrlPerMinute?: unknown;
  imageBrlPerUnit?: unknown;
  sourceNote?: string | null;
  active: boolean;
  actorProfileId: string;
  expectedVersion: number;
}) {
  const model = String(input.model || '').trim().slice(0, 160);
  if (!model || !/^[a-zA-Z0-9._:-]+$/.test(model)) throw new Error('Modelo inválido para a tabela de custos.');
  const current = await currentPricing(autocar, model);
  const currentVersion = Number(current?.version || 0);
  if (currentVersion !== input.expectedVersion) throw new Error('O preço deste modelo mudou desde a última leitura. Atualize a tela.');

  const patch = {
    input_brl_per_million: nullableNonnegative(input.inputBrlPerMillion),
    output_brl_per_million: nullableNonnegative(input.outputBrlPerMillion),
    audio_brl_per_minute: nullableNonnegative(input.audioBrlPerMinute),
    image_brl_per_unit: nullableNonnegative(input.imageBrlPerUnit),
    source_note: String(input.sourceNote || '').trim().slice(0, 1000) || null,
    is_active: Boolean(input.active),
    version: currentVersion + 1,
    updated_by_profile_id: input.actorProfileId,
    updated_at: new Date().toISOString()
  };

  if (current) {
    const { data, error } = await autocar.from('ai_model_pricing').update(patch)
      .eq('model', model).eq('version', currentVersion).select('*').maybeSingle();
    if (error) throw error;
    if (!data) throw new Error('O preço foi alterado em paralelo. Atualize a tela.');
    return data;
  }

  const { data, error } = await autocar.from('ai_model_pricing').insert({
    model,
    ...patch,
    created_by_profile_id: input.actorProfileId
  }).select('*').single();
  if (error) {
    if (error.code === '23505') throw new Error('O preço foi criado em paralelo. Atualize a tela.');
    throw error;
  }
  return data;
}

function newAccumulator(): UsageAccumulator {
  return {
    claims: 0,
    completed: 0,
    skipped: 0,
    failed: 0,
    latencyTotal: 0,
    latencySamples: 0,
    attributedInputTokens: 0,
    attributedOutputTokens: 0,
    pricedTokens: 0,
    unpricedTokens: 0,
    unattributedTokens: 0,
    estimatedCostBrl: 0,
    unmeteredRoutedCalls: 0,
    unmeteredAudioCalls: 0,
    modelCalls: {},
    laneCalls: {},
    routingReasons: {},
    modelUsage: {},
    solEscalations: 0
  };
}

function increment(map: Record<string, number>, key: unknown, amount = 1) {
  const normalized = String(key || '').trim();
  if (!normalized) return;
  map[normalized] = (map[normalized] || 0) + amount;
}

function addUsage(acc: UsageAccumulator, pricing: Map<string, PricingRow>, modelValue: unknown, inputValue: unknown, outputValue: unknown) {
  const model = String(modelValue || '').trim();
  const inputTokens = positive(inputValue);
  const outputTokens = positive(outputValue);
  const total = inputTokens + outputTokens;
  if (!total) return;

  if (!model) {
    acc.unattributedTokens += total;
    return;
  }

  acc.attributedInputTokens += inputTokens;
  acc.attributedOutputTokens += outputTokens;
  increment(acc.modelCalls, model);

  const price = pricing.get(model);
  const inputPriced = inputTokens === 0 || price?.input_brl_per_million !== null && price?.input_brl_per_million !== undefined;
  const outputPriced = outputTokens === 0 || price?.output_brl_per_million !== null && price?.output_brl_per_million !== undefined;
  const priced = Boolean(price?.is_active) && inputPriced && outputPriced;
  const usage = acc.modelUsage[model] || { input: 0, output: 0, cost_brl: 0, priced };
  usage.input += inputTokens;
  usage.output += outputTokens;
  usage.priced = usage.priced && priced;

  if (priced && price) {
    const cost = (inputTokens / 1_000_000) * Number(price.input_brl_per_million || 0)
      + (outputTokens / 1_000_000) * Number(price.output_brl_per_million || 0);
    acc.pricedTokens += total;
    acc.estimatedCostBrl += cost;
    usage.cost_brl += cost;
  } else {
    acc.unpricedTokens += total;
  }
  acc.modelUsage[model] = usage;
}

function addClaim(acc: UsageAccumulator, row: any, pricing: Map<string, PricingRow>) {
  const result = row?.result || {};
  const usage = result?.usage || {};
  const routing = result?.model_routing || {};
  const start = new Date(row.created_at).getTime();
  const end = row.completed_at ? new Date(row.completed_at).getTime() : NaN;

  acc.claims += 1;
  if (row.status === 'completed') acc.completed += 1;
  if (row.status === 'skipped') acc.skipped += 1;
  if (row.status === 'failed') acc.failed += 1;
  if (Number.isFinite(start) && Number.isFinite(end) && end >= start) {
    acc.latencyTotal += end - start;
    acc.latencySamples += 1;
  }

  addUsage(acc, pricing, result.model, usage.input_tokens, usage.output_tokens);
  addUsage(acc, pricing, result.vision?.model, result.vision?.usage?.input_tokens, result.vision?.usage?.output_tokens);
  addUsage(acc, pricing, result.document?.model, result.document?.usage?.input_tokens, result.document?.usage?.output_tokens);

  for (const key of ['planner', 'commercial']) {
    const item = routing?.[key];
    if (!item?.model) continue;
    increment(acc.laneCalls, item.lane);
    increment(acc.routingReasons, item.reason);
    if (item.escalated === true || item.lane === 'sol') acc.solEscalations += 1;
    const mainUsageMatches = key === 'commercial'
      && String(result.model || '') === String(item.model || '')
      && positive(usage.input_tokens) + positive(usage.output_tokens) > 0;
    if (!mainUsageMatches) acc.unmeteredRoutedCalls += 1;
  }

  if (result.audio?.model && !result.audio?.usage) acc.unmeteredAudioCalls += 1;
  if (result.tts_model) acc.unmeteredAudioCalls += 1;
}

function presentAccumulator(acc: UsageAccumulator) {
  const successBase = acc.completed + acc.failed;
  const incomplete = acc.unpricedTokens > 0 || acc.unattributedTokens > 0 || acc.unmeteredRoutedCalls > 0 || acc.unmeteredAudioCalls > 0;
  return {
    claims: acc.claims,
    completed: acc.completed,
    skipped: acc.skipped,
    failed: acc.failed,
    success_rate: successBase ? Number(((acc.completed / successBase) * 100).toFixed(1)) : null,
    average_claim_latency_ms: acc.latencySamples ? Math.round(acc.latencyTotal / acc.latencySamples) : null,
    tokens: {
      attributed_input: acc.attributedInputTokens,
      attributed_output: acc.attributedOutputTokens,
      attributed_total: acc.attributedInputTokens + acc.attributedOutputTokens,
      priced: acc.pricedTokens,
      unpriced: acc.unpricedTokens,
      unattributed: acc.unattributedTokens
    },
    estimated_cost_brl: acc.pricedTokens ? Number(acc.estimatedCostBrl.toFixed(6)) : null,
    cost_is_partial: acc.pricedTokens > 0 && incomplete,
    unmetered_routed_calls: acc.unmeteredRoutedCalls,
    unmetered_audio_calls: acc.unmeteredAudioCalls,
    model_calls: acc.modelCalls,
    lane_calls: acc.laneCalls,
    routing_reasons: acc.routingReasons,
    model_usage: acc.modelUsage,
    sol_escalations: acc.solEscalations
  };
}

function aggregatePeriod(rows: any[], pricing: Map<string, PricingRow>, sinceMs: number | null, sampleReachedLimit: boolean) {
  const filtered = sinceMs === null
    ? rows
    : rows.filter((row) => new Date(row.created_at).getTime() >= sinceMs);
  const global = newAccumulator();
  const stores = new Map<string, UsageAccumulator>();
  const conversations = new Map<string, { storeId: string; usage: UsageAccumulator }>();

  for (const row of filtered) {
    addClaim(global, row, pricing);
    const storeId = String(row.store_id || 'unknown');
    if (!stores.has(storeId)) stores.set(storeId, newAccumulator());
    addClaim(stores.get(storeId)!, row, pricing);

    const conversationId = String(row.production_conversation_id || '').trim();
    if (conversationId) {
      const key = `${storeId}:${conversationId}`;
      if (!conversations.has(key)) conversations.set(key, { storeId, usage: newAccumulator() });
      addClaim(conversations.get(key)!.usage, row, pricing);
    }
  }

  const timestamps = filtered.map((row) => new Date(row.created_at).getTime()).filter(Number.isFinite);
  const oldest = timestamps.length ? Math.min(...timestamps) : null;
  const newest = timestamps.length ? Math.max(...timestamps) : null;
  const truncated = sampleReachedLimit && (sinceMs === null || oldest === null || oldest > sinceMs);
  const conversationRows = Array.from(conversations.entries()).map(([key, value]) => {
    const [, conversationId] = key.split(':', 2);
    return {
      conversation_id: conversationId,
      store_id: value.storeId,
      ...presentAccumulator(value.usage)
    };
  }).sort((a, b) => {
    const cost = Number(b.estimated_cost_brl || 0) - Number(a.estimated_cost_brl || 0);
    if (cost) return cost;
    return Number(b.tokens?.attributed_total || 0) - Number(a.tokens?.attributed_total || 0);
  }).slice(0, 25);

  return {
    requested_since: sinceMs === null ? null : new Date(sinceMs).toISOString(),
    observed_from: oldest === null ? null : new Date(oldest).toISOString(),
    observed_to: newest === null ? null : new Date(newest).toISOString(),
    sample_truncated: truncated,
    global: presentAccumulator(global),
    stores: Object.fromEntries(Array.from(stores.entries()).map(([storeId, value]) => [storeId, presentAccumulator(value)])),
    conversations: conversationRows
  };
}

export async function readAutocarControlPlaneReport(autocar: any) {
  const [claimsResult, pricingResult] = await Promise.all([
    autocar.from('ai_runtime_message_claims')
      .select('store_id,production_conversation_id,purpose,status,message_type,created_at,completed_at,result')
      .order('created_at', { ascending: false })
      .limit(REPORT_LIMIT),
    autocar.from('ai_model_pricing').select('*').eq('is_active', true)
  ]);
  if (claimsResult.error) throw claimsResult.error;

  let pricingSchemaReady = true;
  if (pricingResult.error) {
    if (!missingControlPlaneRelation(pricingResult.error)) throw pricingResult.error;
    pricingSchemaReady = false;
  }
  const pricingRows = pricingSchemaReady ? (pricingResult.data || []) as PricingRow[] : [];
  const pricing = new Map(pricingRows.map((row) => [row.model, row]));
  const rows = claimsResult.data || [];
  const now = Date.now();
  const sampleReachedLimit = rows.length >= REPORT_LIMIT;
  const periods = {
    '24h': aggregatePeriod(rows, pricing, now - 24 * 60 * 60 * 1000, sampleReachedLimit),
    '7d': aggregatePeriod(rows, pricing, now - 7 * 24 * 60 * 60 * 1000, sampleReachedLimit),
    '30d': aggregatePeriod(rows, pricing, now - 30 * 24 * 60 * 60 * 1000, sampleReachedLimit),
    sample: aggregatePeriod(rows, pricing, null, sampleReachedLimit)
  };

  return {
    source: 'ai_runtime_message_claims',
    sample_limit: REPORT_LIMIT,
    pricing: {
      schema_ready: pricingSchemaReady,
      active_models: pricingRows.length,
      note: 'Custos só são calculados quando modelo, quantidade de uso e preço configurado são comprováveis. Calls roteadas sem usage, áudio/TTS sem unidade, tokens sem modelo e modelos sem preço permanecem explicitamente não alocados.'
    },
    periods
  };
}
