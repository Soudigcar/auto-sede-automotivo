import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import {
  AutocarOpenAiStageError,
  openAiHttpFailure,
  sanitizeAutocarOpenAiFailure
} from '../src/lib/server/autocar/openAiDiagnostics';
import { selectFollowUpV2RunBatch } from '../src/lib/server/autocar/followUpV2RunSelection';
import type { FollowUpV2Event } from '../src/lib/server/autocar/followUpV2Execution';

function event(id: string, dueAt: string, sequenceKey: string, leadId = 'lead'): FollowUpV2Event {
  return {
    id, storeId: '239755c3-a2d4-4cdd-9502-f1595031c924', conversationId: 'conversation', leadId,
    scenario: 'vehicle_interest', stepId: id, sourceId: 'source', sequenceKey, dueAt,
    anchorAt: '2026-09-05T20:05:14.154Z', inboundAt: '2026-09-05T20:05:00.000Z',
    idempotencyKey: `key-${id}`, dryRun: false
  };
}

test('catch-up de uma mesma sequência mantém apenas a etapa vencida mais recente', () => {
  const earlier = event('step-4h', '2026-09-06T00:05:14.154Z', 'vehicle-sequence');
  const later = event('step-1d', '2026-09-06T20:05:14.154Z', 'vehicle-sequence');
  const selected = selectFollowUpV2RunBatch([earlier, later]);
  assert.deepEqual(selected.runnable.map((item) => item.id), ['step-1d']);
  assert.deepEqual(selected.superseded.map((item) => item.id), ['step-4h']);
  assert.deepEqual(selected.deferred, []);
});

test('um mesmo lead tem no máximo uma tentativa por ciclo mesmo em sequências diferentes', () => {
  const first = event('vehicle', '2026-09-06T10:00:00Z', 'vehicle-sequence');
  const second = event('simulation', '2026-09-06T11:00:00Z', 'simulation-sequence');
  const selected = selectFollowUpV2RunBatch([first, second]);
  assert.equal(selected.runnable.length, 1);
  assert.equal(selected.deferred.length, 1);
  assert.equal(selected.runnable[0].leadId, selected.deferred[0].leadId);
});

test('diagnóstico OpenAI classifica 429 de quota sem guardar mensagem privada', () => {
  const headers = new Headers({ 'x-request-id': 'req_safe_123' });
  const failure = openAiHttpFailure('retrieval_embedding', { status: 429, headers }, {
    error: { code: 'insufficient_quota', message: 'PRIVATE PROVIDER MESSAGE' }
  }, 'execution-123');
  assert.ok(failure instanceof AutocarOpenAiStageError);
  assert.equal(failure.diagnostic.category, 'quota');
  assert.equal(failure.diagnostic.status, 429);
  assert.equal(failure.diagnostic.code, 'insufficient_quota');
  assert.equal(failure.diagnostic.request_id, 'req_safe_123');
  assert.ok(!JSON.stringify(failure.diagnostic).includes('PRIVATE PROVIDER MESSAGE'));
});

test('erro interno sanitizado nunca replica a mensagem original', () => {
  const error: any = new Error('DO-NOT-LOG customer content or secret');
  error.code = 'UND_ERR_CONNECT_TIMEOUT';
  const diagnostic = sanitizeAutocarOpenAiFailure(error, 'generation_internal', 'execution-456');
  assert.equal(diagnostic.code, 'UND_ERR_CONNECT_TIMEOUT');
  assert.ok(!JSON.stringify(diagnostic).includes('DO-NOT-LOG'));
});

test('follow-up opta por um único embedding compartilhado para treinamento e conhecimento', () => {
  const intelligence = readFileSync('src/lib/server/autocar/intelligenceCore.ts', 'utf8');
  const reopening = readFileSync('src/lib/server/autocar/followUpV2ContextualReopening.ts', 'utf8');
  const retrieval = readFileSync('src/lib/server/autocar/retrievalContext.ts', 'utf8');
  assert.match(intelligence, /input\.correlationId[\s\S]*searchAutocarRetrievalContext/);
  assert.match(reopening, /correlationId: source\.correlationId/);
  assert.match(retrieval, /createAutocarRetrievalEmbedding/);
  assert.equal((retrieval.match(/createAutocarRetrievalEmbedding\(/g) || []).length, 1);
});

test('executor persiste diagnóstico sanitizado dentro dos gates existentes, sem migration', () => {
  const source = readFileSync('src/lib/server/autocar/followUpV2Execution.ts', 'utf8');
  assert.match(source, /generation_error/);
  assert.match(source, /recordAutocarOpenAiFailure/);
  assert.match(source, /\.\.\.\(result\.gates \|\| \{\}\)/);
});
