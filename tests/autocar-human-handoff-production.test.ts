import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AUTOCAR_HUMAN_HANDOFF_PILOT_STORE_ID,
  AUTOCAR_HUMAN_HANDOFF_PREVIEW_BRANCH,
  buildAutocarHumanHandoffRollbackPatch,
  evaluateAutocarHumanHandoffScope
} from '../src/lib/server/autocar/liveHumanHandoffPilot.ts';

test('A4 é permitida em Production', () => {
  const scope = evaluateAutocarHumanHandoffScope({
    storeId: AUTOCAR_HUMAN_HANDOFF_PILOT_STORE_ID,
    vercelEnv: 'production',
    gitRef: 'main'
  });

  assert.equal(scope.allowed, true);
});

test('outra loja permanece bloqueada mesmo em Production', () => {
  const scope = evaluateAutocarHumanHandoffScope({
    storeId: 'fdf9cbd6-2825-48ea-8dbb-7d36c3af2c42',
    vercelEnv: 'production',
    gitRef: 'main'
  });

  assert.equal(scope.allowed, false);
  assert.match(scope.reason, /restrito à A4/);
});

test('Preview só libera a branch corretiva autorizada', () => {
  const allowed = evaluateAutocarHumanHandoffScope({
    storeId: AUTOCAR_HUMAN_HANDOFF_PILOT_STORE_ID,
    vercelEnv: 'preview',
    gitRef: AUTOCAR_HUMAN_HANDOFF_PREVIEW_BRANCH
  });
  const blocked = evaluateAutocarHumanHandoffScope({
    storeId: AUTOCAR_HUMAN_HANDOFF_PILOT_STORE_ID,
    vercelEnv: 'preview',
    gitRef: 'feature/qualquer-outra'
  });

  assert.equal(allowed.allowed, true);
  assert.equal(blocked.allowed, false);
});

test('development permanece fail-closed', () => {
  const scope = evaluateAutocarHumanHandoffScope({
    storeId: AUTOCAR_HUMAN_HANDOFF_PILOT_STORE_ID,
    vercelEnv: 'development',
    gitRef: AUTOCAR_HUMAN_HANDOFF_PREVIEW_BRANCH
  });

  assert.equal(scope.allowed, false);
});

test('rollback restaura exatamente o estado anterior do runtime', () => {
  const patch = buildAutocarHumanHandoffRollbackPatch({
    human_state: 'autocar_active',
    pause_reason: null,
    paused_by_profile_id: null,
    paused_by_source: null,
    paused_at: null,
    resumed_at: '2026-08-16T07:47:30.794Z'
  }, '2026-08-21T23:00:00.000Z');

  assert.deepEqual(patch, {
    human_state: 'autocar_active',
    pause_reason: null,
    paused_by_profile_id: null,
    paused_by_source: null,
    paused_at: null,
    resumed_at: '2026-08-16T07:47:30.794Z',
    updated_at: '2026-08-21T23:00:00.000Z'
  });
});
