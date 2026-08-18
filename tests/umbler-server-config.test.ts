import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getUmblerServerConfig,
  publicUmblerSettings,
  stripStoredUmblerSecrets
} from '../src/lib/server/umblerServerConfig.ts';

const verifyToken = 'umbler-server-secret-for-test';

test('configuração Umbler lê o token somente do ambiente server-side', () => {
  const config = getUmblerServerConfig({ UMBLER_WEBHOOK_TOKEN: ` ${verifyToken} ` });

  assert.equal(config.verifyToken, verifyToken);
  assert.equal(config.hasVerifyToken, true);
});

test('token Umbler curto ou vazio não é considerado configurado', () => {
  assert.equal(getUmblerServerConfig({ UMBLER_WEBHOOK_TOKEN: '' }).hasVerifyToken, false);
  assert.equal(getUmblerServerConfig({ UMBLER_WEBHOOK_TOKEN: 'curto' }).hasVerifyToken, false);
});

test('resposta pública e persistência removem token Umbler legado', () => {
  const stored = {
    verify_token: verifyToken,
    source_name: 'Umbler Talk / WhatsApp',
    event_id: 'event-id'
  };
  const config = getUmblerServerConfig({ UMBLER_WEBHOOK_TOKEN: verifyToken });
  const safeStored = stripStoredUmblerSecrets(stored);
  const publicSettings = publicUmblerSettings(stored, config);
  const serialized = JSON.stringify({ safeStored, publicSettings });

  assert.equal('verify_token' in safeStored, false);
  assert.equal(publicSettings.has_verify_token, true);
  assert.equal(serialized.includes(verifyToken), false);
});
