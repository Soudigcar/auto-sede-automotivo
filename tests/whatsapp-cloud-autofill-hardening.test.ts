import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const source = readFileSync(
  path.join(process.cwd(), 'src/components/WhatsappCloudApiPanel.tsx'),
  'utf8'
);

function expectInputGuard(name: string, autocomplete: 'off' | 'new-password') {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const input = new RegExp(
    `<input[^>]*name="${escapedName}"[^>]*autoComplete="${autocomplete}"[^>]*data-1p-ignore="true"[^>]*data-lpignore="true"[^>]*>`,
    'i'
  );
  assert.match(source, input);
}

test('campos de configuracao da Cloud API recusam autofill de credenciais do navegador', () => {
  for (const name of [
    'whatsapp-cloud-business-account-name',
    'whatsapp-cloud-waba-id',
    'whatsapp-cloud-phone-number-id',
    'whatsapp-cloud-display-phone-number',
    'whatsapp-cloud-graph-api-version'
  ]) {
    expectInputGuard(name, 'off');
  }
});

test('segredos sinteticos usam semantica de nova credencial e bloqueios de password managers', () => {
  for (const name of [
    'whatsapp-cloud-access-token',
    'whatsapp-cloud-app-secret',
    'whatsapp-cloud-verify-token'
  ]) {
    expectInputGuard(name, 'new-password');
  }
});
