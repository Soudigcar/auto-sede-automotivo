import assert from 'node:assert/strict';
import test from 'node:test';
import {
  WHATSAPP_CLOUD_PREVIEW_BRANCH,
  WHATSAPP_CLOUD_PREVIEW_PROJECT_REF,
  WHATSAPP_CLOUD_PRODUCTION_PROJECT_REF,
  evaluateWhatsappCloudWriteScope
} from '../src/lib/server/storeWhatsappCloud.ts';

const tempUrl = `https://${WHATSAPP_CLOUD_PREVIEW_PROJECT_REF}.supabase.co`;
const prodUrl = `https://${WHATSAPP_CLOUD_PRODUCTION_PROJECT_REF}.supabase.co`;

test('libera somente Preview da branch autorizada no Supabase temporario', () => {
  const scope = evaluateWhatsappCloudWriteScope({
    vercelEnv: 'preview',
    gitRef: WHATSAPP_CLOUD_PREVIEW_BRANCH,
    previewEnabled: 'true',
    productionConfigEnabled: 'false',
    supabaseUrl: tempUrl
  });

  assert.equal(scope.allowed, true);
  assert.equal(scope.mode, 'preview_synthetic');
});

test('bloqueia outra branch em Preview', () => {
  const scope = evaluateWhatsappCloudWriteScope({
    vercelEnv: 'preview',
    gitRef: 'feature/outra-branch',
    previewEnabled: 'true',
    supabaseUrl: tempUrl
  });

  assert.equal(scope.allowed, false);
  assert.match(scope.reason, /branch isolada autorizada/);
});

test('bloqueia Preview sem flag explicita', () => {
  const scope = evaluateWhatsappCloudWriteScope({
    vercelEnv: 'preview',
    gitRef: WHATSAPP_CLOUD_PREVIEW_BRANCH,
    previewEnabled: 'false',
    supabaseUrl: tempUrl
  });

  assert.equal(scope.allowed, false);
  assert.match(scope.reason, /não está habilitada/);
});

test('bloqueia Preview apontando para CRM Production', () => {
  const scope = evaluateWhatsappCloudWriteScope({
    vercelEnv: 'preview',
    gitRef: WHATSAPP_CLOUD_PREVIEW_BRANCH,
    previewEnabled: 'true',
    supabaseUrl: prodUrl
  });

  assert.equal(scope.allowed, false);
  assert.match(scope.reason, /Supabase temporário autorizado/);
});

test('Production continua fail-closed sem flag especifica', () => {
  const scope = evaluateWhatsappCloudWriteScope({
    vercelEnv: 'production',
    gitRef: 'main',
    productionConfigEnabled: 'false',
    supabaseUrl: prodUrl
  });

  assert.equal(scope.allowed, false);
  assert.match(scope.reason, /ainda não foi liberada/);
});

test('gate Production exige main, flag especifica e CRM Production', () => {
  const allowed = evaluateWhatsappCloudWriteScope({
    vercelEnv: 'production',
    gitRef: 'main',
    productionConfigEnabled: 'true',
    supabaseUrl: prodUrl
  });
  assert.equal(allowed.allowed, true);
  assert.equal(allowed.mode, 'production_config');

  const wrongBranch = evaluateWhatsappCloudWriteScope({
    vercelEnv: 'production',
    gitRef: 'feature/qualquer',
    productionConfigEnabled: 'true',
    supabaseUrl: prodUrl
  });
  assert.equal(wrongBranch.allowed, false);

  const wrongDatabase = evaluateWhatsappCloudWriteScope({
    vercelEnv: 'production',
    gitRef: 'main',
    productionConfigEnabled: 'true',
    supabaseUrl: tempUrl
  });
  assert.equal(wrongDatabase.allowed, false);
});

test('bloqueia URL malformada ou ausente', () => {
  for (const supabaseUrl of ['', 'not-a-url']) {
    const scope = evaluateWhatsappCloudWriteScope({
      vercelEnv: 'preview',
      gitRef: WHATSAPP_CLOUD_PREVIEW_BRANCH,
      previewEnabled: 'true',
      supabaseUrl
    });

    assert.equal(scope.allowed, false);
  }
});
