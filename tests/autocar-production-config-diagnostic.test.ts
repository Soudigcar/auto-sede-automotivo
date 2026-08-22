import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AUTOCAR_PRODUCTION_DIAGNOSTIC_EXPECTED_REF,
  diagnoseAutocarProductionConfig
} from '../src/lib/server/autocar/productionConfigDiagnostic.ts';

function productionEnv(serviceRoleKey = 'secret') {
  return {
    VERCEL_ENV: 'production',
    AUTOCAR_SUPABASE_URL: `https://${AUTOCAR_PRODUCTION_DIAGNOSTIC_EXPECTED_REF}.supabase.co`,
    AUTOCAR_SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey
  } as NodeJS.ProcessEnv;
}

test('Preview fica fail-closed e não tenta ler credenciais de Production', async () => {
  let readerCalled = false;
  const result = await diagnoseAutocarProductionConfig(
    {
      VERCEL_ENV: 'preview',
      AUTOCAR_SUPABASE_URL: `https://${AUTOCAR_PRODUCTION_DIAGNOSTIC_EXPECTED_REF}.supabase.co`,
      AUTOCAR_SUPABASE_SERVICE_ROLE_KEY: 'should-never-be-used'
    } as NodeJS.ProcessEnv,
    async () => {
      readerCalled = true;
      throw new Error('não deveria executar');
    }
  );

  assert.equal(result.status, 'preview_fail_closed');
  assert.equal(result.authoritative, false);
  assert.equal(result.reason, 'preview_is_not_authoritative');
  assert.equal(result.transition_state, 'unknown');
  assert.equal(readerCalled, false);
});

test('Production falha fechado quando credenciais estão ausentes', async () => {
  const result = await diagnoseAutocarProductionConfig({ VERCEL_ENV: 'production' } as NodeJS.ProcessEnv);
  assert.equal(result.status, 'degraded');
  assert.equal(result.reason, 'configuration_missing');
  assert.equal(result.checks.url_configured, false);
  assert.equal(result.checks.service_role_configured, false);
});

test('Production rejeita projeto Supabase diferente do AUTOCAR Production', async () => {
  let readerCalled = false;
  const result = await diagnoseAutocarProductionConfig(
    {
      VERCEL_ENV: 'production',
      AUTOCAR_SUPABASE_URL: 'https://azszzdotbrczlhrmhrlw.supabase.co',
      AUTOCAR_SUPABASE_SERVICE_ROLE_KEY: 'secret'
    } as NodeJS.ProcessEnv,
    async () => {
      readerCalled = true;
      return null;
    }
  );

  assert.equal(result.status, 'degraded');
  assert.equal(result.reason, 'unexpected_project_ref');
  assert.equal(readerCalled, false);
});

test('Production reconhece pre_cutover_dev_shadow como saudável', async () => {
  const result = await diagnoseAutocarProductionConfig(
    productionEnv('super-secret-value'),
    async ({ url, serviceRoleKey }) => {
      assert.equal(url, `https://${AUTOCAR_PRODUCTION_DIAGNOSTIC_EXPECTED_REF}.supabase.co`);
      assert.equal(serviceRoleKey, 'super-secret-value');
      return { environment: 'production', schema_version: 2, live_enabled: false };
    },
    false
  );

  assert.equal(result.status, 'ok');
  assert.equal(result.authoritative, true);
  assert.equal(result.reason, 'pre_cutover_configuration_valid');
  assert.equal(result.transition_state, 'pre_cutover_dev_shadow');
  assert.equal(result.cutover_code_enabled, false);
  assert.equal(result.live_enabled, false);
  assert.equal(result.checks.live_enabled_matches_transition, true);
  assert.equal(JSON.stringify(result).includes('super-secret-value'), false);
});

test('Production reconhece armed_pre_cutover como saudável sem considerar cutover efetivo', async () => {
  const result = await diagnoseAutocarProductionConfig(
    productionEnv(),
    async () => ({ environment: 'production', schema_version: 2, live_enabled: true }),
    false
  );

  assert.equal(result.status, 'ok');
  assert.equal(result.reason, 'armed_pre_cutover_configuration_valid');
  assert.equal(result.transition_state, 'armed_pre_cutover');
  assert.equal(result.cutover_code_enabled, false);
  assert.equal(result.live_enabled, true);
  assert.equal(result.checks.live_enabled_is_false, false);
  assert.equal(result.checks.live_enabled_matches_transition, true);
});

test('Production reconhece cutover_production como saudável somente com código e live ativos', async () => {
  const result = await diagnoseAutocarProductionConfig(
    productionEnv(),
    async () => ({ environment: 'production', schema_version: 2, live_enabled: true }),
    true
  );

  assert.equal(result.status, 'ok');
  assert.equal(result.reason, 'cutover_configuration_valid');
  assert.equal(result.transition_state, 'cutover_production');
  assert.equal(result.cutover_code_enabled, true);
  assert.equal(result.live_enabled, true);
});

test('Production falha fechado quando cutover por código está ativo mas live_enabled está false', async () => {
  const result = await diagnoseAutocarProductionConfig(
    productionEnv(),
    async () => ({ environment: 'production', schema_version: 2, live_enabled: false }),
    true
  );

  assert.equal(result.status, 'degraded');
  assert.equal(result.reason, 'runtime_config_invalid');
  assert.equal(result.transition_state, 'invalid_transition_state');
  assert.equal(result.checks.live_enabled_matches_transition, false);
});

test('Production falha fechado para environment ou schema incompatível', async () => {
  const wrongEnvironment = await diagnoseAutocarProductionConfig(
    productionEnv(),
    async () => ({ environment: 'development', schema_version: 2, live_enabled: false }),
    false
  );
  assert.equal(wrongEnvironment.status, 'degraded');
  assert.equal(wrongEnvironment.reason, 'runtime_config_invalid');
  assert.equal(wrongEnvironment.checks.database_environment_matches, false);

  const wrongSchema = await diagnoseAutocarProductionConfig(
    productionEnv(),
    async () => ({ environment: 'production', schema_version: 1, live_enabled: false }),
    false
  );
  assert.equal(wrongSchema.status, 'degraded');
  assert.equal(wrongSchema.reason, 'runtime_config_invalid');
  assert.equal(wrongSchema.checks.schema_version_matches, false);
});

test('Production trata falha de autenticação/leitura como service_role_validation_failed', async () => {
  const result = await diagnoseAutocarProductionConfig(
    productionEnv('invalid'),
    async () => {
      throw new Error('Invalid API key');
    }
  );

  assert.equal(result.status, 'degraded');
  assert.equal(result.reason, 'service_role_validation_failed');
  assert.equal(JSON.stringify(result).includes('Invalid API key'), false);
});
