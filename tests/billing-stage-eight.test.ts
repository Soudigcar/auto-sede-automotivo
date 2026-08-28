import assert from 'node:assert/strict';
import test from 'node:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  billingEnforcementEnabled,
  evaluateBillingAccess,
  type BillingSubscriptionAccessRow,
  type BillingSubscriptionStatus
} from '../src/lib/server/billing/access.ts';
import { readBillingRuntimeSafety } from '../src/lib/server/billing/runtime.ts';

function routeFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    if (entry.isDirectory()) return routeFiles(path);
    return entry.name === 'route.ts' ? [path] : [];
  });
}

function source(path: string) {
  return readFileSync(path, 'utf8');
}

const legacyStoreSaasRoutes = [
  'src/app/api/lead-routing-rules/route.ts',
  'src/app/api/leads/manual/route.ts',
  'src/app/api/olx-browser-import/context/route.ts',
  'src/app/api/store-profile/route.ts',
  'src/app/api/store-stock-readonly/route.ts',
  'src/app/api/store-stock-upload/route.ts',
  'src/app/api/store-stock/route.ts',
  'src/app/api/vehicle-link-import-ai/route.ts',
  'src/app/api/vehicle-link-import/browser-image/route.ts',
  'src/app/api/vehicle-link-import/browser-preview/route.ts',
  'src/app/api/vehicle-link-import/route.ts',
  'src/app/api/vehicle-link-import/site/route.ts'
] as const;

test('todas as rotas modernas do portal da loja usam o autorizador central', () => {
  const routes = routeFiles('src/app/api/store/portal');
  assert.ok(routes.length >= 20);
  for (const route of routes) {
    assert.match(source(route), /authorizeStorePortal\(/, route);
  }
});

test('WhatsApp da loja, midias e nova foto privada passam pelo entitlement central', () => {
  for (const route of routeFiles('src/app/api/store-whatsapp')) {
    assert.match(source(route), /authorizeStoreWhatsappPortal\(/, route);
  }
  for (const route of routeFiles('src/app/api/whatsapp/messages')) {
    assert.match(source(route), /canUseStoreWhatsapp\(/, route);
  }
  assert.match(source('src/app/api/store-whatsapp/profile-picture/route.ts'), /authorizeStoreWhatsappPortal\(/);
});

test('AUTOCAR da loja nao possui rota lateral fora do autorizador central', () => {
  const routes = routeFiles('src/app/api/store/portal/autocar');
  assert.ok(routes.length >= 8);
  for (const route of routes) {
    assert.match(source(route), /authorizeStorePortal\(/, route);
  }
});

test('fluxos legados ainda usados pela loja consultam o mesmo entitlement', () => {
  for (const route of legacyStoreSaasRoutes) {
    assert.match(source(route), /authorizeStoreEntitlement\(|authorizeStorePortal\(/, route);
  }

  const compatibilityProxy = source('src/app/api/vehicle-link-import-v2/route.ts');
  assert.match(compatibilityProxy, /\/api\/vehicle-link-import/);
  assert.match(compatibilityProxy, /headers\.set\('authorization', authorization\)/);
});

test('portal publico continua independente do estado comercial do SaaS', () => {
  const marketplace = source('src/lib/server/marketplace.ts');
  const entitlement = source('src/lib/server/storePortal.ts');
  assert.match(marketplace, /portal_enabled/);
  assert.doesNotMatch(marketplace, /store_billing_subscriptions|resolveStoreBillingAccess/);
  assert.match(entitlement, /isOperationalStorePortal\(store:any\).*portal_enabled===true/);
  assert.match(entitlement, /isOperationalStoreSaas\(store:any\).*store\.status==='active'/);
});

test('todos os estados comerciais preservam acesso quando a homologacao esta em observe', () => {
  const statuses: BillingSubscriptionStatus[] = [
    'pending_checkout', 'trialing', 'active', 'past_due', 'suspended', 'cancelled'
  ];

  for (const status of statuses) {
    const subscription: BillingSubscriptionAccessRow = {
      id: `subscription-${status}`,
      status,
      access_enforcement_mode: 'enforce',
      trial_ends_at: '2026-08-27T00:00:00.000Z',
      grace_ends_at: '2026-08-27T00:00:00.000Z'
    };
    const decision = evaluateBillingAccess({
      role: 'store',
      operationalStore: true,
      enforcementEnabled: false,
      subscription,
      now: new Date('2026-08-28T00:00:00.000Z')
    });
    assert.equal(decision.allowed, true, status);
    assert.equal(decision.enforced, false, status);
    assert.equal(decision.reason, 'global_observation_mode', status);
  }
});

test('homologacao exige duas chaves para enforcement e mantem mutacoes financeiras desligadas', () => {
  assert.equal(billingEnforcementEnabled({ BILLING_ENFORCEMENT_ENABLED: 'true' } as NodeJS.ProcessEnv), false);
  assert.equal(billingEnforcementEnabled({ BILLING_STAGE6_ENFORCEMENT_ENABLED: 'true' } as NodeJS.ProcessEnv), false);

  const safety = readBillingRuntimeSafety({
    VERCEL_ENV: 'preview',
    NEXT_PUBLIC_SUPABASE_URL: 'https://hfzmzfhuhukmxkxbkxay.supabase.co',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'publishable-test-key',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role-test-key',
    BILLING_ALLOWED_SUPABASE_PROJECT_REF: 'hfzmzfhuhukmxkxbkxay',
    BILLING_ENFORCEMENT_ENABLED: 'false',
    BILLING_STAGE6_ENFORCEMENT_ENABLED: 'false',
    BILLING_STAGE6_MUTATIONS_ENABLED: 'false',
    BILLING_TRIAL_START_ENABLED: 'false'
  } as NodeJS.ProcessEnv);

  assert.equal(safety.readsEnabled, true);
  assert.equal(safety.mutationsEnabled, false);
  assert.equal(safety.trialStartEnabled, false);
});
