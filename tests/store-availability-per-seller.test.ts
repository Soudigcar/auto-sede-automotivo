import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const availability = readFileSync('src/lib/server/storeAvailability.ts', 'utf8');
const warningHelper = readFileSync('src/lib/storeScheduleWarnings.ts', 'utf8');
const pipelineRoute = readFileSync('src/app/api/store/portal/pipeline/actions/route.ts', 'utf8');
const pipelineUxRoute = readFileSync('src/app/api/store/portal/pipeline/ux-actions/route.ts', 'utf8');
const taskRoute = readFileSync('src/app/api/store/lead-task/route.ts', 'utf8');
const calendarPage = readFileSync('src/app/loja/[slug]/calendario/page.tsx', 'utf8');

test('helper de disponibilidade continua detectando sobreposições e suporta escopo por responsável', () => {
  assert.match(availability, /responsibleUserId\?: string \| null/);
  assert.match(availability, /if \(responsibleUserId\) leadQuery = leadQuery\.eq\('assigned_user_id', responsibleUserId\)/);
  assert.match(availability, /if \(responsibleUserId\) taskQuery = taskQuery\.eq\('created_by', responsibleUserId\)/);
  assert.match(availability, /available: conflicts\.length === 0/);
});

test('aviso compartilhado informa conflito sem linguagem de bloqueio', () => {
  assert.match(warningHelper, /já existe outro Agendamento, Visita ou Tarefa neste horário/);
  assert.match(warningHelper, /foi salvo mesmo assim/);
  assert.doesNotMatch(warningHelper, /Escolha outro horário/);
});

test('pipeline seguro transforma conflito em aviso e não lança erro de horário ocupado', () => {
  assert.match(pipelineRoute, /readScheduleWarning/);
  assert.match(pipelineRoute, /getStoreScheduleConflictWarning\(!availability\.available\)/);
  assert.match(pipelineRoute, /message: warning \? `Agendamento salvo\. \$\{warning\}` : 'Agendamento salvo\.'/);
  assert.match(pipelineRoute, /warning,/);
  assert.doesNotMatch(pipelineRoute, /throw new Error\(`Horário ocupado/);
  assert.doesNotMatch(pipelineRoute, /Escolha outro horário/);
});

test('ux-actions também salva com aviso e não bloqueia conflito', () => {
  assert.match(pipelineUxRoute, /readScheduleWarning/);
  assert.match(pipelineUxRoute, /getStoreScheduleConflictWarning\(!availability\.available\)/);
  assert.match(pipelineUxRoute, /schedule_conflict_warning: Boolean\(warning\)/);
  assert.match(pipelineUxRoute, /warning,/);
  assert.doesNotMatch(pipelineUxRoute, /throw new Error\(`Horário ocupado/);
  assert.doesNotMatch(pipelineUxRoute, /Escolha outro horário/);
});

test('tarefas comuns do lead não retornam 409 por conflito e devolvem aviso', () => {
  assert.match(taskRoute, /const warning = await readConflictWarning/);
  assert.match(taskRoute, /getStoreScheduleConflictWarning\(!availability\.available\)/);
  assert.match(taskRoute, /message: warning \? `Tarefa salva\. \$\{warning\}` : 'Tarefa salva\.'/);
  assert.doesNotMatch(taskRoute, /Horário ocupado por/);
  assert.doesNotMatch(taskRoute, /status: 409[^\n]*Escolha outro horário/);
});

test('calendário permite salvar conflito e mostra aviso após o registro', () => {
  assert.match(calendarPage, /const warning = await readConflictWarning\(start, end\)/);
  assert.doesNotMatch(calendarPage, /if \(occupied\)/);
  assert.doesNotMatch(calendarPage, /Horário ocupado\. Escolha outro horário/);
  assert.match(calendarPage, /setMessage\(warning \? `Tarefa registrada no calendário\. \$\{warning\}` : 'Tarefa registrada no calendário\.'\)/);
  assert.match(calendarPage, /É permitido registrar vários compromissos no mesmo horário/);
  assert.match(calendarPage, /Conflitos geram aviso, sem impedir novos compromissos/);
});
