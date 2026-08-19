import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateSaasWriteEnvironment, extractSupabaseProjectRef } from '../src/lib/server/saasEnvironment';

test('extracts Supabase project ref', () => {
  assert.equal(extractSupabaseProjectRef('https://exampleproject.supabase.co'), 'exampleproject');
});

test('is disabled by default', () => {
  const result = evaluateSaasWriteEnvironment({
    NEXT_PUBLIC_SUPABASE_URL: 'https://safeproject.supabase.co',
    VERCEL_ENV: 'preview'
  });
  assert.equal(result.enabled, false);
});

test('blocks CRM Production even when flag is enabled', () => {
  const result = evaluateSaasWriteEnvironment({
    SAAS_ONBOARDING_WRITE_ENABLED: 'true',
    NEXT_PUBLIC_SUPABASE_URL: 'https://wufikrdgyxrsszlbpfmv.supabase.co',
    VERCEL_ENV: 'preview'
  });
  assert.equal(result.enabled, false);
  assert.equal(result.projectRef, 'wufikrdgyxrsszlbpfmv');
});

test('blocks autocar-dev', () => {
  const result = evaluateSaasWriteEnvironment({
    SAAS_ONBOARDING_WRITE_ENABLED: 'true',
    NEXT_PUBLIC_SUPABASE_URL: 'https://azszzdotbrczlhrmhrlw.supabase.co',
    VERCEL_ENV: 'preview'
  });
  assert.equal(result.enabled, false);
});

test('blocks AUTOCAR Production', () => {
  const result = evaluateSaasWriteEnvironment({
    SAAS_ONBOARDING_WRITE_ENABLED: 'true',
    NEXT_PUBLIC_SUPABASE_URL: 'https://icmwdggbvijexjgrvsbl.supabase.co',
    VERCEL_ENV: 'preview'
  });
  assert.equal(result.enabled, false);
});

test('blocks any Vercel Production target', () => {
  const result = evaluateSaasWriteEnvironment({
    SAAS_ONBOARDING_WRITE_ENABLED: 'true',
    NEXT_PUBLIC_SUPABASE_URL: 'https://safeproject.supabase.co',
    VERCEL_ENV: 'production'
  });
  assert.equal(result.enabled, false);
});

test('allows explicitly enabled isolated Preview Supabase project', () => {
  const result = evaluateSaasWriteEnvironment({
    SAAS_ONBOARDING_WRITE_ENABLED: 'true',
    NEXT_PUBLIC_SUPABASE_URL: 'https://safeproject.supabase.co',
    VERCEL_ENV: 'preview'
  });
  assert.equal(result.enabled, true);
  assert.equal(result.projectRef, 'safeproject');
});
