import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const migration = readFileSync('supabase/migrations/20260822151932_autocar_training_publication_governance.sql', 'utf8');
const route = readFileSync('src/app/api/master/autocar/training/route.ts', 'utf8');
const ui = readFileSync('src/components/MasterAutocarCommercialTrainingV3.tsx', 'utf8');
const governance = readFileSync('src/lib/server/autocar/trainingPublicationGovernance.ts', 'utf8');
const trainingLab = readFileSync('src/lib/server/autocar/trainingLab.ts', 'utf8');
const safeErrors = readFileSync('src/lib/safeErrorMessage.ts', 'utf8');

test('migration existente mantém publication gate fail-closed', () => {
  assert.match(migration, /publication_status text not null default 'unpublished'/);
  assert.match(migration, /s\.status = 'approved'/);
  assert.match(migration, /s\.publication_status = 'published'/);
});

test('migration existente despublica automaticamente conteúdo publicado quando editado', () => {
  assert.match(migration, /autocar_training_unpublish_on_content_change/);
  assert.match(migration, /new\.status := 'draft'/);
  assert.match(migration, /new\.publication_status := 'unpublished'/);
});

test('API salva cenários sempre como draft e publicação continua explícita por escopo', () => {
  assert.match(route, /status: 'draft'/);
  assert.match(route, /expectedConfirmation = scope === 'store' \? 'PUBLICAR_LOJA' : 'PUBLICAR_GLOBAL'/);
  assert.match(route, /saveAsLearning: false/);
});

test('rascunho não depende de embedding e aprovação prepara embedding antes de aprovar', () => {
  assert.match(trainingLab, /status,\n\s+embedding: null,/);
  assert.match(trainingLab, /export async function prepareTrainingScenarioForApproval/);
  assert.match(route, /const preparation = await prepareTrainingScenarioForApproval\(scenarioId, context\.profile\.id\);/);
  assert.match(route, /expectedVersion: preparation\.version/);
  assert.match(route, /expectedUpdatedAt: preparation\.updated_at/);
});

test('preparação do embedding usa compare-and-swap e preserva escopo', () => {
  assert.match(trainingLab, /select\('id,scope,store_id,situation,intent,ideal_response,objective,next_action,restrictions,tags,examples,priority,status,version,updated_at'\)/);
  assert.match(trainingLab, /\.eq\('version', expectedVersion\)/);
  assert.match(trainingLab, /\.eq\('updated_at', expectedUpdatedAt\)/);
  assert.match(trainingLab, /applyTrainingTarget\(updateQuery, target\)/);
  assert.match(trainingLab, /foi alterado enquanto o embedding era gerado/);
});

test('aprovação usa compare-and-swap e valida alvo global ou loja', () => {
  assert.match(governance, /export type TrainingApprovalGuard/);
  assert.match(governance, /expectedScope\?: AutocarTrainingScope/);
  assert.match(governance, /\.eq\('version', guard\.expectedVersion\)/);
  assert.match(governance, /\.eq\('updated_at', guard\.expectedUpdatedAt\)/);
  assert.match(governance, /applyTarget\(query, target\)/);
  assert.match(governance, /foi alterado durante a aprovação/);
});

test('publicação exige aprendizado aprovado e embedding válido', () => {
  assert.match(governance, /current\.status !== 'approved'/);
  assert.match(governance, /Apenas aprendizado aprovado pode ser publicado/);
  assert.match(governance, /if \(!current\.embedding\)/);
  assert.match(governance, /não possui embedding válido/);
});

test('erros estruturados continuam convertidos para mensagem textual segura', () => {
  assert.match(route, /safeErrorMessage\(error/);
  assert.match(safeErrors, /for \(const key of \['message', 'error', 'details', 'description', 'hint'\]\)/);
  assert.doesNotMatch(route, /error\?\.message \|\| error/);
});

test('tela V3 explicita técnica e mantém gravação bloqueada no Preview autorizado', () => {
  assert.match(ui, /Treinar técnica, não decorar resposta/);
  assert.match(ui, /Exemplo de resposta · opcional e NÃO vinculante/);
  assert.match(ui, /Salvar rascunho · bloqueado no Preview/);
  assert.match(ui, /Preview sintético · sem gravação/);
});
