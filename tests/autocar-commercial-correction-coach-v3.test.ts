import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { minimizeCommercialCoachTextV3 } from '../src/lib/server/autocar/commercialTrainingCoachV3';

const ui = readFileSync('src/components/MasterAutocarCommercialCorrectionCoachV3.tsx', 'utf8');
const route = readFileSync('src/app/api/master/autocar/training/correction-preview/route.ts', 'utf8');
const page = readFileSync('src/app/master/autocar/training/page.tsx', 'utf8');

test('treinamento principal seleciona resposta AUTOCAR e edita somente uma cópia', () => {
  assert.match(page, /MasterAutocarCommercialCorrectionCoachV3/);
  assert.match(ui, /const selectable = item\.is_autocar/);
  assert.match(ui, /Clique para corrigir uma cópia/);
  assert.match(ui, /Sua correção · edite como gostaria que a AUTOCAR respondesse/);
  assert.match(ui, /Original · imutável/);
  assert.match(ui, /não altera nem sobrescreve a mensagem histórica original/);
});

test('preview compara original, correção e nova resposta sem persistência', () => {
  assert.match(ui, /Original → sua correção → nova resposta/);
  assert.match(ui, /Comparar, aprender técnica e retestar/);
  assert.match(ui, /external_execution=false · persistence=false/);
  assert.match(route, /historical_message_immutable: true/);
  assert.match(route, /external_execution: false/);
  assert.match(route, /persistence: false/);
});

test('endpoint de correção valida resposta AUTOCAR exata e o inbound imediatamente anterior', () => {
  assert.match(route, /autocar_message_id/);
  assert.match(route, /isAutocarOutbound\(selected\)/);
  assert.match(route, /Não foi encontrada uma fala do cliente antes dessa resposta da AUTOCAR/);
  assert.match(route, /não é a primeira resposta direta da AUTOCAR após a fala anterior do cliente/);
  assert.match(route, /loadAutocarReplayMessagesV2/);
});

test('endpoint de correção não contém escrita em Supabase nem execução externa', () => {
  assert.doesNotMatch(route, /\.insert\(/);
  assert.doesNotMatch(route, /\.update\(/);
  assert.doesNotMatch(route, /\.upsert\(/);
  assert.doesNotMatch(route, /\.delete\(/);
  assert.doesNotMatch(route, /sendEvolution/i);
  assert.doesNotMatch(route, /webhook/i);
});

test('Coach minimiza identificadores pessoais antes do modelo', () => {
  const minimized = minimizeCommercialCoachTextV3('Meu CPF 123.456.789-00, telefone (61) 99999-8888 e email teste@exemplo.com.');
  assert.doesNotMatch(minimized, /123\.456\.789-00/);
  assert.doesNotMatch(minimized, /99999-8888/);
  assert.doesNotMatch(minimized, /teste@exemplo\.com/);
  assert.match(minimized, /\[CPF\]/);
  assert.match(minimized, /\[TELEFONE\]/);
  assert.match(minimized, /\[EMAIL\]/);
});

test('correção é exemplo não vinculante para extração da técnica', () => {
  assert.match(route, /corrected_response_is_non_binding_example: true/);
  assert.match(route, /referenceResponse: minimizedCorrection \|\| null/);
  assert.match(route, /structureCommercialCoachingV3/);
});
