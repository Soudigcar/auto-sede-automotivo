import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync('src/components/AutocarIntelligenceCenter.tsx', 'utf8');

test('visao geral preserva rascunho legado sem duplicar controles oficiais', () => {
  assert.match(source, /followUpRules:\s*string/);
  assert.match(source, /autonomyMode:\s*'off' \| 'copilot' \| 'autopilot'/);
  assert.match(source, /autocar-intelligence-draft:\$\{slug\}/);
  assert.match(source, /localStorage\.getItem\(storageKey\)/);
  assert.match(source, /localStorage\.setItem\(storageKey, JSON\.stringify\(config\)\)/);

  assert.doesNotMatch(source, /<TextArea label="Cadência de follow-up"/);
  assert.doesNotMatch(source, /update\('autonomyMode'/);
  assert.match(source, /\/loja\/\$\{slug\}\/autocar\/follow-up/);
  assert.match(source, /administrados exclusivamente na configuração oficial do Smart Follow-up/);
  assert.match(source, /A Visão Geral não altera OFF, COPILOT ou AUTOPILOT/);
  assert.match(source, /Modo geral da AUTOCAR/);

  assert.doesNotMatch(source, /\/api\/store\/portal\/autocar\/follow-up-v2/);
  assert.doesNotMatch(source, /from ['"]@\/lib\/server\/autocar\//);
});
