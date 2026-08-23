import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  AUTOCAR_DEFAULT_RESUME_REASON,
  evaluateAutocarResumeRequest,
  isProtectedAutocarResumeState
} from '../src/lib/server/autocar/resumeGovernance.ts';

const protectedState = { human_state: 'human_active', paused_by_source: 'autocar_handoff' };
const route = readFileSync('src/app/api/store/portal/autocar/runtime/route.ts', 'utf8');
const sql = readFileSync('supabase/migrations/20260823180000_harden_autocar_protected_resume_governance_v2.sql', 'utf8');

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

test('retomada humana comum permanece compatível para Gestor da loja', () => {
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

test('retomada repetida falha quando runtime já está ativo', () => {
  const decision = evaluateAutocarResumeRequest({
    runtime: { human_state: 'autocar_active', paused_by_source: null },
    actorRole: 'master'
  });
  assert.equal(decision.allowed, false);
  if (!decision.allowed) assert.equal(decision.status, 409);
});

test('rota preserva escopo atual de conversa e usa apenas RPC auditada para resume', () => {
  assert.match(route, /authorizeStorePortal/);
  assert.match(route, /canAccessStoreConversation/);
  assert.match(route, /can_take_over: context\.permissions\.includes\('view_whatsapp'\)/);
  assert.match(route, /can_resume_protected: context\.role === 'master'/);
  assert.match(route, /evaluateAutocarResumeRequest/);
  assert.match(route, /rpc\('resume_autocar_conversation_audited'/);
  assert.doesNotMatch(route, /resumeAutocarConversation\(/);
});

test('migration usa o tenant root do AUTOCAR Production e não public.stores', () => {
  assert.match(sql, /store_id uuid not null references public\.ai_store_refs\(store_id\) on delete restrict/);
  assert.doesNotMatch(sql, /references public\.stores\(id\)/);
  assert.match(sql, /autocar_conversation_id uuid not null references public\.ai_runtime_conversations\(id\)/);
});

test('migration exige trilha imutável, trava de banco e RPC atômica service-role only', () => {
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
