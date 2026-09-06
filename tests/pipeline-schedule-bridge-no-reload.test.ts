import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const source = readFileSync('src/components/StorePipelineScheduleUxBridge.tsx', 'utf8');

test('schedule bridge no longer reloads the whole document', () => {
  assert.equal(source.includes('window.location.reload()'), false);
});

test('schedule bridge only captures drop into scheduled stage', () => {
  assert.equal(source.includes("if (stage !== 'scheduled') return;"), true);
  assert.equal(source.includes('directDropStages'), false);
});
