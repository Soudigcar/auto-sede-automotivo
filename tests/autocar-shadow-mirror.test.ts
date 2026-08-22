import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AUTOCAR_CUTOVER_BRIDGE_CODE_ENABLED,
  AUTOCAR_SHADOW_MIRROR_DESTINATION_REF,
  AUTOCAR_SHADOW_MIRROR_SOURCE_REF,
  autocarShadowMirrorRowsEquivalent,
  evaluateAutocarRollbackMirrorGate,
  evaluateAutocarShadowMirrorGate,
  normalizeAutocarShadowMirrorRow
} from '../src/lib/server/autocar/shadowMirror.ts';

const productionUrl = `https://${AUTOCAR_SHADOW_MIRROR_DESTINATION_REF}.supabase.co`;
const devUrl = `https://${AUTOCAR_SHADOW_MIRROR_SOURCE_REF}.supabase.co`;
const key = 'service-role-key-for-shadow-mirror-test';

test('Cutover Bridge fica preparado por código sem ligar o cutover definitivo', () => {
  assert.equal(AUTOCAR_CUTOVER_BRIDGE_CODE_ENABLED, true);
});

test('Preview permanece fail-closed mesmo com flag e credenciais presentes', () => {
  const gate = evaluateAutocarShadowMirrorGate({
    VERCEL_ENV: 'preview',
    AUTOCAR_SHADOW_MIRROR_ENABLED: 'true',
    AUTOCAR_SUPABASE_URL: productionUrl,
    AUTOCAR_SUPABASE_SERVICE_ROLE_KEY: key
  } as NodeJS.ProcessEnv);

  assert.equal(gate.enabled, false);
  assert.equal(gate.reason, 'non_production_fail_closed');
  assert.equal(gate.destinationServiceRoleKey, '');
});

test('Production exige habilitação explícita do Forward Mirror', () => {
  const gate = evaluateAutocarShadowMirrorGate({
    VERCEL_ENV: 'production',
    AUTOCAR_SUPABASE_URL: productionUrl,
    AUTOCAR_SUPABASE_SERVICE_ROLE_KEY: key
  } as NodeJS.ProcessEnv);

  assert.equal(gate.enabled, false);
  assert.equal(gate.reason, 'mirror_not_enabled');
});

test('Production rejeita projeto destino diferente do AUTOCAR Production', () => {
  const gate = evaluateAutocarShadowMirrorGate({
    VERCEL_ENV: 'production',
    AUTOCAR_SHADOW_MIRROR_ENABLED: 'true',
    AUTOCAR_SUPABASE_URL: devUrl,
    AUTOCAR_SUPABASE_SERVICE_ROLE_KEY: key
  } as NodeJS.ProcessEnv);

  assert.equal(gate.enabled, false);
  assert.equal(gate.reason, 'unexpected_destination_project');
});

test('Forward Mirror Production habilita apenas com flag explícita e destino exato', () => {
  const gate = evaluateAutocarShadowMirrorGate({
    VERCEL_ENV: 'production',
    AUTOCAR_SHADOW_MIRROR_ENABLED: 'true',
    AUTOCAR_SUPABASE_URL: productionUrl,
    AUTOCAR_SUPABASE_SERVICE_ROLE_KEY: key
  } as NodeJS.ProcessEnv);

  assert.equal(gate.enabled, true);
  assert.equal(gate.reason, 'enabled');
  assert.equal(gate.destinationUrl, productionUrl);
  assert.equal(gate.destinationServiceRoleKey, key);
});

test('Rollback Mirror permanece bloqueado no Preview', () => {
  const gate = evaluateAutocarRollbackMirrorGate({
    VERCEL_ENV: 'preview',
    AUTOCAR_ROLLBACK_MIRROR_ENABLED: 'true',
    AUTOCAR_DEV_SUPABASE_URL: devUrl,
    AUTOCAR_DEV_SUPABASE_SERVICE_ROLE_KEY: key
  } as NodeJS.ProcessEnv, true);

  assert.equal(gate.enabled, false);
  assert.equal(gate.reason, 'non_production_fail_closed');
});

test('Rollback Mirror não pode ligar enquanto o cutover por código estiver desligado', () => {
  const gate = evaluateAutocarRollbackMirrorGate({
    VERCEL_ENV: 'production',
    AUTOCAR_ROLLBACK_MIRROR_ENABLED: 'true',
    AUTOCAR_DEV_SUPABASE_URL: devUrl,
    AUTOCAR_DEV_SUPABASE_SERVICE_ROLE_KEY: key
  } as NodeJS.ProcessEnv, false);

  assert.equal(gate.enabled, false);
  assert.equal(gate.reason, 'cutover_code_disabled');
});

test('Rollback Mirror exige habilitação explícita mesmo após futuro cutover', () => {
  const gate = evaluateAutocarRollbackMirrorGate({
    VERCEL_ENV: 'production',
    AUTOCAR_DEV_SUPABASE_URL: devUrl,
    AUTOCAR_DEV_SUPABASE_SERVICE_ROLE_KEY: key
  } as NodeJS.ProcessEnv, true);

  assert.equal(gate.enabled, false);
  assert.equal(gate.reason, 'rollback_mirror_not_enabled');
});

test('Rollback Mirror rejeita destino que não seja exatamente autocar-dev', () => {
  const gate = evaluateAutocarRollbackMirrorGate({
    VERCEL_ENV: 'production',
    AUTOCAR_ROLLBACK_MIRROR_ENABLED: 'true',
    AUTOCAR_DEV_SUPABASE_URL: productionUrl,
    AUTOCAR_DEV_SUPABASE_SERVICE_ROLE_KEY: key
  } as NodeJS.ProcessEnv, true);

  assert.equal(gate.enabled, false);
  assert.equal(gate.reason, 'unexpected_rollback_destination_project');
});

test('Rollback Mirror futuro exige cutover + flag explícita + autocar-dev exato', () => {
  const gate = evaluateAutocarRollbackMirrorGate({
    VERCEL_ENV: 'production',
    AUTOCAR_ROLLBACK_MIRROR_ENABLED: 'true',
    AUTOCAR_DEV_SUPABASE_URL: devUrl,
    AUTOCAR_DEV_SUPABASE_SERVICE_ROLE_KEY: key
  } as NodeJS.ProcessEnv, true);

  assert.equal(gate.enabled, true);
  assert.equal(gate.reason, 'enabled');
  assert.equal(gate.destinationUrl, devUrl);
  assert.equal(gate.destinationServiceRoleKey, key);
});

test('equivalência ignora exclusivamente updated_at', () => {
  const source = {
    id: 'row-1',
    store_id: 'store-1',
    status: 'completed',
    result: { ok: true, nested: { value: 1 } },
    created_at: '2026-08-21T10:00:00.000Z',
    updated_at: '2026-08-21T10:01:00.000Z'
  };
  const destination = {
    ...source,
    updated_at: '2026-08-21T10:05:00.000Z'
  };

  assert.equal(autocarShadowMirrorRowsEquivalent(source, destination), true);
  assert.deepEqual(normalizeAutocarShadowMirrorRow(source), {
    id: 'row-1',
    store_id: 'store-1',
    status: 'completed',
    result: { ok: true, nested: { value: 1 } },
    created_at: '2026-08-21T10:00:00.000Z'
  });
});

test('qualquer diferença fora de updated_at continua bloqueando equivalência', () => {
  const source = {
    id: 'row-1',
    store_id: 'store-1',
    status: 'completed',
    created_at: '2026-08-21T10:00:00.000Z',
    updated_at: '2026-08-21T10:01:00.000Z'
  };
  const destination = {
    ...source,
    status: 'failed',
    updated_at: '2026-08-21T10:05:00.000Z'
  };

  assert.equal(autocarShadowMirrorRowsEquivalent(source, destination), false);
});
