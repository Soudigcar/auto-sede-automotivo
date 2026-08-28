export const WHATSAPP_PROFILE_PICTURE_BUCKET = 'whatsapp-profile-pictures-v1';
export const WHATSAPP_PROFILE_PICTURE_MAX_BYTES = 1024 * 1024;
export const WHATSAPP_PROFILE_PICTURE_SOURCE_MAX_BYTES = 2 * 1024 * 1024;
export const WHATSAPP_PROFILE_PICTURE_REFRESH_MS = 24 * 60 * 60 * 1_000;
export const WHATSAPP_PROFILE_PICTURE_MISSING_RETRY_MS = 6 * 60 * 60 * 1_000;
export const WHATSAPP_PROFILE_PICTURE_ERROR_RETRY_MS = 15 * 60 * 1_000;

export type WhatsappProfilePictureStatus =
  | 'available'
  | 'missing'
  | 'upstream_error'
  | 'storage_error';

export type WhatsappProfilePictureMetadata = {
  metadata: Record<string, unknown>;
  storagePath: string;
  refreshedAt: string;
  lastAttemptAt: string;
  lastStatus: WhatsappProfilePictureStatus | '';
};

function cleanText(value: unknown) {
  return String(value || '').trim();
}

function validTimestamp(value: string) {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

export function whatsappProfilePictureMetadata(value: unknown): WhatsappProfilePictureMetadata {
  const metadata = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const rawStatus = cleanText(metadata.profile_picture_cache_status);
  const lastStatus: WhatsappProfilePictureStatus | '' = [
    'available',
    'missing',
    'upstream_error',
    'storage_error'
  ].includes(rawStatus)
    ? rawStatus as WhatsappProfilePictureStatus
    : '';

  return {
    metadata,
    storagePath: cleanText(metadata.profile_picture_storage_path),
    refreshedAt: cleanText(metadata.profile_picture_source_refreshed_at),
    lastAttemptAt: cleanText(metadata.profile_picture_last_attempt_at),
    lastStatus
  };
}

export function whatsappProfilePictureStoragePath(storeId: unknown, contactId: unknown) {
  const safeStoreId = cleanText(storeId);
  const safeContactId = cleanText(contactId);
  if (
    !/^[a-zA-Z0-9-]+$/.test(safeStoreId) ||
    !/^[a-zA-Z0-9-]+$/.test(safeContactId)
  ) {
    throw new Error('Escopo inválido para armazenar foto do WhatsApp.');
  }
  return `${safeStoreId}/${safeContactId}/avatar.webp`;
}

export function whatsappProfilePictureNeedsRefresh(
  cache: WhatsappProfilePictureMetadata,
  now = Date.now()
) {
  const refreshedAt = validTimestamp(cache.refreshedAt);
  if (
    cache.storagePath &&
    refreshedAt !== null &&
    now - refreshedAt < WHATSAPP_PROFILE_PICTURE_REFRESH_MS
  ) {
    return false;
  }

  const lastAttemptAt = validTimestamp(cache.lastAttemptAt);
  if (lastAttemptAt === null) return true;

  if (
    cache.lastStatus === 'missing' &&
    now - lastAttemptAt < WHATSAPP_PROFILE_PICTURE_MISSING_RETRY_MS
  ) {
    return false;
  }

  if (
    ['upstream_error', 'storage_error'].includes(cache.lastStatus) &&
    now - lastAttemptAt < WHATSAPP_PROFILE_PICTURE_ERROR_RETRY_MS
  ) {
    return false;
  }

  return true;
}

export function isAllowedWhatsappProfilePictureUrl(value: unknown) {
  try {
    const url = new URL(cleanText(value));
    if (url.protocol !== 'https:' || url.username || url.password) return false;
    const hostname = url.hostname.toLowerCase();
    return hostname === 'pps.whatsapp.net' ||
      hostname.endsWith('.whatsapp.net') ||
      hostname.endsWith('.fbcdn.net') ||
      hostname.endsWith('.fbsbx.com');
  } catch {
    return false;
  }
}

export function isSupportedWhatsappProfilePictureContentType(value: unknown) {
  const contentType = cleanText(value).toLowerCase().split(';')[0];
  return ['image/jpeg', 'image/png', 'image/webp'].includes(contentType);
}

export function isRetryableWhatsappProfilePictureError(error: unknown) {
  const candidate = error as { status?: unknown; name?: unknown } | null;
  const status = Number(candidate?.status || 0);
  const name = cleanText(candidate?.name);
  return status === 408 || status === 429 || status >= 500 ||
    ['AbortError', 'TimeoutError', 'TypeError'].includes(name);
}
