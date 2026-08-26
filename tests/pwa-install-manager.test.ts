import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const manager = readFileSync('src/components/PwaInstallManager.tsx', 'utf8');

test('PWA stays registered without showing a recurring install banner', () => {
  assert.match(manager, /navigator\.serviceWorker\.register\('\/sw\.js'/);
  assert.match(manager, /return null/);
  assert.doesNotMatch(manager, /Instalar Auto Controle/);
  assert.doesNotMatch(manager, /beforeinstallprompt/);
  assert.doesNotMatch(manager, /Fechar aviso de instalação/);
});
