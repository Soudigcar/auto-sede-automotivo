import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import {
  createAsaasRecurringCheckout,
  readAsaasSandboxSafety,
  readAsaasServerConfiguration
} from '../src/lib/server/billing/asaas.ts';
import { readBillingRuntimeSafety } from '../src/lib/server/billing/runtime.ts';

const projectRef = 'hfzmzfhuhukmxkxbkxay';
const positiveStoreId = '06652d5a-9ca6-4c4d-9bf5-0a2afb6b6dfe';
const failureStoreId = 'f13e19a9-c80e-4c0b-bef3-bc8d47f22d86';
const stage13StoreId = '360eaf1f-8ea3-4fc6-bdb5-a17282c0f103';
const masterRoute = readFileSync('src/app/api/master/billing/route.ts', 'utf8');
const readinessRoute = readFileSync('src/app/api/master/billing/readiness/route.ts', 'utf8');
const repository = readFileSync('src/lib/server/billing/repository.ts', 'utf8');
const webhookRoute = readFileSync('src/app/api/webhooks/asaas/route.ts', 'utf8');
const masterUi = readFileSync('src/components/MasterBillingCenter.tsx', 'utf8');
const seed = readFileSync('supabase/billing-stage-13-synthetic-activation-seed.sql', 'utf8');
const runbook = readFileSync('docs/billing-synthetic-activation-stage-13.md', 'utf8');

function stage13Environment(patch: Record<string, string> = {}) {
  return {
    VERCEL_ENV: 'preview',
    NEXT_PUBLIC_SUPABASE_URL: `https://${projectRef}.supabase.co`,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'publishable-test-key',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role-test-key',
    BILLING_PREVIEW_ALLOWED_SUPABASE_PROJECT_REF: projectRef,
    BILLING_PREVIEW_ENVIRONMENT_NAME: 'saas-dev',
    BILLING_PREVIEW_READS_ENABLED: 'true',
    BILLING_PREVIEW_MUTATIONS_ENABLED: 'false',
    BILLING_PREVIEW_ENFORCEMENT_ENABLED: 'false',
    BILLING_PREVIEW_STAGE13_ACTIVATION_ENABLED: 'true',
    BILLING_TRIAL_START_ENABLED: 'true',
    ASAAS_ENV: 'sandbox',
    BILLING_ASAAS_SANDBOX_ENABLED: 'true',
    BILLING_ASAAS_SYNTHETIC_STORE_ID: positiveStoreId,
    BILLING_ASAAS_FAILURE_SYNTHETIC_STORE_ID: failureStoreId,
    BILLING_ASAAS_STAGE13_SYNTHETIC_STORE_ID: stage13StoreId,
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

test('gate da etapa 13 libera apenas a mutação sintética dedicada em Preview', () => {
  const safety = readBillingRuntimeSafety(stage13Environment());
  assert.equal(safety.readsEnabled, true);
  assert.equal(safety.mutationsEnabled, false);
  assert.equal(safety.enforcementEnabled, false);
  assert.equal(safety.stage13ActivationEnabled, true);
  assert.equal(safety.trialStartEnabled, true);

  assert.equal(readBillingRuntimeSafety(stage13Environment({
    BILLING_PREVIEW_MUTATIONS_ENABLED: 'true'
  })).stage13ActivationEnabled, false);
  assert.equal(readBillingRuntimeSafety(stage13Environment({
    BILLING_PREVIEW_ENFORCEMENT_ENABLED: 'true'
  })).stage13ActivationEnabled, false);
  assert.equal(readBillingRuntimeSafety(stage13Environment({
    BILLING_TRIAL_START_ENABLED: 'false'
  })).stage13ActivationEnabled, false);
  assert.equal(readBillingRuntimeSafety(stage13Environment({
    VERCEL_ENV: 'production'
  })).stage13ActivationEnabled, false);
  assert.equal(readBillingRuntimeSafety(stage13Environment({
    NEXT_PUBLIC_SUPABASE_URL: 'https://aaaaaaaaaaaaaaaaaaaa.supabase.co'
  })).stage13ActivationEnabled, false);
});

test('Asaas Sandbox exige uma terceira loja distinta e inclui seu ID nos Webhooks', () => {
  const safety = readAsaasSandboxSafety(stage13Environment());
  assert.equal(safety.enabled, true);
  assert.equal(safety.stage13ActivationEnabled, true);
  assert.equal(safety.stage13SyntheticStoreId, stage13StoreId);
  assert.deepEqual(safety.syntheticStoreIds, [positiveStoreId, failureStoreId, stage13StoreId]);

  const duplicate = readAsaasSandboxSafety(stage13Environment({
    BILLING_ASAAS_STAGE13_SYNTHETIC_STORE_ID: positiveStoreId
  }));
  assert.equal(duplicate.enabled, false);
  assert.equal(duplicate.stage13ActivationEnabled, false);
});

test('Checkout recorrente envia customerData sintético pré-preenchido sem confirmar pagamento', async () => {
  let requestedBody: any = null;
  const fakeFetch = (async (_input: string | URL | Request, init?: RequestInit) => {
    requestedBody = JSON.parse(String(init?.body || '{}'));
    return new Response(JSON.stringify({
      id: '131ca662-56c8-4479-b5b3-fd61a413fce7',
      link: 'https://sandbox.asaas.com/checkoutSession/show/131ca662-56c8-4479-b5b3-fd61a413fce7',
      status: 'ACTIVE'
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;

  await createAsaasRecurringCheckout(sandboxConfiguration(), {
    externalReference: 'store:stage13:subscription:synthetic',
    planName: 'Profissional',
    amountCents: 149700,
    includedUsers: 5,
    trialEndsAt: '2030-01-02T14:05:06.000Z',
    previewBaseUrl: 'https://billing-preview.vercel.app',
    customerData: {
      name: 'Loja DEV Billing Ativacao Ltda',
      cpfCnpj: '98.765.432/0001-98',
      email: 'BILLING-STAGE13@EXAMPLE.COM',
      phone: '(11) 90000-0000',
      address: 'Rua Sintetica',
      addressNumber: 13,
      complement: 'Ambiente Sandbox',
      province: 'Centro',
      postalCode: '01001-000',
      city: 3550308
    }
  }, fakeFetch);

  assert.deepEqual(requestedBody.customerData, {
    name: 'Loja DEV Billing Ativacao Ltda',
    cpfCnpj: '98765432000198',
    email: 'billing-stage13@example.com',
    phone: '11900000000',
    address: 'Rua Sintetica',
    addressNumber: 13,
    complement: 'Ambiente Sandbox',
    province: 'Centro',
    postalCode: '01001000',
    city: 3550308
  });
  assert.deepEqual(requestedBody.chargeTypes, ['RECURRENT']);
  assert.equal(requestedBody.subscription.cycle, 'MONTHLY');
  assert.equal(requestedBody.items[0].value, 1497);
  assert.equal('payment' in requestedBody, false);
});

test('seed cria somente loja, usuário e cadastro sintéticos, sem trial ou cobrança', () => {
  assert.match(seed, new RegExp(stage13StoreId));
  assert.match(seed, /Loja DEV Billing Ativacao/);
  assert.match(seed, /billing_stage13_seed/);
  assert.match(seed, /portal_enabled[\s\S]*false/);
  assert.match(seed, /auth_user_id is null/);
  assert.match(seed, /ready_for_activation/);
  assert.match(seed, /on conflict \(idempotency_key\) do nothing/);
  assert.doesNotMatch(seed, /insert into public\.store_billing_subscriptions/i);
  assert.doesNotMatch(seed, /insert into public\.billing_payments/i);
  assert.doesNotMatch(seed, /(?:update|delete from) public\.stores/i);
});

test('API e repositório travam a ativação no seed, no perfil validado e em observe', () => {
  assert.match(masterRoute, /activate-stage13-sandbox/);
  assert.match(masterRoute, /storeId !== asaasSandbox\.stage13SyntheticStoreId/);
  assert.match(masterRoute, /billing_stage13_activation_allowed: registrationSimulationEnabled/);
  assert.match(masterRoute, /payment_confirmed: false/);
  assert.match(masterRoute, /billing_general_mutations_read_only/);
  assert.match(repository, /scenario: 'activation'/);
  assert.match(repository, /registration_status !== 'ready_for_activation'/);
  assert.match(repository, /customerData/);
  assert.match(repository, /customer_data_prefilled/);
  assert.match(repository, /address: 'Rua Sintetica'/);
  assert.doesNotMatch(repository, /access_enforcement_mode:\s*'enforce'/);
  assert.match(readinessRoute, /registrationWriteAllowed: false/);
});

test('Webhook, UI e runbook preservam idempotência e contagem regressiva', () => {
  assert.match(webhookRoute, /provider_event_id/);
  assert.match(webhookRoute, /syntheticStoreIds: asaasSandbox\.syntheticStoreIds/);
  assert.match(masterUi, /SaaS · etapa 13/);
  assert.match(masterUi, /Revalidar sem duplicar/);
  assert.match(masterUi, /trialRemaining\(selectedRegistrationSubscription\.trial_ends_at/);
  assert.match(masterUi, /não concluir pagamento/);
  assert.match(runbook, /exatamente 1 assinatura aberta/);
  assert.match(runbook, /o mesmo `provider_checkout_id` após repetição/);
  assert.match(runbook, /access_enforcement_mode='observe'/);
});
