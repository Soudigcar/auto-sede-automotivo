import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  AUTOCAR_DEFAULT_RESUME_REASON,
  AUTOCAR_PROTECTED_RESUME_MIN_REASON_LENGTH,
  AUTOCAR_RESUME_AUDIT_SOURCE,
  buildAutocarResumeSuccessMessage,
  evaluateAutocarResumeRequest,
  isAutocarResumeAuditReplayMatch,
  isProtectedAutocarResumeState,
  normalizeAutocarResumeRequestId
} from '../src/lib/autocar/resumeGovernance.ts';

const route = readFileSync('src/app/api/store/portal/autocar/runtime/route.ts', 'utf8');
const component = readFileSync('src/components/AutocarCopilotInline.tsx', 'utf8');
const protectedState = { human_state: 'human_active', paused_by_source: 'autocar_handoff' };
const requestId = '8d1a6ccb-391f-4ad3-b6f8-97d69f548876';

function audit(overrides: Record<string, unknown> = {}) {
  return {
    id: '5bdbf94b-37f7-434b-a5f1-c5c85f082267',
    request_id: requestId,
    store_id: '239755c3-a2d4-4cdd-9502-f1595031c924',
    production_conversation_id: '0e7218c4-993e-43f8-ba1e-43b7d91e581a',
    actor_profile_id: '6223ce5c-08e3-46f6-9b17-8e2e6d5d54d3',
    actor_role: 'master',
    resume_source: AUTOCAR_RESUME_AUDIT_SOURCE,
    protected_resume: true,
    ...overrides
  };
}

const replayContext = {
  requestId,
  storeId: '239755c3-a2d4-4cdd-9502-f1595031c924',
  productionConversationId: '0e7218c4-993e-43f8-ba1e-43b7d91e581a',
  actorProfileId: '6223ce5c-08e3-46f6-9b17-8e2e6d5d54d3',
  actorRole: 'master',
  resumeSource: AUTOCAR_RESUME_AUDIT_SOURCE
};

test('detecta autocar_handoff protegido com normalização', () => {
  assert.equal(isProtectedAutocarResumeState(protectedState), true);
  assert.equal(isProtectedAutocarResumeState({ human_state: ' PAUSED ', paused_by_source: ' AUTOCAR_HANDOFF ' }), true);
  assert.equal(isProtectedAutocarResumeState({ human_state: 'human_active', paused_by_source: 'inbox' }), false);
});

test('Gestor não pode retomar handoff protegido', () => {
  const decision = evaluateAutocarResumeRequest({
    runtime: protectedState,
    actorRole: 'store',
    resumeReason: 'Motivo suficientemente detalhado',
    confirmed: true
  });
  assert.equal(decision.allowed, false);
  if (!decision.allowed) {
    assert.equal(decision.status, 403);
    assert.match(decision.error, /somente o Master/);
  }
});

test('Master precisa de motivo mínimo e confirmação booleana estrita', () => {
  const shortReason = evaluateAutocarResumeRequest({
    runtime: protectedState,
    actorRole: 'master',
    resumeReason: 'curto',
    confirmed: true
  });
  assert.equal(shortReason.allowed, false);
  if (!shortReason.allowed) assert.equal(shortReason.status, 400);

  const stringConfirmation = evaluateAutocarResumeRequest({
    runtime: protectedState,
    actorRole: 'master',
    resumeReason: 'Retomada autorizada pelo Master',
    confirmed: 'true'
  });
  assert.equal(stringConfirmation.allowed, false);
  if (!stringConfirmation.allowed) assert.equal(stringConfirmation.status, 400);

  const allowed = evaluateAutocarResumeRequest({
    runtime: protectedState,
    actorRole: ' master ',
    resumeReason: ' Retomada autorizada pelo Master ',
    confirmed: true
  });
  assert.equal(allowed.allowed, true);
  if (allowed.allowed) {
    assert.equal(allowed.protectedResume, true);
    assert.equal(allowed.resumeReason, 'Retomada autorizada pelo Master');
  }
});

test('retomada humana normal continua disponível ao Gestor com motivo padrão', () => {
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

test('retomada repetida é recusada quando a conversa já está ativa', () => {
  const decision = evaluateAutocarResumeRequest({
    runtime: { human_state: 'autocar_active', paused_by_source: null },
    actorRole: 'master'
  });
  assert.equal(decision.allowed, false);
  if (!decision.allowed) assert.equal(decision.status, 409);
});

test('request_id aceita somente UUID canônico e normaliza letras', () => {
  assert.equal(normalizeAutocarResumeRequestId(requestId.toUpperCase()), requestId);
  assert.equal(normalizeAutocarResumeRequestId('não-é-uuid'), null);
  assert.equal(normalizeAutocarResumeRequestId(''), null);
});

test('replay idempotente exige o mesmo request, loja, conversa, ator, papel e origem', () => {
  assert.equal(isAutocarResumeAuditReplayMatch(audit(), replayContext), true);
  assert.equal(isAutocarResumeAuditReplayMatch(audit({ actor_profile_id: '33c0e3cb-0090-437d-8f97-e21ed176e9db' }), replayContext), false);
  assert.equal(isAutocarResumeAuditReplayMatch(audit({ production_conversation_id: '97126557-1336-456b-91c1-e459af5f9bad' }), replayContext), false);
  assert.equal(isAutocarResumeAuditReplayMatch(audit({ actor_role: 'store' }), replayContext), false);
  assert.equal(isAutocarResumeAuditReplayMatch(audit({ resume_source: 'outro_fluxo' }), replayContext), false);
});

test('mensagem de sucesso respeita o modo efetivo e não promete AUTOPILOT no COPILOT ou OFF', () => {
  const autopilot = buildAutocarResumeSuccessMessage({ runtime: { effective_mode: 'autopilot' }, protectedResume: true });
  const copilot = buildAutocarResumeSuccessMessage({ runtime: { effective_mode: 'copilot' } });
  const off = buildAutocarResumeSuccessMessage({ runtime: { effective_mode: 'off' }, idempotentReplay: true });
  assert.match(autopilot, /SAFE CORE/);
  assert.match(copilot, /COPILOT, sem envio automático/);
  assert.doesNotMatch(copilot, /poderá ser atendida automaticamente/);
  assert.match(off, /OFF e não enviará respostas automáticas/);
});

test('rota mantém tenant e carteira, usa apenas a RPC auditada e trata retry concorrente', () => {
  assert.match(route, /authorizeStorePortal/);
  assert.match(route, /canAccessStoreConversation/);
  assert.match(route, /can_resume_protected: context\.role === 'master'/);
  assert.match(route, /protected_resume_required: isProtectedAutocarResumeState/);
  assert.match(route, /from\('ai_runtime_resume_audit'\)/);
  assert.match(route, /rpc\('resume_autocar_conversation_audited'/);
  assert.match(route, /p_request_id: requestId/);
  assert.match(route, /idempotent_replay: true/);
  assert.match(route, /readResumeAudit\(autocar, requestId\)/);
  assert.match(route, /String\(replayRuntime\.data\?\.human_state \|\| ''\) === 'autocar_active'/);
  assert.doesNotMatch(route, /resumeAutocarConversation/);
});

test('rota falha fechada quando a governança não existe no ambiente', () => {
  assert.match(route, /PGRST202/);
  assert.match(route, /PGRST205/);
  assert.match(route, /42P01/);
  assert.match(route, /status: 503/);
  assert.match(route, /governança auditada de retomada ainda não está disponível/);
});

test('interface separa retomada normal, bloqueio do Gestor e confirmação protegida do Master', () => {
  assert.match(component, /protected_resume_required/);
  assert.match(component, /can_resume_protected/);
  assert.match(component, /somente o Master pode devolver esta conversa/);
  assert.match(component, /role="dialog" aria-label="Confirmar retomada protegida da AUTOCAR"/);
  assert.match(component, /resume_reason: protectedResume \? reason : undefined/);
  assert.match(component, /confirm_protected_resume: protectedResume \? resumeConfirmed : false/);
  assert.match(component, /request_id: requestId/);
  assert.match(component, /maxLength=\{500\}/);
  assert.match(component, /type="checkbox" checked=\{resumeConfirmed\}/);
  assert.match(component, /AUTOCAR_PROTECTED_RESUME_MIN_REASON_LENGTH/);
  assert.match(component, /humanActive && canManageAutocar && !protectedResume/);
  assert.doesNotMatch(component, /A próxima mensagem do cliente poderá voltar ao AUTOPILOT/);
});

test('limite do motivo protegido permanece alinhado entre helper e interface', () => {
  assert.equal(AUTOCAR_PROTECTED_RESUME_MIN_REASON_LENGTH, 12);
  assert.match(component, /caracteres mínimos/);
});
