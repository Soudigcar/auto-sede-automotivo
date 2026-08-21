import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertCutoverDryRunPreview,
  compareRuntimeRows,
  stableRuntimeHash
} from '../src/lib/server/autocar/cutoverDryRun.ts';
import {
  AUTOCAR_CUTOVER_ALLOWED_BRANCH,
  AUTOCAR_CUTOVER_CODE_WRITE_ENABLED,
  AUTOCAR_CUTOVER_WRITE_GATE_MODE,
  isAutocarCutoverWriteGateEnabled
} from '../src/lib/server/autocar/cutoverSync.ts';

test('dry-run é bloqueado fora do Vercel Preview', () => {
  assert.throws(
    () => assertCutoverDryRunPreview({ VERCEL_ENV: 'production' } as NodeJS.ProcessEnv),
    /exclusivamente no Vercel Preview/
  );
  assert.doesNotThrow(
    () => assertCutoverDryRunPreview({ VERCEL_ENV: 'preview' } as NodeJS.ProcessEnv)
  );
});

test('gate de escrita é controlado por código e permanece fail-closed', () => {
  assert.equal(AUTOCAR_CUTOVER_WRITE_GATE_MODE, 'code');
  assert.equal(AUTOCAR_CUTOVER_CODE_WRITE_ENABLED, false);
  assert.equal(AUTOCAR_CUTOVER_ALLOWED_BRANCH, 'agent/autocar-production-cutover-guard');

  assert.equal(
    isAutocarCutoverWriteGateEnabled({
      VERCEL_ENV: 'preview',
      VERCEL_GIT_COMMIT_REF: AUTOCAR_CUTOVER_ALLOWED_BRANCH,
      AUTOCAR_CUTOVER_WRITE_ENABLED: 'true'
    } as NodeJS.ProcessEnv),
    false
  );

  assert.equal(
    isAutocarCutoverWriteGateEnabled({
      VERCEL_ENV: 'production',
      VERCEL_GIT_COMMIT_REF: AUTOCAR_CUTOVER_ALLOWED_BRANCH,
      AUTOCAR_CUTOVER_WRITE_ENABLED: 'true'
    } as NodeJS.ProcessEnv),
    false
  );
});

test('hash estável ignora ordem das chaves do objeto', () => {
  assert.equal(
    stableRuntimeHash({ b: 2, a: { y: 2, x: 1 } }),
    stableRuntimeHash({ a: { x: 1, y: 2 }, b: 2 })
  );
});

test('comparação detecta ausentes, alterações e extras sem modificar os arrays', () => {
  const source = [
    { id: '1', store_id: 'store-a', effective_mode: 'autopilot', updated_at: '2026-08-21T10:00:00Z' },
    { id: '2', store_id: 'store-b', effective_mode: 'off', updated_at: '2026-08-21T11:00:00Z' }
  ];
  const destination = [
    { id: '1', store_id: 'store-a', effective_mode: 'off', updated_at: '2026-08-20T10:00:00Z' },
    { id: '3', store_id: 'store-c', effective_mode: 'off', updated_at: '2026-08-20T11:00:00Z' }
  ];

  const result = compareRuntimeRows('ai_runtime_conversations', source, destination);

  assert.equal(result.missing_in_destination_count, 1);
  assert.deepEqual(result.missing_in_destination_ids, ['2']);
  assert.equal(result.changed_count, 1);
  assert.equal(result.changed[0]?.id, '1');
  assert.equal(result.extra_in_destination_count, 1);
  assert.deepEqual(result.extra_in_destination_ids, ['3']);
  assert.equal(source.length, 2);
  assert.equal(destination.length, 2);
});

test('claims detectam duplicidade e conflito cruzado de idempotência sem expor a chave', () => {
  const source = [
    { id: 'a', store_id: 'store-a', idempotency_key: 'same-key' },
    { id: 'b', store_id: 'store-a', idempotency_key: 'same-key' }
  ];
  const destination = [
    { id: 'z', store_id: 'store-a', idempotency_key: 'same-key' }
  ];

  const result = compareRuntimeRows('ai_runtime_message_claims', source, destination);
  assert.equal(result.idempotency?.source_duplicate_count, 1);
  assert.equal(result.idempotency?.destination_duplicate_count, 0);
  assert.equal(result.idempotency?.cross_conflict_count, 1);
  assert.notEqual(result.idempotency?.cross_conflicts[0]?.key_hash, 'same-key');
});
