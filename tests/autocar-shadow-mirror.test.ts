import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AUTOCAR_SHADOW_MIRROR_DESTINATION_REF,
  autocarShadowMirrorRowsEquivalent,
  evaluateAutocarShadowMirrorGate,
  normalizeAutocarShadowMirrorRow
} from '../src/lib/server/autocar/shadowMirror.ts';

const productionUrl = `https://${AUTOCAR_SHADOW_MIRROR_DESTINATION_REF}.supabase.co`;
const key = 'service-role-key-for-shadow-mirror-test';

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

test('Production exige habilitação explícita do mirror', () => {
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
    AUTOCAR_SUPABASE_URL: 'https://azszzdotbrczlhrmhrlw.supabase.co',
    AUTOCAR_SUPABASE_SERVICE_ROLE_KEY: key
  } as NodeJS.ProcessEnv);

  assert.equal(gate.enabled, false);
  assert.equal(gate.reason, 'unexpected_destination_project');
});

test('Production habilita apenas com flag explícita e destino exato', () => {
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
