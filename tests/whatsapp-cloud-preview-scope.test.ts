import assert from 'node:assert/strict';
import test from 'node:test';
import {
  WHATSAPP_CLOUD_PREVIEW_BRANCH,
  WHATSAPP_CLOUD_PREVIEW_PROJECT_REF,
  evaluateWhatsappCloudPreviewWriteScope
} from '../src/lib/server/storeWhatsappCloud.ts';

const tempUrl = `https://${WHATSAPP_CLOUD_PREVIEW_PROJECT_REF}.supabase.co`;

test('libera somente Preview da branch autorizada no Supabase temporario', () => {
  const scope = evaluateWhatsappCloudPreviewWriteScope({
    vercelEnv: 'preview',
    gitRef: WHATSAPP_CLOUD_PREVIEW_BRANCH,
    previewEnabled: 'true',
    supabaseUrl: tempUrl
  });

  assert.equal(scope.allowed, true);
});

test('bloqueia Production mesmo com flag e banco temporario corretos', () => {
  const scope = evaluateWhatsappCloudPreviewWriteScope({
    vercelEnv: 'production',
    gitRef: WHATSAPP_CLOUD_PREVIEW_BRANCH,
    previewEnabled: 'true',
    supabaseUrl: tempUrl
  });

  assert.equal(scope.allowed, false);
  assert.match(scope.reason, /somente em Vercel Preview/);
});

test('bloqueia outra branch', () => {
  const scope = evaluateWhatsappCloudPreviewWriteScope({
    vercelEnv: 'preview',
    gitRef: 'feature/outra-branch',
    previewEnabled: 'true',
    supabaseUrl: tempUrl
  });

  assert.equal(scope.allowed, false);
  assert.match(scope.reason, /branch isolada autorizada/);
});

test('bloqueia Preview sem flag explicita', () => {
  const scope = evaluateWhatsappCloudPreviewWriteScope({
    vercelEnv: 'preview',
    gitRef: WHATSAPP_CLOUD_PREVIEW_BRANCH,
    previewEnabled: 'false',
    supabaseUrl: tempUrl
  });

  assert.equal(scope.allowed, false);
  assert.match(scope.reason, /não está habilitada/);
});

test('bloqueia CRM Production mesmo com demais gates corretos', () => {
  const scope = evaluateWhatsappCloudPreviewWriteScope({
    vercelEnv: 'preview',
    gitRef: WHATSAPP_CLOUD_PREVIEW_BRANCH,
    previewEnabled: 'true',
    supabaseUrl: 'https://wufikrdgyxrsszlbpfmv.supabase.co'
  });

  assert.equal(scope.allowed, false);
  assert.match(scope.reason, /Supabase temporário autorizado/);
});

test('bloqueia URL malformada ou ausente', () => {
  for (const supabaseUrl of ['', 'not-a-url']) {
    const scope = evaluateWhatsappCloudPreviewWriteScope({
      vercelEnv: 'preview',
      gitRef: WHATSAPP_CLOUD_PREVIEW_BRANCH,
      previewEnabled: 'true',
      supabaseUrl
    });

    assert.equal(scope.allowed, false);
  }
});
