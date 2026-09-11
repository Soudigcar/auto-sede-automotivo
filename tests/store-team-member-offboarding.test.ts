import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const teamRoute = readFileSync('src/app/api/store/team/route.ts', 'utf8');
const teamPage = readFileSync('src/app/loja/[slug]/equipe/page.tsx', 'utf8');
const offboardingAction = readFileSync('src/app/loja/[slug]/equipe/MemberOffboardingAction.tsx', 'utf8');
const legacyRegistrationPage = readFileSync('src/app/equipe/cadastro/page.tsx', 'utf8');
const canonicalRegistrationRoute = readFileSync('src/app/api/public/team-registration/route.ts', 'utf8');

function actionBlock(source: string, action: string, nextAction: string) {
  const start = source.indexOf(`if (action === '${action}')`);
  const end = source.indexOf(`if (action === '${nextAction}')`, start + 1);
  assert.notEqual(start, -1, `${action} action must exist`);
  assert.notEqual(end, -1, `${nextAction} action must follow ${action}`);
  return source.slice(start, end);
}

test('offboarding preserves identity and never deletes the Auth user', () => {
  const block = actionBlock(teamRoute, 'offboard_member', 'update_member');
  assert.match(block, /status:\s*'inactive'/);
  assert.match(block, /receives_leads:\s*false/);
  assert.match(block, /team_member_offboarded/);
  assert.match(block, /identity_preserved:\s*true/);
  assert.match(block, /history_preserved:\s*true/);
  assert.doesNotMatch(block, /auth\.admin\.deleteUser/);
  assert.doesNotMatch(block, /\.from\('users'\)\.delete/);
});

test('offboarding requires explicit confirmation and blocks assigned open leads', () => {
  const block = actionBlock(teamRoute, 'offboard_member', 'update_member');
  assert.match(block, /confirmation !== 'EXCLUIR'/);
  assert.match(block, /assigned_store_id/);
  assert.match(block, /assigned_user_id/);
  assert.match(block, /\(lost,sale_confirmed\)/);
  assert.match(block, /ACTIVE_LEADS_ASSIGNED/);
  assert.match(block, /CONCURRENT_LEAD_ASSIGNMENT/);
});

test('Preview offboarding is write-closed', () => {
  const block = actionBlock(teamRoute, 'offboard_member', 'update_member');
  const previewIndex = block.indexOf("process.env.VERCEL_ENV === 'preview'");
  const userUpdateIndex = block.indexOf(".from('users')", previewIndex);
  assert.ok(previewIndex > -1);
  assert.ok(userUpdateIndex > previewIndex, 'the mutation must only appear after the Preview early return');
  assert.match(block.slice(previewIndex, userUpdateIndex), /Nenhum acesso ou dado real foi alterado/);
});

test('offboarded members are removed from the active team surface', () => {
  assert.match(teamRoute, /\.neq\('status', 'inactive'\)/);
  assert.match(teamPage, /MemberOffboardingAction/);
  assert.match(teamPage, /action: 'offboard_member'/);
  assert.match(offboardingAction, /Excluir da equipe/);
  assert.match(offboardingAction, /Digite EXCLUIR para confirmar/);
  assert.match(offboardingAction, /histórico comercial não será apagado/);
});

test('existing accounts are directed to the authenticated store-transfer flow', () => {
  const createMemberBlock = actionBlock(teamRoute, 'create_member', 'generate_link');
  assert.match(createMemberBlock, /ACCOUNT_TRANSFER_REQUIRED/);
  assert.match(createMemberBlock, /link de cadastro/);
  assert.match(legacyRegistrationPage, /router\.replace\(`\/equipe\/cadastro\/\$\{encodeURIComponent\(token\)\}`\)/);
  assert.match(canonicalRegistrationRoute, /action === 'check_email'/);
  assert.match(canonicalRegistrationRoute, /action === 'confirm_transfer'/);
  assert.match(canonicalRegistrationRoute, /signInWithPassword/);
  assert.match(canonicalRegistrationRoute, /transfer_store_team_member/);
  assert.match(canonicalRegistrationRoute, /confirm_transfer === true/);
});
