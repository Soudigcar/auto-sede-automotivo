import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const source = readFileSync('src/components/StorePipelineViewportHeightGuard.tsx', 'utf8');
const layout = readFileSync('src/app/layout.tsx', 'utf8');

test('pipeline viewport guard contains desktop document scroll inside the portal canvas', () => {
  assert.equal(source.includes("const PIPELINE_PATH = /^\\/loja\\/[^/]+\\/pipeline\\/?$/;"), true);
  assert.equal(source.includes('@media (min-width: 1024px)'), true);
  assert.equal(source.includes('html:has(body.pipeline-aura-active)'), true);
  assert.equal(source.includes('body.pipeline-aura-active {'), true);
  assert.equal(source.includes('main.pipeline-aura-page'), true);
  assert.equal(source.includes('main.pipeline-aura-page > section.pipeline-aura-portal-shell'), true);
  assert.equal(source.includes('.pipeline-aura-portal-canvas.pipeline-aura-canvas'), true);
  assert.equal(source.includes('height: 100dvh !important'), true);
  assert.equal(source.includes('overflow: hidden !important'), true);
  assert.equal(source.includes('overflow-y: auto !important'), true);
  assert.equal(source.includes('overscroll-behavior-y: contain'), true);
});

test('pipeline viewport guard keeps board column and mobile behavior outside its scope', () => {
  assert.equal(source.includes('pipeline-aura-board'), false);
  assert.equal(source.includes('data-pipeline-stage-cards'), false);
  assert.equal(source.includes('@media (max-width'), false);
});

test('pipeline viewport guard remains mounted globally but self-scopes by route', () => {
  assert.equal(layout.includes("import { StorePipelineViewportHeightGuard } from '@/components/StorePipelineViewportHeightGuard';"), true);
  assert.equal(layout.includes('<StorePipelineViewportHeightGuard />'), true);
});
