import { getEvolutionAudioBase64 } from '@/lib/server/evolutionAudio';

const AUDIO_PIPELINE_VERSION = 'autocar-audio-v1';
const DEFAULT_TRANSCRIBE_MODEL = 'gpt-4o-mini-transcribe';
const DEFAULT_TTS_MODEL = 'gpt-4o-mini-tts';
const DEFAULT_TTS_VOICE = 'marin';
const MAX_AUDIO_SECONDS = 120;
const MAX_AUDIO_BYTES = 20 * 1024 * 1024;

function openAiKey() {
  const key = String(process.env.OPENAI_API_KEY || '').trim();
  if (!key) throw new Error('OPENAI_API_KEY não disponível para o pipeline de áudio.');
  return key;
}

function transcribeModel() {
  return String(process.env.OPENAI_AUTOCAR_TRANSCRIBE_MODEL || DEFAULT_TRANSCRIBE_MODEL).trim();
}

function ttsModel() {
  return String(process.env.OPENAI_AUTOCAR_TTS_MODEL || DEFAULT_TTS_MODEL).trim();
}

function ttsVoice() {
  return String(process.env.OPENAI_AUTOCAR_TTS_VOICE || DEFAULT_TTS_VOICE).trim();
}

function providerMessageId(rawPayload: any) {
  return String(rawPayload?.key?.id || rawPayload?.message?.key?.id || rawPayload?.id || '').trim();
}

function inboundAudio(rawPayload: any) {
  return rawPayload?.message?.audioMessage || rawPayload?.audioMessage || null;
}

function audioSeconds(rawPayload: any) {
  const value = Number(inboundAudio(rawPayload)?.seconds || 0);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function audioMime(rawPayload: any) {
  const raw = String(inboundAudio(rawPayload)?.mimetype || 'audio/ogg').trim().toLowerCase();
  return raw.split(';')[0] || 'audio/ogg';
}

function extensionForMime(mime: string) {
  if (mime.includes('mpeg') || mime.includes('mp3')) return 'mp3';
  if (mime.includes('mp4') || mime.includes('m4a')) return 'm4a';
  if (mime.includes('wav')) return 'wav';
  if (mime.includes('webm')) return 'webm';
  return 'ogg';
}

function blobSafeBuffer(bytes: Uint8Array) {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function decodeBase64(base64: string) {
  const bytes = Buffer.from(base64, 'base64');
  if (!bytes.length) throw new Error('Áudio recebido está vazio após decodificação.');
  if (bytes.length > MAX_AUDIO_BYTES) throw new Error('Áudio excede o limite seguro do AUTOCAR Audio V1.');
  return bytes;
}

async function transcribe(bytes: Buffer, mime: string) {
  const form = new FormData();
  form.set('file', new Blob([blobSafeBuffer(bytes)], { type: mime }), `autocar-inbound.${extensionForMime(mime)}`);
  form.set('model', transcribeModel());
  form.set('language', 'pt');

  const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${openAiKey()}` },
    body: form,
    cache: 'no-store',
    signal: AbortSignal.timeout(45_000)
  });
  const raw = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(String(raw?.error?.message || `OpenAI transcrição HTTP ${response.status}.`).slice(0, 500));
  }

  const text = String(raw?.text || '').replace(/\s+/g, ' ').trim().slice(0, 12_000);
  if (!text) throw new Error('Transcrição de áudio retornou vazia.');
  return { text, raw };
}

export async function prepareAutocarInboundAudio(input: {
  productionSupabase: any;
  storeId: string;
  conversationId: string;
  whatsappNumberId: string;
  messageId: string;
}) {
  const { data: message, error: messageError } = await input.productionSupabase
    .from('whatsapp_messages')
    .select('id,store_id,conversation_id,whatsapp_number_id,message_type,body,raw_payload')
    .eq('id', input.messageId)
    .eq('store_id', input.storeId)
    .eq('conversation_id', input.conversationId)
    .eq('whatsapp_number_id', input.whatsappNumberId)
    .maybeSingle();
  if (messageError) throw messageError;
  if (!message) return { ready: false, skipped: true, reason: 'Mensagem canônica não encontrada para transcrição.' };
  if (String(message.message_type || '') !== 'audio') {
    return { ready: true, skipped: true, reason: 'Mensagem não é áudio.', transcript: String(message.body || '') };
  }

  const existingTranscript = String(message?.raw_payload?.autocar_audio_transcription?.text || '').trim();
  if (existingTranscript) {
    return {
      ready: true,
      duplicate: true,
      transcript: existingTranscript,
      model: message?.raw_payload?.autocar_audio_transcription?.model || null,
      version: AUDIO_PIPELINE_VERSION
    };
  }

  const seconds = audioSeconds(message.raw_payload);
  if (seconds > MAX_AUDIO_SECONDS) {
    return { ready: false, skipped: true, reason: `Áudio de ${seconds}s excede o limite de ${MAX_AUDIO_SECONDS}s do V1.` };
  }

  const { data: integration, error: integrationError } = await input.productionSupabase
    .from('store_whatsapp_integrations')
    .select('instance_name,status,scope')
    .eq('store_id', input.storeId)
    .eq('crm_number_id', input.whatsappNumberId)
    .eq('scope', 'store')
    .maybeSingle();
  if (integrationError) throw integrationError;
  if (!integration?.instance_name || integration.status !== 'connected') {
    return { ready: false, skipped: true, reason: 'Integração Evolution da loja não está conectada para recuperar o áudio.' };
  }

  const providerId = providerMessageId(message.raw_payload);
  if (!providerId) return { ready: false, skipped: true, reason: 'Áudio sem identificador do provedor.' };

  const mime = audioMime(message.raw_payload);
  const media = await getEvolutionAudioBase64(String(integration.instance_name), message.raw_payload);
  const bytes = decodeBase64(media.base64);
  const result = await transcribe(bytes, mime);
  const now = new Date().toISOString();
  const transcription = {
    version: AUDIO_PIPELINE_VERSION,
    model: transcribeModel(),
    text: result.text,
    seconds: seconds || null,
    mimetype: mime,
    bytes: bytes.length,
    provider_message_id: providerId,
    transcribed_at: now
  };

  const { error: updateError } = await input.productionSupabase
    .from('whatsapp_messages')
    .update({
      body: result.text,
      raw_payload: {
        ...(message.raw_payload || {}),
        autocar_audio_transcription: transcription
      }
    })
    .eq('id', message.id)
    .eq('store_id', input.storeId);
  if (updateError) throw updateError;

  const { error: conversationError } = await input.productionSupabase
    .from('whatsapp_conversations')
    .update({ last_message: result.text, updated_at: now })
    .eq('id', input.conversationId)
    .eq('store_id', input.storeId);
  if (conversationError) throw conversationError;

  return {
    ready: true,
    transcript: result.text,
    model: transcribeModel(),
    seconds: seconds || null,
    bytes: bytes.length,
    version: AUDIO_PIPELINE_VERSION
  };
}

export async function synthesizeAutocarSpeech(text: string) {
  const safeText = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 3500);
  if (!safeText) throw new Error('Resposta textual vazia para síntese de voz.');

  const response = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${openAiKey()}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: ttsModel(),
      voice: ttsVoice(),
      input: safeText,
      response_format: 'mp3',
      instructions: 'Fale em português do Brasil, com voz natural, cordial e comercial de atendimento automotivo. Preserve exatamente o conteúdo; não acrescente informações.'
    }),
    cache: 'no-store',
    signal: AbortSignal.timeout(45_000)
  });

  if (!response.ok) {
    const raw = await response.text().catch(() => '');
    throw new Error(String(raw || `OpenAI TTS HTTP ${response.status}.`).slice(0, 500));
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (!bytes.length) throw new Error('OpenAI TTS retornou áudio vazio.');
  if (bytes.length > MAX_AUDIO_BYTES) throw new Error('Resposta de voz excede o limite seguro do Audio V1.');

  return {
    bytes,
    mimetype: 'audio/mpeg',
    fileName: 'autocar.mp3',
    model: ttsModel(),
    voice: ttsVoice(),
    version: AUDIO_PIPELINE_VERSION
  };
}
