import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const route = readFileSync('src/app/api/whatsapp/messages/send-attachment/route.ts', 'utf8');
const desktop = readFileSync('src/components/WhatsappAttachmentButton.tsx', 'utf8');
const mobile = readFileSync('src/components/WhatsappMobileInboxBridge.tsx', 'utf8');
const mobileInbox = readFileSync('src/components/WhatsappMobileInboxV2.tsx', 'utf8');
const recorder = readFileSync('src/components/WhatsappAudioRecorderButton.tsx', 'utf8');

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

test('audio recorder provides a safe WhatsApp-like review flow on desktop and mobile', () => {
  assert.match(recorder, /navigator\.mediaDevices\?\.getUserMedia/);
  assert.match(recorder, /echoCancellation: true/);
  assert.match(recorder, /noiseSuppression: true/);
  assert.match(recorder, /recorder\.pause\(\)/);
  assert.match(recorder, /recorder\.resume\(\)/);
  assert.match(recorder, /Áudio pronto\. Ouça antes de enviar\./);
  assert.match(recorder, /<audio src=\{previewUrl\} controls/);
  assert.match(recorder, /MAX_RECORDING_SECONDS/);
  assert.match(recorder, /MAX_AUDIO_BYTES/);
  assert.match(recorder, /track\.stop\(\)/);
  assert.match(recorder, /URL\.revokeObjectURL/);
  assert.match(desktop, /WhatsappAudioRecorderButton/);
  assert.match(mobile, /audioRecorder=\{<WhatsappAudioRecorderButton/);
  assert.match(mobileInbox, /props\.messageText\.trim\(\).*props\.audioRecorder/);
});
