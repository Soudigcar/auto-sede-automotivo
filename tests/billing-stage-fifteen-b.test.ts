import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  claimStoredBillingWebhookEvent,
  completeStoredBillingWebhookEvent
} from '../src/lib/server/billing/repository.ts';

const packageRoot = 'supabase/production_ready/billing_stage15b';
const manifest = JSON.parse(readFileSync(`${packageRoot}/manifest.json`, 'utf8'));
const migrations = manifest.approved_migrations.map((entry: any) => ({
  ...entry,
  sql: readFileSync(entry.path, 'utf8')
}));
const productionSql = migrations.map((entry: any) => entry.sql).join('\n');
const preflightSql = readFileSync(`${packageRoot}/preflight_before_read_only.sql`, 'utf8');
const postflightSql = readFileSync(`${packageRoot}/postflight_after_read_only.sql`, 'utf8');
const rollbackSql = readFileSync(
  `${packageRoot}/20260828174000_billing_stage15b_forward_rollback.sql`,
  'utf8'
);
const routeSql = readFileSync('src/app/api/webhooks/asaas/route.ts', 'utf8');
const stage14Readme = readFileSync(
  'supabase/production_ready/billing_stage14/README.md',
  'utf8'
);

function sha256(path: string) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function readOnlyStatements(sql: string) {
  return sql
    .replace(/^\s*--.*$/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
}

test('manifesto 15B versiona quatro migrations e todos os artefatos por SHA-256', () => {
  assert.equal(manifest.stage, '15B');
  assert.equal(manifest.deployment_strategy, 'supabase_apply_migration_only');
  assert.equal(manifest.approved_migrations.length, 4);
  assert.equal(manifest.history.direct_sql_forbidden, true);
  assert.equal(manifest.history.db_push_forbidden, true);
  assert.equal(manifest.history.rollback_strategy, 'forward_migration');

  for (const [index, entry] of manifest.approved_migrations.entries()) {
    assert.equal(entry.order, index + 1);
    assert.match(entry.migration_name, /^billing_stage15b_[a-z0-9_]+$/);
    assert.equal(sha256(entry.path), entry.sha256, entry.path);
  }
  for (const [pathKey, hashKey] of [
    ['preflight_path', 'preflight_sha256'],
    ['postflight_path', 'postflight_sha256'],
    ['rollback_path', 'rollback_sha256'],
    ['rehearsal_builder_path', 'rehearsal_builder_sha256']
  ]) {
    assert.equal(
      sha256(manifest.verification[pathKey]),
      manifest.verification[hashKey],
      manifest.verification[pathKey]
    );
  }
  assert.deepEqual(Object.values(manifest.required_flags), [false, false, false, false, false, false, false]);
});

test('todas as migrations têm transação curta e a allowlist não contém identidade sintética', () => {
  for (const entry of migrations) {
    assert.match(entry.sql, /^begin;/);
    assert.match(entry.sql, /set local lock_timeout = '5s';/);
    assert.match(entry.sql, /set local statement_timeout = '30s';/);
    assert.match(entry.sql, /commit;\s*$/);
  }
  assert.doesNotMatch(productionSql, /Loja DEV|billing_stage(?:5|13)_seed/i);
  assert.doesNotMatch(
    productionSql,
    /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i
  );
  assert.doesNotMatch(productionSql, /insert into public\.(?:stores|users)\b/i);
});

test('preflight antes e postflight depois são separados e estritamente read-only', () => {
  for (const sql of [preflightSql, postflightSql]) {
    const statements = readOnlyStatements(sql);
    assert.match(statements, /^select\b/i);
    assert.doesNotMatch(
      statements,
      /\b(?:insert|update|delete|drop|alter|create|grant|revoke|truncate)\b/i
    );
  }
  assert.match(preflightSql, /to_regclass\('public\.billing_plans'\)/);
  assert.doesNotMatch(preflightSql, /'public\.store_billing_subscriptions'::regclass/);
  assert.doesNotMatch(preflightSql, /from public\.store_billing_subscriptions/i);
  assert.match(postflightSql, /enforcement_rows/);
  assert.match(postflightSql, /invalid_processing_claims/);
});

test('constraints compostas impedem divergência de loja em todos os agregados financeiros', () => {
  assert.match(productionSql, /unique \(id, store_id\)/);
  assert.match(
    productionSql,
    /billing_payments_subscription_store_fkey[\s\S]*foreign key \(subscription_id, store_id\)/
  );
  assert.match(
    productionSql,
    /billing_audit_subscription_store_fkey[\s\S]*foreign key \(subscription_id, store_id\)/
  );
  assert.match(
    productionSql,
    /billing_registration_audit_profile_store_fkey[\s\S]*foreign key \(profile_id, store_id\)/
  );
});

test('claim, finalização e transições financeiras são atômicos no banco', () => {
  assert.match(productionSql, /processing_status = 'processing'/);
  assert.match(productionSql, /processing_token = gen_random_uuid\(\)/);
  assert.match(productionSql, /processing_token = p_processing_token/);
  assert.match(productionSql, /for update/);
  assert.match(productionSql, /pg_advisory_xact_lock/);
  assert.match(productionSql, /apply_asaas_payment_webhook_event/);
  assert.match(productionSql, /on conflict \(provider_payment_id\) do update/);
  assert.match(productionSql, /v_subscription\.status = 'cancelled'/);
  assert.match(routeSql, /claimStoredBillingWebhookEvent/);
  assert.match(routeSql, /completeStoredBillingWebhookEvent/);
  assert.doesNotMatch(routeSql, /\.eq\('processing_attempts'/);
  assert.doesNotMatch(routeSql, /\.from\('billing_payments'\)\.upsert/s);
});

test('helpers exigem token do claim para concluir o evento', async () => {
  const calls: Array<{ name: string; args: any }> = [];
  const token = '20000000-0000-4000-8000-000000000002';
  const supabase = {
    async rpc(name: string, args: any) {
      calls.push({ name, args });
      if (name === 'claim_billing_webhook_event') {
        return { data: [{ id: args.p_event_id, processing_token: token }], error: null };
      }
      return { data: args.p_processing_token === token, error: null };
    }
  };

  const claimed = await claimStoredBillingWebhookEvent(
    supabase,
    '10000000-0000-4000-8000-000000000001'
  );
  assert.equal(claimed.processing_token, token);
  assert.equal(await completeStoredBillingWebhookEvent(supabase, {
    eventId: claimed.id,
    processingToken: token,
    processingStatus: 'processed'
  }), true);
  assert.deepEqual(calls.map((call) => call.name), [
    'claim_billing_webhook_event',
    'complete_billing_webhook_event'
  ]);
});

test('rollback é uma migration forward, parcial-safe e fail-closed', () => {
  assert.match(rollbackSql, /^begin;/);
  assert.match(rollbackSql, /billing_stage15b_rollback_confirm/);
  assert.match(rollbackSql, /to_regclass\(format\('public\.%I'/);
  assert.match(rollbackSql, /foreach v_table in array v_operational_tables/);
  assert.match(rollbackSql, /Rollback destrutivo recusado/);
  assert.doesNotMatch(rollbackSql, /\bcascade\b/i);
  assert.match(stage14Readme, /SUBSTITUÍDO \/ NÃO EXECUTAR/);
});

test('gerador produz ensaio executável isolado e termina em rollback', () => {
  const sql = execFileSync(process.execPath, [
    'scripts/build-billing-stage15b-rehearsal.mjs',
    '--schema',
    'billing_stage15b_test'
  ], { encoding: 'utf8', maxBuffer: 2 * 1024 * 1024 });

  assert.match(sql, /^begin;/);
  assert.match(sql, /create schema billing_stage15b_test;/);
  assert.match(sql, /billing_stage15b_test\.claim_billing_webhook_event/);
  assert.match(sql, /public\.stores/);
  assert.doesNotMatch(sql, /public\.billing_plans/);
  assert.match(sql, /O rollback parcial deixou tabelas/);
  assert.match(sql, /Evento atrasado regrediu o estado financeiro atomico/);
  assert.match(sql, /rollback;$/);
});
