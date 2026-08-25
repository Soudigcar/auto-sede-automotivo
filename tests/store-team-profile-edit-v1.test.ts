import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

function source(relativePath: string) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

function updateAction(route: string) {
  const start = route.indexOf("action === 'update_member'");
  const end = route.indexOf("return NextResponse.json({ error: 'Ação não reconhecida.'", start);
  return route.slice(start, end);
}

test('loja edita perfil e cargo sem enviar identidade imutável', () => {
  const page = source('src/app/loja/[slug]/equipe/page.tsx');
  const save = page.slice(page.indexOf('async function saveMember'), page.indexOf('async function sendPasswordRecovery'));

  assert.match(save, /full_name: draft\.full_name/);
  assert.match(save, /phone: draft\.phone/);
  assert.match(save, /role: draft\.role/);
  assert.doesNotMatch(save, /email:/);
  assert.doesNotMatch(save, /store_id:/);
  assert.match(page, /Editar perfil/);
  assert.match(page, /option value="pre_sales"/);
  assert.match(page, /option value="seller"/);
  assert.match(page, /option value="prospector"/);
  assert.doesNotMatch(page, /option value="master"/);
  assert.doesNotMatch(page, /option value="store"/);
  assert.match(page, /value=\{draft\.email\} readOnly disabled/);
});

test('update_member mantém gestor e tenant scope e bloqueia email ou loja', () => {
  const route = source('src/app/api/store/team/route.ts');
  const action = updateAction(route);

  assert.match(route, /!\['master', 'store'\]\.includes\(profile\.role\)/);
  assert.match(action, /hasOwnProperty\.call\(body, 'email'\)/);
  assert.match(action, /hasOwnProperty\.call\(body, 'store_id'\)/);
  assert.match(action, /isStoreTeamRole\(role\)/);
  assert.match(action, /\.eq\('id', memberId\)/);
  assert.match(action, /\.eq\('store_id', store\.id\)/);
  assert.match(action, /\.in\('role', \['pre_sales', 'seller', 'prospector'\]\)/);
});

test('Preview valida update_member antes de qualquer escrita real', () => {
  const action = updateAction(source('src/app/api/store/team/route.ts'));
  const preview = action.indexOf("process.env.VERCEL_ENV === 'preview'");
  const userWrite = action.indexOf(".from('users')\n        .update", preview);
  const prospectorWrite = action.indexOf(".from('prospectors')\n            .update", preview);
  const auditWrite = action.indexOf(".from('audit_logs').insert", preview);

  assert.ok(preview >= 0);
  assert.ok(userWrite > preview);
  assert.ok(prospectorWrite > preview);
  assert.ok(auditWrite > preview);
  assert.match(action, /Nenhum dado real foi alterado/);
});

test('troca para ou de Prospectador preserva histórico e não apaga registros', () => {
  const action = updateAction(source('src/app/api/store/team/route.ts'));

  assert.match(action, /previousRole === 'prospector' \|\| role === 'prospector'/);
  assert.match(action, /status: 'inactive'/);
  assert.match(action, /from\('prospectors'\)\.insert/);
  assert.doesNotMatch(action, /from\('prospectors'\)\.delete/);
  assert.match(action, /rollbackMember/);
});

test('edição registra antes e depois para auditoria', () => {
  const action = updateAction(source('src/app/api/store/team/route.ts'));

  assert.match(action, /action_type: 'team_member_profile_updated'/);
  assert.match(action, /old_value:/);
  assert.match(action, /new_value:/);
  assert.match(action, /updated_by_user_id: profile\.id/);
  assert.match(action, /role_changed: previousRole !== role/);
});
