import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const migration = readFileSync('supabase/migrations/20260822151000_autocar_training_publication_governance.sql', 'utf8');
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
  assert.match(route, /await prepareTrainingScenarioForApproval\(scenarioId, context\.profile\.id\);\n\s+const scenario = await approveTrainingScenario/);
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
