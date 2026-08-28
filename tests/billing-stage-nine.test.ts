import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { billingEnforcementEnabled } from '../src/lib/server/billing/access.ts';
import {
  billingDeploymentEnvironment,
  readBillingRuntimeSafety
} from '../src/lib/server/billing/runtime.ts';

const previewRef = 'hfzmzfhuhukmxkxbkxay';
const productionRef = 'wufikrdgyxrsszlbpfmv';

function credentials(projectRef: string) {
  return {
    NEXT_PUBLIC_SUPABASE_URL: `https://${projectRef}.supabase.co`,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'publishable-test-key',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role-test-key'
  };
}

test('etapa 9 separa completamente allowlists e chaves de Preview e Production', () => {
  const preview = readBillingRuntimeSafety({
    VERCEL_ENV: 'preview',
    ...credentials(previewRef),
    BILLING_PREVIEW_ALLOWED_SUPABASE_PROJECT_REF: previewRef,
    BILLING_PREVIEW_ENVIRONMENT_NAME: 'saas-dev',
    BILLING_PREVIEW_READS_ENABLED: 'true',
    BILLING_PREVIEW_MUTATIONS_ENABLED: 'false',
    BILLING_PREVIEW_ENFORCEMENT_ENABLED: 'false'
  } as NodeJS.ProcessEnv);

  assert.equal(preview.deploymentEnvironment, 'preview');
  assert.equal(preview.environmentName, 'saas-dev');
  assert.equal(preview.readsEnabled, true);
  assert.equal(preview.mutationsEnabled, false);
  assert.equal(preview.enforcementEnabled, false);
  assert.equal(preview.reason, 'ready');

  const production = readBillingRuntimeSafety({
    VERCEL_ENV: 'production',
    ...credentials(productionRef),
    BILLING_PRODUCTION_ALLOWED_SUPABASE_PROJECT_REF: productionRef,
    BILLING_PRODUCTION_ENVIRONMENT_NAME: 'crm-production-observe',
    BILLING_PRODUCTION_READS_ENABLED: 'true',
    BILLING_PRODUCTION_MUTATIONS_ENABLED: 'false',
    BILLING_PRODUCTION_ENFORCEMENT_ENABLED: 'false'
  } as NodeJS.ProcessEnv);

  assert.equal(production.deploymentEnvironment, 'production');
  assert.equal(production.environmentName, 'crm-production-observe');
  assert.equal(production.readsEnabled, true);
  assert.equal(production.mutationsEnabled, false);
  assert.equal(production.enforcementEnabled, false);
  assert.equal(production.trialStartEnabled, false);
  assert.equal(production.reason, 'ready');
});

test('Production nasce desligada e nunca aceita allowlist ou chaves de Preview', () => {
  const disabled = readBillingRuntimeSafety({
    VERCEL_ENV: 'production',
    ...credentials(productionRef),
    BILLING_PREVIEW_ALLOWED_SUPABASE_PROJECT_REF: productionRef,
    BILLING_PREVIEW_READS_ENABLED: 'true',
    BILLING_PREVIEW_MUTATIONS_ENABLED: 'true',
    BILLING_PREVIEW_ENFORCEMENT_ENABLED: 'true',
    BILLING_ALLOWED_SUPABASE_PROJECT_REF: productionRef,
    BILLING_STAGE6_MUTATIONS_ENABLED: 'true',
    BILLING_STAGE6_ENFORCEMENT_ENABLED: 'true',
    BILLING_TRIAL_START_ENABLED: 'true'
  } as NodeJS.ProcessEnv);

  assert.equal(disabled.readsEnabled, false);
  assert.equal(disabled.mutationsEnabled, false);
  assert.equal(disabled.enforcementEnabled, false);
  assert.equal(disabled.trialStartEnabled, false);
  assert.equal(disabled.reason, 'reads_disabled');

  const missingProductionTarget = readBillingRuntimeSafety({
    VERCEL_ENV: 'production',
    ...credentials(productionRef),
    BILLING_PRODUCTION_READS_ENABLED: 'true',
    BILLING_PREVIEW_ALLOWED_SUPABASE_PROJECT_REF: productionRef
  } as NodeJS.ProcessEnv);
  assert.equal(missingProductionTarget.reason, 'target_not_configured');
});

test('mismatch de projeto falha fechado antes de mutacao ou enforcement', () => {
  const mismatch = readBillingRuntimeSafety({
    VERCEL_ENV: 'production',
    ...credentials(previewRef),
    BILLING_PRODUCTION_ALLOWED_SUPABASE_PROJECT_REF: productionRef,
    BILLING_PRODUCTION_READS_ENABLED: 'true',
    BILLING_PRODUCTION_MUTATIONS_ENABLED: 'true',
    BILLING_PRODUCTION_ENFORCEMENT_ENABLED: 'true',
    BILLING_TRIAL_START_ENABLED: 'true'
  } as NodeJS.ProcessEnv);

  assert.equal(mismatch.reason, 'target_mismatch');
  assert.equal(mismatch.readsEnabled, false);
  assert.equal(mismatch.mutationsEnabled, false);
  assert.equal(mismatch.enforcementEnabled, false);
  assert.equal(mismatch.trialStartEnabled, false);
});

test('enforcement exige chave global e a chave do mesmo ambiente', () => {
  assert.equal(billingEnforcementEnabled({
    VERCEL_ENV: 'preview',
    BILLING_ENFORCEMENT_ENABLED: 'true',
    BILLING_PREVIEW_ENFORCEMENT_ENABLED: 'true'
  } as NodeJS.ProcessEnv), true);
  assert.equal(billingEnforcementEnabled({
    VERCEL_ENV: 'production',
    BILLING_ENFORCEMENT_ENABLED: 'true',
    BILLING_PREVIEW_ENFORCEMENT_ENABLED: 'true'
  } as NodeJS.ProcessEnv), false);
  assert.equal(billingEnforcementEnabled({
    VERCEL_ENV: 'production',
    BILLING_ENFORCEMENT_ENABLED: 'true',
    BILLING_PRODUCTION_ENFORCEMENT_ENABLED: 'true'
  } as NodeJS.ProcessEnv), true);
  assert.equal(billingDeploymentEnvironment({ VERCEL_ENV: 'development' } as NodeJS.ProcessEnv), 'unsupported');
});

test('APIs e interface ficam genericas para Production observe e Asaas Production continua bloqueado', () => {
  const masterRoute = readFileSync('src/app/api/master/billing/route.ts', 'utf8');
  const storeRoute = readFileSync('src/app/api/store/portal/billing/route.ts', 'utf8');
  const masterUi = readFileSync('src/components/MasterBillingCenter.tsx', 'utf8');
  const storeUi = readFileSync('src/components/StoreBillingExperience.tsx', 'utf8');
  const asaas = readFileSync('src/lib/server/billing/asaas.ts', 'utf8');

  assert.match(masterRoute, /production_observe_prepared/);
  assert.match(masterRoute, /production_blocked: true/);
  assert.match(storeRoute, /deployment_environment/);
  assert.doesNotMatch(storeRoute, /Preview não está isolado/);
  assert.match(masterUi, /SaaS · etapa 11/);
  assert.match(storeUi, /ambiente de observação/);
  assert.match(asaas, /ASAAS_PRODUCTION_FORBIDDEN/);
  assert.match(asaas, /configuration\.environment !== 'sandbox'/);
});

test('Node 24 fica fixado e a etapa 9 nao adiciona migration', () => {
  const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
  const packageLock = JSON.parse(readFileSync('package-lock.json', 'utf8'));
  assert.equal(packageJson.engines.node, '24.x');
  assert.equal(packageLock.packages[''].engines.node, '24.x');
  assert.equal(readFileSync('.nvmrc', 'utf8').trim(), '24');

  const billingMigrations = readdirSync('supabase/migrations')
    .filter((name) => /billing|asaas/i.test(name));
  assert.deepEqual(billingMigrations, ['20260827044014_billing_foundation_asaas.sql']);
});
