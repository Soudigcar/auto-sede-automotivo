export type WhatsappMediaType = 'image' | 'video' | 'audio' | 'document';

const SAFE_INLINE_MIME_TYPES: Record<Exclude<WhatsappMediaType, 'document'>, Set<string>> = {
  image: new Set([
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'image/gif',
    'image/avif',
    'image/heic',
    'image/heif'
  ]),
  video: new Set([
    'video/mp4',
    'video/3gpp',
    'video/webm',
    'video/quicktime',
    'video/x-matroska'
  ]),
  audio: new Set([
    'audio/ogg',
    'audio/opus',
    'audio/mpeg',
    'audio/mp3',
    'audio/mp4',
    'audio/aac',
    'audio/wav',
    'audio/x-wav',
    'audio/webm',
    'audio/3gpp',
    'audio/amr'
  ])
};

function normalizedMime(value: unknown) {
  return String(value || '').split(';')[0].trim().toLowerCase();
}

export function whatsappMediaResponsePolicy(
  messageType: WhatsappMediaType,
  providerMime: unknown,
  downloadRequested = false
) {
  if (messageType === 'document') {
    return {
      contentType: 'application/octet-stream',
      disposition: 'attachment' as const
    };
  }

  const contentType = normalizedMime(providerMime);
  if (!SAFE_INLINE_MIME_TYPES[messageType].has(contentType)) return null;

  return {
    contentType,
    disposition: downloadRequested ? 'attachment' as const : 'inline' as const
  };
}
