import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { billingEnforcementEnabled } from '../src/lib/server/billing/access.ts';
import { readBillingRuntimeSafety } from '../src/lib/server/billing/runtime.ts';

type ManifestEntry = {
  file: string;
  target: 'crm-production' | 'autocar-production';
  state: string;
  remote_version?: string;
};

const manifest = JSON.parse(
  readFileSync('supabase/billing-stage-10-migration-manifest.json', 'utf8')
) as { migrations: ManifestEntry[] };
const runbook = readFileSync('docs/billing-production-readiness-stage-10.md', 'utf8');
const auditSql = readFileSync('supabase/billing-stage-10-read-only-audit.sql', 'utf8');

test('manifesto da etapa 10 cobre cada migration local exatamente uma vez', () => {
  const repository = readdirSync('supabase/migrations')
    .filter((name) => name.endsWith('.sql'))
    .filter((name) => name <= '20260828025428_whatsapp_profile_picture_private_cache.sql')
    .sort();
  const routed = manifest.migrations.map((entry) => entry.file).sort();

  assert.deepEqual(routed, repository);
  assert.equal(new Set(routed).size, routed.length);
  assert.equal(manifest.migrations.length, 40);
});

test('fundacao do billing e a unica migration CRM pendente', () => {
  const pending = manifest.migrations.filter((entry) => entry.state === 'pending-explicit-authorization');
  assert.deepEqual(pending, [{
    file: '20260827044014_billing_foundation_asaas.sql',
    target: 'crm-production',
    state: 'pending-explicit-authorization'
  }]);

  const crmApplied = manifest.migrations.filter(
    (entry) => entry.target === 'crm-production' && entry.state.startsWith('applied')
  );
  assert.equal(crmApplied.length, 27);
  assert.ok(crmApplied.every((entry) => /^\d{14}$/.test(entry.remote_version || '')));
});

test('migrations próprias do AUTOCAR nunca são direcionadas ao CRM', () => {
  const autocar = manifest.migrations.filter((entry) => entry.target === 'autocar-production');
  assert.equal(autocar.length, 12);
  assert.ok(autocar.every((entry) => entry.state === 'not-audited-stage-10'));
  assert.ok(autocar.every((entry) => /autocar|ai_|training/i.test(entry.file)));
});

test('auditoria de lojas é read-only e separa portal de acesso SaaS', () => {
  assert.match(auditSql, /^begin transaction read only;/);
  assert.match(auditSql, /rollback;\s*$/);
  assert.match(auditSql, /'confirmed_saas'/);
  assert.match(auditSql, /'portal_only'/);
  assert.match(auditSql, /auth_user\.last_sign_in_at/);
  assert.match(auditSql, /store_row\.portal_enabled/);
  assert.doesNotMatch(auditSql, /\b(insert|update|delete|alter|drop|create|truncate|grant|revoke)\b/i);
});

test('runbook mantém Production desligada e exige CNPJ antes do Asaas', () => {
  assert.match(runbook, /BILLING_PRODUCTION_READS_ENABLED=false/);
  assert.match(runbook, /BILLING_PRODUCTION_MUTATIONS_ENABLED=false/);
  assert.match(runbook, /BILLING_PRODUCTION_ENFORCEMENT_ENABLED=false/);
  assert.match(runbook, /BILLING_ENFORCEMENT_ENABLED=false/);
  assert.match(runbook, /BILLING_TRIAL_START_ENABLED=false/);
  assert.match(runbook, /CNPJ válido é obrigatório/);
  assert.match(runbook, /Não configurar `ASAAS_API_KEY` nem `ASAAS_WEBHOOK_TOKEN`/);
  assert.doesNotMatch(runbook, /7hs|A4 Multimarcas|Auto Sede|Loja DEV/);
});

test('flags desligadas preservam acesso e recusam leitura/mutacao em Production', () => {
  const safety = readBillingRuntimeSafety({
    VERCEL_ENV: 'production',
    BILLING_PRODUCTION_ENVIRONMENT_NAME: 'crm-production-observe',
    BILLING_PRODUCTION_READS_ENABLED: 'false',
    BILLING_PRODUCTION_MUTATIONS_ENABLED: 'false',
    BILLING_PRODUCTION_ENFORCEMENT_ENABLED: 'false',
    BILLING_ENFORCEMENT_ENABLED: 'false',
    BILLING_TRIAL_START_ENABLED: 'false'
  } as NodeJS.ProcessEnv);

  assert.equal(safety.reason, 'reads_disabled');
  assert.equal(safety.readsEnabled, false);
  assert.equal(safety.mutationsEnabled, false);
  assert.equal(safety.enforcementEnabled, false);
  assert.equal(safety.trialStartEnabled, false);
  assert.equal(billingEnforcementEnabled({
    VERCEL_ENV: 'production',
    BILLING_ENFORCEMENT_ENABLED: 'false',
    BILLING_PRODUCTION_ENFORCEMENT_ENABLED: 'false'
  } as NodeJS.ProcessEnv), false);
});
