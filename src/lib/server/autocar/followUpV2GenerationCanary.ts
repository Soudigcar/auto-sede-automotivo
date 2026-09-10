import { createHash } from 'node:crypto';
import {
  createAutocarStructuredResponse,
  type AutocarStructuredResponseRequest
} from '@/lib/server/autocar/client';
import {
  createAutocarRetrievalEmbedding,
  invalidOpenAiResponseFailure,
  recordAutocarOpenAiFailure,
  sanitizeAutocarOpenAiFailure,
  type AutocarOpenAiFailure
} from '@/lib/server/autocar/openAiDiagnostics';

export const FOLLOW_UP_V2_GENERATION_CANARY_BRANCH = 'test/autocar-follow-up-v2-generation-canary';
export const FOLLOW_UP_V2_GENERATION_CANARY_CONFIRMATION = 'synthetic-generation-only';
export const FOLLOW_UP_V2_GENERATION_CANARY_CORRELATION_ID = 'autocar-follow-up-v2-generation-only-canary-v1';

const EXPECTED_EMBEDDING_DIMENSIONS = 1536;
const EMBEDDING_MODEL = 'text-embedding-3-small';

export type FollowUpV2GenerationCanaryEnvironment = {
  VERCEL_ENV?: string;
  VERCEL_GIT_COMMIT_REF?: string;
};

export type FollowUpV2GenerationCanaryPorts = {
  createEmbedding(input: string, correlationId?: string | null): Promise<number[]>;
  createStructuredResponse(request: AutocarStructuredResponseRequest): Promise<{
    parsed: any;
    routing: { model: string };
    payload: any;
  }>;
  recordFailure(diagnostic: AutocarOpenAiFailure): void;
};

const defaultPorts: FollowUpV2GenerationCanaryPorts = {
  createEmbedding: createAutocarRetrievalEmbedding,
  createStructuredResponse: createAutocarStructuredResponse,
  recordFailure: recordAutocarOpenAiFailure
};

const canarySchema: Record<string, unknown> = {
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

const syntheticInput = {
  synthetic_marker: 'AUTOCAR FOLLOW-UP V2 GENERATION-ONLY CANARY',
  scenario: 'vehicle_interest',
  operational_context: {
    next_best_action: 'Continue the synthetic vehicle-interest conversation without claiming any external action.'
  },
  store: { name: 'AUTOCAR Synthetic Store', city: 'Goiania', state: 'GO' },
  crm: {
    customer_name: 'Synthetic Customer', vehicle_interest: 'Synthetic Hatch 2024', status: 'in_progress',
    scheduled_at: null, payment_type: null, financing_bank: null
  },
  recent_conversation_weighted: [
    {
      recency_rank: 3, recency_weight: 'ALTO', speaker: 'CLIENTE', type: 'text',
      text: 'Tenho interesse no carro. Ele ainda esta disponivel?', sent_at: '2026-01-01T12:00:00.000Z'
    },
    {
      recency_rank: 2, recency_weight: 'MAXIMO', speaker: 'LOJA', type: 'text',
      text: 'Sim. Voce gostaria de agendar uma visita para conhecer o veiculo?', sent_at: '2026-01-01T12:01:00.000Z'
    },
    {
      recency_rank: 1, recency_weight: 'MAXIMO', speaker: 'CLIENTE', type: 'text',
      text: 'Tenho interesse, mas para mim sabado seria melhor.', sent_at: '2026-01-01T12:03:00.000Z'
    }
  ],
  autocar_intelligence: {
    hard_policies: [], commercial_constitution: { synthetic: true },
    context_engine: { synthetic: true, training_selected: 0, knowledge_selected: 0 },
    approved_training: [], method_and_global_knowledge: [], store_specific_knowledge: [], store_inventory: null
  }
};

const syntheticEmbeddingInput = [
  'AUTOCAR synthetic Smart Follow-Up V2 canary.',
  'The customer is interested in a synthetic vehicle and said Saturday is better for a visit.',
  'No real customer, store, lead, conversation, inventory, appointment, or message data is present.'
].join(' ');

export function assertFollowUpV2GenerationCanaryEnvironment(environment: FollowUpV2GenerationCanaryEnvironment) {
  if (environment.VERCEL_ENV !== 'preview') throw new Error('follow_up_v2_generation_canary_preview_only');
  if (environment.VERCEL_GIT_COMMIT_REF !== FOLLOW_UP_V2_GENERATION_CANARY_BRANCH) {
    throw new Error('follow_up_v2_generation_canary_branch_only');
  }
}

function currentCanaryEnvironment(): FollowUpV2GenerationCanaryEnvironment {
  return {
    VERCEL_ENV: process.env.VERCEL_ENV,
    VERCEL_GIT_COMMIT_REF: process.env.VERCEL_GIT_COMMIT_REF
  };
}

function embeddingFingerprint(embedding: number[]) {
  return createHash('sha256').update(embedding.map((value) => Number(value).toFixed(8)).join(',')).digest('hex').slice(0, 16);
}

export async function runFollowUpV2GenerationCanary(options: {
  environment?: FollowUpV2GenerationCanaryEnvironment;
  ports?: FollowUpV2GenerationCanaryPorts;
} = {}) {
  const environment: FollowUpV2GenerationCanaryEnvironment = options.environment || currentCanaryEnvironment();
  const ports = options.ports || defaultPorts;
  assertFollowUpV2GenerationCanaryEnvironment(environment);

  try {
    const embedding = await ports.createEmbedding(syntheticEmbeddingInput, FOLLOW_UP_V2_GENERATION_CANARY_CORRELATION_ID);
    if (!Array.isArray(embedding) || embedding.length !== EXPECTED_EMBEDDING_DIMENSIONS) {
      throw invalidOpenAiResponseFailure(
        'retrieval_embedding', 'invalid_canary_embedding_dimensions', FOLLOW_UP_V2_GENERATION_CANARY_CORRELATION_ID
      );
    }

    const generated = await ports.createStructuredResponse({
      task: 'commercial_reply',
      schemaName: 'autocar_follow_up_v2_generation_canary',
      schema: canarySchema,
      maxOutputTokens: 900,
      includeReadTools: false,
      diagnosticStage: 'structured_response',
      diagnosticCorrelationId: FOLLOW_UP_V2_GENERATION_CANARY_CORRELATION_ID,
      instructions: [
        'This is a synthetic Smart Follow-Up V2 generation-only diagnostic.',
        'Return only the requested structured response and do not call tools.',
        'Write suggested_message in Brazilian Portuguese as a natural continuation of the synthetic conversation.',
        'Use at most two short sentences and at most one main question.',
        'Do not invent price, financing, inventory, approval, discount, appointment availability, or any external action.',
        'Never claim that a message was sent, an appointment was created, a lead was changed, or any system was updated.'
      ].join(' '),
      input: syntheticInput
    });

    const plan = generated.parsed || {};
    const suggestedMessage = String(plan.suggested_message || '').trim();
    const outputValid = plan.is_commercial_conversation === true && suggestedMessage.length > 0 && suggestedMessage.length <= 600;

    return {
      ok: outputValid,
      canary: 'follow_up_v2_generation_only',
      reason: outputValid ? 'generation_ready' : 'generation_invalid',
      safety: { synthetic_only: true, persistence_enabled: false, outbound_enabled: false, tools_enabled: false },
      stages: {
        retrieval_embedding: 'pass', structured_response: 'pass', output_validation: outputValid ? 'pass' : 'fail'
      },
      embedding: { model: EMBEDDING_MODEL, dimensions: embedding.length, fingerprint: embeddingFingerprint(embedding) },
      generation: {
        model: String(generated.routing?.model || ''), suggested_message: suggestedMessage,
        message_length: suggestedMessage.length,
        input_tokens: Number(generated.payload?.usage?.input_tokens || 0),
        output_tokens: Number(generated.payload?.usage?.output_tokens || 0)
      },
      correlation_id: FOLLOW_UP_V2_GENERATION_CANARY_CORRELATION_ID
    };
  } catch (error) {
    const diagnostic = sanitizeAutocarOpenAiFailure(
      error, 'generation_internal', FOLLOW_UP_V2_GENERATION_CANARY_CORRELATION_ID
    );
    ports.recordFailure(diagnostic);
    return {
      ok: false,
      canary: 'follow_up_v2_generation_only',
      reason: 'openai_failure',
      safety: { synthetic_only: true, persistence_enabled: false, outbound_enabled: false, tools_enabled: false },
      stages: { [diagnostic.stage]: 'fail' },
      diagnostic
    };
  }
}
