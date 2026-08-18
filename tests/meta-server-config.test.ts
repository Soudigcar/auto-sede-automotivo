import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getMetaServerConfig,
  publicMetaSettings,
  redactMetaSecrets,
  stripStoredMetaSecrets
} from '../src/lib/server/metaServerConfig.ts';

const pageToken = 'meta-page-secret-for-test';
const verifyToken = 'meta-verify-secret-for-test';

test('configuração Meta lê segredos apenas do ambiente server-side', () => {
  const config = getMetaServerConfig({
    META_PAGE_ACCESS_TOKEN: ` ${pageToken} `,
    META_LEADS_VERIFY_TOKEN: ` ${verifyToken} `
  });

  assert.equal(config.pageAccessToken, pageToken);
  assert.equal(config.verifyToken, verifyToken);
  assert.equal(config.hasPageAccessToken, true);
  assert.equal(config.hasVerifyToken, true);
});

test('verify token vazio não é considerado configurado', () => {
  const config = getMetaServerConfig({ META_LEADS_VERIFY_TOKEN: '' });

  assert.equal(config.verifyToken, '');
  assert.equal(config.hasVerifyToken, false);
});

test('resposta pública e persistência removem tokens legados do banco', () => {
  const stored = {
    app_id: '123',
    page_id: '456',
    page_access_token: pageToken,
    verify_token: verifyToken,
    form_mappings: [{ form_id: '789' }]
  };
  const config = getMetaServerConfig({
    META_PAGE_ACCESS_TOKEN: pageToken,
    META_LEADS_VERIFY_TOKEN: verifyToken
  });

  const safeStored = stripStoredMetaSecrets(stored);
  const publicSettings = publicMetaSettings(stored, config);
  const serialized = JSON.stringify({ safeStored, publicSettings });

  assert.equal('page_access_token' in safeStored, false);
  assert.equal('verify_token' in safeStored, false);
  assert.equal(publicSettings.has_page_access_token, true);
  assert.equal(publicSettings.has_verify_token, true);
  assert.equal(serialized.includes(pageToken), false);
  assert.equal(serialized.includes(verifyToken), false);
});

test('diagnóstico remove campos e ocorrências acidentais de segredos', () => {
  const config = getMetaServerConfig({
    META_PAGE_ACCESS_TOKEN: pageToken,
    META_LEADS_VERIFY_TOKEN: verifyToken
  });
  const unsafe = {
    error: `Falha usando ${pageToken}`,
    access_token: pageToken,
    nested: { verify_token: verifyToken, message: `valor=${verifyToken}` }
  };

  const safe = redactMetaSecrets(unsafe, config);
  const serialized = JSON.stringify(safe);

  assert.equal(serialized.includes(pageToken), false);
  assert.equal(serialized.includes(verifyToken), false);
  assert.equal('access_token' in safe, false);
  assert.equal('verify_token' in safe.nested, false);
  assert.match(safe.error, /\[REDACTED\]/);
});
