import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { evaluateBillingAccess } from '../src/lib/server/billing/access.ts';
import {
  asaasCheckoutFailureState,
  processStoredAsaasWebhookEvent,
  resolveAsaasPaymentState
} from '../src/lib/server/billing/repository.ts';

const packageRoot = 'supabase/production_ready/billing_stage14';
const manifest = JSON.parse(readFileSync(`${packageRoot}/manifest.json`, 'utf8'));
const productionSql = manifest.approved_migrations
  .map((entry: any) => readFileSync(entry.path, 'utf8'))
  .join('\n');
const hardeningSql = readFileSync(
  `${packageRoot}/20260828161000_billing_observe_hardening.sql`,
  'utf8'
);
const registrationSql = readFileSync(
  `${packageRoot}/20260828160000_store_billing_registration_profiles.sql`,
  'utf8'
);
const rollbackSql = readFileSync(`${packageRoot}/rollback_before_activation.sql`, 'utf8');
const preflightSql = readFileSync(`${packageRoot}/preflight_read_only.sql`, 'utf8');
const repositorySource = readFileSync('src/lib/server/billing/repository.ts', 'utf8');
const masterRoute = readFileSync('src/app/api/master/billing/route.ts', 'utf8');
const masterUi = readFileSync('src/components/MasterBillingCenter.tsx', 'utf8');
const runbook = readFileSync('docs/billing-production-hardening-stage-14.md', 'utf8');

function sha256(path: string) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

test('manifesto permite somente as três migrations Production-safe e valida SHA-256', () => {
  assert.equal(manifest.stage, 14);
  assert.equal(manifest.mode, 'observe');
  assert.equal(manifest.deployment_strategy, 'manual_allowlist_only');
  assert.equal(manifest.requires_new_production_authorization, true);
  assert.equal(manifest.approved_migrations.length, 3);

  for (const [index, entry] of manifest.approved_migrations.entries()) {
    assert.equal(entry.order, index + 1);
    assert.equal(sha256(entry.path), entry.sha256, entry.path);
    assert.equal(manifest.excluded_paths.includes(entry.path), false, entry.path);
  }
  assert.equal(sha256(manifest.verification.preflight_path), manifest.verification.preflight_sha256);
  assert.equal(sha256(manifest.verification.rollback_path), manifest.verification.rollback_sha256);
  assert.deepEqual(Object.values(manifest.required_flags), [false, false, false, false, false, false, false]);
});

test('pacote aprovado não contém seed, identidade sintética ou destino de ambiente', () => {
  assert.doesNotMatch(productionSql, /Loja DEV|billing_stage(?:5|13)_seed|synt[eé]tic/i);
  assert.doesNotMatch(productionSql, /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i);
  assert.doesNotMatch(productionSql, /\.example\.(?:com|org|net)/i);
  assert.doesNotMatch(productionSql, /supabase\.co|VERCEL_ENV|ASAAS_API_KEY/i);
  assert.doesNotMatch(productionSql, /insert into public\.(?:stores|users)\b/i);
});

test('RLS e privilégios deixam todas as tabelas exclusivamente server-side', () => {
  for (const table of [
    'billing_plans',
    'store_billing_subscriptions',
    'billing_payments',
    'billing_webhook_events',
    'billing_audit_log',
    'store_billing_registration_profiles',
    'store_billing_registration_audit'
  ]) {
    assert.match(hardeningSql, new RegExp(`alter table public\\.${table} enable row level security`, 'i'));
    assert.match(hardeningSql, new RegExp(`revoke all on table public\\.${table}[\\s\\S]{0,100}service_role`, 'i'));
  }
  assert.doesNotMatch(hardeningSql, /grant\s+[^;]*\bdelete\b/i);
  assert.match(hardeningSql, /store_billing_stage14_observe_only/);
  assert.match(hardeningSql, /check \(access_enforcement_mode = 'observe'\)/);
  assert.match(hardeningSql, /security invoker/);
  assert.match(hardeningSql, /set search_path = ''/);
});

test('RPCs Production-safe exigem Master, loja e usuário ativos e cadastro validado', () => {
  assert.match(registrationSql, /actor\.role = 'master'/);
  assert.match(registrationSql, /store_row\.status = 'active'/);
  assert.match(registrationSql, /store_user\.role in \('store', 'pre_sales', 'seller', 'prospector'\)/);
  assert.match(registrationSql, /Chave de idempotencia ja utilizada por outra loja/);
  assert.match(hardeningSql, /registration\.registration_status = 'ready_for_activation'/);
  assert.match(hardeningSql, /v_now \+ interval '7 days'/);
  assert.match(hardeningSql, /'observe'/);
  assert.doesNotMatch(registrationSql, /registration_source|store_name/);
});

test('rollback é fail-closed, recusa dados e nunca usa cascade', () => {
  assert.match(rollbackSql, /billing_stage14_rollback_confirm/);
  assert.match(rollbackSql, /Rollback destrutivo recusado/);
  assert.match(rollbackSql, /store_billing_subscriptions limit 1/);
  assert.match(rollbackSql, /store_billing_registration_profiles limit 1/);
  assert.doesNotMatch(rollbackSql, /\bcascade\b/i);
  assert.match(rollbackSql, /lock_timeout = '5s'/);
  assert.match(rollbackSql, /statement_timeout = '30s'/);
});

test('preflight é estritamente somente leitura', () => {
  const statements = preflightSql
    .replace(/^\s*--.*$/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
  assert.match(statements, /^select\b/i);
  assert.doesNotMatch(statements, /\b(?:insert|update|delete|drop|alter|create|grant|revoke|truncate)\b/i);
  assert.match(preflightSql, /relrowsecurity/);
  assert.match(preflightSql, /has_function_privilege/);
  assert.match(preflightSql, /enforcement_rows/);
});

test('trial expirado em observe altera diagnóstico, mas nunca bloqueia acesso', () => {
  const decision = evaluateBillingAccess({
    role: 'store',
    operationalStore: true,
    enforcementEnabled: true,
    now: new Date('2030-01-10T00:00:00.000Z'),
    subscription: {
      id: 'subscription-expired',
      status: 'trialing',
      access_enforcement_mode: 'observe',
      trial_ends_at: '2030-01-09T23:59:59.000Z',
      grace_ends_at: null
    }
  });

  assert.equal(decision.observedAllowed, false);
  assert.equal(decision.observedReason, 'trial_expired');
  assert.equal(decision.allowed, true);
  assert.equal(decision.enforced, false);
  assert.equal(decision.reason, 'subscription_observation_mode');
});

test('webhook atrasado não regride pagamento liquidado ou perdido', () => {
  assert.deepEqual(resolveAsaasPaymentState({
    eventType: 'PAYMENT_OVERDUE',
    providerStatus: 'OVERDUE',
    existingStatus: 'RECEIVED',
    existingReceivedAt: '2030-01-01T00:00:00.000Z'
  }), {
    providerStatus: 'RECEIVED',
    subscriptionTarget: null,
    stale: true
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
  assert.match(repositorySource, /subscription\.status === 'cancelled'/);
  assert.match(repositorySource, /asaas_webhook_terminal_transition_ignored/);
});

test('assinatura cancelada trata webhook posterior como processado sem qualquer update', async () => {
  let subscriptionUpdates = 0;
  const audits: any[] = [];
  const subscription = {
    id: 'subscription-cancelled',
    store_id: 'store-cancelled',
    status: 'cancelled',
    access_enforcement_mode: 'observe',
    trial_ends_at: '2030-01-08T00:00:00.000Z',
    current_period_started_at: null,
    current_period_ends_at: null,
    past_due_at: null,
    grace_ends_at: null,
    provider_customer_id: 'cus_cancelled',
    provider_subscription_id: 'sub_cancelled',
    provider_checkout_id: null,
    external_reference: 'store:cancelled'
  };

  const supabase = {
    from(table: string) {
      if (table === 'store_billing_subscriptions') {
        const chain: any = {
          select() { return chain; },
          eq() { return chain; },
          maybeSingle: async () => ({ data: subscription, error: null }),
          update() { subscriptionUpdates += 1; return chain; }
        };
        return chain;
      }
      if (table === 'billing_audit_log') {
        const chain: any = {
          select() { return chain; },
          eq() { return chain; },
          contains() { return chain; },
          limit() { return chain; },
          maybeSingle: async () => ({ data: null, error: null }),
          async insert(value: any) {
            audits.push(value);
            return { error: null };
          }
        };
        return chain;
      }
      throw new Error(`Tabela inesperada no ensaio: ${table}`);
    }
  };

  const result = await processStoredAsaasWebhookEvent(supabase, {
    provider_event_id: 'event-after-cancel',
    event_type: 'SUBSCRIPTION_UPDATED',
    provider_object_type: 'subscription',
    provider_object_id: 'sub_cancelled',
    payload: { object: { externalReference: 'store:cancelled' } }
  });

  assert.deepEqual(result, {
    processing_status: 'processed',
    subscription_id: 'subscription-cancelled'
  });
  assert.equal(subscriptionUpdates, 0);
  assert.equal(audits.length, 1);
  assert.equal(audits[0].action, 'asaas_webhook_terminal_transition_ignored');
  assert.equal(audits[0].new_status, 'cancelled');
});

test('falha do Asaas preserva trial, não confirma pagamento e permite retry seguro', () => {
  const result = asaasCheckoutFailureState({
    id: 'subscription-safe',
    status: 'trialing',
    trial_started_at: '2030-01-01T00:00:00.000Z',
    trial_ends_at: '2030-01-08T00:00:00.000Z',
    access_enforcement_mode: 'observe'
  });

  assert.equal(result.retryable, true);
  assert.equal(result.trial_preserved, true);
  assert.equal(result.payment_confirmed, false);
  assert.equal(result.access_enforcement_mode, 'observe');
  assert.match(masterRoute, /status: 502/);
  assert.match(masterRoute, /trial foi preservado/);
  assert.doesNotMatch(masterRoute, /checkoutError\?\.message/);
});

test('Preview e runbook identificam a etapa 14 sem autorizar Production', () => {
  assert.match(masterUi, /SaaS · etapa 14/);
  assert.match(masterUi, /pacote de entrada em Production separado dos seeds sintéticos/);
  assert.match(runbook, /Uma nova autorização será necessária/);
  assert.match(runbook, /Não executar `supabase db push` indiscriminadamente/);
  assert.match(runbook, /continua permitido enquanto o enforcement global/);
});
