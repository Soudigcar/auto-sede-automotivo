import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const scheduleBridge = readFileSync('src/components/StorePipelineScheduleUxBridge.tsx', 'utf8');
const newLeadBridge = readFileSync('src/components/StorePipelineNewLeadScheduleButton.tsx', 'utf8');
const saleBridge = readFileSync('src/components/StorePipelineSaleActionBridge.tsx', 'utf8');
const pipelinePage = readFileSync('src/app/loja/[slug]/pipeline/page.tsx', 'utf8');

test('cards atuais da Pipeline continuam marcados como v2', () => {
  assert.match(pipelinePage, /data-pipeline-card-v2="true"/);
});

test('bridge de agendamento não reestiliza nem intercepta card v2', () => {
  assert.match(scheduleBridge, /if \(isPipelineCardV2\(card\)\) return;/);
  assert.match(scheduleBridge, /const card = button\.closest<HTMLElement>\('\[data-lead-id\]'\);\s*if \(isPipelineCardV2\(card\)\) return;/s);
});

test('bridges de Agendar e Venda não injetam ações em card v2', () => {
  assert.match(newLeadBridge, /if \(isPipelineCardV2\(card\)\) return;/);
  assert.match(saleBridge, /if \(isPipelineCardV2\(card\)\) return;/);
});

test('ações legadas pré-existentes são removidas de card v2 ao normalizar', () => {
  assert.match(newLeadBridge, /isPipelineCardV2\(card\).*button\.remove\(\)/s);
  assert.match(saleBridge, /isPipelineCardV2\(card\).*button\.remove\(\)/s);
});
