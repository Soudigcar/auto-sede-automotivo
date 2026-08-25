export const AUTOCAR_CONTEXT_ENGINE_VERSION = 'autocar-context-engine-v2-foundation';

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
const METHOD_LIMIT = 4;
const STORE_LIMIT = 3;
const EXCERPT_MAX_CHARS = 1600;

function similarityOf(row: SimilarityRow) {
  const value = Number(row?.similarity);
  return Number.isFinite(value) ? value : -1;
}

function trimExcerpt<T extends SimilarityRow>(row: T): T {
  if (typeof row.content !== 'string' || row.content.length <= EXCERPT_MAX_CHARS) return row;
  return { ...row, content: `${row.content.slice(0, EXCERPT_MAX_CHARS).trim()}…` };
}

export function selectRelevantTraining<T extends SimilarityRow>(rows: T[]) {
  return [...(rows || [])]
    .filter((row) => similarityOf(row) >= TRAINING_MIN_SIMILARITY)
    .sort((a, b) => similarityOf(b) - similarityOf(a))
    .slice(0, TRAINING_LIMIT);
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
}) {
  return {
    version: AUTOCAR_CONTEXT_ENGINE_VERSION,
    thresholds: {
      training_similarity: TRAINING_MIN_SIMILARITY,
      knowledge_similarity: KNOWLEDGE_MIN_SIMILARITY
    },
    limits: {
      training: TRAINING_LIMIT,
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
    }
  };
}
