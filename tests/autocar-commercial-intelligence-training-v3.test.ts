import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
  AUTOCAR_COMMERCIAL_TRAINING_PREFIX,
  buildCommercialTrainingEmbeddingTextV3,
  commercialTrainingV3Instructions,
  decodeCommercialTrainingV3Envelope,
  encodeCommercialTrainingV3Envelope,
  normalizeCommercialTrainingScenarioV3,
  resolveCommercialTrainingScopeV3
} from '../src/lib/server/autocar/commercialTrainingV3';

const fixturePath = path.join(process.cwd(), 'tests/fixtures/autocar-commercial-training-v3.synthetic.json');
const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
const trainingLabSource = fs.readFileSync(path.join(process.cwd(), 'src/lib/server/autocar/trainingLab.ts'), 'utf8');
const intelligenceSource = fs.readFileSync(path.join(process.cwd(), 'src/lib/server/autocar/intelligenceCore.ts'), 'utf8');
const routeSource = fs.readFileSync(path.join(process.cwd(), 'src/app/api/master/autocar/training/route.ts'), 'utf8');
const uiSource = fs.readFileSync(path.join(process.cwd(), 'src/components/MasterAutocarCommercialTrainingV3.tsx'), 'utf8');

test('V3 armazena técnica estruturada e exemplo de resposta como referência não vinculante', () => {
  const encoded = encodeCommercialTrainingV3Envelope({
    technique: fixture.technique,
    referenceResponse: fixture.reference_response
  });
  assert.equal(encoded.startsWith(AUTOCAR_COMMERCIAL_TRAINING_PREFIX), true);
  const decoded = decodeCommercialTrainingV3Envelope(encoded);
  assert.equal(decoded?.version, 3);
  assert.equal(decoded?.technique, fixture.technique);
  assert.equal(decoded?.reference_response, fixture.reference_response);
});

test('V3 valida isolamento entre escopo global e escopo de loja', () => {
  assert.deepEqual(resolveCommercialTrainingScopeV3('global', null), { scope: 'global', storeId: null });
  assert.deepEqual(resolveCommercialTrainingScopeV3('store', 'synthetic-store-01'), { scope: 'store', storeId: 'synthetic-store-01' });
  assert.throws(() => resolveCommercialTrainingScopeV3('store', null), /exige uma loja identificada/);
  assert.throws(() => resolveCommercialTrainingScopeV3('global', 'synthetic-store-01'), /não pode carregar identificador de loja/);
});

test('V3 normaliza técnica, objetivo, restrições, próximo movimento e exemplos', () => {
  const encoded = encodeCommercialTrainingV3Envelope({ technique: fixture.technique, referenceResponse: fixture.reference_response });
  const guidance = normalizeCommercialTrainingScenarioV3({
    id: 'synthetic-training-01',
    scope: fixture.scope,
    store_id: fixture.store_id,
    situation: fixture.situation,
    intent: fixture.intent,
    ideal_response: encoded,
    objective: fixture.objective,
    next_action: fixture.next_action,
    restrictions: fixture.restrictions,
    examples: fixture.examples,
    tags: ['synthetic'],
    similarity: 0.91
  });
  assert.equal(guidance.training_version, 3);
  assert.equal(guidance.technique, fixture.technique);
  assert.deepEqual(guidance.avoid, fixture.restrictions);
  assert.equal(guidance.preferred_next_move, fixture.next_action);
  assert.equal(guidance.reference_response, fixture.reference_response);
});

test('cenários legados continuam compatíveis, mas resposta antiga vira apenas referência', () => {
  const guidance = normalizeCommercialTrainingScenarioV3({
    id: 'legacy-synthetic',
    scope: 'global',
    situation: 'Cliente pede informação.',
    ideal_response: 'Uma resposta histórica de exemplo.',
    objective: 'Responder e descobrir contexto.',
    next_action: 'Fazer uma pergunta curta.'
  });
  assert.equal(guidance.training_version, 'legacy');
  assert.equal(guidance.reference_response, 'Uma resposta histórica de exemplo.');
  assert.match(guidance.technique, /apenas como exemplo de estratégia/);
});

test('embedding V3 prioriza a técnica e marca resposta como exemplo não vinculante', () => {
  const encoded = encodeCommercialTrainingV3Envelope({ technique: fixture.technique, referenceResponse: fixture.reference_response });
  const text = buildCommercialTrainingEmbeddingTextV3({
    scope: 'global',
    situation: fixture.situation,
    intent: fixture.intent,
    ideal_response: encoded,
    objective: fixture.objective,
    next_action: fixture.next_action,
    restrictions: fixture.restrictions,
    examples: fixture.examples
  });
  assert.match(text, /Técnica comercial:/);
  assert.match(text, /Objetivo comercial:/);
  assert.match(text, /Evitar:/);
  assert.match(text, /Exemplo de resposta não vinculante:/);
});

test('contrato V3 evita roteiro fixo e convite prematuro', () => {
  const instructions = commercialTrainingV3Instructions();
  assert.match(instructions, /nunca transforma exemplo em resposta fixa/);
  assert.match(instructions, /não autorizam forçar visita ou test-drive/);
  assert.match(instructions, /nunca enfraquecer segurança, regras Master/);
});

test('simulador sintético V3 não persiste e não executa operação externa', () => {
  const previewStart = trainingLabSource.indexOf('export async function simulateCommercialTrainingV3Preview');
  const nextFunction = trainingLabSource.indexOf('export async function simulateTraining', previewStart);
  const previewSource = trainingLabSource.slice(previewStart, nextFunction);
  assert.match(previewSource, /preview_synthetic: true/);
  assert.match(previewSource, /external_execution: false/);
  assert.doesNotMatch(previewSource, /\.from\(/);
  assert.doesNotMatch(previewSource, /\.rpc\(/);
  assert.doesNotMatch(previewSource, /\.insert\(/);
  assert.doesNotMatch(previewSource, /\.update\(/);
});

test('rota expõe reteste V3 separado do fluxo persistente existente', () => {
  assert.match(routeSource, /action === 'simulate-v3-preview'/);
  assert.match(routeSource, /simulateCommercialTrainingV3Preview/);
  assert.match(routeSource, /environment: 'preview-synthetic'/);
});

test('inteligência serializa treinamento no contrato V3 sem raw ideal_response', () => {
  assert.match(intelligenceSource, /commercial_training_version: 3/);
  assert.match(intelligenceSource, /commercial_training_contract: commercialTrainingV3Instructions\(\)/);
  assert.match(intelligenceSource, /approved_training: serializeCommercialTrainingGuidanceV3\(context\.training\)/);
});

test('UI V3 ensina técnica e mantém persistência bloqueada nesta validação', () => {
  assert.match(uiSource, /Treinar técnica, não decorar resposta/);
  assert.match(uiSource, /Técnica \/ forma de condução/);
  assert.match(uiSource, /Exemplo de resposta · opcional e NÃO vinculante/);
  assert.match(uiSource, /Salvar rascunho · bloqueado no Preview/);
  assert.match(uiSource, /Replay \/ Reteste sintético/);
});
