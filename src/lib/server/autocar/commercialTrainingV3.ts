export const AUTOCAR_COMMERCIAL_TRAINING_VERSION = 3 as const;
export const AUTOCAR_COMMERCIAL_TRAINING_PREFIX = 'AUTOCAR_COMMERCIAL_TRAINING_V3:';

export type AutocarTrainingScope = 'global' | 'store';

export type CommercialTrainingV3Envelope = {
  version: 3;
  technique: string;
  reference_response?: string | null;
};

export type CommercialTrainingScenarioLike = {
  id?: string | null;
  scope?: string | null;
  store_id?: string | null;
  situation?: string | null;
  intent?: string | null;
  ideal_response?: string | null;
  objective?: string | null;
  next_action?: string | null;
  restrictions?: unknown;
  tags?: unknown;
  examples?: unknown;
  similarity?: unknown;
};

export type CommercialTrainingGuidanceV3 = {
  training_version: 3 | 'legacy';
  id: string | null;
  scope: AutocarTrainingScope;
  store_id: string | null;
  situation: string;
  commercial_intent: string | null;
  technique: string;
  objective: string | null;
  avoid: string[];
  preferred_next_move: string | null;
  reference_examples: string[];
  reference_response: string | null;
  tags: string[];
  similarity: number | null;
};

function cleanText(value: unknown, max = 6000) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function cleanList(value: unknown, maxItems = 20, maxChars = 700) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => cleanText(item, maxChars))
    .filter(Boolean)
    .slice(0, maxItems);
}

export function resolveCommercialTrainingScopeV3(scope: unknown, storeId: unknown) {
  const normalizedScope: AutocarTrainingScope = scope === 'store' ? 'store' : 'global';
  const normalizedStoreId = cleanText(storeId, 120) || null;

  if (normalizedScope === 'store' && !normalizedStoreId) {
    throw new Error('Treinamento com escopo de loja exige uma loja identificada.');
  }
  if (normalizedScope === 'global' && normalizedStoreId) {
    throw new Error('Treinamento global não pode carregar identificador de loja.');
  }

  return { scope: normalizedScope, storeId: normalizedStoreId };
}

export function encodeCommercialTrainingV3Envelope(input: {
  technique: string;
  referenceResponse?: string | null;
}) {
  const technique = cleanText(input.technique, 5000);
  if (!technique) throw new Error('Técnica comercial é obrigatória no treinamento V3.');
  const referenceResponse = cleanText(input.referenceResponse, 6000) || null;
  const payload: CommercialTrainingV3Envelope = {
    version: AUTOCAR_COMMERCIAL_TRAINING_VERSION,
    technique,
    reference_response: referenceResponse
  };
  return `${AUTOCAR_COMMERCIAL_TRAINING_PREFIX}${JSON.stringify(payload)}`;
}

export function decodeCommercialTrainingV3Envelope(value: unknown): CommercialTrainingV3Envelope | null {
  const raw = String(value ?? '').trim();
  if (!raw.startsWith(AUTOCAR_COMMERCIAL_TRAINING_PREFIX)) return null;
  try {
    const parsed = JSON.parse(raw.slice(AUTOCAR_COMMERCIAL_TRAINING_PREFIX.length));
    if (Number(parsed?.version) !== AUTOCAR_COMMERCIAL_TRAINING_VERSION) return null;
    const technique = cleanText(parsed?.technique, 5000);
    if (!technique) return null;
    return {
      version: AUTOCAR_COMMERCIAL_TRAINING_VERSION,
      technique,
      reference_response: cleanText(parsed?.reference_response, 6000) || null
    };
  } catch {
    return null;
  }
}

function legacyTechnique(row: CommercialTrainingScenarioLike) {
  const parts = [
    'Use o comportamento comercial demonstrado pela referência apenas como exemplo de estratégia, nunca como texto obrigatório.',
    cleanText(row.objective, 1800) ? `Preserve o objetivo comercial: ${cleanText(row.objective, 1800)}.` : '',
    cleanText(row.next_action, 1800) ? `Prefira o próximo movimento: ${cleanText(row.next_action, 1800)}.` : ''
  ].filter(Boolean);
  return parts.join(' ');
}

function similarityValue(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function normalizeCommercialTrainingScenarioV3(row: CommercialTrainingScenarioLike): CommercialTrainingGuidanceV3 {
  const scope = row.scope === 'store' ? 'store' : 'global';
  const storeId = cleanText(row.store_id, 120) || null;
  if (scope === 'store' && !storeId) {
    throw new Error('Treinamento de loja inválido: store_id ausente.');
  }
  if (scope === 'global' && storeId) {
    throw new Error('Treinamento global inválido: store_id deve ser nulo.');
  }

  const envelope = decodeCommercialTrainingV3Envelope(row.ideal_response);
  const legacyReference = envelope ? null : cleanText(row.ideal_response, 6000) || null;
  const referenceResponse = envelope?.reference_response || legacyReference;
  const examples = cleanList(row.examples, 20, 1000);

  return {
    training_version: envelope ? AUTOCAR_COMMERCIAL_TRAINING_VERSION : 'legacy',
    id: cleanText(row.id, 120) || null,
    scope,
    store_id: storeId,
    situation: cleanText(row.situation, 4000),
    commercial_intent: cleanText(row.intent, 300) || null,
    technique: envelope?.technique || legacyTechnique(row),
    objective: cleanText(row.objective, 2000) || null,
    avoid: cleanList(row.restrictions, 20, 700),
    preferred_next_move: cleanText(row.next_action, 2000) || null,
    reference_examples: examples,
    reference_response: referenceResponse,
    tags: cleanList(row.tags, 30, 240),
    similarity: similarityValue(row.similarity)
  };
}

export function serializeCommercialTrainingGuidanceV3(rows: CommercialTrainingScenarioLike[]) {
  return (rows || []).map(normalizeCommercialTrainingScenarioV3);
}

export function buildCommercialTrainingEmbeddingTextV3(row: CommercialTrainingScenarioLike) {
  const guidance = normalizeCommercialTrainingScenarioV3(row);
  return [
    `Situação do cliente: ${guidance.situation}`,
    guidance.commercial_intent ? `Intenção comercial: ${guidance.commercial_intent}` : '',
    `Técnica comercial: ${guidance.technique}`,
    guidance.objective ? `Objetivo comercial: ${guidance.objective}` : '',
    guidance.avoid.length ? `Evitar: ${guidance.avoid.join(' | ')}` : '',
    guidance.preferred_next_move ? `Próximo movimento preferido: ${guidance.preferred_next_move}` : '',
    guidance.reference_examples.length ? `Exemplos de situação: ${guidance.reference_examples.join(' | ')}` : '',
    guidance.reference_response ? `Exemplo de resposta não vinculante: ${guidance.reference_response}` : '',
    guidance.tags.length ? `Tags: ${guidance.tags.join(', ')}` : ''
  ].filter(Boolean).join('\n');
}

export function commercialTrainingV3Instructions() {
  return [
    'CONTRATO DE TREINAMENTO COMERCIAL V3:',
    'o treinamento ensina técnica, princípio, objetivo, restrições e próximo movimento; nunca transforma exemplo em resposta fixa.',
    'Exemplos e reference_response são referências não vinculantes: gere linguagem nova e natural para o contexto atual e não copie literalmente por padrão.',
    'Responda primeiro à pergunta explícita do cliente quando houver resposta segura e confirmada; depois avance no máximo um movimento comercial útil.',
    'Respeite a maturidade da conversa: interesse inicial, pergunta de preço ou pedido de informação isolado não autorizam forçar visita ou test-drive.',
    'Treinamento de loja pode adaptar técnica, tom e processo local, mas nunca enfraquecer segurança, regras Master ou fatos canônicos.',
    'Treinamento comercial não autoriza ação operacional externa: envio, agenda, alteração de CRM, transferência, negociação protegida e outras capacidades continuam governadas pelo backend.'
  ].join(' ');
}
