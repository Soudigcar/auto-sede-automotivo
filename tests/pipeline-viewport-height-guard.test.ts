import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const source = readFileSync('src/components/StorePipelineViewportHeightGuard.tsx', 'utf8');
const layout = readFileSync('src/app/layout.tsx', 'utf8');

test('pipeline viewport guard targets the outer Aura portal containers on desktop', () => {
  assert.equal(source.includes("const PIPELINE_PATH = /^\\/loja\\/[^/]+\\/pipeline\\/?$/;"), true);
  assert.equal(source.includes('@media (min-width: 1024px)'), true);
  assert.equal(source.includes('main.pipeline-aura-page'), true);
  assert.equal(source.includes('main.pipeline-aura-page > section.pipeline-aura-portal-shell'), true);
  assert.equal(source.includes('.pipeline-aura-portal-canvas'), true);
  assert.equal(source.includes('.store-pipeline-page'), true);
  assert.equal(source.includes('min-height: 0 !important'), true);
  assert.equal(source.includes('padding-bottom: 0 !important'), true);
});

test('pipeline viewport guard does not change board column heights or mobile rules', () => {
  assert.equal(source.includes('pipeline-aura-board'), false);
  assert.equal(source.includes('100dvh'), false);
  assert.equal(source.includes('@media (max-width'), false);
});

test('pipeline viewport guard remains mounted globally but self-scopes by route', () => {
  assert.equal(layout.includes("import { StorePipelineViewportHeightGuard } from '@/components/StorePipelineViewportHeightGuard';"), true);
  assert.equal(layout.includes('<StorePipelineViewportHeightGuard />'), true);
});
