import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import {
  authorizeStoreEntitlement,
  isOperationalStorePortal,
  isOperationalStoreSaas
} from '../src/lib/server/storePortal.ts';
import { readBillingRuntimeSafety } from '../src/lib/server/billing/runtime.ts';

const remainingStoreRoutes = [
  'lead-activity',
  'lead-responsibilities',
  'lead-task',
  'lead-transfer',
  'pipeline-details',
  'sale-confirmation',
  'sale-details',
  'team-links',
  'team-members',
  'team-register',
  'team'
] as const;

test('visibilidade publica e acesso ao SaaS usam sinais independentes', () => {
  const hiddenActiveStore = {
    id: 'store-hidden',
    status: 'active',
    portal_enabled: false
  };

  assert.equal(isOperationalStorePortal(hiddenActiveStore), false);
  assert.equal(isOperationalStoreSaas(hiddenActiveStore), true);
  assert.equal(isOperationalStorePortal({ ...hiddenActiveStore, portal_enabled: true }), true);
  assert.equal(isOperationalStoreSaas({ ...hiddenActiveStore, status: 'inactive' }), false);
});

test('entitlement central preserva loja ativa e oculta no portal em modo observe', async () => {
  const query: any = {
    select() { return query; },
    eq() { return query; },
    neq() { return query; },
    order() { return query; },
    limit() { return query; },
    async maybeSingle() {
      return {
        data: {
          id: 'subscription-observe',
          status: 'active',
          access_enforcement_mode: 'observe',
          trial_ends_at: null,
          grace_ends_at: null
        },
        error: null
      };
    }
  };

  const result = await authorizeStoreEntitlement({ from() { return query; } }, {
    role: 'store',
    storeId: 'store-hidden',
    profileStoreId: 'store-hidden',
    store: {
      id: 'store-hidden',
      status: 'active',
      portal_enabled: false
    }
  });

  assert.equal('error' in result, false);
  if ('error' in result) return;
  assert.equal(result.billing.allowed, true);
  assert.equal(result.billing.enforced, false);
  assert.equal(result.billing.observedAllowed, true);
});

test('entitlement central rejeita acesso cruzado entre lojas antes de consultar billing', async () => {
  let queried = false;
  const result = await authorizeStoreEntitlement({
    from() {
      queried = true;
      throw new Error('consulta inesperada');
    }
  }, {
    role: 'seller',
    storeId: 'store-a',
    profileStoreId: 'store-b'
  });

  assert.equal('error' in result, true);
  assert.equal(queried, false);
});

test('as 11 rotas restantes consultam o mesmo autorizador de entitlement', () => {
  for (const route of remainingStoreRoutes) {
    const source = readFileSync(`src/app/api/store/${route}/route.ts`, 'utf8');
    assert.match(source, /authorizeStoreEntitlement\(/, route);
  }
});

test('cadastro de equipe SaaS nao depende da exibicao da loja no portal publico', () => {
  const legacyRegistration = readFileSync('src/app/api/store/team-register/route.ts', 'utf8');
  const currentRegistration = readFileSync('src/app/api/public/team-registration/route.ts', 'utf8');
  const managedStore = readFileSync('src/lib/server/storeTeam.ts', 'utf8');

  assert.match(legacyRegistration, /isOperationalStoreSaas\(link\.stores\)/);
  assert.match(currentRegistration, /isOperationalStoreSaas\(store\)/);
  assert.match(currentRegistration, /authorizeStoreEntitlement\(/);
  assert.doesNotMatch(managedStore, /status !== 'active' \|\| !store\.portal_enabled/);
});

test('nenhuma rota da etapa 7 ativa bloqueio ou mutacao financeira', () => {
  const access = readFileSync('src/lib/server/billing/access.ts', 'utf8');
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

  assert.match(access, /BILLING_STAGE6_ENFORCEMENT_ENABLED/);
  assert.equal(safety.mutationsEnabled, false);
  assert.equal(safety.trialStartEnabled, false);
});
