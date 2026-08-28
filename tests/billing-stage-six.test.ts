import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import {
  evaluateBillingAccess,
  resolveStoreBillingAccess,
  type BillingSubscriptionAccessRow
} from '../src/lib/server/billing/access.ts';
import { readBillingRuntimeSafety } from '../src/lib/server/billing/runtime.ts';
import { storePortalMenu, storePortalPermissions } from '../src/lib/server/storePortal.ts';

const masterRoute = readFileSync('src/app/api/master/billing/route.ts', 'utf8');
const masterUi = readFileSync('src/components/MasterBillingCenter.tsx', 'utf8');
const storeRoute = readFileSync('src/app/api/store/portal/billing/route.ts', 'utf8');
const storeUi = readFileSync('src/components/StoreBillingExperience.tsx', 'utf8');
const contextRoute = readFileSync('src/app/api/store/portal/context/route.ts', 'utf8');

const now = new Date('2026-08-28T12:00:00.000Z');

function subscription(patch: Partial<BillingSubscriptionAccessRow> = {}): BillingSubscriptionAccessRow {
  return {
    id: 'subscription-stage-six',
    status: 'active',
    access_enforcement_mode: 'observe',
    trial_ends_at: null,
    grace_ends_at: null,
    ...patch
  };
}

test('etapa 6 mantem mutacoes bloqueadas mesmo com flags antigas habilitadas', () => {
  const safety = readBillingRuntimeSafety({
    VERCEL_ENV: 'preview',
    NEXT_PUBLIC_SUPABASE_URL: 'https://hfzmzfhuhukmxkxbkxay.supabase.co',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'publishable-test-key',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role-test-key',
    BILLING_PREVIEW_ALLOWED_SUPABASE_PROJECT_REF: 'hfzmzfhuhukmxkxbkxay',
    BILLING_PREVIEW_READS_ENABLED: 'true',
    BILLING_PREVIEW_MUTATIONS_ENABLED: 'false',
    BILLING_TRIAL_START_ENABLED: 'true',
    ASAAS_SANDBOX_CHECKOUT_ENABLED: 'true',
    ASAAS_SANDBOX_PAYMENT_CONFIRMATION_ENABLED: 'true',
    ASAAS_SANDBOX_FAILURE_TEST_ENABLED: 'true'
  } as NodeJS.ProcessEnv);

  assert.equal(safety.readsEnabled, true);
  assert.equal(safety.mutationsEnabled, false);
  assert.equal(safety.trialStartEnabled, false);
});

test('etapa 6 mantem entitlement em observe se apenas a chave global antiga for habilitada', async () => {
  const { billingEnforcementEnabled } = await import('../src/lib/server/billing/access.ts');
  assert.equal(billingEnforcementEnabled({
    VERCEL_ENV: 'preview',
    BILLING_ENFORCEMENT_ENABLED: 'true'
  } as NodeJS.ProcessEnv), false);
});

test('entitlement calcula o estado comercial, mas sempre preserva o acesso em observe', () => {
  const active = evaluateBillingAccess({
    role: 'store', operationalStore: true, enforcementEnabled: false,
    subscription: subscription(), now
  });
  assert.equal(active.allowed, true);
  assert.equal(active.enforced, false);
  assert.equal(active.reason, 'global_observation_mode');
  assert.equal(active.observedAllowed, true);
  assert.equal(active.observedReason, 'subscription_active');

  const overdue = evaluateBillingAccess({
    role: 'store', operationalStore: true, enforcementEnabled: false,
    subscription: subscription({
      status: 'past_due',
      grace_ends_at: '2026-08-28T11:59:59.000Z'
    }),
    now
  });
  assert.equal(overdue.allowed, true);
  assert.equal(overdue.enforced, false);
  assert.equal(overdue.observedAllowed, false);
  assert.equal(overdue.observedReason, 'payment_required');
});

test('falha inesperada da consulta de entitlement continua fail-open sem PII', async () => {
  const query: any = {
    select() { return query; }, eq() { return query; }, neq() { return query; },
    order() { return query; }, limit() { return query; },
    async maybeSingle() { return { data: null, error: { code: 'XX001', message: 'internal failure' } }; }
  };
  const originalError = console.error;
  const logs: unknown[][] = [];
  console.error = (...args: unknown[]) => logs.push(args);
  try {
    const decision = await resolveStoreBillingAccess({ from() { return query; } }, {
      role: 'store', storeId: 'store-stage-six', operationalStore: true,
      enforcementEnabled: false, now
    });
    assert.equal(decision.allowed, true);
    assert.equal(decision.reason, 'billing_infrastructure_unavailable');
    assert.deepEqual(logs[0]?.[1], { code: 'XX001' });
  } finally {
    console.error = originalError;
  }
});

test('somente Master e gestor recebem a experiencia financeira da loja', () => {
  assert.ok(storePortalPermissions('master').includes('view_billing'));
  assert.ok(storePortalPermissions('store').includes('view_billing'));
  assert.equal(storePortalPermissions('pre_sales').includes('view_billing'), false);
  assert.equal(storePortalPermissions('seller').includes('view_billing'), false);
  assert.equal(storePortalPermissions('prospector').includes('view_billing'), false);
  assert.ok(storePortalMenu('store', 'loja-dev').some((item) => item.href === '/loja/loja-dev/assinatura'));
  assert.equal(storePortalMenu('seller', 'loja-dev').some((item) => item.key === 'billing'), false);
});

test('API da loja e interface sao estritamente de leitura e limitadas ao escopo autenticado', () => {
  assert.match(storeRoute, /export async function GET/);
  assert.doesNotMatch(storeRoute, /export async function POST/);
  assert.match(storeRoute, /authorizeStorePortal\(request, slug\)/);
  assert.match(storeRoute, /context\.permissions\.includes\('view_billing'\)/);
  assert.match(storeRoute, /readStoreBillingOverview\(context\.supabase, context\.store\.id\)/);
  assert.doesNotMatch(storeRoute, /provider_(customer|subscription|checkout|payment)_id:/);
  assert.match(storeUi, /Plano e Assinatura/);
  assert.match(storeUi, /Modo de observação ativo/);
  assert.match(storeUi, /Checkout e alterações financeiras estão bloqueados/);
  assert.doesNotMatch(storeUi, /method:\s*['"]POST['"]/);
});

test('Master mantém finanças somente leitura e controles sintéticos da etapa 5 não são expostos', () => {
  const mutationGuard = masterRoute.indexOf('if (!context.safety.mutationsEnabled)');
  const bodyRead = masterRoute.indexOf('request.json()');
  assert.ok(mutationGuard >= 0);
  assert.ok(bodyRead > mutationGuard);
  assert.match(masterRoute, /billing_stage6_read_only/);
  assert.doesNotMatch(masterRoute, /stage5-card-refused|stage5-overdue|stage5-refund|stage5-chargeback-sequence/);
  assert.match(masterUi, /Cadastro sintético/);
  assert.match(masterUi, /Trial: não · Asaas: não · Acesso: observe/);
  assert.doesNotMatch(masterUi, /Gerar Checkout Sandbox|Confirmar cobrança Sandbox|Simular cartão recusado|Forçar atraso Sandbox|Estornar no Sandbox|Testar chargeback/);
});

test('contexto registra decisao observada sem incluir campos pessoais no log', () => {
  const marker = contextRoute.indexOf("console.info('[billing.entitlement.observe]'");
  assert.ok(marker >= 0);
  const logEnd = contextRoute.indexOf('});', marker);
  assert.ok(logEnd > marker);
  const logBlock = contextRoute.slice(marker, logEnd + 3);
  assert.match(logBlock, /access_preserved/);
  assert.match(logBlock, /observed_reason/);
  assert.doesNotMatch(logBlock, /full_name|email|phone/);
});
