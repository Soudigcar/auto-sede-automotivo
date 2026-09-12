import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { AutocarOpenAiStageError } from '../src/lib/server/autocar/openAiDiagnostics';
import {
  FOLLOW_UP_V2_GENERATION_CANARY_BRANCH,
  runFollowUpV2GenerationCanary,
  type FollowUpV2GenerationCanaryPorts
} from '../src/lib/server/autocar/followUpV2GenerationCanary';

function passingPorts(counters?: { embedding: number; structured: number }): FollowUpV2GenerationCanaryPorts {
  return {
    async createEmbedding() {
      if (counters) counters.embedding += 1;
      return Array.from({ length: 1536 }, (_, index) => index / 100000);
    },
    async createStructuredResponse() {
      if (counters) counters.structured += 1;
      return {
        parsed: {
          is_commercial_conversation: true,
          block_reason: null,
          last_topic: 'Synthetic vehicle availability',
          customer_last_intent: 'Visit on Saturday',
          store_last_action: 'Asked whether the customer wanted to schedule a visit',
          pending_thread: 'Choose the next safe step for Saturday',
          reopening_hook: 'Continue from the Saturday preference',
          commercial_objective: 'Keep the synthetic conversation moving',
          avoid_repeating: ['Do not repeat the same scheduling question'],
          suggested_message: 'Perfeito. Sabado funciona melhor para voce; prefere conversar sobre o periodo da manha ou da tarde?'
        },
        routing: { model: 'synthetic-model' },
        payload: { usage: { input_tokens: 123, output_tokens: 45 } }
      };
    },
    recordFailure() {}
  };
}

const previewEnvironment = {
  VERCEL_ENV: 'preview',
  VERCEL_GIT_COMMIT_REF: FOLLOW_UP_V2_GENERATION_CANARY_BRANCH
};

test('generation canary fails closed before OpenAI outside Preview', async () => {
  const counters = { embedding: 0, structured: 0 };
  await assert.rejects(
    runFollowUpV2GenerationCanary({
      environment: { VERCEL_ENV: 'production', VERCEL_GIT_COMMIT_REF: 'main' },
      ports: passingPorts(counters)
    }),
    /follow_up_v2_generation_canary_preview_only/
  );
  assert.deepEqual(counters, { embedding: 0, structured: 0 });
});

test('generation canary fails closed on any other Preview branch', async () => {
  const counters = { embedding: 0, structured: 0 };
  await assert.rejects(
    runFollowUpV2GenerationCanary({
      environment: { VERCEL_ENV: 'preview', VERCEL_GIT_COMMIT_REF: 'another-branch' },
      ports: passingPorts(counters)
    }),
    /follow_up_v2_generation_canary_branch_only/
  );
  assert.deepEqual(counters, { embedding: 0, structured: 0 });
});

test('generation canary exercises embedding and structured response with synthetic inputs only', async () => {
  const counters = { embedding: 0, structured: 0 };
  const result = await runFollowUpV2GenerationCanary({
    environment: previewEnvironment,
    ports: passingPorts(counters)
  });
  assert.equal(result.ok, true);
  assert.equal(result.reason, 'generation_ready');
  assert.deepEqual(counters, { embedding: 1, structured: 1 });
  assert.equal(result.safety.synthetic_only, true);
  assert.equal(result.safety.persistence_enabled, false);
  assert.equal(result.safety.outbound_enabled, false);
  assert.equal(result.embedding?.dimensions, 1536);
  assert.equal(result.generation?.model, 'synthetic-model');
});

test('generation canary returns sanitized OpenAI diagnostics and never exposes the original error message', async () => {
  let recorded: unknown = null;
  const ports = passingPorts();
  ports.createEmbedding = async () => {
    throw new AutocarOpenAiStageError({
      stage: 'retrieval_embedding',
      category: 'rate_limit',
      status: 429,
      code: 'rate_limit_exceeded',
      request_id: 'req_safe_canary',
      correlation_id: 'autocar-follow-up-v2-generation-only-canary-v1'
    });
  };
  ports.recordFailure = (diagnostic) => { recorded = diagnostic; };

  const result = await runFollowUpV2GenerationCanary({ environment: previewEnvironment, ports });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'openai_failure');
  assert.equal(result.diagnostic?.stage, 'retrieval_embedding');
  assert.equal(result.diagnostic?.status, 429);
  assert.equal((recorded as any)?.code, 'rate_limit_exceeded');
  assert.ok(!JSON.stringify(result).includes('PRIVATE'));
});

test('generation canary source has no database, runtime executor, provider-send, or credential access', () => {
  const source = readFileSync('src/lib/server/autocar/followUpV2GenerationCanary.ts', 'utf8');
  const route = readFileSync('src/app/api/internal/autocar/follow-up-v2-generation-canary/route.ts', 'utf8');
  const combined = `${source}\n${route}`;

  assert.doesNotMatch(combined, /sendEvolutionText|executeFollowUpV2|createFollowUpV2DatabasePorts|getAutocarRuntimeClient/);
  assert.doesNotMatch(combined, /\.from\s*\(|\.rpc\s*\(/);
  assert.doesNotMatch(combined, /OPENAI_API_KEY|SUPABASE|EVOLUTION|WHATSAPP|WEBHOOK/i);
  assert.match(source, /createAutocarRetrievalEmbedding/);
  assert.match(source, /createAutocarStructuredResponse/);
  assert.match(source, /includeReadTools:\s*false/);
  assert.doesNotMatch(route, /request\.json\s*\(/);
});
