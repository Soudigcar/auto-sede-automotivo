import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  parseHostedBranchArguments,
  preflightHostedBranch,
  validateHostedEdgeInventory,
  type HostedBranchTarget,
} from '../scripts/lib/metrics-hosted-branch-preflight';
import { forbiddenMetricsRefs, metricsBranch } from '../src/lib/commercialMetricsHomologation';

const crm = 'abcdefghijklmnopqrst';
const autocar = 'tsrqponmlkjihgfedcba';
const manifest = { approved: true, branch: metricsBranch, crmProjectRef: crm, autocarProjectRef: autocar };
const target = (kind: 'crm' | 'autocar'): HostedBranchTarget => ({
  kind,
  targetMode: 'branch',
  projectRef: kind === 'crm' ? crm : autocar,
  expectedParentRef: forbiddenMetricsRefs[kind === 'crm' ? 0 : 1],
  branchName: kind === 'crm' ? 'metrics-crm-homologation' : 'metrics-autocar-homologation',
  apiUrl: `https://${kind === 'crm' ? crm : autocar}.supabase.co`,
});
const metadata = (t: HostedBranchTarget) => ({
  project_ref: t.projectRef,
  parent_project_ref: t.expectedParentRef,
  name: t.branchName,
  with_data: false,
  is_default: false,
  status: 'FUNCTIONS_DEPLOYED',
  preview_project_status: 'ACTIVE_HEALTHY',
});
const crmStub = [{
  slug: 'meta-leads-backfill-temp', status: 'ACTIVE', version: 8, verify_jwt: true,
  ezbr_sha256: '5aba291847f70956f33734fd1954a4ec66c78505ff860bcc4decf753d692f466',
}];

for (const kind of ['crm', 'autocar'] as const) test(`hosted ${kind} preflight requires branch mode, metadata and Edge inventory`, async () => {
  const t = target(kind);
  let calls = 0;
  const transport: typeof fetch = async (input) => {
    calls += 1;
    const url = String(input);
    if (url.endsWith('/branches')) return Response.json([metadata(t)]);
    if (url.endsWith('/functions')) return Response.json(kind === 'crm' ? crmStub : []);
    throw new Error('unexpected request');
  };
  const result = await preflightHostedBranch(t, manifest, 'synthetic-token', transport);
  assert.equal(calls, 2);
  assert.equal(result.definitionVersion, 'branch-metadata-v2');
  assert.equal(result.targetMode, 'branch');
});

test('hosted target parser has no default mode or implicit destination', () => {
  const t = target('crm');
  const args = ['--target-mode','branch','--kind','crm','--project-ref',t.projectRef,'--expected-parent-ref',t.expectedParentRef,'--branch-name',t.branchName,'--api-url',t.apiUrl];
  assert.deepEqual(parseHostedBranchArguments(args), t);
  assert.throws(() => parseHostedBranchArguments(args.filter((value) => value !== '--target-mode' && value !== 'branch')));
  assert.throws(() => parseHostedBranchArguments(args.map((value) => value === 'branch' ? 'minimal' : value)));
});

test('Edge inventory fails closed on operational, missing, extra or changed functions', () => {
  validateHostedEdgeInventory(target('crm'), crmStub);
  validateHostedEdgeInventory(target('autocar'), []);
  for (const changed of [
    [],
    [{ ...crmStub[0], version: 7 }],
    [{ ...crmStub[0], verify_jwt: false }],
    [{ ...crmStub[0], ezbr_sha256: 'changed' }],
    [...crmStub, { ...crmStub[0], slug: 'other' }],
  ]) assert.throws(() => validateHostedEdgeInventory(target('crm'), changed));
  assert.throws(() => validateHostedEdgeInventory(target('autocar'), crmStub));
});

test('hosted branch SQL validates inherited schema and never recreates operational tables', () => {
  for (const kind of ['crm','autocar'] as const) {
    const contract = readFileSync(`supabase/homologation/commercial-metrics-v1/${kind}/branch-contract.sql`, 'utf8');
    assert.match(contract, /app\.metrics_target_mode/);
    assert.match(contract, /branch-metadata-v2/);
    assert.doesNotMatch(contract, /create\s+table|alter\s+table|drop\s+table|create\s+policy|alter\s+publication/i);
    assert.match(contract, /pg_net/);
    assert.match(contract, /auth\.users/);
  }
});

test('CRM hosted seed satisfies branch constraints and preserves inherited guards', () => {
  const sql = readFileSync('supabase/homologation/commercial-metrics-v1/crm/branch-seed.sql', 'utf8');
  assert.match(sql, /app\.lead_routing_explicit\s*=\s*'on'/);
  assert.match(sql, /responsible_name/);
  assert.match(sql, /customer_name,origin,status/);
  assert.match(sql, /'manual'/);
  assert.match(sql, /assigned_user_id,assigned_user_role,seller_user_id/);
  assert.match(sql, /seller_name,financing_bank,payment_type/);
  assert.doesNotMatch(sql, /store_whatsapp_integrations\s*\(/i);
  assert.doesNotMatch(sql, /interested_vehicle_id|vehicle_id/);
  assert.doesNotMatch(sql, /disable\s+trigger|drop\s+trigger|create\s+trigger/i);
});

test('AUTOCAR hosted seed uses explicit columns and historical non-executable claims', () => {
  const sql = readFileSync('supabase/homologation/commercial-metrics-v1/autocar/branch-seed.sql', 'utf8');
  assert.match(sql, /insert into public\.ai_store_refs\(store_id,store_slug,store_name/);
  assert.match(sql, /insert into public\.ai_store_agents\(\s*id,store_id,name,status,mode/);
  assert.match(sql, /insert into public\.ai_runtime_conversations\(\s*id,store_id,production_conversation_id/);
  assert.match(sql, /production_message_id,purpose,idempotency_key,direction/);
  assert.match(sql, /'completed'/);
  assert.match(sql, /'failed'/);
  assert.doesNotMatch(sql, /insert into public\.ai_(?:store_agents|runtime_conversations|runtime_message_claims)\s+values/i);
  assert.doesNotMatch(sql, /'claimed'|'ready'/);
});

test('hosted renderer is branch-only and does not execute remote SQL', () => {
  const source = readFileSync('scripts/render-metrics-homologation.ts', 'utf8');
  assert.match(source, /parseHostedBranchArguments/);
  assert.match(source, /branch-contract\.sql/);
  assert.match(source, /branch-seed\.sql/);
  assert.match(source, /branch-metadata-v2/);
  assert.match(source, /app\.metrics_target_mode = 'branch'/);
  assert.doesNotMatch(source, /execute_sql|apply_migration|createClient|postgres|psql/);
});
