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

test('manual member creation never exposes a credential and is preview-safe', () => {
  const route = source('src/app/api/store/team/route.ts');
  const action = route.slice(route.indexOf("action === 'create_member'"), route.indexOf("action === 'generate_link'"));
  const previewIndex = action.indexOf("process.env.VERCEL_ENV === 'preview'");
  const createUserIndex = action.indexOf('admin.createUser');
  const resetIndex = action.indexOf('resetPasswordForEmail');
  assert.ok(previewIndex >= 0);
  assert.ok(createUserIndex > previewIndex);
  assert.ok(resetIndex > createUserIndex);
  assert.match(action, /createBootstrapSecret/);
  assert.match(action, /credential_delivery: 'email'/);
  assert.match(action, /manager_invite/);
  assert.doesNotMatch(action, /temporary_password/);
  assert.doesNotMatch(action, /password_notice/);
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

test('all password-setting flows share the strong account policy', () => {
  const policy = source('src/lib/storeTeamRegistration.ts');
  const registration = source('src/app/api/public/team-registration/route.ts');
  const change = source('src/app/api/auth/change-password/route.ts');
  const recovery = source('src/app/api/auth/password-recovery/complete/route.ts');
  const changePage = source('src/app/trocar-senha/page.tsx');

  assert.match(policy, /ACCOUNT_PASSWORD_MIN_LENGTH = 12/);
  assert.match(policy, /!\/\[a-z\]\//);
  assert.match(policy, /!\/\[A-Z\]\//);
  assert.match(policy, /!\/\\d\//);
  assert.match(policy, /!\/\[\^A-Za-z0-9\]\//);
  assert.match(registration, /teamRegistrationPasswordError/);
  assert.match(change, /accountPasswordError/);
  assert.match(recovery, /accountPasswordError/);
  assert.match(changePage, /ACCOUNT_PASSWORD_MIN_LENGTH/);
  assert.match(changePage, /ACCOUNT_PASSWORD_HINT/);
  assert.doesNotMatch(changePage, /senha recebida do Gestor/i);
  assert.doesNotMatch(changePage, /Mínimo 8 caracteres/);
});

test('recovery completion blocks Preview writes', () => {
  const route = source('src/app/api/auth/password-recovery/complete/route.ts');
  assert.match(route, /accountPasswordError/);
  assert.match(route, /VERCEL_ENV === 'preview'/);
  assert.match(route, /updateUserById/);
  assert.match(route, /password_recovery_completed/);
});

test('recovery callback explicitly matches the implicit email flow', () => {
  const page = source('src/app/redefinir-senha/page.tsx');
  assert.match(page, /from '@supabase\/supabase-js'/);
  assert.match(page, /flowType:\s*'implicit'/);
  assert.match(page, /detectSessionInUrl:\s*true/);
  assert.match(page, /event === 'PASSWORD_RECOVERY'/);
  assert.doesNotMatch(page, /from '@\/lib\/supabase'/);
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
