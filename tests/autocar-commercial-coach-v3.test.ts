import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
  AUTOCAR_COMMERCIAL_COACH_PREVIEW_BRANCH,
  evaluateCommercialTrainingCoachPreviewScope
} from '../src/lib/server/autocar/commercialTrainingCoachV3';
import { selectRelevantTraining, trainingSelectionReport } from '../src/lib/server/autocar/contextEngineV2';

const routeSource = fs.readFileSync(path.join(process.cwd(), 'src/app/api/master/autocar/training/route.ts'), 'utf8');
const uiSource = fs.readFileSync(path.join(process.cwd(), 'src/components/MasterAutocarCommercialTrainingV3.tsx'), 'utf8');
const coachSource = fs.readFileSync(path.join(process.cwd(), 'src/lib/server/autocar/commercialTrainingCoachV3.ts'), 'utf8');
const intelligenceSource = fs.readFileSync(path.join(process.cwd(), 'src/lib/server/autocar/intelligenceCore.ts'), 'utf8');

test('seleção V3 reserva precedência Master e permite complemento da loja correta', () => {
  const rows = [
    { id: 'store-hot', scope: 'store', store_id: 'store-1', similarity: 0.99 },
    { id: 'other-store', scope: 'store', store_id: 'store-2', similarity: 0.98 },
    { id: 'master-a', scope: 'global', store_id: null, similarity: 0.91 },
    { id: 'master-b', scope: 'global', store_id: null, similarity: 0.82 },
    { id: 'master-c', scope: 'global', store_id: null, similarity: 0.75 }
  ];
  const selected = selectRelevantTraining(rows, 'store-1');
  assert.deepEqual(selected.map((row: any) => row.id), ['master-a', 'master-b', 'store-hot']);
  assert.equal(selected.some((row: any) => row.id === 'other-store'), false);
});

test('seleção V3 usa treinamentos da loja quando não existe Master relevante sem vazar outra loja', () => {
  const rows = [
    { id: 'local-a', scope: 'store', store_id: 'store-1', similarity: 0.92 },
    { id: 'local-b', scope: 'store', store_id: 'store-1', similarity: 0.83 },
    { id: 'foreign', scope: 'store', store_id: 'store-2', similarity: 0.99 },
    { id: 'irrelevant-master', scope: 'global', store_id: null, similarity: 0.4 }
  ];
  const selected = selectRelevantTraining(rows, 'store-1');
  assert.deepEqual(selected.map((row: any) => row.id), ['local-a', 'local-b']);
  assert.equal(selected.some((row: any) => row.id === 'foreign'), false);
});

test('relatório de seleção torna a precedência Global/Master auditável', () => {
  const rows = [
    { id: 'g', scope: 'global', similarity: 0.9 },
    { id: 's', scope: 'store', store_id: 'store-1', similarity: 0.9 },
    { id: 'x', scope: 'store', store_id: 'store-2', similarity: 0.9 }
  ];
  const selected = selectRelevantTraining(rows, 'store-1');
  const report = trainingSelectionReport(rows, selected, 'store-1');
  assert.deepEqual(report.precedence, ['global_master', 'store_complementary']);
  assert.equal(report.selected_global, 1);
  assert.equal(report.selected_store, 1);
  assert.equal(report.excluded_other_store, 1);
});

test('Coach de conversas reais é fail-closed fora do Preview exato autorizado', () => {
  assert.equal(evaluateCommercialTrainingCoachPreviewScope({
    vercelEnv: 'preview', gitRef: AUTOCAR_COMMERCIAL_COACH_PREVIEW_BRANCH
  }).allowed, true);
  assert.equal(evaluateCommercialTrainingCoachPreviewScope({
    vercelEnv: 'production', gitRef: AUTOCAR_COMMERCIAL_COACH_PREVIEW_BRANCH
  }).allowed, false);
  assert.equal(evaluateCommercialTrainingCoachPreviewScope({
    vercelEnv: 'preview', gitRef: 'main'
  }).allowed, false);
});

test('Coach transforma feedback em técnica e declara ausência de persistência/execução externa', () => {
  assert.match(coachSource, /Transforme a orientação do treinador humano em uma técnica comercial reutilizável/);
  assert.match(coachSource, /technique descreve como raciocinar e conduzir; não escreva uma fala pronta/);
  assert.match(coachSource, /external_execution: false/);
  assert.match(coachSource, /persistence: false/);
});

test('rotas de Coach Preview exigem guard da branch e expõem fluxo read-only', () => {
  for (const action of ['coach-stores-preview', 'coach-conversations-preview', 'coach-conversation-preview', 'coach-retest-real-preview']) {
    assert.match(routeSource, new RegExp(`action === '${action}'`));
  }
  const coachStart = routeSource.indexOf("if (action === 'coach-stores-preview')");
  const syntheticStart = routeSource.indexOf("if (action === 'simulate-v3-preview')", coachStart);
  const coachRoutes = routeSource.slice(coachStart, syntheticStart);
  assert.match(coachRoutes, /assertCommercialTrainingCoachPreviewScope\(\)/);
  assert.doesNotMatch(coachRoutes, /\.insert\(/);
  assert.doesNotMatch(coachRoutes, /\.update\(/);
  assert.doesNotMatch(coachRoutes, /\.upsert\(/);
  assert.doesNotMatch(coachRoutes, /\.delete\(/);
  assert.doesNotMatch(coachRoutes, /sendEvolution/);
});

test('UI promove conversa real como fluxo principal e mantém salvar bloqueado', () => {
  assert.match(uiSource, /Treinar com Conversas Reais/);
  assert.match(uiSource, /Ensine em linguagem normal/);
  assert.match(uiSource, /Antes × aprendizado × depois/);
  assert.match(uiSource, /Salvar aprendizado · bloqueado/);
  assert.match(uiSource, /Preview read-only · sem gravação/);
});

test('inteligência declara precedência Global Master sobre Loja no contexto serializado', () => {
  assert.match(intelligenceSource, /commercial_training_precedence: \['global_master', 'store_complementary'\]/);
  assert.match(intelligenceSource, /PRECEDÊNCIA DETERMINÍSTICA/);
  assert.match(intelligenceSource, /ignore a parte conflitante do treinamento de Loja/);
});
