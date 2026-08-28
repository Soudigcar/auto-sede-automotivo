import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import {
  deliverAsaasSandboxTestWebhook,
  forceAsaasSandboxPaymentOverdue,
  readAsaasSandboxSafety,
  readAsaasServerConfiguration,
  refundAsaasSandboxPayment
} from '../src/lib/server/billing/asaas.ts';
import {
  asaasDueDateKey,
  billingDateKey,
  BILLING_GRACE_PERIOD_DAYS,
  resolveAsaasPaymentState
} from '../src/lib/server/billing/repository.ts';

const repository = readFileSync('src/lib/server/billing/repository.ts', 'utf8');
const masterRoute = readFileSync('src/app/api/master/billing/route.ts', 'utf8');
const webhookRoute = readFileSync('src/app/api/webhooks/asaas/route.ts', 'utf8');
const billingUi = readFileSync('src/components/MasterBillingCenter.tsx', 'utf8');

const positiveStoreId = '06652d5a-9ca6-4c4d-9bf5-0a2afb6b6dfe';
const failureStoreId = '16652d5a-9ca6-4c4d-9bf5-0a2afb6b6dfe';

function stageFiveEnvironment(patch: Record<string, string> = {}) {
  return {
    VERCEL_ENV: 'preview',
    ASAAS_ENV: 'sandbox',
    BILLING_ASAAS_SANDBOX_ENABLED: 'true',
    BILLING_ASAAS_SYNTHETIC_STORE_ID: positiveStoreId,
    BILLING_ASAAS_FAILURE_SYNTHETIC_STORE_ID: failureStoreId,
    BILLING_ASAAS_SANDBOX_FAILURE_TEST_ENABLED: 'true',
    BILLING_ASAAS_PREVIEW_BASE_URL: 'https://billing-preview.vercel.app',
    VERCEL_AUTOMATION_BYPASS_SECRET: 'vercel-preview-bypass-secret',
    ...patch
  } as NodeJS.ProcessEnv;
}

function sandboxConfiguration() {
  return readAsaasServerConfiguration({
    ASAAS_ENV: 'sandbox',
    ASAAS_API_KEY: '$aact_hmlg_sandbox_test',
    ASAAS_WEBHOOK_TOKEN: '0123456789abcdef0123456789abcdef'
  } as NodeJS.ProcessEnv);
}

test('etapa 5 exige segunda loja sintetica distinta e flag explicita no Preview', () => {
  const enabled = readAsaasSandboxSafety(stageFiveEnvironment());
  assert.equal(enabled.enabled, true);
  assert.equal(enabled.failureTestEnabled, true);
  assert.deepEqual(enabled.syntheticStoreIds, [positiveStoreId, failureStoreId]);

  const disabled = readAsaasSandboxSafety(stageFiveEnvironment({
    BILLING_ASAAS_SANDBOX_FAILURE_TEST_ENABLED: 'false',
    BILLING_ASAAS_FAILURE_SYNTHETIC_STORE_ID: ''
  }));
  assert.equal(disabled.enabled, true);
  assert.equal(disabled.failureTestEnabled, false);

  const sameStore = readAsaasSandboxSafety(stageFiveEnvironment({
    BILLING_ASAAS_FAILURE_SYNTHETIC_STORE_ID: positiveStoreId
  }));
  assert.equal(sameStore.enabled, false);
  assert.equal(sameStore.failureTestEnabled, false);
});

test('atraso e estorno chamam somente endpoints oficiais do Asaas Sandbox', async () => {
  const requests: Array<{ url: string; method: string; body: any }> = [];
  const fakeFetch = (async (input: string | URL | Request, init?: RequestInit) => {
    requests.push({
      url: String(input),
      method: String(init?.method || 'GET'),
      body: init?.body ? JSON.parse(String(init.body)) : null
    });
    return new Response(JSON.stringify({ id: 'pay_stage5_synthetic', status: 'OK' }), { status: 200 });
  }) as typeof fetch;

  await forceAsaasSandboxPaymentOverdue(
    sandboxConfiguration(),
    'pay_stage5_synthetic',
    fakeFetch
  );
  await refundAsaasSandboxPayment(
    sandboxConfiguration(),
    'pay_stage5_synthetic',
    fakeFetch
  );

  assert.equal(requests[0].url, 'https://api-sandbox.asaas.com/v3/sandbox/payment/pay_stage5_synthetic/overdue');
  assert.equal(requests[0].method, 'POST');
  assert.equal(requests[1].url, 'https://api-sandbox.asaas.com/v3/payments/pay_stage5_synthetic/refund');
  assert.equal(requests[1].method, 'POST');
  assert.match(requests[1].body.description, /etapa 5/i);
});

test('replay de webhook usa token, bypass e payload financeiro fixo', async () => {
  let requestedUrl = '';
  let requestedHeaders: HeadersInit | undefined;
  let requestedBody: any = null;
  const fakeFetch = (async (input: string | URL | Request, init?: RequestInit) => {
    requestedUrl = String(input);
    requestedHeaders = init?.headers;
    requestedBody = JSON.parse(String(init?.body || '{}'));
    return new Response(JSON.stringify({
      received: true,
      duplicate: false,
      processing_status: 'processed'
    }), { status: 200 });
  }) as typeof fetch;
  const environment = stageFiveEnvironment();
  const result = await deliverAsaasSandboxTestWebhook(
    sandboxConfiguration(),
    readAsaasSandboxSafety(environment),
    {
      id: 'evt_stage5_chargeback_requested_pay_stage5_synthetic',
      event: 'PAYMENT_CHARGEBACK_REQUESTED',
      payment: {
        id: 'pay_stage5_synthetic',
        status: 'CHARGEBACK_REQUESTED',
        value: 1497,
        billingType: 'CREDIT_CARD',
        subscription: 'sub_stage5_synthetic'
      }
    },
    environment,
    fakeFetch
  );
  assert.match(requestedUrl, /^https:\/\/billing-preview\.vercel\.app\/api\/webhooks\/asaas\?/);
  assert.match(requestedUrl, /x-vercel-protection-bypass=/);
  assert.equal((requestedHeaders as Record<string, string>)['asaas-access-token'], '0123456789abcdef0123456789abcdef');
  assert.equal(requestedBody.payment.value, 1497);
  assert.equal(result.processing_status, 'processed');

  await assert.rejects(() => deliverAsaasSandboxTestWebhook(
    sandboxConfiguration(),
    readAsaasSandboxSafety(environment),
    { ...requestedBody, payment: { ...requestedBody.payment, value: 1498 } },
    environment,
    fakeFetch
  ));
});

test('recusa entra em past_due, sucesso posterior recupera e perda terminal rejeita evento antigo', () => {
  assert.deepEqual(resolveAsaasPaymentState({
    eventType: 'PAYMENT_CREDIT_CARD_CAPTURE_REFUSED',
    providerStatus: 'CREDIT_CARD_CAPTURE_REFUSED',
    existingStatus: 'PENDING'
  }), {
    providerStatus: 'CREDIT_CARD_CAPTURE_REFUSED',
    subscriptionTarget: 'past_due',
    stale: false
  });
  assert.deepEqual(resolveAsaasPaymentState({
    eventType: 'PAYMENT_CONFIRMED',
    providerStatus: 'CONFIRMED',
    existingStatus: 'CREDIT_CARD_CAPTURE_REFUSED'
  }), {
    providerStatus: 'CONFIRMED',
    subscriptionTarget: 'active',
    stale: false
  });
  assert.deepEqual(resolveAsaasPaymentState({
    eventType: 'PAYMENT_CONFIRMED',
    providerStatus: 'CONFIRMED',
    existingStatus: 'CHARGEBACK_DISPUTE'
  }), {
    providerStatus: 'CHARGEBACK_DISPUTE',
    subscriptionTarget: null,
    stale: true
  });
});

test('vencimento civil do Asaas nao retrocede um dia ao passar por timestamptz', () => {
  assert.equal(asaasDueDateKey('2026-09-03T00:00:00.000Z'), '2026-09-03');
  assert.equal(asaasDueDateKey('2026-09-03 00:00:00+00'), '2026-09-03');
  assert.equal(billingDateKey('2026-09-03T22:34:14.441Z'), '2026-09-03');
  assert.equal(
    asaasDueDateKey('2026-09-03T00:00:00.000Z'),
    billingDateKey('2026-09-03T22:34:14.441Z')
  );
  assert.match(billingUi, /asaasDueDate\(payment\.due_at\)/);
});

test('codigo fixa carencia em 3 dias, preserva observe e expoe a trilha da etapa 5', () => {
  assert.equal(BILLING_GRACE_PERIOD_DAYS, 3);
  assert.match(repository, /subscription\.past_due_at \|\| now/);
  assert.match(repository, /subscription\.grace_ends_at[\s\S]*BILLING_GRACE_PERIOD_DAYS/);
  assert.match(repository, /PAYMENT_CREDIT_CARD_CAPTURE_REFUSED/);
  assert.match(repository, /duplicate_requested/);
  assert.match(repository, /out_of_order/);
  assert.doesNotMatch(repository, /access_enforcement_mode:\s*'enforce'/);
  assert.match(masterRoute, /stage5-chargeback-sequence/);
  assert.match(masterRoute, /storeId !== asaasSandbox\.failureSyntheticStoreId/);
  assert.match(webhookRoute, /syntheticStoreIds: asaasSandbox\.syntheticStoreIds/);
  assert.match(billingUi, /Carência de 3 dias/);
  assert.match(billingUi, /Cenário negativo concluído sem bloqueio/);
});
