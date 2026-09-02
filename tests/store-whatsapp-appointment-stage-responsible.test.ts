import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { isStoreLeadAppointmentType } from '../src/lib/storeLeadAppointments.ts';

const wrapper = readFileSync('src/components/WhatsappCommerceActions.tsx', 'utf8');
const baseActions = readFileSync('src/components/WhatsappCommerceActionsBase.tsx', 'utf8');
const taskRoute = readFileSync('src/app/api/store/lead-task/route.ts', 'utf8');
const responsibleRoute = readFileSync('src/app/api/store/lead-responsible/route.ts', 'utf8');

function section(source: string, start: string, end: string) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex);
  assert.notEqual(startIndex, -1, `Trecho inicial não encontrado: ${start}`);
  assert.notEqual(endIndex, -1, `Trecho final não encontrado: ${end}`);
  return source.slice(startIndex, endIndex);
}

test('Test-Drive e visita são os tipos comerciais que usam agendamento seguro', () => {
  assert.equal(isStoreLeadAppointmentType('test_drive'), true);
  assert.equal(isStoreLeadAppointmentType('confirm_visit'), true);
  assert.equal(isStoreLeadAppointmentType('call_back'), false);
  assert.equal(isStoreLeadAppointmentType('follow_up'), false);
  assert.match(baseActions, /\{ key: 'test_drive', label: 'Test-Drive' \}/);
});

test('rota do Inbox delega Test-Drive e visita ao fluxo seguro antes de criar tarefa', () => {
  const appointmentBranch = section(
    taskRoute,
    '    if (isStoreLeadAppointmentType(taskType)) {',
    '\n\n    const availability = await checkStoreAvailability'
  );
  const branchIndex = taskRoute.indexOf('if (isStoreLeadAppointmentType(taskType))');
  const insertIndex = taskRoute.indexOf(".from('store_calendar_tasks').insert");

  assert.match(taskRoute, /POST as runSecurePipelineAction/);
  assert.match(appointmentBranch, /command: 'schedule'/);
  assert.match(appointmentBranch, /slug: store\.slug/);
  assert.match(appointmentBranch, /lead_id: lead\.id/);
  assert.match(appointmentBranch, /notes: appointmentNotes/);
  assert.match(appointmentBranch, /return runSecurePipelineAction\(secureRequest\)/);
  assert.doesNotMatch(appointmentBranch, /store_calendar_tasks|\.insert\(/);
  assert.ok(branchIndex > -1 && insertIndex > -1 && branchIndex < insertIndex);
});

test('tarefas comuns permanecem no fluxo existente sem mudança automática de etapa', () => {
  assert.match(taskRoute, /const availability = await checkStoreAvailability/);
  assert.match(taskRoute, /from\('store_calendar_tasks'\)\.insert/);
  assert.match(taskRoute, /last_activity_type: 'task_created'/);
  assert.match(taskRoute, /to_status: lead\.status \|\| null/);
});

test('responsável é consultado por assigned_user_id com autorização e isolamento da loja', () => {
  assert.match(responsibleRoute, /authorizeStorePortal\(request, slug\)/);
  assert.match(responsibleRoute, /select\('id, assigned_store_id, assigned_user_id'\)/);
  assert.match(responsibleRoute, /canAccessStoreLead\(context\.profile, context\.role, lead\)/);
  assert.match(responsibleRoute, /eq\('id', lead\.assigned_user_id\)/);
  assert.match(responsibleRoute, /eq\('store_id', context\.store\.id\)/);
  assert.match(responsibleRoute, /select\('full_name, role'\)/);
  assert.doesNotMatch(responsibleRoute, /\.(?:insert|update|delete|rpc)\(/);
  assert.match(responsibleRoute, /Cache-Control': 'private, no-store, max-age=0'/);
});

test('Inbox mostra nome do responsável e fallback sem ampliar os dados retornados', () => {
  assert.match(wrapper, /\/api\/store\/lead-responsible/);
  assert.doesNotMatch(wrapper, /\/api\/store\/lead-transfer/);
  assert.match(wrapper, /Responsável: indisponível/);
  assert.match(wrapper, /Responsável: carregando\.\.\./);
  assert.match(wrapper, /Carteira geral da loja/);
  assert.match(wrapper, /aria-label=\{responsibleLabel\}/);
  assert.match(wrapper, /<UsersRound/);
  assert.match(wrapper, /requestId !== requestRef\.current/);
  assert.match(wrapper, /<WhatsappCommerceActionsBase/);
  assert.match(wrapper, /aria-label="Agendar visita à loja"/);
  assert.match(wrapper, /task_type: 'confirm_visit'/);
  assert.match(wrapper, /a visita aparecerá uma única vez no calendário/);
  assert.doesNotMatch(responsibleRoute, /email|phone|photo_url/);
});

test('mensagem do fluxo legado é normalizada para confirmar a movimentação para Agendado', () => {
  assert.match(wrapper, /Agendamento criado: tarefa adicionada ao calendário\./);
  assert.match(wrapper, /Agendamento salvo\. Lead movido para Agendado\./);
  assert.match(wrapper, /onRefresh=\{refreshWithResponsible\}/);
});
