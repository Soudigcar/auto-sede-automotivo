import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync('src/components/MasterAutocarCenter.tsx', 'utf8');

test('aba Lojas do Master AUTOCAR e somente leitura e preserva governanca dupla', () => {
  assert.doesNotMatch(source, /action:\s*'set-store-mode'/);
  assert.doesNotMatch(source, /function setMode\(/);
  assert.doesNotMatch(source, /onClick=\{\(\) => void setMode/);

  assert.match(source, /Governança por loja/);
  assert.match(source, /Esta aba é somente leitura/);
  assert.match(source, /Para alterar permissões, use exclusivamente/);
  assert.match(source, /Master → Loja/);

  assert.match(source, /AUTOCAR Master/);
  assert.match(source, /AUTOPILOT permitido/);
  assert.match(source, /Loja escolheu/);
  assert.match(source, /Modo efetivo/);

  assert.match(source, /master_enabled/);
  assert.match(source, /master_autopilot_allowed/);
  assert.match(source, /store_selected_mode/);
  assert.match(source, /agent\?\.mode/);

  assert.match(source, /fetch\('\/api\/master\/autocar', \{ headers:/);
  assert.doesNotMatch(source, /set-store-access/);
});
