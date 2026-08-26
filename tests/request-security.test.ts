import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';
import {
  RequestSecurityError,
  readJsonBody,
  readRawBody,
  safeEqual,
  verifySha256Hmac
} from '../src/lib/server/requestSecurity.ts';
import { isAllowedRemoteHostname, isBlockedNetworkAddress } from '../src/lib/server/secureRemoteFetch.ts';

test('safeEqual exige valor não vazio e compara em tempo constante', () => {
  assert.equal(safeEqual('', ''), false);
  assert.equal(safeEqual('segredo', 'segredo'), true);
  assert.equal(safeEqual('segredo', 'outro'), false);
});

test('verifySha256Hmac aceita somente assinatura SHA-256 correta', () => {
  const raw = JSON.stringify({ lead: '123' });
  const secret = 'secret-for-test';
  const signature = `sha256=${createHmac('sha256', secret).update(raw).digest('hex')}`;
  assert.equal(verifySha256Hmac(raw, signature, secret), true);
  assert.equal(verifySha256Hmac(`${raw}x`, signature, secret), false);
  assert.equal(verifySha256Hmac(raw, '', secret), false);
});

test('readRawBody aplica limite mesmo sem Content-Length', async () => {
  const request = new Request('https://example.test/hook', { method: 'POST', body: '123456' });
  await assert.rejects(() => readRawBody(request, 5), (error: unknown) => {
    assert.ok(error instanceof RequestSecurityError);
    assert.equal(error.status, 413);
    return true;
  });
});

test('readJsonBody rejeita JSON inválido', async () => {
  const request = new Request('https://example.test/hook', { method: 'POST', body: '{' });
  await assert.rejects(() => readJsonBody(request), (error: unknown) => {
    assert.ok(error instanceof RequestSecurityError);
    assert.equal(error.status, 400);
    return true;
  });
});

test('SSRF bloqueia endereços privados, loopback e reservados', () => {
  for (const address of ['127.0.0.1', '10.1.2.3', '169.254.169.254', '172.16.0.1', '192.168.1.1', '::1', 'fc00::1', 'fe80::1']) {
    assert.equal(isBlockedNetworkAddress(address), true, address);
  }
  assert.equal(isBlockedNetworkAddress('8.8.8.8'), false);
  assert.equal(isBlockedNetworkAddress('2606:4700:4700::1111'), false);
});

test('allowlist remota exige hostname exato', () => {
  const allowed = ['maps.app.goo.gl', 'www.google.com'];
  assert.equal(isAllowedRemoteHostname('maps.app.goo.gl', allowed), true);
  assert.equal(isAllowedRemoteHostname('MAPS.APP.GOO.GL', allowed), true);
  assert.equal(isAllowedRemoteHostname('maps.app.goo.gl.evil.example', allowed), false);
  assert.equal(isAllowedRemoteHostname('evilgoogle.com', allowed), false);
});
