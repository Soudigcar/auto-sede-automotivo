import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import {
  confirmAsaasSandboxPayment,
  readAsaasSandboxSafety,
  readAsaasServerConfiguration
} from '../src/lib/server/billing/asaas.ts';
import {
  monthlyBillingPeriod,
  resolveAsaasPaymentState
} from '../src/lib/server/billing/repository.ts';

const masterRoute = readFileSync('src/app/api/master/billing/route.ts', 'utf8');
const webhookRoute = readFileSync('src/app/api/webhooks/asaas/route.ts', 'utf8');
const repository = readFileSync('src/lib/server/billing/repository.ts', 'utf8');
const billingUi = readFileSync('src/components/MasterBillingCenter.tsx', 'utf8');
const atomicMigration = readFileSync(
  'supabase/production_ready/billing_stage15b/20260828173000_billing_webhook_atomicity.sql',
  'utf8'
);

const syntheticStoreId = '06652d5a-9ca6-4c4d-9bf5-0a2afb6b6dfe';

function stageFourEnvironment(patch: Record<string, string> = {}) {
  return {
    VERCEL_ENV: 'preview',
    ASAAS_ENV: 'sandbox',
    BILLING_ASAAS_SANDBOX_ENABLED: 'true',
    BILLING_ASAAS_SANDBOX_PAYMENT_CONFIRMATION_ENABLED: 'true',
    BILLING_ASAAS_SYNTHETIC_STORE_ID: syntheticStoreId,
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

test('confirmacao da etapa 4 exige chave explicita e continua restrita ao Preview Sandbox', () => {
  const enabled = readAsaasSandboxSafety(stageFourEnvironment());
  assert.equal(enabled.enabled, true);
  assert.equal(enabled.paymentConfirmationEnabled, true);

  const disabled = readAsaasSandboxSafety(stageFourEnvironment({
    BILLING_ASAAS_SANDBOX_PAYMENT_CONFIRMATION_ENABLED: 'false'
  }));
  assert.equal(disabled.enabled, true);
  assert.equal(disabled.paymentConfirmationEnabled, false);

  const production = readAsaasSandboxSafety(stageFourEnvironment({ VERCEL_ENV: 'production' }));
  assert.equal(production.enabled, false);
  assert.equal(production.paymentConfirmationEnabled, false);
});

test('confirmacao chama exclusivamente o endpoint Sandbox da cobranca autorizada', async () => {
  let requestedUrl = '';
  let requestedMethod = '';
  const fakeFetch = (async (input: string | URL | Request, init?: RequestInit) => {
    requestedUrl = String(input);
    requestedMethod = String(init?.method || 'GET');
    return new Response(JSON.stringify({ id: 'pay_synthetic_stage_four', status: 'CONFIRMED' }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  }) as typeof fetch;

  const result = await confirmAsaasSandboxPayment(
    sandboxConfiguration(),
    'pay_synthetic_stage_four',
    fakeFetch
  );
  assert.equal(requestedUrl, 'https://api-sandbox.asaas.com/v3/sandbox/payment/pay_synthetic_stage_four/confirm');
  assert.equal(requestedMethod, 'POST');
  assert.deepEqual(result, { id: 'pay_synthetic_stage_four', status: 'CONFIRMED' });
});

test('maquina de estados nao deixa evento antigo regredir pagamento confirmado', () => {
  assert.deepEqual(resolveAsaasPaymentState({
    eventType: 'PAYMENT_OVERDUE',
    providerStatus: 'OVERDUE',
    existingStatus: 'CONFIRMED',
    existingConfirmedAt: '2026-09-03T12:00:00Z'
  }), {
    providerStatus: 'CONFIRMED',
    subscriptionTarget: null,
    stale: true
  });

  assert.deepEqual(resolveAsaasPaymentState({
    eventType: 'PAYMENT_CONFIRMED',
    providerStatus: 'CONFIRMED',
    existingStatus: 'OVERDUE'
  }), {
    providerStatus: 'CONFIRMED',
    subscriptionTarget: 'active',
    stale: false
  });

  assert.equal(resolveAsaasPaymentState({
    eventType: 'PAYMENT_REFUNDED',
    providerStatus: 'REFUNDED',
    existingStatus: 'CONFIRMED',
    existingConfirmedAt: '2026-09-03T12:00:00Z'
  }).subscriptionTarget, 'past_due');

  assert.deepEqual(resolveAsaasPaymentState({
    eventType: 'PAYMENT_UPDATED',
    providerStatus: 'PENDING',
    existingStatus: 'SANDBOX_CONFIRMATION_REQUESTED'
  }), {
    providerStatus: 'SANDBOX_CONFIRMATION_REQUESTED',
    subscriptionTarget: null,
    stale: true
  });
});

test('periodo mensal nasce no vencimento e termina um mes depois sem estourar o calendario', () => {
  assert.deepEqual(monthlyBillingPeriod('2026-09-03T03:00:00.000Z'), {
    startsAt: '2026-09-03T03:00:00.000Z',
    endsAt: '2026-10-03T03:00:00.000Z'
  });
  assert.deepEqual(monthlyBillingPeriod('2027-01-31T03:00:00.000Z'), {
    startsAt: '2027-01-31T03:00:00.000Z',
    endsAt: '2027-02-28T03:00:00.000Z'
  });
});

test('API, webhook, repositorio e UI preservam o escopo sintetico da etapa 4', () => {
  assert.match(masterRoute, /confirm-sandbox-payment/);
  assert.match(masterRoute, /storeId !== asaasSandbox\.syntheticStoreId/);
  assert.match(masterRoute, /paymentConfirmationEnabled/);
  assert.match(repository, /payments\.length !== 1/);
  assert.match(repository, /Number\(payment\.amount_cents\) !== 149700/);
  assert.match(repository, /provider_status: 'SANDBOX_CONFIRMATION_REQUESTED'/);
  assert.match(repository, /access_enforcement_mode !== 'observe'/);
  assert.match(repository, /asaas_sandbox_payment_confirmation_requested/);
  assert.match(repository, /SANDBOX_CONFIRMATION_REQUESTED/);
  assert.match(repository, /apply_asaas_subscription_webhook_event/);
  assert.match(atomicMigration, /asaas_webhook_subscription_transition/);
  assert.match(webhookRoute, /provider_event_id,event_type/);
  assert.match(webhookRoute, /claimStoredBillingWebhookEvent/);
  assert.match(webhookRoute, /completeStoredBillingWebhookEvent/);
  assert.doesNotMatch(webhookRoute, /\.eq\('processing_attempts'/);
  assert.match(billingUi, /Cartão Sandbox cadastrado/);
  assert.doesNotMatch(billingUi, /Confirmar cobrança Sandbox/);
  assert.match(billingUi, /Saúde dos webhooks/);
  assert.match(billingUi, /Auditoria do billing/);
  assert.doesNotMatch(repository, /access_enforcement_mode:\s*'enforce'/);
});
