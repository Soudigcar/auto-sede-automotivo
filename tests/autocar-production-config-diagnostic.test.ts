import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AUTOCAR_PRODUCTION_DIAGNOSTIC_EXPECTED_REF,
  diagnoseAutocarProductionConfig
} from '../src/lib/server/autocar/productionConfigDiagnostic.ts';

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

test('Production valida URL, service-role e runtime_config sem expor segredo', async () => {
  const result = await diagnoseAutocarProductionConfig(
    {
      VERCEL_ENV: 'production',
      AUTOCAR_SUPABASE_URL: `https://${AUTOCAR_PRODUCTION_DIAGNOSTIC_EXPECTED_REF}.supabase.co`,
      AUTOCAR_SUPABASE_SERVICE_ROLE_KEY: 'super-secret-value'
    } as NodeJS.ProcessEnv,
    async ({ url, serviceRoleKey }) => {
      assert.equal(url, `https://${AUTOCAR_PRODUCTION_DIAGNOSTIC_EXPECTED_REF}.supabase.co`);
      assert.equal(serviceRoleKey, 'super-secret-value');
      return { environment: 'production', schema_version: 2, live_enabled: false };
    }
  );

  assert.equal(result.status, 'ok');
  assert.equal(result.authoritative, true);
  assert.equal(result.reason, 'production_configuration_valid');
  assert.equal(result.configured_project_ref, AUTOCAR_PRODUCTION_DIAGNOSTIC_EXPECTED_REF);
  assert.equal(result.schema_version, 2);
  assert.equal(result.live_enabled, false);
  assert.equal(JSON.stringify(result).includes('super-secret-value'), false);
});

test('Production rejeita runtime_config incompatível', async () => {
  const result = await diagnoseAutocarProductionConfig(
    {
      VERCEL_ENV: 'production',
      AUTOCAR_SUPABASE_URL: `https://${AUTOCAR_PRODUCTION_DIAGNOSTIC_EXPECTED_REF}.supabase.co`,
      AUTOCAR_SUPABASE_SERVICE_ROLE_KEY: 'secret'
    } as NodeJS.ProcessEnv,
    async () => ({ environment: 'production', schema_version: 2, live_enabled: true })
  );

  assert.equal(result.status, 'degraded');
  assert.equal(result.reason, 'runtime_config_invalid');
  assert.equal(result.checks.live_enabled_is_false, false);
});

test('Production trata falha de autenticação/leitura como service_role_validation_failed', async () => {
  const result = await diagnoseAutocarProductionConfig(
    {
      VERCEL_ENV: 'production',
      AUTOCAR_SUPABASE_URL: `https://${AUTOCAR_PRODUCTION_DIAGNOSTIC_EXPECTED_REF}.supabase.co`,
      AUTOCAR_SUPABASE_SERVICE_ROLE_KEY: 'invalid'
    } as NodeJS.ProcessEnv,
    async () => {
      throw new Error('Invalid API key');
    }
  );

  assert.equal(result.status, 'degraded');
  assert.equal(result.reason, 'service_role_validation_failed');
  assert.equal(JSON.stringify(result).includes('Invalid API key'), false);
});
