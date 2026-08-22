import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AUTOCAR_DEV_REF,
  AUTOCAR_PRODUCTION_REF
} from '../src/lib/server/autocar/runtimeEnvironment.ts';
import { evaluateStoreAutocarModeMutationGovernance } from '../src/lib/server/autocar/storeModeGovernance.ts';

function status(overrides: Record<string, unknown> = {}) {
  return {
    vercel_environment: 'preview',
    runtime_environment: 'autocar-dev',
    project_ref: AUTOCAR_DEV_REF,
    schema: 'dev_v1',
    transition_mode: 'development_dev',
    external_execution_allowed: false,
    automatic_replies_enabled: false,
    autopilot_preview_only: true,
    ...overrides
  } as any;
}

test('Preview isolado pode alterar somente autocar-dev e nunca configuração LIVE', () => {
  const result = evaluateStoreAutocarModeMutationGovernance(status());

  assert.equal(result.allowed, true);
  assert.equal(result.scope, 'preview_dev');
  assert.equal(result.writes_to, 'autocar-dev');
  assert.equal(result.live_configuration, false);
});

test('Preview bloqueia alteração se apontar para AUTOCAR Production', () => {
  const result = evaluateStoreAutocarModeMutationGovernance(status({
    runtime_environment: 'autocar-production',
    project_ref: AUTOCAR_PRODUCTION_REF,
    schema: 'production_v2',
    transition_mode: 'cutover_production'
  }));

  assert.equal(result.allowed, false);
  assert.equal(result.scope, 'blocked');
  assert.equal(result.writes_to, 'none');
});

test('Preview bloqueia alteração se qualquer execução externa estiver habilitada', () => {
  const result = evaluateStoreAutocarModeMutationGovernance(status({
    external_execution_allowed: true,
    automatic_replies_enabled: true,
    autopilot_preview_only: false
  }));

  assert.equal(result.allowed, false);
  assert.equal(result.writes_to, 'none');
});

test('Production reconhecida permite configuração LIVE somente em AUTOCAR Production', () => {
  const result = evaluateStoreAutocarModeMutationGovernance(status({
    vercel_environment: 'production',
    runtime_environment: 'autocar-production',
    project_ref: AUTOCAR_PRODUCTION_REF,
    schema: 'production_v2',
    transition_mode: 'cutover_production',
    external_execution_allowed: true,
    automatic_replies_enabled: true,
    autopilot_preview_only: false
  }));

  assert.equal(result.allowed, true);
  assert.equal(result.scope, 'production_live');
  assert.equal(result.writes_to, 'autocar-production');
  assert.equal(result.live_configuration, true);
});

test('Production falha fechado se houver regressão para autocar-dev', () => {
  const result = evaluateStoreAutocarModeMutationGovernance(status({
    vercel_environment: 'production'
  }));

  assert.equal(result.allowed, false);
  assert.equal(result.scope, 'blocked');
  assert.equal(result.writes_to, 'none');
  assert.equal(result.live_configuration, false);
});
