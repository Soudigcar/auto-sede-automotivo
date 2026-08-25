import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

function source(relativePath: string) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

test('login exposes self-service recovery without secret link', () => {
  const login = source('src/app/login/page.tsx');
  assert.match(login, /href="\/recuperar-senha"/);
  assert.match(login, /Esqueci minha senha/);
});

test('public recovery is neutral, rate limited and preview-safe', () => {
  const route = source('src/app/api/auth/password-recovery/route.ts');
  const previewIndex = route.indexOf("process.env.VERCEL_ENV === 'preview'");
  const rateLimitIndex = route.indexOf('await enforceRateLimit');
  const resetIndex = route.indexOf('resetPasswordForEmail');
  assert.ok(previewIndex >= 0);
  assert.ok(rateLimitIndex > previewIndex);
  assert.ok(resetIndex > previewIndex);
  assert.match(route, /Se esse e-mail estiver cadastrado/);
  assert.doesNotMatch(route, /token:/);
});

test('manager recovery is tenant-scoped and never returns credentials', () => {
  const route = source('src/app/api/store/team/route.ts');
  const action = route.slice(route.indexOf("action === 'send_password_recovery'"), route.indexOf("action === 'update_member'"));
  assert.match(action, /\.eq\('store_id', store\.id\)/);
  assert.match(action, /resetPasswordForEmail/);
  assert.match(action, /password_recovery_requested/);
  assert.match(action, /VERCEL_ENV === 'preview'/);
  assert.doesNotMatch(action, /temporary_password/);
  assert.doesNotMatch(action, /token_hash/);
});

test('recovery completion requires strong password and blocks Preview writes', () => {
  const route = source('src/app/api/auth/password-recovery/complete/route.ts');
  assert.match(route, /value\.length >= 12/);
  assert.match(route, /\[A-Z\]/);
  assert.match(route, /\[a-z\]/);
  assert.match(route, /VERCEL_ENV === 'preview'/);
  assert.match(route, /updateUserById/);
  assert.match(route, /password_recovery_completed/);
});

test('store UI offers recovery email and generic copy-only page', () => {
  const page = source('src/app/loja/[slug]/equipe/page.tsx');
  assert.match(page, /send_password_recovery/);
  assert.match(page, /Acesso e Segurança/);
  assert.match(page, /\/recuperar-senha/);
  assert.match(page, /A loja nunca vê senha ou token/);
});

test('password recovery pages stay on the internal system host', () => {
  const proxy = source('src/proxy.ts');
  assert.match(proxy, /'\/recuperar-senha'/);
  assert.match(proxy, /'\/redefinir-senha'/);
  assert.match(proxy, /sistemaautomotivo\.autosede\.com\.br/);
});
