import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const auraTheme = readFileSync('src/components/StorePipelineAuraTheme.tsx', 'utf8');
const cockpit = readFileSync('src/components/StorePipelineCockpitUx.tsx', 'utf8');
const scheduleBridge = readFileSync('src/components/StorePipelineScheduleUxBridge.tsx', 'utf8');
const newLeadBridge = readFileSync('src/components/StorePipelineNewLeadScheduleButton.tsx', 'utf8');
const saleBridge = readFileSync('src/components/StorePipelineSaleActionBridge.tsx', 'utf8');

test('native v2 cards keep their compact presentation after internal navigation', () => {
  assert.match(auraTheme, /\[data-lead-id\]:not\(\[data-pipeline-card-v2="true"\]\)/);
  assert.match(auraTheme, /card\.classList\.remove\('pipeline-aura-lead-card'\)/);
  assert.match(scheduleBridge, /card\.dataset\.pipelineCardV2 === 'true'/);
  assert.match(scheduleBridge, /classList\.remove\('pipeline-card-actions-uniform', 'pipeline-card-action-uniform'\)/);
});

test('legacy action bridges do not inject duplicate actions into native v2 cards', () => {
  assert.match(newLeadBridge, /card\.dataset\.pipelineCardV2 === 'true'/);
  assert.match(saleBridge, /card\.dataset\.pipelineCardV2 === 'true'/);
});

test('desktop metrics are never pulled beneath the fixed top bar', () => {
  assert.doesNotMatch(cockpit, /margin-top:-58px!important/);
  assert.match(cockpit, /\.pipeline-cockpit-host \{ margin-top:0!important; \}/);
});
