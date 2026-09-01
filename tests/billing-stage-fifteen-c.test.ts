import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  BILLING_STAGE15C_BLOCKED_PROJECT_REFS,
  BILLING_STAGE15C_ENVIRONMENT_NAME,
  BILLING_STAGE15C_GIT_BRANCH,
  readBillingStage15cSafety
} from '../src/lib/server/billing/runtime.ts';

const packageRoot = 'supabase/production_ready/billing_stage15c';
const fixtures = readFileSync(`${packageRoot}/fixtures_before_migrations.sql`, 'utf8');
const seed = readFileSync(`${packageRoot}/seed_after_migrations.sql`, 'utf8');
const verify = readFileSync(`${packageRoot}/verify_read_only.sql`, 'utf8');
const runbook = readFileSync(`${packageRoot}/README.md`, 'utf8');
const webhookRoute = readFileSync('src/app/api/webhooks/asaas/route.ts', 'utf8');
const masterRoute = readFileSync('src/app/api/master/billing/route.ts', 'utf8');
const readinessRoute = readFileSync('src/app/api/master/billing/readiness/route.ts', 'utf8');
const manifest = JSON.parse(readFileSync(`${packageRoot}/manifest.json`, 'utf8'));

const temporaryRef = 'vdnbcfnmkrqnzwnvfapi';

function stage15cEnvironment(patch: Record<string, string> = {}) {
  return {
    VERCEL_ENV: 'preview',
    VERCEL_GIT_COMMIT_REF: BILLING_STAGE15C_GIT_BRANCH,
    NEXT_PUBLIC_SUPABASE_URL: `https://${temporaryRef}.supabase.co`,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'publishable-test-key',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role-test-key',
    BILLING_STAGE15C_ENABLED: 'true',
    BILLING_STAGE15C_SUPABASE_PROJECT_REF: temporaryRef,
    BILLING_PREVIEW_ALLOWED_SUPABASE_PROJECT_REF: temporaryRef,
    BILLING_PREVIEW_ENVIRONMENT_NAME: BILLING_STAGE15C_ENVIRONMENT_NAME,
    BILLING_PREVIEW_READS_ENABLED: 'true',
    BILLING_PREVIEW_MUTATIONS_ENABLED: 'false',
    BILLING_PREVIEW_ENFORCEMENT_ENABLED: 'false',
    BILLING_PREVIEW_REGISTRATION_WRITES_ENABLED: 'false',
    BILLING_ENFORCEMENT_ENABLED: 'false',
    BILLING_PRODUCTION_READS_ENABLED: 'false',
    BILLING_PRODUCTION_MUTATIONS_ENABLED: 'false',
    BILLING_PRODUCTION_ENFORCEMENT_ENABLED: 'false',
    ...patch
  } as NodeJS.ProcessEnv;
}

function sha256(path: string) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

test('gate 15C aceita somente o Preview temporario com tres refs identicos', () => {
  const safety = readBillingStage15cSafety(stage15cEnvironment());
  assert.equal(safety.enabled, true);
  assert.equal(safety.reason, 'ready');
  assert.equal(safety.declaredProjectRef, temporaryRef);

  assert.equal(readBillingStage15cSafety(stage15cEnvironment({
    BILLING_PREVIEW_ALLOWED_SUPABASE_PROJECT_REF: 'bbbbbbbbbbbbbbbbbbbb'
  })).reason, 'target_mismatch');
  assert.equal(readBillingStage15cSafety(stage15cEnvironment({
    NEXT_PUBLIC_SUPABASE_URL: 'https://cccccccccccccccccccc.supabase.co'
  })).reason, 'target_mismatch');
});

test('gate 15C recusa os quatro ambientes permanentes conhecidos', () => {
  assert.equal(BILLING_STAGE15C_BLOCKED_PROJECT_REFS.size, 4);
  for (const projectRef of BILLING_STAGE15C_BLOCKED_PROJECT_REFS) {
    const safety = readBillingStage15cSafety(stage15cEnvironment({
      NEXT_PUBLIC_SUPABASE_URL: `https://${projectRef}.supabase.co`,
      BILLING_PREVIEW_ALLOWED_SUPABASE_PROJECT_REF: projectRef,
      BILLING_STAGE15C_SUPABASE_PROJECT_REF: projectRef
    }));
    assert.equal(safety.enabled, false, projectRef);
    assert.equal(safety.reason, 'protected_target', projectRef);
  }
});

test('gate 15C exige branch, nome e flags fail-closed exatos', () => {
  const cases: Array<[Record<string, string>, string]> = [
    [{ VERCEL_ENV: 'production' }, 'not_preview'],
    [{ VERCEL_GIT_COMMIT_REF: 'main' }, 'wrong_git_branch'],
    [{ BILLING_PREVIEW_ENVIRONMENT_NAME: 'saas-dev' }, 'wrong_environment_name'],
    [{ BILLING_PREVIEW_MUTATIONS_ENABLED: 'true' }, 'unsafe_flags'],
    [{ BILLING_PREVIEW_ENFORCEMENT_ENABLED: 'true' }, 'unsafe_flags'],
    [{ BILLING_ENFORCEMENT_ENABLED: 'true' }, 'unsafe_flags'],
    [{ BILLING_PRODUCTION_READS_ENABLED: '' }, 'unsafe_flags']
  ];
  for (const [patch, reason] of cases) {
    assert.equal(readBillingStage15cSafety(stage15cEnvironment(patch)).reason, reason);
  }
});

test('rotas antigas mantem saas-dev e adicionam o gate isolado 15C', () => {
  assert.match(masterRoute, /BILLING_STAGE12_DEV_PROJECT_REF = 'hfzmzfhuhukmxkxbkxay'/);
  assert.match(readinessRoute, /BILLING_STAGE12_DEV_PROJECT_REF = 'hfzmzfhuhukmxkxbkxay'/);
  assert.match(masterRoute, /readBillingStage15cSafety\(\)\.enabled/);
  assert.match(readinessRoute, /readBillingStage15cSafety\(\)\.enabled/);
  assert.match(readinessRoute, /billing_stage15b_registration_profiles/);
});

test('webhook falha fechado quando a 15C foi solicitada sem passar no gate', () => {
  assert.match(webhookRoute, /stage15cSafety\.requested && !stage15cSafety\.enabled/);
  assert.match(webhookRoute, /Webhook Asaas Sandbox bloqueado pelo gate/);
  assert.match(webhookRoute, /claimStoredBillingWebhookEvent/);
  assert.match(webhookRoute, /completeStoredBillingWebhookEvent/);
});

test('fixtures-base exigem banco vazio e criam apenas tres lojas e quatro usuarios sinteticos', () => {
  assert.match(fixtures, /to_regclass\('public\.billing_plans'\) is not null/);
  assert.match(fixtures, /select count\(\*\) from auth\.users\) <> 0/);
  assert.match(fixtures, /Loja DEV Roteamento/);
  assert.match(fixtures, /Loja DEV Billing Falhas/);
  assert.match(fixtures, /Loja DEV Billing Ativacao/);
  assert.equal((fixtures.match(/billing-stage15c-[a-z-]+-user@example\.com/g) || []).length, 3);
  assert.doesNotMatch(fixtures, /insert into public\.(?:billing_|store_billing_)/i);
});

test('seed posterior exige quatro migrations e preserva zero trial, pagamento e webhook', () => {
  assert.match(seed, /billing_stage15b_foundation_asaas/);
  assert.match(seed, /billing_stage15b_registration_profiles/);
  assert.match(seed, /billing_stage15b_observe_hardening/);
  assert.match(seed, /billing_stage15b_webhook_atomicity/);
  assert.match(seed, /ready_for_activation/);
  assert.doesNotMatch(seed, /insert into public\.store_billing_subscriptions/i);
  assert.doesNotMatch(seed, /insert into public\.billing_payments/i);
  assert.doesNotMatch(seed, /insert into public\.billing_webhook_events/i);
});

test('verificacao 15C e estritamente read-only e cobre RLS, grants, historico e locks', () => {
  const statements = verify.replace(/^\s*--.*$/gm, '').replace(/\s+/g, ' ').trim();
  assert.match(statements, /^select\b/i);
  assert.doesNotMatch(
    statements,
    /\b(?:insert|update|delete|drop|alter|create|grant|revoke|truncate)\b/i
  );
  assert.match(verify, /relrowsecurity/);
  assert.match(verify, /role_table_grants/);
  assert.match(verify, /stage15b_migrations/);
  assert.match(verify, /lock_waiters/);
});

test('manifesto sela gates, SQLs, runbook e exclusao obrigatoria da branch', () => {
  assert.equal(manifest.stage, '15C');
  assert.equal(manifest.mode, 'isolated_e2e');
  assert.equal(manifest.delete_temporary_branch_at_end, true);
  assert.equal(manifest.production_forbidden, true);
  assert.deepEqual(manifest.blocked_project_refs.sort(), [...BILLING_STAGE15C_BLOCKED_PROJECT_REFS].sort());
  for (const entry of manifest.sealed_artifacts) {
    assert.equal(sha256(entry.path), entry.sha256, entry.path);
  }
  assert.match(runbook, /excluída ao final/);
  assert.match(runbook, /0 grants de cliente/);
  assert.match(runbook, /eventos fora de\s+ordem/);
});
