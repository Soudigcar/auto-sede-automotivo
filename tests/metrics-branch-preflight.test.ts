import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseBranchArguments, preflightBranch, validateBranchMetadata, type BranchTarget } from '../scripts/lib/metrics-branch-preflight';
import { forbiddenMetricsRefs, metricsBranch } from '../src/lib/commercialMetricsHomologation';

const crm = 'abcdefghijklmnopqrst', autocar = 'tsrqponmlkjihgfedcba';
const manifest = { approved: true, branch: metricsBranch, crmProjectRef: crm, autocarProjectRef: autocar };
const target: BranchTarget = { kind: 'crm', projectRef: crm, expectedParentRef: forbiddenMetricsRefs[0], branchName: 'metrics-crm-homologation', apiUrl: `https://${crm}.supabase.co` };
const metadata = (t: BranchTarget) => ({ project_ref: t.projectRef, parent_project_ref: t.expectedParentRef, name: t.branchName, with_data: false, is_default: false, status: 'FUNCTIONS_DEPLOYED', preview_project_status: 'ACTIVE_HEALTHY' });

for (const kind of ['crm', 'autocar'] as const) test(`official healthy ${kind} branch passes before rendering`, async () => {
  const t: BranchTarget = kind === 'crm' ? target : { kind, projectRef: autocar, expectedParentRef: forbiddenMetricsRefs[1], branchName: 'metrics-autocar-homologation', apiUrl: `https://${autocar}.supabase.co` };
  let calls = 0;
  const transport: typeof fetch = async (url, options) => {
    calls++;
    assert.equal(url, `https://api.supabase.com/v1/projects/${t.expectedParentRef}/branches`);
    assert.equal(options?.method, 'GET'); assert.equal(options?.redirect, 'error');
    return Response.json([metadata(t)]);
  };
  const verified = await preflightBranch(t, manifest, 'synthetic-token', transport);
  assert.equal(calls, 1); assert.equal(verified.projectRef, t.projectRef);
  assert.equal(verified.definitionVersion, 'branch-metadata-v1');
});
for (const ref of forbiddenMetricsRefs) test(`preflight rejects forbidden destination ${ref}`, async () => {
  let calls = 0;
  const transport: typeof fetch = async () => { calls++; throw new Error('Unexpected request'); };
  await assert.rejects(preflightBranch({ ...target, projectRef: ref, apiUrl: `https://${ref}.supabase.co` }, { ...manifest, crmProjectRef: ref }, 'synthetic', transport));
  assert.equal(calls, 0);
});
test('missing, duplicated, absent and malformed official metadata fail closed', async () => {
  for (const payload of [null, {}, [], [metadata(target), metadata(target)], [{ ...metadata(target), project_ref: autocar }]]) {
    await assert.rejects(preflightBranch(target, manifest, 'synthetic', async () => Response.json(payload)));
  }
  for (const field of Object.keys(metadata(target))) {
    const copy: Record<string, unknown> = { ...metadata(target) }; delete copy[field];
    assert.throws(() => validateBranchMetadata(target, manifest, copy), field);
  }
});
test('wrong parent, name, health, default branch and data copy are rejected', () => {
  for (const changes of [{ parent_project_ref: forbiddenMetricsRefs[1] }, { name: 'other' }, { preview_project_status: 'INACTIVE' }, { status: 'CREATING_PROJECT' }, { is_default: true }, { with_data: true }]) {
    assert.throws(() => validateBranchMetadata(target, manifest, { ...metadata(target), ...changes }));
  }
  assert.throws(() => validateBranchMetadata({ ...target, expectedParentRef: forbiddenMetricsRefs[1] }, manifest, metadata(target)));
  assert.throws(() => validateBranchMetadata({ ...target, branchName: 'other' }, manifest, metadata(target)));
});
test('exact HTTPS host, distinct refs and approved manifest are mandatory', () => {
  for (const apiUrl of [`http://${crm}.supabase.co`, `https://${autocar}.supabase.co`, `https://${crm}.supabase.co.evil.invalid`, `https://user@${crm}.supabase.co`, `https://${crm}.supabase.co/path`, `https://${crm}.supabase.co:443`]) {
    assert.throws(() => validateBranchMetadata({ ...target, apiUrl }, manifest, metadata(target)));
  }
  for (const changes of [{ approved: false }, { branch: 'main' }, { crmProjectRef: null }, { autocarProjectRef: crm }, { crmProjectRef: autocar, autocarProjectRef: crm }]) {
    assert.throws(() => validateBranchMetadata(target, { ...manifest, ...changes }, metadata(target)));
  }
});
test('arguments have no defaults, duplicates, unknown flags or missing values', () => {
  const args = ['--kind', 'crm', '--project-ref', crm, '--expected-parent-ref', target.expectedParentRef, '--branch-name', target.branchName, '--api-url', target.apiUrl];
  assert.deepEqual(parseBranchArguments(args), target);
  for (let i = 0; i < args.length; i += 2) assert.throws(() => parseBranchArguments(args.filter((_, n) => n !== i && n !== i + 1)));
  for (const invalid of [[], [...args, '--kind', 'crm'], [...args, '--linked', 'true'], [...args, '--kind']]) assert.throws(() => parseBranchArguments(invalid));
});
test('provider failure and redirects cannot expose secrets or produce success', async () => {
  for (const transport of [async () => new Response('sensitive-provider-body', { status: 403 }), async () => { throw new Error('sensitive-transport-error'); }]) {
    await assert.rejects(preflightBranch(target, manifest, 'synthetic', transport), { message: 'Official branch metadata unavailable' });
  }
  await assert.rejects(preflightBranch(target, manifest, undefined, async () => { throw new Error('Must not reach transport'); }), { message: 'Management API authentication required' });
});
test('SQL bundles no longer manufacture or rely on hosted SQL identity', () => {
  for (const path of ['crm/schema.sql', 'crm/seed.sql', 'autocar/schema.sql', 'autocar/seed.sql', 'auth/bind-profiles.sql']) {
    const sql = readFileSync(`supabase/homologation/commercial-metrics-v1/${path}`, 'utf8');
    assert.doesNotMatch(sql, /api_external_url|cluster_name|current_database\s*\(/);
    assert.match(sql, /do NOT prove database identity/);
    assert.match(sql, /branch-metadata-v1/);
  }
  assert.deepEqual(JSON.parse(readFileSync('src/lib/commercialMetricsHomologationManifest.json', 'utf8')), { branch: metricsBranch, crmProjectRef: null, autocarProjectRef: null, approved: false });
});
