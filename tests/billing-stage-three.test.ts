import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import {
  createAsaasRecurringCheckout,
  ensureAsaasSandboxWebhook,
  formatAsaasDateTime,
  readAsaasSandboxSafety,
  readAsaasServerConfiguration
} from '../src/lib/server/billing/asaas.ts';

const masterRoute = readFileSync('src/app/api/master/billing/route.ts', 'utf8');
const webhookRoute = readFileSync('src/app/api/webhooks/asaas/route.ts', 'utf8');
const repository = readFileSync('src/lib/server/billing/repository.ts', 'utf8');
const billingUi = readFileSync('src/components/MasterBillingCenter.tsx', 'utf8');

const syntheticStoreId = '06652d5a-9ca6-4c4d-9bf5-0a2afb6b6dfe';

function sandboxEnvironment(patch: Record<string, string> = {}) {
  return {
    VERCEL_ENV: 'preview',
    ASAAS_ENV: 'sandbox',
    BILLING_ASAAS_SANDBOX_ENABLED: 'true',
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

test('gate Asaas aceita apenas Preview Sandbox com loja sintetica e bypass', () => {
  const safe = readAsaasSandboxSafety(sandboxEnvironment());
  assert.equal(safe.enabled, true);
  assert.equal(safe.syntheticStoreId, syntheticStoreId);
  assert.equal(safe.previewBaseUrl, 'https://billing-preview.vercel.app');

  assert.equal(readAsaasSandboxSafety(sandboxEnvironment({ VERCEL_ENV: 'production' })).enabled, false);
  assert.equal(readAsaasSandboxSafety(sandboxEnvironment({ ASAAS_ENV: 'production' })).enabled, false);
  assert.equal(readAsaasSandboxSafety(sandboxEnvironment({ BILLING_ASAAS_SYNTHETIC_STORE_ID: '' })).enabled, false);
  assert.equal(readAsaasSandboxSafety(sandboxEnvironment({ VERCEL_AUTOMATION_BYPASS_SECRET: '' })).enabled, false);
  assert.equal(readAsaasSandboxSafety(sandboxEnvironment({ BILLING_ASAAS_PREVIEW_BASE_URL: 'https://autosede.com.br' })).enabled, false);
});

test('vencimento enviado ao Asaas corresponde ao fim do trial em Brasilia', () => {
  assert.equal(
    formatAsaasDateTime('2030-01-02T14:05:06.000Z'),
    '2030-01-02 11:05:06'
  );
});

test('checkout recorrente usa somente cartao, valor profissional e callback sem segredo', async () => {
  let requestedUrl = '';
  let requestedBody: any = null;
  const fakeFetch = (async (input: string | URL | Request, init?: RequestInit) => {
    requestedUrl = String(input);
    requestedBody = JSON.parse(String(init?.body || '{}'));
    return new Response(JSON.stringify({
      id: '131ca662-56c8-4479-b5b3-fd61a413fce7',
      link: 'https://sandbox.asaas.com/checkoutSession/show/131ca662-56c8-4479-b5b3-fd61a413fce7',
      status: 'ACTIVE'
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;

  const checkout = await createAsaasRecurringCheckout(sandboxConfiguration(), {
    externalReference: 'store:synthetic:subscription:synthetic',
    planName: 'Profissional',
    amountCents: 149700,
    includedUsers: 5,
    trialEndsAt: '2030-01-02T14:05:06.000Z',
    previewBaseUrl: 'https://billing-preview.vercel.app'
  }, fakeFetch);

  assert.equal(requestedUrl, 'https://api-sandbox.asaas.com/v3/checkouts');
  assert.deepEqual(requestedBody.billingTypes, ['CREDIT_CARD']);
  assert.deepEqual(requestedBody.chargeTypes, ['RECURRENT']);
  assert.equal(requestedBody.items[0].value, 1497);
  assert.equal(requestedBody.subscription.cycle, 'MONTHLY');
  assert.equal(requestedBody.subscription.nextDueDate, '2030-01-02 11:05:06');
  assert.equal('customerData' in requestedBody, false);
  assert.doesNotMatch(JSON.stringify(requestedBody.callback), /protection-bypass|bypass-secret/);
  assert.match(checkout.link, /^https:\/\/sandbox\.asaas\.com\//);
});

test('configuracao do webhook e idempotente por nome e usa token diferente da API key', async () => {
  const requests: Array<{ url: string; method: string; body: any }> = [];
  const fakeFetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const method = String(init?.method || 'GET');
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    requests.push({ url, method, body });
    if (method === 'GET') {
      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    }
    return new Response(JSON.stringify({
      id: '0f328d12-aead-47ad-8a1e-698620c0d24c',
      enabled: true,
      interrupted: false
    }), { status: 200 });
  }) as typeof fetch;
  const environment = sandboxEnvironment();
  const result = await ensureAsaasSandboxWebhook(
    sandboxConfiguration(),
    readAsaasSandboxSafety(environment),
    environment,
    fakeFetch
  );
  assert.equal(result.created, true);
  assert.equal(requests[0].method, 'GET');
  assert.equal(requests[1].method, 'POST');
  assert.match(requests[1].body.url, /^https:\/\/billing-preview\.vercel\.app\/api\/webhooks\/asaas\?/);
  assert.match(requests[1].body.url, /x-vercel-protection-bypass=/);
  assert.equal(requests[1].body.authToken, '0123456789abcdef0123456789abcdef');
  assert.ok(requests[1].body.events.includes('CHECKOUT_PAID'));
  assert.ok(requests[1].body.events.includes('PAYMENT_CONFIRMED'));
});

test('API, repositorio, webhook e UI preservam os limites da etapa 3', () => {
  assert.match(masterRoute, /action === 'create-sandbox-checkout'/);
  assert.match(masterRoute, /storeId !== asaasSandbox\.syntheticStoreId/);
  assert.match(repository, /store\.registration_source !== 'dev_routing_seed'/);
  assert.match(repository, /subscription\.access_enforcement_mode !== 'observe'/);
  assert.match(repository, /amount_cents !== 149700/);
  assert.match(repository, /provider_checkout_id: checkout\.id/);
  assert.match(webhookRoute, /provider_event_id/);
  assert.match(webhookRoute, /\['processed', 'ignored'\]\.includes/);
  assert.match(webhookRoute, /processStoredAsaasWebhookEvent/);
  assert.match(billingUi, /Gerar Checkout Sandbox/);
  assert.match(billingUi, /Nenhuma cobrança real é permitida/);
  assert.doesNotMatch(repository, /access_enforcement_mode:\s*'enforce'/);
});
