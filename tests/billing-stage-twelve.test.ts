import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { readBillingRuntimeSafety } from '../src/lib/server/billing/runtime.ts';

const migration = readFileSync(
  'supabase/migrations/20260828131550_store_registration_profiles_stage12.sql',
  'utf8'
);
const route = readFileSync('src/app/api/master/billing/readiness/route.ts', 'utf8');
const masterRoute = readFileSync('src/app/api/master/billing/route.ts', 'utf8');
const masterUi = readFileSync('src/components/MasterBillingCenter.tsx', 'utf8');
const runbook = readFileSync('docs/billing-registration-persistence-stage-12.md', 'utf8');

const previewRef = 'hfzmzfhuhukmxkxbkxay';
const credentials = {
  NEXT_PUBLIC_SUPABASE_URL: `https://${previewRef}.supabase.co`,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'publishable-test-key',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-test-key'
};

test('etapa 12 separa escrita cadastral das mutações financeiras', () => {
  const enabled = readBillingRuntimeSafety({
    VERCEL_ENV: 'preview',
    ...credentials,
    BILLING_PREVIEW_ALLOWED_SUPABASE_PROJECT_REF: previewRef,
    BILLING_PREVIEW_ENVIRONMENT_NAME: 'saas-dev',
    BILLING_PREVIEW_READS_ENABLED: 'true',
    BILLING_PREVIEW_MUTATIONS_ENABLED: 'false',
    BILLING_PREVIEW_ENFORCEMENT_ENABLED: 'false',
    BILLING_PREVIEW_REGISTRATION_WRITES_ENABLED: 'true',
    BILLING_TRIAL_START_ENABLED: 'false'
  } as NodeJS.ProcessEnv);

  assert.equal(enabled.readsEnabled, true);
  assert.equal(enabled.registrationWritesEnabled, true);
  assert.equal(enabled.mutationsEnabled, false);
  assert.equal(enabled.trialStartEnabled, false);
  assert.equal(enabled.enforcementEnabled, false);

  const production = readBillingRuntimeSafety({
    VERCEL_ENV: 'production',
    ...credentials,
    BILLING_PRODUCTION_ALLOWED_SUPABASE_PROJECT_REF: previewRef,
    BILLING_PRODUCTION_READS_ENABLED: 'true',
    BILLING_PREVIEW_REGISTRATION_WRITES_ENABLED: 'true'
  } as NodeJS.ProcessEnv);
  assert.equal(production.registrationWritesEnabled, false);
});

test('migration cria cadastro e auditoria server-side sem alterar stores', () => {
  assert.match(migration, /create table if not exists public\.store_billing_registration_profiles/);
  assert.match(migration, /create table if not exists public\.store_billing_registration_audit/);
  assert.match(migration, /alter table public\.store_billing_registration_profiles enable row level security/);
  assert.match(migration, /alter table public\.store_billing_registration_audit enable row level security/);
  assert.match(migration, /revoke all on table public\.store_billing_registration_profiles\s+from public, anon, authenticated/);
  assert.match(migration, /grant select, insert, update on table public\.store_billing_registration_profiles\s+to service_role/);
  assert.match(migration, /grant select, insert on table public\.store_billing_registration_audit\s+to service_role/);
  assert.doesNotMatch(migration, /grant delete/i);
  assert.doesNotMatch(migration, /(?:update|insert into|delete from) public\.stores/i);
});

test('RPC é invoker, idempotente e travada no seed sintético autorizado', () => {
  assert.match(migration, /create or replace function public\.save_store_billing_registration_profile/);
  assert.match(migration, /security invoker/);
  assert.match(migration, /idempotency_key uuid not null unique/);
  assert.match(migration, /store_row\.store_name = 'Loja DEV Billing Falhas'/);
  assert.match(migration, /store_row\.registration_source = 'billing_stage5_seed'/);
  assert.match(migration, /actor\.role = 'master'/);
  assert.match(migration, /registration_status[\s\S]*ready_for_activation/);
  assert.match(migration, /changed_fields/);
});

test('API persiste somente o cadastro validado e não chama trial, Asaas ou cobrança', () => {
  assert.match(route, /BILLING_STAGE12_DEV_PROJECT_REF = 'hfzmzfhuhukmxkxbkxay'/);
  assert.match(route, /save-readiness/);
  assert.match(route, /registrationWritesEnabled/);
  assert.match(route, /billing_stage12_registration_write_forbidden/);
  assert.match(route, /Loja DEV Billing Falhas/);
  assert.match(route, /billing_stage5_seed/);
  assert.match(route, /\.rpc\('save_store_billing_registration_profile'/);
  assert.doesNotMatch(route, /startStoreBillingTrial|createStoreAsaas|confirmStoreAsaas|fetch\s*\(/);
  assert.match(route, /would_start_trial: false/);
  assert.match(route, /would_create_asaas_customer: false/);
  assert.match(route, /would_charge: false/);
});

test('Master expõe status persistido, auditoria sem PII e trava de ambiente', () => {
  assert.match(masterRoute, /billing_registration_write_allowed/);
  assert.match(masterRoute, /registration_persistence_enabled/);
  assert.match(masterUi, /SaaS · etapa 12/);
  assert.match(masterUi, /Salvar cadastro sintético validado/);
  assert.match(masterUi, /Auditoria cadastral sintética/);
  assert.match(masterUi, /Persistência restrita à Loja DEV Billing Falhas/);
  assert.match(masterUi, /Trial: não · Asaas: não · Acesso: observe/);
});

test('runbook mantém billing financeiro, Production e dados reais fora do escopo', () => {
  assert.match(runbook, /BILLING_PREVIEW_REGISTRATION_WRITES_ENABLED=true/);
  assert.match(runbook, /BILLING_PREVIEW_MUTATIONS_ENABLED=false/);
  assert.match(runbook, /BILLING_TRIAL_START_ENABLED=false/);
  assert.match(runbook, /BILLING_ENFORCEMENT_ENABLED=false/);
  assert.match(runbook, /nenhum cliente, Checkout ou cobrança/);
  assert.match(runbook, /Supabase Production, Asaas Production e Vercel Production/);
});
