export type AutocarOpenAiStage = 'retrieval_embedding' | 'structured_response' | 'generation_internal';
export type AutocarOpenAiFailureCategory =
  | 'authentication'
  | 'quota'
  | 'rate_limit'
  | 'access'
  | 'request'
  | 'provider'
  | 'transport'
  | 'invalid_response'
  | 'internal';

export type AutocarOpenAiFailure = {
  stage: AutocarOpenAiStage;
  category: AutocarOpenAiFailureCategory;
  status: number | null;
  code: string;
  request_id: string | null;
  correlation_id: string | null;
};

export class AutocarOpenAiStageError extends Error {
  readonly diagnostic: AutocarOpenAiFailure;
  constructor(diagnostic: AutocarOpenAiFailure) {
    super(`autocar_openai_${diagnostic.stage}_${diagnostic.category}`);
    this.name = 'AutocarOpenAiStageError';
    this.diagnostic = diagnostic;
  }
}

function cleanCode(value: unknown, fallback = 'unknown_error') {
  const normalized = String(value || '').trim().replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 80);
  return normalized || fallback;
}

function cleanId(value: unknown) {
  const normalized = String(value || '').trim().replace(/[^a-zA-Z0-9._:-]+/g, '').slice(0, 160);
  return normalized || null;
}

function categoryFor(status: number | null, code: string): AutocarOpenAiFailureCategory {
  const value = code.toLowerCase();
  if (status === 401 || value.includes('invalid_api_key') || value.includes('authentication')) return 'authentication';
  if (value.includes('insufficient_quota') || value.includes('billing_quota') || value.includes('quota_exceeded')) return 'quota';
  if (status === 429 || value.includes('rate_limit')) return 'rate_limit';
  if (status === 403 || value.includes('permission') || value.includes('model_not_found')) return 'access';
  if (status !== null && status >= 500) return 'provider';
  if (status !== null && status >= 400) return 'request';
  return 'internal';
}

export function openAiHttpFailure(
  stage: AutocarOpenAiStage,
  response: Pick<Response, 'status' | 'headers'>,
  payload: any,
  correlationId?: string | null
) {
  const code = cleanCode(payload?.error?.code || payload?.error?.type || `http_${response.status}`);
  return new AutocarOpenAiStageError({
    stage,
    category: categoryFor(response.status, code),
    status: response.status,
    code,
    request_id: cleanId(response.headers?.get?.('x-request-id')),
    correlation_id: cleanId(correlationId)
  });
}

export function openAiTransportFailure(stage: AutocarOpenAiStage, error: unknown, correlationId?: string | null) {
  const code = cleanCode((error as any)?.code || (error as any)?.name || 'transport_error', 'transport_error');
  return new AutocarOpenAiStageError({
    stage,
    category: 'transport',
    status: null,
    code,
    request_id: null,
    correlation_id: cleanId(correlationId)
  });
}

export function invalidOpenAiResponseFailure(stage: AutocarOpenAiStage, code: string, correlationId?: string | null, requestId?: string | null) {
  return new AutocarOpenAiStageError({
    stage,
    category: 'invalid_response',
    status: null,
    code: cleanCode(code, 'invalid_response'),
    request_id: cleanId(requestId),
    correlation_id: cleanId(correlationId)
  });
}

export function missingOpenAiKeyFailure(stage: AutocarOpenAiStage, correlationId?: string | null) {
  return new AutocarOpenAiStageError({
    stage,
    category: 'authentication',
    status: null,
    code: 'missing_api_key',
    request_id: null,
    correlation_id: cleanId(correlationId)
  });
}

export function sanitizeAutocarOpenAiFailure(error: unknown, fallbackStage: AutocarOpenAiStage, correlationId?: string | null): AutocarOpenAiFailure {
  if (error instanceof AutocarOpenAiStageError) return error.diagnostic;
  const statusValue = Number((error as any)?.status);
  const status = Number.isInteger(statusValue) && statusValue >= 100 && statusValue <= 599 ? statusValue : null;
  const code = cleanCode((error as any)?.code || 'internal_error', 'internal_error');
  return {
    stage: fallbackStage,
    category: categoryFor(status, code),
    status,
    code,
    request_id: cleanId((error as any)?.requestId || (error as any)?.request_id),
    correlation_id: cleanId(correlationId)
  };
}

export function recordAutocarOpenAiFailure(diagnostic: AutocarOpenAiFailure) {
  console.error(`AUTOCAR_OPENAI_FAILURE ${JSON.stringify(diagnostic)}`);
}

const RETRIEVAL_EMBEDDING_MODEL = 'text-embedding-3-small';
const RETRIEVAL_EMBEDDING_DIMENSIONS = 1536;

export async function createAutocarRetrievalEmbedding(input: string, correlationId?: string | null) {
  const key = String(process.env.OPENAI_API_KEY || '').trim();
  if (!key) throw missingOpenAiKeyFailure('retrieval_embedding', correlationId);
  let response: Response;
  try {
    response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: RETRIEVAL_EMBEDDING_MODEL, input, dimensions: RETRIEVAL_EMBEDDING_DIMENSIONS }),
      cache: 'no-store'
    });
  } catch (error) {
    throw openAiTransportFailure('retrieval_embedding', error, correlationId);
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw openAiHttpFailure('retrieval_embedding', response, payload, correlationId);
  const embedding = payload?.data?.[0]?.embedding;
  if (!Array.isArray(embedding) || embedding.length !== RETRIEVAL_EMBEDDING_DIMENSIONS) {
    throw invalidOpenAiResponseFailure('retrieval_embedding', 'invalid_embedding_payload', correlationId, response.headers.get('x-request-id'));
  }
  return embedding as number[];
}

export function autocarVectorLiteral(values: number[]) {
  return `[${values.map((value) => Number(value).toFixed(8)).join(',')}]`;
}
