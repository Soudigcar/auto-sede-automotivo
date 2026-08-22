import assert from 'node:assert/strict';
import test from 'node:test';
import {
  INTERNAL_LOGIN_URL,
  resolveInternalAccessUrl
} from '../src/lib/publicPortalAccess.ts';

test('preview permanece no proprio ambiente ao entrar', () => {
  assert.equal(resolveInternalAccessUrl('preview'), '/login');
});

test('production preserva o login oficial do sistema', () => {
  assert.equal(resolveInternalAccessUrl('production'), INTERNAL_LOGIN_URL);
});

test('ambiente local ou indefinido nao altera o comportamento oficial', () => {
  assert.equal(resolveInternalAccessUrl('development'), INTERNAL_LOGIN_URL);
  assert.equal(resolveInternalAccessUrl(undefined), INTERNAL_LOGIN_URL);
});
