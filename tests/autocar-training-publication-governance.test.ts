import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const migration = readFileSync('supabase/migrations/20260822151932_autocar_training_publication_governance.sql', 'utf8');
const route = readFileSync('src/app/api/master/autocar/training/route.ts', 'utf8');
const ui = readFileSync('src/components/MasterAutocarTrainingLab.tsx', 'utf8');
const governance = readFileSync('src/lib/server/autocar/trainingPublicationGovernance.ts', 'utf8');
const trainingLab = readFileSync('src/lib/server/autocar/trainingLab.ts', 'utf8');
const safeErrors = readFileSync('src/lib/safeErrorMessage.ts', 'utf8');

test('migration cria publication gate com default fail-closed', () => {
  assert.match(migration, /publication_status text not null default 'unpublished'/);
  assert.match(migration, /s\.status = 'approved'/);
  assert.match(migration, /s\.publication_status = 'published'/);
});

test('migration despublica automaticamente quando conteudo publicado e editado', () => {
  assert.match(migration, /autocar_training_unpublish_on_content_change/);
  assert.match(migration, /new\.status := 'draft'/);
  assert.match(migration, /new\.publication_status := 'unpublished'/);
});

test('API salva cenarios sempre como draft e revisao nunca publica aprendizado automaticamente', () => {
  assert.match(route, /status: 'draft'/);
  assert.match(route, /saveAsLearning: false/);
  assert.match(route, /confirmation[^\n]+PUBLICAR_GLOBAL/);
});

test('rascunho nao depende de embedding e aprovacao prepara embedding antes de aprovar', () => {
  assert.match(trainingLab, /status,\n\s+embedding: null,/);
  assert.match(trainingLab, /export async function prepareTrainingScenarioForApproval/);
  assert.match(route, /const preparation = await prepareTrainingScenarioForApproval\(scenarioId, context\.profile\.id\);/);
  assert.match(route, /expectedVersion: preparation\.version/);
  assert.match(route, /expectedUpdatedAt: preparation\.updated_at/);
});

test('preparacao do embedding falha se o aprendizado mudar durante a chamada externa', () => {
  assert.match(trainingLab, /select\('id,scope,situation,intent,ideal_response,objective,next_action,restrictions,tags,examples,priority,status,version,updated_at'\)/);
  assert.match(trainingLab, /\.eq\('version', expectedVersion\)/);
  assert.match(trainingLab, /\.eq\('updated_at', expectedUpdatedAt\)/);
  assert.match(trainingLab, /foi alterado enquanto o embedding era gerado/);
});

test('aprovacao usa compare-and-swap e falha se versao ou updated_at mudarem', () => {
  assert.match(governance, /export type TrainingApprovalGuard/);
  assert.match(governance, /\.eq\('version', guard\.expectedVersion\)/);
  assert.match(governance, /\.eq\('updated_at', guard\.expectedUpdatedAt\)/);
  assert.match(governance, /foi alterado durante a aprovação/);
});

test('publicacao exige aprendizado aprovado e embedding valido', () => {
  assert.match(governance, /current\.status !== 'approved'/);
  assert.match(governance, /Apenas aprendizado aprovado pode ser publicado/);
  assert.match(governance, /if \(!current\.embedding\)/);
  assert.match(governance, /não possui embedding válido/);
});

test('erros estruturados sao convertidos para mensagem textual segura', () => {
  assert.match(route, /safeErrorMessage\(error/);
  assert.match(safeErrors, /for \(const key of \['message', 'error', 'details', 'description', 'hint'\]\)/);
  assert.doesNotMatch(route, /error\?\.message \|\| error/);
});

test('tela Master inicia criacao a partir de simulacao com opt-in desmarcado', () => {
  assert.match(ui, /useState\(false\)/);
  assert.match(ui, /Sempre salva como rascunho/);
  assert.match(ui, /RASCUNHO/);
  assert.match(ui, /APROVAR/);
  assert.match(ui, /PUBLICAR/);
});
