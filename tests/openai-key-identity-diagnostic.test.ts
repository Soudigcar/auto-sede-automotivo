import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import {
  OPENAI_KEY_IDENTITY_DIAGNOSTIC_BRANCH,
  runOpenAiKeyIdentityDiagnostic
} from '../src/lib/server/autocar/openAiKeyIdentityDiagnostic';

const previewEnvironment = {
  VERCEL_ENV: 'preview',
  VERCEL_GIT_COMMIT_REF: OPENAI_KEY_IDENTITY_DIAGNOSTIC_BRANCH
};

test('key identity diagnostic fails closed outside the authorized Preview branch', async () => {
  let calls = 0;
  const fetchFn: typeof fetch = async () => {
    calls += 1;
    return new Response('{}', { status: 200 });
  };

  await assert.rejects(
    runOpenAiKeyIdentityDiagnostic({
      environment: { VERCEL_ENV: 'production', VERCEL_GIT_COMMIT_REF: 'main' },
      apiKey: 'synthetic-key',
      ports: { fetchFn }
    }),
    /openai_key_identity_diagnostic_preview_only/
  );

  await assert.rejects(
    runOpenAiKeyIdentityDiagnostic({
      environment: { VERCEL_ENV: 'preview', VERCEL_GIT_COMMIT_REF: 'another-branch' },
      apiKey: 'synthetic-key',
      ports: { fetchFn }
    }),
    /openai_key_identity_diagnostic_branch_only/
  );

  assert.equal(calls, 0);
});

test('key identity diagnostic returns sanitized organization identity without exposing the key', async () => {
  const apiKey = 'synthetic-secret-key-never-return';
  let authorizationHeader = '';
  const fetchFn: typeof fetch = async (input, init) => {
    assert.equal(String(input), 'https://api.openai.com/v1/me');
    assert.equal(init?.method, 'GET');
    authorizationHeader = String((init?.headers as Record<string, string>)?.Authorization || '');
    return new Response(JSON.stringify({
      object: 'user',
      id: 'user-synthetic',
      email: 'private@example.invalid',
      name: 'Private Synthetic User',
      orgs: {
        object: 'list',
        data: [
          { object: 'organization', id: 'org-synthetic-a', title: 'Synthetic Organization A' },
          { object: 'organization', id: 'org-synthetic-b', title: 'Synthetic Organization B' }
        ]
      }
    }), {
      status: 200,
      headers: {
        'content-type': 'application/json',
        'x-request-id': 'req_synthetic_identity',
        'openai-organization': 'org-synthetic-b'
      }
    });
  };

  const result = await runOpenAiKeyIdentityDiagnostic({
    environment: previewEnvironment,
    apiKey,
    ports: { fetchFn }
  });

  assert.equal(authorizationHeader, `Bearer ${apiKey}`);
  assert.equal(result.ok, true);
  assert.equal(result.reason, 'identity_resolved');
  assert.equal(result.safety.key_exposed, false);
  assert.equal(result.safety.persistence_enabled, false);
  assert.equal(result.safety.outbound_enabled, false);
  assert.equal(result.organizations?.length, 2);
  assert.equal(result.organizations?.[1]?.title, 'Synthetic Organization B');
  assert.equal(result.request_context?.organization_match_found, true);
  assert.equal(result.request_context?.organization_title, 'Synthetic Organization B');
  assert.ok(result.user?.id_fingerprint);
  assert.ok(result.organizations?.[0]?.id_fingerprint);

  const serialized = JSON.stringify(result);
  assert.ok(!serialized.includes(apiKey));
  assert.ok(!serialized.includes('private@example.invalid'));
  assert.ok(!serialized.includes('Private Synthetic User'));
  assert.ok(!serialized.includes('org-synthetic-a'));
  assert.ok(!serialized.includes('org-synthetic-b'));
});

test('key identity diagnostic sanitizes provider errors without exposing provider messages', async () => {
  const apiKey = 'synthetic-secret-key-never-return';
  const fetchFn: typeof fetch = async () => new Response(JSON.stringify({
    error: {
      message: 'private provider detail that must not be returned',
      type: 'invalid_request_error',
      code: 'account_identity_failure'
    }
  }), {
    status: 403,
    headers: { 'x-request-id': 'req_synthetic_failure' }
  });

  const result = await runOpenAiKeyIdentityDiagnostic({
    environment: previewEnvironment,
    apiKey,
    ports: { fetchFn }
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'identity_request_failed');
  assert.equal(result.error?.status, 403);
  assert.equal(result.error?.code, 'account_identity_failure');
  assert.equal(result.error?.request_id, 'req_synthetic_failure');
  assert.ok(!JSON.stringify(result).includes('private provider detail'));
  assert.ok(!JSON.stringify(result).includes(apiKey));
});

test('identity diagnostic route is GET-only and does not access persistence or outbound providers', () => {
  const source = readFileSync('src/lib/server/autocar/openAiKeyIdentityDiagnostic.ts', 'utf8');
  const route = readFileSync('src/app/api/internal/autocar/openai-key-identity/route.ts', 'utf8');
  const combined = `${source}\n${route}`;

  assert.match(source, /https:\/\/api\.openai\.com\/v1\/me/);
  assert.match(source, /method:\s*'GET'/);
  assert.doesNotMatch(combined, /sendEvolutionText|executeFollowUpV2|createFollowUpV2DatabasePorts|getAutocarRuntimeClient/);
  assert.doesNotMatch(combined, /\.from\s*\(|\.rpc\s*\(/);
  assert.doesNotMatch(combined, /SUPABASE|EVOLUTION|WHATSAPP|WEBHOOK/i);
  assert.doesNotMatch(route, /request\.json\s*\(/);
});
