import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const recorderPath = new URL('../src/components/WhatsappAudioRecorder.tsx', import.meta.url);
const attachmentUiPath = new URL('../src/components/WhatsappAttachmentButton.tsx', import.meta.url);
const audioRoutePath = new URL('../src/app/api/whatsapp/messages/send-audio/route.ts', import.meta.url);
const attachmentRoutePath = new URL('../src/app/api/whatsapp/messages/send-attachment/route.ts', import.meta.url);
const mediaRoutePath = new URL('../src/app/api/whatsapp/messages/media/route.ts', import.meta.url);
const nextConfigPath = new URL('../next.config.ts', import.meta.url);
const proxyPath = new URL('../src/proxy.ts', import.meta.url);

async function source(url: URL) {
  return readFile(url, 'utf8');
}

test('gravador negocia formatos, limita tamanho e libera o microfone', async () => {
  const code = await source(recorderPath);

  assert.match(code, /audio\/webm;codecs=opus/);
  assert.match(code, /audio\/ogg;codecs=opus/);
  assert.match(code, /audio\/mp4/);
  assert.match(code, /MAX_AUDIO_BYTES = 4 \* 1024 \* 1024/);
  assert.match(code, /MAX_RECORDING_SECONDS = 180/);
  assert.match(code, /getTracks\(\)\.forEach\(\(track\) => track\.stop\(\)\)/);
  assert.match(code, /URL\.revokeObjectURL/);
  assert.match(code, /NotAllowedError/);
});

test('gravador usa rota dedicada de voice note e mantém retry após falha', async () => {
  const code = await source(recorderPath);

  assert.match(code, /\/api\/whatsapp\/messages\/send-audio/);
  assert.match(code, /if \(!response\.ok\) throw new Error/);
  assert.match(code, /setState\('ready'\)/);
  assert.match(code, /O áudio continua disponível para tentar novamente/);
});

test('botão de microfone é compartilhado entre Master e Loja pelo componente de anexos', async () => {
  const code = await source(attachmentUiPath);

  assert.match(code, /WhatsappAudioRecorder/);
  assert.match(code, /<WhatsappAudioRecorder conversationId=\{conversationId\}/);
});

test('rota de áudio valida tenant, estado live e handoff humano antes do provider', async () => {
  const code = await source(audioRoutePath);

  const permissionIndex = code.indexOf('canAccessStoreConversation');
  const liveIndex = code.indexOf('readManagedEvolutionState(integration)');
  const takeoverIndex = code.indexOf('const takeover = await markAutocarHumanActive');
  const providerIndex = code.indexOf('/message/sendWhatsAppAudio/');

  assert.ok(permissionIndex >= 0, 'deve validar autorização da conversa');
  assert.ok(liveIndex >= 0, 'deve consultar o estado live da Evolution');
  assert.ok(takeoverIndex >= 0, 'deve assumir atendimento humano');
  assert.ok(providerIndex >= 0, 'deve usar endpoint dedicado de voice note');
  assert.ok(liveIndex < providerIndex, 'estado live precisa ser validado antes do envio');
  assert.ok(takeoverIndex < providerIndex, 'handoff humano precisa ocorrer antes do envio');
  assert.match(code, /encoding', 'true'/);
  assert.match(code, /message_type: 'audio'/);
  assert.match(code, /voice_note: true/);
});

test('rota de áudio recusa payload vazio, grande ou não-áudio', async () => {
  const code = await source(audioRoutePath);

  assert.match(code, /if \(!fileValue\.size\)/);
  assert.match(code, /fileValue\.size > MAX_AUDIO_BYTES/);
  assert.match(code, /mime\.startsWith\(ALLOWED_AUDIO_MIME_PREFIX\)/);
  assert.match(code, /status: 413/);
  assert.match(code, /status: 415/);
});

test('anexos tradicionais também passam a usar estado live e handoff pré-envio', async () => {
  const code = await source(attachmentRoutePath);

  const liveIndex = code.indexOf('readManagedEvolutionState(integration)');
  const takeoverIndex = code.indexOf('const takeover = await markAutocarHumanActive');
  const providerIndex = code.indexOf('/message/sendMedia/');

  assert.ok(liveIndex >= 0);
  assert.ok(takeoverIndex >= 0);
  assert.ok(providerIndex >= 0);
  assert.ok(liveIndex < providerIndex);
  assert.ok(takeoverIndex < providerIndex);
});

test('recuperação de mídia usa conexão live e proíbe cache de áudio no navegador', async () => {
  const code = await source(mediaRoutePath);

  assert.match(code, /readManagedEvolutionState\(integration\)/);
  assert.match(code, /resolveEvolutionAvailability\(integration, liveState\)/);
  assert.match(code, /Cache-Control': 'private, no-store, max-age=0'/);
  assert.match(code, /Pragma: 'no-cache'/);
});

test('microfone fica liberado somente nas rotas de Inbox WhatsApp', async () => {
  const nextConfig = await source(nextConfigPath);
  const proxy = await source(proxyPath);

  assert.doesNotMatch(nextConfig, /microphone=\(\)/);
  assert.match(proxy, /DEFAULT_PERMISSIONS_POLICY = 'camera=\(\), microphone=\(\), geolocation=\(\), payment=\(\), usb=\(\), browsing-topics=\(\)'/);
  assert.match(proxy, /WHATSAPP_PERMISSIONS_POLICY = 'camera=\(\), microphone=\(self\), geolocation=\(\), payment=\(\), usb=\(\), browsing-topics=\(\)'/);
  assert.match(proxy, /pathname === '\/master\/whatsapp\/inbox'/);
  assert.match(proxy, /\^\\\/loja\\\/\[\^\/\]\+\\\/whatsapp/);
  assert.match(proxy, /isWhatsappInboxPath\(pathname\) \? WHATSAPP_PERMISSIONS_POLICY : DEFAULT_PERMISSIONS_POLICY/);
});
