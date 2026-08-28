import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { isStoreBillingEligible } from '../src/lib/server/billing/repository.ts';
import {
  readBillingRuntimeSafety,
  supabaseProjectRef
} from '../src/lib/server/billing/runtime.ts';

const billingRoute = readFileSync('src/app/api/master/billing/route.ts', 'utf8');
const billingUi = readFileSync('src/components/MasterBillingCenter.tsx', 'utf8');
const masterSidebar = readFileSync('src/components/MasterSidebar.tsx', 'utf8');

function previewEnvironment(patch: Record<string, string> = {}) {
  return {
    VERCEL_ENV: 'preview',
    NEXT_PUBLIC_SUPABASE_URL: 'https://hfzmzfhuhukmxkxbkxay.supabase.co',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'publishable-test-key',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role-test-key',
    BILLING_PREVIEW_ALLOWED_SUPABASE_PROJECT_REF: 'hfzmzfhuhukmxkxbkxay',
    BILLING_PREVIEW_ENVIRONMENT_NAME: 'saas-dev',
    BILLING_PREVIEW_READS_ENABLED: 'true',
    BILLING_PREVIEW_ENFORCEMENT_ENABLED: 'false',
    BILLING_ENFORCEMENT_ENABLED: 'false',
    BILLING_PREVIEW_MUTATIONS_ENABLED: 'false',
    BILLING_TRIAL_START_ENABLED: 'false',
    ...patch
  } as NodeJS.ProcessEnv;
}

test('etapa 2 aceita somente hostname oficial do projeto Supabase autorizado', () => {
  assert.equal(
    supabaseProjectRef('https://hfzmzfhuhukmxkxbkxay.supabase.co'),
    'hfzmzfhuhukmxkxbkxay'
  );
  assert.equal(supabaseProjectRef('https://hfzmzfhuhukmxkxbkxay.supabase.co.example.com'), '');
  assert.equal(supabaseProjectRef('not-a-url'), '');
});

test('billing do Preview falha fechado fora do saas-dev e trial nasce desligado', () => {
  const safe = readBillingRuntimeSafety(previewEnvironment());
  assert.equal(safe.readsEnabled, true);
  assert.equal(safe.projectMatches, true);
  assert.equal(safe.mutationsEnabled, false);
  assert.equal(safe.trialStartEnabled, false);
  assert.equal(safe.reason, 'ready');

  const production = readBillingRuntimeSafety(previewEnvironment({
    VERCEL_ENV: 'production',
    BILLING_TRIAL_START_ENABLED: 'true'
  }));
  assert.equal(production.readsEnabled, false);
  assert.equal(production.trialStartEnabled, false);
  assert.equal(production.reason, 'reads_disabled');

  const wrongProject = readBillingRuntimeSafety(previewEnvironment({
    NEXT_PUBLIC_SUPABASE_URL: 'https://wufikrdgyxrsszlbpfmv.supabase.co'
  }));
  assert.equal(wrongProject.readsEnabled, false);
  assert.equal(wrongProject.reason, 'target_mismatch');

  const legacyFlagAlone = readBillingRuntimeSafety(previewEnvironment({
    BILLING_TRIAL_START_ENABLED: 'true'
  }));
  assert.equal(legacyFlagAlone.mutationsEnabled, false);
  assert.equal(legacyFlagAlone.trialStartEnabled, false);
});

test('somente loja ativa com usuario ativo do sistema e elegivel ao trial', () => {
  assert.equal(isStoreBillingEligible({ status: 'active', activeSystemUsers: 1 }), true);
  assert.equal(isStoreBillingEligible({ status: 'active', activeSystemUsers: 0 }), false);
  assert.equal(isStoreBillingEligible({ status: 'inactive', activeSystemUsers: 5 }), false);
});

test('API bloqueia toda mutacao da etapa 6 antes de ler o corpo da requisicao', () => {
  const guard = billingRoute.indexOf('if (!context.safety.mutationsEnabled)');
  const bodyRead = billingRoute.indexOf('request.json()');
  const mutation = billingRoute.indexOf('const subscription = await startStoreBillingTrial');
  assert.ok(guard >= 0);
  assert.ok(bodyRead > guard);
  assert.ok(mutation > guard);
  assert.match(billingRoute, /billing_stage6_read_only/);
  assert.match(billingRoute, /readBillingRuntimeSafety\(\)/);
});

test('interface Master separa portal, acesso SaaS e assinatura em modo somente leitura', () => {
  assert.match(masterSidebar, /Planos & Billing/);
  assert.match(masterSidebar, /\/master\/billing/);
  assert.match(billingUi, /Portal, acesso ao sistema e assinatura são exibidos separadamente/);
  assert.match(billingUi, /Somente leitura/);
  assert.match(billingUi, /Plano & Assinatura/);
  assert.doesNotMatch(billingUi, /Liberar trial de 7 dias/);
  assert.doesNotMatch(billingUi, /\.from\(['"]store_billing_subscriptions['"]\).*\.(insert|upsert)/s);
});
