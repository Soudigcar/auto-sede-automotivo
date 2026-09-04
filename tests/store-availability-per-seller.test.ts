import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const availability = readFileSync('src/lib/server/storeAvailability.ts', 'utf8');
const pipelineRoute = readFileSync('src/app/api/store/portal/pipeline/actions/route.ts', 'utf8');
const taskRoute = readFileSync('src/app/api/store/lead-task/route.ts', 'utf8');

test('agendamento comercial informa o responsável do lead para a disponibilidade', () => {
  assert.match(pipelineRoute, /responsibleUserId\?: string \| null/);
  assert.match(pipelineRoute, /responsibleUserId: responsibleUserId \|\| null/);
  assert.match(
    pipelineRoute,
    /assertScheduleAvailable\(context\.supabase, context\.store\.id, lead\.id, startsAt, lead\.assigned_user_id\)/
  );
});

test('disponibilidade limita conflitos ao mesmo responsável quando ele é informado', () => {
  assert.match(availability, /responsibleUserId\?: string \| null/);
  assert.match(availability, /const responsibleUserId = input\.responsibleUserId \|\| null/);
  assert.match(availability, /if \(responsibleUserId\) leadQuery = leadQuery\.eq\('assigned_user_id', responsibleUserId\)/);
  assert.match(availability, /if \(responsibleUserId\) taskQuery = taskQuery\.eq\('created_by', responsibleUserId\)/);
});

test('sem responsável explícito a trava global da loja permanece como fallback', () => {
  const availabilityCall = taskRoute.match(/const availability = await checkStoreAvailability\(\{([\s\S]*?)\}\);/);
  assert.ok(availabilityCall, 'Chamada de disponibilidade das tarefas comuns não encontrada.');
  assert.doesNotMatch(availabilityCall[1], /responsibleUserId/);
  assert.match(availability, /\.eq\('assigned_store_id', input\.storeId\)/);
  assert.match(availability, /\.eq\('store_id', input\.storeId\)/);
});

test('mensagem de conflito identifica que a ocupação é do responsável', () => {
  assert.match(pipelineRoute, /Horário ocupado no calendário deste responsável/);
});
