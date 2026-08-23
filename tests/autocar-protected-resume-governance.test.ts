import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  AUTOCAR_DEFAULT_RESUME_REASON,
  evaluateAutocarResumeRequest,
  isProtectedAutocarResumeState
} from '../src/lib/server/autocar/resumeGovernance.ts';

const protectedState = { human_state: 'human_active', paused_by_source: 'autocar_handoff' };

test('detecta handoff protegido inclusive com normalização', () => {
  assert.equal(isProtectedAutocarResumeState(protectedState), true);
  assert.equal(isProtectedAutocarResumeState({ human_state: ' PAUSED ', paused_by_source: ' AUTOCAR_HANDOFF ' }), true);
  assert.equal(isProtectedAutocarResumeState({ human_state: 'human_active', paused_by_source: 'inbox' }), false);
});

test('loja não pode retomar handoff protegido', () => {
  const decision = evaluateAutocarResumeRequest({
    runtime: protectedState,
    actorRole: 'store',
    resumeReason: 'Motivo suficientemente detalhado',
    confirmed: true
  });
  assert.equal(decision.allowed, false);
  if (!decision.allowed) assert.equal(decision.status, 403);
});

test('Master precisa de motivo e confirmação estrita no handoff protegido', () => {
  const missingReason = evaluateAutocarResumeRequest({
    runtime: protectedState,
    actorRole: 'master',
    resumeReason: 'curto',
    confirmed: true
  });
  assert.equal(missingReason.allowed, false);
  if (!missingReason.allowed) assert.equal(missingReason.status, 400);

  const stringConfirmation = evaluateAutocarResumeRequest({
    runtime: protectedState,
    actorRole: 'master',
    resumeReason: 'Retomada autorizada pelo Master',
    confirmed: 'true'
  });
  assert.equal(stringConfirmation.allowed, false);
  if (!stringConfirmation.allowed) assert.equal(stringConfirmation.status, 400);
});

test('Master pode retomar handoff protegido com motivo e confirmação explícitos', () => {
  const decision = evaluateAutocarResumeRequest({
    runtime: protectedState,
    actorRole: ' master ',
    resumeReason: ' Retomada autorizada pelo Master ',
    confirmed: true
  });
  assert.equal(decision.allowed, true);
  if (decision.allowed) {
    assert.equal(decision.protectedResume, true);
    assert.equal(decision.resumeReason, 'Retomada autorizada pelo Master');
  }
});

test('estado paused por handoff continua protegido', () => {
  const decision = evaluateAutocarResumeRequest({
    runtime: { human_state: 'paused', paused_by_source: 'autocar_handoff' },
    actorRole: 'master',
    resumeReason: 'Retomada após revisão humana',
    confirmed: true
  });
  assert.equal(decision.allowed, true);
});

test('retomada humana normal mantém compatibilidade para Gestor da loja', () => {
  const decision = evaluateAutocarResumeRequest({
    runtime: { human_state: 'human_active', paused_by_source: 'inbox' },
    actorRole: 'store'
  });
  assert.equal(decision.allowed, true);
  if (decision.allowed) {
    assert.equal(decision.protectedResume, false);
    assert.equal(decision.resumeReason, AUTOCAR_DEFAULT_RESUME_REASON);
  }
});

test('retomada concorrente ou repetida falha quando runtime já está ativo', () => {
  const decision = evaluateAutocarResumeRequest({
    runtime: { human_state: 'autocar_active', paused_by_source: null },
    actorRole: 'master'
  });
  assert.equal(decision.allowed, false);
  if (!decision.allowed) assert.equal(decision.status, 409);
});

test('migration exige trilha imutável, trava de banco e RPC atômica service-role only', () => {
  const sql = readFileSync('supabase/migrations/20260823084500_harden_autocar_protected_resume_governance.sql', 'utf8');
  assert.match(sql, /create table if not exists public\.ai_runtime_resume_audit/);
  assert.match(sql, /before update or delete on public\.ai_runtime_resume_audit/);
  assert.match(sql, /for update;/i);
  assert.match(sql, /current_setting\('autocar\.protected_resume_authorized'/);
  assert.match(sql, /set_config\('autocar\.protected_resume_authorized', '1', true\)/);
  assert.match(sql, /new\.human_state = 'autocar_active'/);
  assert.match(sql, /new\.paused_by_source := old\.paused_by_source/);
  assert.match(sql, /v_role <> 'master'/);
  assert.match(sql, /p_confirmed is not true/);
  assert.match(sql, /insert into public\.ai_runtime_resume_audit/);
  assert.match(sql, /revoke all on function public\.resume_autocar_conversation_audited/);
  assert.match(sql, /grant execute on function public\.resume_autocar_conversation_audited[\s\S]*to service_role/);
});
