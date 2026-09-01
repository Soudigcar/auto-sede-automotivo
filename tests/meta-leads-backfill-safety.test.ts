import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  commitWasExplicitlyRequested,
  resolveBackfillConfig,
  safeSecretEqual,
  signMetaPayload
} from '../supabase/functions/_shared/metaBackfillSafety.ts';

const productionRef = 'wufikrdgyxrsszlbpfmv';
const devRef = 'azszzdotbrczlhrmhrlw';
const source = readFileSync('supabase/functions/meta-leads-backfill-temp/index.ts', 'utf8');
const safetySource = readFileSync('supabase/functions/_shared/metaBackfillSafety.ts', 'utf8');

function environment(values: Record<string, string>) {
  return (name: string) => values[name];
}

function baseValues(projectRef = devRef) {
  return {
    SUPABASE_URL: `https://${projectRef}.supabase.co`,
    META_LEADS_BACKFILL_ENV: 'development',
    META_LEADS_BACKFILL_KEY: 'a'.repeat(32),
    META_APP_SECRET: 'b'.repeat(32),
    META_LEADS_BACKFILL_WEBHOOK_URL: 'https://preview.example.test/api/webhooks/meta-leads',
    META_LEADS_BACKFILL_ALLOWED_HOST: 'preview.example.test'
  };
}

test('development backfill cannot target the production webhook', () => {
  const values = {
    ...baseValues(),
    META_LEADS_BACKFILL_WEBHOOK_URL: 'https://sistemaautomotivo.autosede.com.br/api/webhooks/meta-leads',
    META_LEADS_BACKFILL_ALLOWED_HOST: 'sistemaautomotivo.autosede.com.br'
  };
  assert.throws(() => resolveBackfillConfig(environment(values)), /environment_mismatch:development/);
});

test('production mode is accepted only on the production Supabase project and host', () => {
  const production = {
    ...baseValues(productionRef),
    META_LEADS_BACKFILL_ENV: 'production',
    META_LEADS_BACKFILL_WEBHOOK_URL: 'https://sistemaautomotivo.autosede.com.br/api/webhooks/meta-leads',
    META_LEADS_BACKFILL_ALLOWED_HOST: 'sistemaautomotivo.autosede.com.br'
  };
  assert.equal(resolveBackfillConfig(environment(production)).environment, 'production');
  assert.throws(
    () => resolveBackfillConfig(environment({ ...production, SUPABASE_URL: `https://${devRef}.supabase.co` })),
    /environment_mismatch:production/
  );
});

test('production rejects a host that is not attached to the official Vercel project', () => {
  const values = {
    ...baseValues(productionRef),
    META_LEADS_BACKFILL_ENV: 'production',
    META_LEADS_BACKFILL_WEBHOOK_URL: 'https://www.autocontroleautomotivo.com.br/api/webhooks/meta-leads',
    META_LEADS_BACKFILL_ALLOWED_HOST: 'www.autocontroleautomotivo.com.br'
  };
  assert.throws(() => resolveBackfillConfig(environment(values)), /environment_mismatch:production/);
});

test('webhook host allowlist is exact and HTTPS-only', () => {
  assert.throws(
    () => resolveBackfillConfig(environment({
      ...baseValues(),
      META_LEADS_BACKFILL_WEBHOOK_URL: 'https://preview.example.test.evil.test/api/webhooks/meta-leads'
    })),
    /unsafe_environment/
  );
  assert.throws(
    () => resolveBackfillConfig(environment({
      ...baseValues(),
      META_LEADS_BACKFILL_WEBHOOK_URL: 'http://preview.example.test/api/webhooks/meta-leads'
    })),
    /unsafe_environment/
  );
  assert.throws(
    () => resolveBackfillConfig(environment({
      ...baseValues(),
      META_LEADS_BACKFILL_WEBHOOK_URL: 'https://preview.example.test/api/other-route'
    })),
    /unsafe_environment/
  );
});

test('commit requires two explicit request signals', () => {
  assert.equal(commitWasExplicitlyRequested(new Request('https://edge.test/run?commit=1')), false);
  assert.equal(commitWasExplicitlyRequested(new Request('https://edge.test/run', { headers: { 'x-backfill-mode': 'commit' } })), false);
  assert.equal(commitWasExplicitlyRequested(new Request('https://edge.test/run?commit=1', { headers: { 'x-backfill-mode': 'commit' } })), true);
});

test('secrets are compared by digest and webhook payloads receive a Meta-compatible signature', async () => {
  assert.equal(await safeSecretEqual('secret-one', 'secret-one'), true);
  assert.equal(await safeSecretEqual('secret-one', 'secret-two'), false);
  assert.match(await signMetaPayload('{"ok":true}', 'b'.repeat(32)), /^sha256=[a-f0-9]{64}$/);
});

test('Edge Function keeps secrets and destination out of source and defaults to dry-run', () => {
  assert.doesNotMatch(source, /const\s+KEY\s*=/);
  assert.doesNotMatch(source, /const\s+WEBHOOK\s*=/);
  assert.doesNotMatch(source, /bf_[a-z0-9]+/i);
  assert.match(safetySource, /META_LEADS_BACKFILL_KEY/);
  assert.match(safetySource, /META_LEADS_BACKFILL_WEBHOOK_URL/);
  assert.match(source, /signMetaPayload/);
  assert.match(source, /if \(!commit\)/);
  assert.match(source, /x-hub-signature-256/);
});
