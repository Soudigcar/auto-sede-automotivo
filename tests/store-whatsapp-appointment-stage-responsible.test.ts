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
    '\n\n    const warning = await readConflictWarning'
  );
  const branchIndex = taskRoute.indexOf('if (isStoreLeadAppointmentType(taskType))');
  const insertIndex = taskRoute.indexOf(".from('store_calendar_tasks').insert");

  assert.match(taskRoute, /POST as runSecurePipelineAction/);
  assert.match(appointmentBranch, /command: 'schedule'/);
  assert.match(appointmentBranch, /slug: store\.slug/);
  assert.match(appointmentBranch, /lead_id: lead\.id/);
  assert.match(appointmentBranch, /notes: appointmentNotes/);
  assert.match(appointmentBranch, /const secureResponse = await runSecurePipelineAction\(secureRequest\)/);
  assert.match(appointmentBranch, /const warning = payload\.warning \|\| null/);
  assert.doesNotMatch(appointmentBranch, /store_calendar_tasks|\.insert\(/);
  assert.ok(branchIndex > -1 && insertIndex > -1 && branchIndex < insertIndex);
});

test('tarefas comuns permanecem no fluxo existente sem mudança automática de etapa', () => {
  assert.match(taskRoute, /const warning = await readConflictWarning\(supabase, store\.id, startsAt, lead\.id\)/);
  assert.match(taskRoute, /from\('store_calendar_tasks'\)\.insert/);
  assert.match(taskRoute, /last_activity_type: 'task_created'/);
  assert.match(taskRoute, /to_status: lead\.status \|\| null/);
});

test('responsáveis são resolvidos em lote por assigned_user_id com autorização e isolamento da loja', () => {
  assert.match(responsibleRoute, /authorizeStorePortal\(request, slug\)/);
  assert.match(responsibleRoute, /singleLeadId/);
  assert.match(responsibleRoute, /batchLeadIds/);
  assert.match(responsibleRoute, /requestedLeadIds/);
  assert.match(responsibleRoute, /slice\(0, 100\)/);
  assert.match(responsibleRoute, /select\('id, assigned_store_id, assigned_user_id'\)/);
  assert.match(responsibleRoute, /\.in\('id', requestedLeadIds\)/);
  assert.match(responsibleRoute, /canAccessStoreLead\(context\.profile, context\.role, lead\)/);
  assert.match(responsibleRoute, /accessibleLeads\.map/);
  assert.match(responsibleRoute, /lead\.assigned_user_id/);
  assert.match(responsibleRoute, /select\('id, full_name, role'\)/);
  assert.match(responsibleRoute, /\.in\('id', responsibleUserIds\)/);
  assert.match(responsibleRoute, /\.eq\('store_id', context\.store\.id\)/);
  assert.match(responsibleRoute, /responsible: responsibles\[singleLeadId\] \?\? null/);
  assert.doesNotMatch(responsibleRoute, /\.(?:insert|update|delete|rpc)\(/);
  assert.doesNotMatch(responsibleRoute, /email|phone|photo_url/);
  assert.match(responsibleRoute, /Cache-Control': 'private, no-store, max-age=0'/);
});

test('responsável não é mais renderizado como chip dentro da barra de digitação', () => {
  const renderStart = wrapper.indexOf('  return (\n    <div ref={actionBarRef} className="contents">');
  const visitModal = wrapper.indexOf('      {visitOpen ? (', renderStart);
  assert.notEqual(renderStart, -1);
  assert.notEqual(visitModal, -1);
  const composerActions = wrapper.slice(renderStart, visitModal);

  assert.doesNotMatch(wrapper, /UsersRound/);
  assert.doesNotMatch(wrapper, /responsibleLabel/);
  assert.doesNotMatch(composerActions, /Responsável:/);
  assert.doesNotMatch(composerActions, /data-lead-responsible-decoration/);
  assert.match(composerActions, /<WhatsappCommerceActionsBase/);
  assert.match(composerActions, /aria-label="Agendar visita à loja"/);
});

test('wrapper carrega somente conversas permitidas e consulta responsáveis em lote', () => {
  assert.match(wrapper, /\/api\/store-whatsapp\?\$\{listQuery\.toString\(\)\}/);
  assert.match(wrapper, /leadIds\.join\(','\)/);
  assert.match(wrapper, /\/api\/store\/lead-responsible\?\$\{responsibleQuery\.toString\(\)\}/);
  assert.match(wrapper, /Object\.prototype\.hasOwnProperty\.call\(responsibles, leadId\)/);
  assert.match(wrapper, /Carteira geral da loja/);
  assert.match(wrapper, /return 'indisponível'/);
  assert.match(wrapper, /requestId !== responsibleRequestRef\.current/);
});

test('responsável é inserido no cabeçalho ao lado da origem, loja e etapa', () => {
  assert.match(wrapper, /actionBar\.closest\('form'\)/);
  assert.match(wrapper, /conversationPanel\?\.firstElementChild/);
  assert.match(wrapper, /button\[aria-expanded\]/);
  assert.match(wrapper, /texts\.filter\(\(text\) => text === '•'\)\.length >= 2/);
  assert.match(wrapper, /kind === 'header' \? `• Responsável: \$\{label\}` : label/);
  assert.match(wrapper, /data-lead-responsible-decoration/);
  assert.match(wrapper, /font-black text-violet-700/);
});

test('nome do responsável permanece na mesma linha dos chips da conversa', () => {
  assert.match(wrapper, /Fila de atendimento/);
  assert.match(wrapper, /button\.querySelector\('h3'\)/);
  assert.match(wrapper, /phoneDigits\(button\.textContent\)\.includes\(entry\.phoneDigits\)/);
  assert.match(wrapper, /texts\.includes\('whatsapp'\) && texts\.includes\('lead'\)/);
  assert.match(wrapper, /'card'/);
  assert.match(wrapper, /kind === 'header' \? `• Responsável: \$\{label\}` : label/);
  assert.match(wrapper, /badgeRowElement\.style\.flexWrap = 'nowrap'/);
  assert.match(wrapper, /badgeRowElement\.style\.overflow = 'hidden'/);
  assert.match(wrapper, /child\.style\.maxWidth = '110px'/);
  assert.match(wrapper, /child\.style\.textOverflow = 'ellipsis'/);
  assert.match(wrapper, /child\.style\.whiteSpace = 'nowrap'/);
  assert.match(wrapper, /decoration\.textContent = text/);
  assert.doesNotMatch(wrapper, /innerHTML/);
  assert.match(wrapper, /new MutationObserver\(apply\)/);
  assert.match(wrapper, /removeResponsibleDecorations\(root\)/);
});

test('visita continua usando o fluxo seguro e atualiza a apresentação após refresh', () => {
  assert.match(wrapper, /task_type: 'confirm_visit'/);
  assert.match(wrapper, /Agendamento salvo\. Lead movido para Agendado\./);
  assert.match(wrapper, /a visita aparecerá uma única vez no calendário/);
  assert.match(wrapper, /await refreshWithResponsibleContext\(\)/);
  assert.match(wrapper, /onRefresh=\{refreshWithResponsibleContext\}/);
});
