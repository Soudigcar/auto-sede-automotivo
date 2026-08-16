import { evolutionMultipartRequest, evolutionRequest } from '@/lib/server/evolution';

function base64Text(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (Array.isArray(value)) return Buffer.from(value).toString('base64');
  if (value && typeof value === 'object') {
    const record = value as any;
    if (record.type === 'Buffer' && Array.isArray(record.data)) {
      return Buffer.from(record.data).toString('base64');
    }
  }
  return '';
}

function blobSafeBuffer(bytes: Uint8Array) {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

export function normalizeEvolutionMediaBase64(result: any) {
  const candidates = [
    result?.base64,
    result?.data?.base64,
    result?.media?.base64,
    result?.data,
    result?.media
  ];

  for (const candidate of candidates) {
    const text = base64Text(candidate);
    if (!text) continue;
    const comma = text.indexOf(',');
    return comma >= 0 && text.slice(0, comma).includes('base64') ? text.slice(comma + 1) : text;
  }

  return '';
}

export async function getEvolutionAudioBase64(instanceName: string, rawMessage: any) {
  const result = await evolutionRequest(`/chat/getBase64FromMediaMessage/${encodeURIComponent(instanceName)}`, {
    method: 'POST',
    body: {
      message: rawMessage,
      convertToMp4: false
    }
  });

  const base64 = normalizeEvolutionMediaBase64(result);
  if (!base64) throw new Error('Evolution não retornou a mídia de áudio em base64.');
  return { base64, raw: result };
}

export async function sendEvolutionAudio(input: {
  instanceName: string;
  number: string;
  bytes: Uint8Array;
  mimetype?: string;
  fileName?: string;
}) {
  const mimetype = String(input.mimetype || 'audio/mpeg').trim();
  const fileName = String(input.fileName || 'autocar.mp3').trim();
  const form = new FormData();
  form.set('number', input.number);
  form.set('file', new Blob([blobSafeBuffer(input.bytes)], { type: mimetype }), fileName);

  return evolutionMultipartRequest(`/message/sendWhatsAppAudio/${encodeURIComponent(input.instanceName)}`, form);
}
