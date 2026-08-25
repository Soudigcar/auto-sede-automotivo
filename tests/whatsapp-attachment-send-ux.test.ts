import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const route = readFileSync('src/app/api/whatsapp/messages/send-attachment/route.ts', 'utf8');
const desktop = readFileSync('src/components/WhatsappAttachmentButton.tsx', 'utf8');
const mobile = readFileSync('src/components/WhatsappMobileInboxBridge.tsx', 'utf8');

test('Evolution media uses the documented JSON base64 contract', () => {
  assert.match(route, /new Uint8Array\(await fileValue\.arrayBuffer\(\)\)/);
  assert.match(route, /Buffer\.from\(bytes\)\.toString\('base64'\)/);
  assert.match(route, /media,/);
  assert.match(route, /evolutionRequest\(`\/message\/sendMedia\//);
  assert.doesNotMatch(route, /evolutionMultipartRequest/);
  assert.match(route, /sendEvolutionAudio/);
});

test('desktop attachment confirmation renders image content instead of only its filename', () => {
  assert.match(desktop, /URL\.createObjectURL\(file\)/);
  assert.match(desktop, /alt="Prévia da imagem selecionada"/);
  assert.match(desktop, /Imagem pronta para enviar/);
  assert.match(desktop, /Enviando para o WhatsApp/);
});

test('mobile attachment flow previews and requires explicit send', () => {
  assert.match(mobile, /setAttachmentFile\(file\)/);
  assert.match(mobile, /Confirmar envio/);
  assert.match(mobile, /URL\.createObjectURL\(attachmentFile\)/);
  assert.match(mobile, /void sendAttachment\(\)/);
  assert.match(mobile, /result\.error \|\| 'Não foi possível enviar o anexo\.'/);
});
