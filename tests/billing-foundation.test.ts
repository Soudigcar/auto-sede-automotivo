import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import {
  billingEnforcementEnabled,
  evaluateBillingAccess,
  resolveStoreBillingAccess,
  type BillingSubscriptionAccessRow
} from '../src/lib/server/billing/access.ts';
import {
  asaasApiHeaders,
  isAuthorizedAsaasWebhook,
  minimalAsaasWebhookPayload,
  readAsaasServerConfiguration
} from '../src/lib/server/billing/asaas.ts';

const migration = readFileSync('supabase/migrations/20260827044014_billing_foundation_asaas.sql', 'utf8');
const masterRoute = readFileSync('src/app/api/master/billing/route.ts', 'utf8');
const webhookRoute = readFileSync('src/app/api/webhooks/asaas/route.ts', 'utf8');
const storePortal = readFileSync('src/lib/server/storePortal.ts', 'utf8');
const now = new Date('2026-08-27T12:00:00.000Z');

function subscription(patch: Partial<BillingSubscriptionAccessRow> = {}): BillingSubscriptionAccessRow {
  return {
    id: 'subscription-a',
    status: 'trialing',
    access_enforcement_mode: 'enforce',
    trial_ends_at: '2026-09-03T12:00:00.000Z',
    grace_ends_at: null,
    ...patch
  };
}

test('billing nasce globalmente desligado e somente true explicito habilita enforcement', () => {
  assert.equal(billingEnforcementEnabled({} as NodeJS.ProcessEnv), false);
  assert.equal(billingEnforcementEnabled({ BILLING_ENFORCEMENT_ENABLED: 'false' } as NodeJS.ProcessEnv), false);
  assert.equal(billingEnforcementEnabled({ BILLING_ENFORCEMENT_ENABLED: 'true' } as NodeJS.ProcessEnv), true);
});

test('modo observacao preserva integralmente o acesso de loja operacional', () => {
  assert.deepEqual(evaluateBillingAccess({
    role: 'store', operationalStore: true, enforcementEnabled: false, subscription: null, now
  }), {
    allowed: true,
    enforced: false,
    reason: 'global_observation_mode',
    subscriptionId: null
  });

  assert.equal(evaluateBillingAccess({
    role: 'store', operationalStore: true, enforcementEnabled: true,
    subscription: subscription({ access_enforcement_mode: 'observe' }), now
  }).allowed, true);
});

test('Master sempre preserva acesso e nao consulta assinatura da loja', async () => {
  const forbiddenClient = { from() { throw new Error('Master nao deve consultar billing da loja.'); } };
  const decision = await resolveStoreBillingAccess(forbiddenClient, {
    role: 'master', storeId: '', operationalStore: false, enforcementEnabled: true, now
  });
  assert.equal(decision.reason, 'master_bypass');
  assert.equal(decision.allowed, true);
});

test('trial permite acesso antes do limite e expira exatamente no setimo dia', () => {
  const before = evaluateBillingAccess({
    role: 'store', operationalStore: true, enforcementEnabled: true,
    subscription: subscription(), now: new Date('2026-09-03T11:59:59.999Z')
  });
  const atBoundary = evaluateBillingAccess({
    role: 'store', operationalStore: true, enforcementEnabled: true,
    subscription: subscription(), now: new Date('2026-09-03T12:00:00.000Z')
  });
  assert.equal(before.reason, 'trial_active');
  assert.equal(before.allowed, true);
  assert.equal(atBoundary.reason, 'trial_expired');
  assert.equal(atBoundary.allowed, false);
});

test('inadimplencia respeita carencia somente quando enforcement da assinatura esta ativo', () => {
  const duringGrace = evaluateBillingAccess({
    role: 'store', operationalStore: true, enforcementEnabled: true,
    subscription: subscription({
      status: 'past_due', trial_ends_at: null, grace_ends_at: '2026-08-30T12:00:00.000Z'
    }), now
  });
  const afterGrace = evaluateBillingAccess({
    role: 'store', operationalStore: true, enforcementEnabled: true,
    subscription: subscription({
      status: 'past_due', trial_ends_at: null, grace_ends_at: '2026-08-27T12:00:00.000Z'
    }), now
  });
  assert.equal(duringGrace.reason, 'past_due_grace');
  assert.equal(duringGrace.allowed, true);
  assert.equal(afterGrace.reason, 'payment_required');
  assert.equal(afterGrace.allowed, false);
});

test('falha de infraestrutura do billing permanece fail-open para nao derrubar lojas atuais', async () => {
  const query: any = {
    select() { return query; }, eq() { return query; }, neq() { return query; },
    order() { return query; }, limit() { return query; },
    async maybeSingle() { return { data: null, error: { code: 'PGRST205', message: 'schema cache' } }; }
  };
  const decision = await resolveStoreBillingAccess({ from() { return query; } }, {
    role: 'store', storeId: 'store-a', operationalStore: true, enforcementEnabled: true, now
  });
  assert.equal(decision.allowed, true);
  assert.equal(decision.reason, 'billing_infrastructure_unavailable');
});

test('migration separa portal publico de assinatura e nunca altera stores ou users', () => {
  assert.match(migration, /create table if not exists public\.billing_plans/);
  assert.match(migration, /create table if not exists public\.store_billing_subscriptions/);
  assert.match(migration, /trial_ends_at = trial_started_at \+ interval '7 days'/);
  assert.match(migration, /'professional', 'Profissional', 149700, 'monthly', 5, true/);
  assert.match(migration, /'observe'/);
  assert.doesNotMatch(migration, /update\s+public\.stores/i);
  assert.doesNotMatch(migration, /update\s+public\.users/i);
});

test('tabelas financeiras sao service-only e trial exige Master ativo no banco e na API', () => {
  assert.match(migration, /revoke all on table public\.billing_plans from public, anon, authenticated/);
  assert.match(migration, /grant select, insert, update on table public\.billing_plans to service_role/);
  assert.match(migration, /actor\.role = 'master'/);
  assert.match(migration, /actor\.status = 'active'/);
  assert.match(masterRoute, /requireMaster\(request, supabase\)/);
  assert.match(masterRoute, /action !== 'start-trial'/);
});

test('gates centrais consultam billing, mas a configuracao padrao nao adiciona consulta ao banco', () => {
  assert.match(storePortal, /resolveStoreBillingAccess/);
  assert.match(storePortal, /status:402/);
});

test('configuracao Asaas separa ambientes, nao aceita token curto e usa access_token server-side', () => {
  const invalid = readAsaasServerConfiguration({
    ASAAS_ENV: 'production',
    ASAAS_API_KEY: '$aact_hmlg_example',
    ASAAS_WEBHOOK_TOKEN: 'curto'
  } as NodeJS.ProcessEnv);
  assert.equal(invalid.apiConfigured, false);
  assert.equal(invalid.webhookConfigured, false);
  assert.equal(invalid.errors.length, 2);

  const valid = readAsaasServerConfiguration({
    ASAAS_ENV: 'sandbox',
    ASAAS_API_KEY: '$aact_hmlg_example',
    ASAAS_WEBHOOK_TOKEN: '0123456789abcdef0123456789abcdef'
  } as NodeJS.ProcessEnv);
  assert.equal(valid.baseUrl, 'https://api-sandbox.asaas.com/v3');
  assert.equal(asaasApiHeaders(valid).access_token, '$aact_hmlg_example');
  const request = new Request('https://example.com', {
    headers: { 'asaas-access-token': '0123456789abcdef0123456789abcdef' }
  });
  assert.equal(isAuthorizedAsaasWebhook(request, valid), true);
});

test('webhook persiste payload minimo, e endpoint limita tamanho e trata duplicidade', () => {
  const normalized = minimalAsaasWebhookPayload({
    id: 'evt_1',
    event: 'PAYMENT_CONFIRMED',
    payment: {
      id: 'pay_1', status: 'CONFIRMED', value: 1497,
      customer: 'cus_1', creditCard: { creditCardNumber: '4111111111111111' }
    }
  });
  assert.equal(normalized.provider_object_type, 'payment');
  assert.equal(normalized.provider_object_id, 'pay_1');
  assert.equal('creditCard' in (normalized.payload.object || {}), false);
  assert.match(webhookRoute, /readJsonBody<any>\(request, MAX_ASAAS_WEBHOOK_BYTES\)/);
  assert.match(webhookRoute, /error\.code \|\| ''\) !== '23505'/);
});
