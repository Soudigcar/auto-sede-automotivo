export const AUTOCAR_CONTEXT_ENGINE_VERSION = 'autocar-context-engine-v3-master-store-precedence';

export type SimilarityRow = {
  similarity?: number | string | null;
  scope?: string | null;
  store_id?: string | null;
  content?: string | null;
  [key: string]: unknown;
};

const TRAINING_MIN_SIMILARITY = 0.58;
const KNOWLEDGE_MIN_SIMILARITY = 0.5;
const TRAINING_LIMIT = 3;
const MASTER_TRAINING_RESERVED = 2;
const STORE_TRAINING_RESERVED = 1;
const METHOD_LIMIT = 4;
const STORE_LIMIT = 3;
const EXCERPT_MAX_CHARS = 1600;

function similarityOf(row: SimilarityRow) {
  const value = Number(row?.similarity);
  return Number.isFinite(value) ? value : -1;
}

function sortedRelevant<T extends SimilarityRow>(rows: T[]) {
  return [...(rows || [])]
    .filter((row) => similarityOf(row) >= TRAINING_MIN_SIMILARITY)
    .sort((a, b) => similarityOf(b) - similarityOf(a));
}

function trimExcerpt<T extends SimilarityRow>(row: T): T {
  if (typeof row.content !== 'string' || row.content.length <= EXCERPT_MAX_CHARS) return row;
  return { ...row, content: `${row.content.slice(0, EXCERPT_MAX_CHARS).trim()}…` };
}

export function selectRelevantTraining<T extends SimilarityRow>(rows: T[], storeId?: string | null) {
  const relevant = sortedRelevant(rows);
  const cleanStoreId = String(storeId || '').trim();

  // Backward compatible path for callers without store context.
  if (!cleanStoreId) return relevant.slice(0, TRAINING_LIMIT);

  // Master/global training is sovereign. Training from another store is never eligible.
  const master = relevant.filter((row) => String(row.scope || 'global') !== 'store');
  const store = relevant.filter((row) => row.scope === 'store' && String(row.store_id || '') === cleanStoreId);

  const selected: T[] = [];
  selected.push(...master.slice(0, MASTER_TRAINING_RESERVED));
  if (store.length) selected.push(...store.slice(0, STORE_TRAINING_RESERVED));

  if (selected.length < TRAINING_LIMIT) {
    const already = new Set(selected.map((row) => row));
    const remainder = [...master.slice(MASTER_TRAINING_RESERVED), ...store.slice(STORE_TRAINING_RESERVED)]
      .filter((row) => !already.has(row))
      .sort((a, b) => similarityOf(b) - similarityOf(a));
    selected.push(...remainder.slice(0, TRAINING_LIMIT - selected.length));
  }

  return selected.slice(0, TRAINING_LIMIT);
}

export function trainingSelectionReport(rows: SimilarityRow[], selected: SimilarityRow[], storeId?: string | null) {
  const cleanStoreId = String(storeId || '').trim();
  return {
    precedence: cleanStoreId ? ['global_master', 'store_complementary'] : ['similarity_only_legacy_caller'],
    selected_global: selected.filter((row) => String(row.scope || 'global') !== 'store').length,
    selected_store: selected.filter((row) => row.scope === 'store' && String(row.store_id || '') === cleanStoreId).length,
    excluded_other_store: cleanStoreId
      ? rows.filter((row) => row.scope === 'store' && String(row.store_id || '') !== cleanStoreId).length
      : 0
  };
}

export function selectRelevantKnowledge<T extends SimilarityRow>(rows: T[], storeId: string) {
  const relevant = [...(rows || [])]
    .filter((row) => similarityOf(row) >= KNOWLEDGE_MIN_SIMILARITY)
    .sort((a, b) => similarityOf(b) - similarityOf(a));

  const store = relevant
    .filter((row) => row.scope === 'store' && row.store_id === storeId)
    .slice(0, STORE_LIMIT)
    .map(trimExcerpt);
  const method = relevant
    .filter((row) => row.scope === 'method')
    .slice(0, METHOD_LIMIT)
    .map(trimExcerpt);

  return {
    method,
    store,
    all: [...store, ...method].sort((a, b) => similarityOf(b) - similarityOf(a))
  };
}

export function autocarContextBudgetReport(input: {
  rawTraining: SimilarityRow[];
  selectedTraining: SimilarityRow[];
  rawKnowledge: SimilarityRow[];
  selectedMethod: SimilarityRow[];
  selectedStore: SimilarityRow[];
  storeId?: string | null;
}) {
  return {
    version: AUTOCAR_CONTEXT_ENGINE_VERSION,
    thresholds: {
      training_similarity: TRAINING_MIN_SIMILARITY,
      knowledge_similarity: KNOWLEDGE_MIN_SIMILARITY
    },
    limits: {
      training: TRAINING_LIMIT,
      master_training_reserved: MASTER_TRAINING_RESERVED,
      store_training_reserved: STORE_TRAINING_RESERVED,
      method_knowledge: METHOD_LIMIT,
      store_knowledge: STORE_LIMIT,
      excerpt_max_chars: EXCERPT_MAX_CHARS
    },
    raw: {
      training: input.rawTraining.length,
      knowledge: input.rawKnowledge.length
    },
    selected: {
      training: input.selectedTraining.length,
      method_knowledge: input.selectedMethod.length,
      store_knowledge: input.selectedStore.length
    },
    training_selection: trainingSelectionReport(input.rawTraining, input.selectedTraining, input.storeId)
  };
}
