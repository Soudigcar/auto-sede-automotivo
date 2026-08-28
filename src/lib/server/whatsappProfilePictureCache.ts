import sharp from 'sharp';
import { getEvolutionProfilePictureUrl } from '@/lib/server/evolution';
import {
  WHATSAPP_PROFILE_PICTURE_BUCKET,
  WHATSAPP_PROFILE_PICTURE_MAX_BYTES,
  WHATSAPP_PROFILE_PICTURE_SOURCE_MAX_BYTES,
  isAllowedWhatsappProfilePictureUrl,
  isRetryableWhatsappProfilePictureError,
  isSupportedWhatsappProfilePictureContentType,
  whatsappProfilePictureMetadata,
  whatsappProfilePictureStoragePath,
  type WhatsappProfilePictureStatus
} from '@/lib/whatsappProfilePicture';

const PROFILE_PICTURE_DOWNLOAD_TIMEOUT_MS = 10_000;
const PROFILE_PICTURE_MAX_ATTEMPTS = 2;
const PROFILE_PICTURE_RETRY_DELAY_MS = 250;

export type WhatsappProfilePictureBinary = {
  bytes: Uint8Array;
  contentType: 'image/webp';
};

type RefreshInput = {
  supabase: any;
  storeId: string;
  conversationId: string;
  contact: any;
  instanceName: string;
  persist: boolean;
};

type RefreshResult =
  | { status: 'available'; picture: WhatsappProfilePictureBinary }
  | { status: 'missing'; picture: null }
  | { status: 'error'; picture: null };

class ProfilePictureHttpError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ProfilePictureHttpError';
    this.status = status;
  }
}

class ProfilePictureStorageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProfilePictureStorageError';
  }
}

const refreshesInFlight = new Map<string, Promise<RefreshResult>>();

function shortId(value: unknown) {
  return String(value || '').slice(0, 8) || null;
}

function logProfilePicture(event: string, input: RefreshInput, detail: Record<string, unknown> = {}) {
  console.info('[WhatsApp Profile Picture]', {
    event,
    store: shortId(input.storeId),
    conversation: shortId(input.conversationId),
    contact: shortId(input.contact?.id),
    ...detail
  });
}

function sleep(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function withRetry<T>(operation: () => Promise<T>) {
  let lastError: unknown;

  for (let attempt = 1; attempt <= PROFILE_PICTURE_MAX_ATTEMPTS; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt >= PROFILE_PICTURE_MAX_ATTEMPTS || !isRetryableWhatsappProfilePictureError(error)) {
        throw error;
      }
      await sleep(PROFILE_PICTURE_RETRY_DELAY_MS * attempt);
    }
  }

  throw lastError;
}

async function downloadAndNormalizeProfilePicture(url: string): Promise<WhatsappProfilePictureBinary> {
  if (!isAllowedWhatsappProfilePictureUrl(url)) {
    throw new ProfilePictureHttpError('A Evolution retornou uma origem de foto não autorizada.', 502);
  }

  const response = await withRetry(async () => {
    const result = await fetch(url, {
      cache: 'no-store',
      redirect: 'follow',
      signal: AbortSignal.timeout(PROFILE_PICTURE_DOWNLOAD_TIMEOUT_MS)
    });

    if (!result.ok) {
      throw new ProfilePictureHttpError(`A foto remota respondeu com HTTP ${result.status}.`, result.status);
    }
    if (!isAllowedWhatsappProfilePictureUrl(result.url || url)) {
      throw new ProfilePictureHttpError('A foto remota redirecionou para uma origem não autorizada.', 502);
    }
    return result;
  });

  const contentType = response.headers.get('content-type');
  if (!isSupportedWhatsappProfilePictureContentType(contentType)) {
    throw new ProfilePictureHttpError('A origem não retornou uma imagem compatível.', 415);
  }

  const declaredLength = Number(response.headers.get('content-length') || 0);
  if (declaredLength > WHATSAPP_PROFILE_PICTURE_SOURCE_MAX_BYTES) {
    throw new ProfilePictureHttpError('A foto remota excede o limite permitido.', 413);
  }

  const source = new Uint8Array(await response.arrayBuffer());
  if (!source.byteLength || source.byteLength > WHATSAPP_PROFILE_PICTURE_SOURCE_MAX_BYTES) {
    throw new ProfilePictureHttpError('A foto remota está vazia ou excede o limite permitido.', 413);
  }

  const normalized = await sharp(source, { limitInputPixels: 16_777_216 })
    .rotate()
    .resize(256, 256, { fit: 'cover', position: 'centre', withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer();

  if (!normalized.byteLength || normalized.byteLength > WHATSAPP_PROFILE_PICTURE_MAX_BYTES) {
    throw new ProfilePictureHttpError('A foto normalizada excede o limite permitido.', 413);
  }

  return { bytes: new Uint8Array(normalized), contentType: 'image/webp' };
}

async function updateContactCacheMetadata(
  input: RefreshInput,
  status: WhatsappProfilePictureStatus,
  refreshedAt?: string
) {
  if (!input.persist) return;

  const cache = whatsappProfilePictureMetadata(input.contact?.metadata);
  const attemptedAt = new Date().toISOString();
  const storagePath = whatsappProfilePictureStoragePath(input.storeId, input.contact.id);
  const metadata: Record<string, unknown> = {
    ...cache.metadata,
    profile_picture_last_attempt_at: attemptedAt,
    profile_picture_cache_status: status
  };

  if (status === 'available' && refreshedAt) {
    metadata.profile_picture_storage_path = storagePath;
    metadata.profile_picture_source_refreshed_at = refreshedAt;
  } else if (status === 'missing') {
    delete metadata.profile_picture_storage_path;
    delete metadata.profile_picture_source_refreshed_at;
  }

  const { error } = await input.supabase
    .from('whatsapp_contacts')
    .update({ metadata })
    .eq('id', input.contact.id)
    .eq('store_id', input.storeId);

  if (error) {
    logProfilePicture('metadata_write_failed', input, { error: String(error.message || error).slice(0, 180) });
  }
}

export async function readStoredWhatsappProfilePicture(
  supabase: any,
  storeId: string,
  contactId: string
): Promise<WhatsappProfilePictureBinary | null> {
  const storagePath = whatsappProfilePictureStoragePath(storeId, contactId);
  const { data, error } = await supabase.storage
    .from(WHATSAPP_PROFILE_PICTURE_BUCKET)
    .download(storagePath);

  if (error || !data) return null;

  const bytes = new Uint8Array(await data.arrayBuffer());
  if (!bytes.byteLength || bytes.byteLength > WHATSAPP_PROFILE_PICTURE_MAX_BYTES) return null;
  return { bytes, contentType: 'image/webp' };
}

async function performRefresh(input: RefreshInput): Promise<RefreshResult> {
  const startedAt = Date.now();

  try {
    const profilePictureUrl = await withRetry(() => getEvolutionProfilePictureUrl(
      input.instanceName,
      input.contact.wa_id || input.contact.phone
    ));

    if (!profilePictureUrl) {
      if (input.persist) {
        const storagePath = whatsappProfilePictureStoragePath(input.storeId, input.contact.id);
        const { error: deleteError } = await input.supabase.storage
          .from(WHATSAPP_PROFILE_PICTURE_BUCKET)
          .remove([storagePath]);
        if (deleteError) {
          throw new ProfilePictureStorageError(`Falha ao remover foto privada obsoleta: ${deleteError.message}`);
        }
      }
      await updateContactCacheMetadata(input, 'missing');
      logProfilePicture('upstream_missing', input, { duration_ms: Date.now() - startedAt });
      return { status: 'missing', picture: null };
    }

    const picture = await downloadAndNormalizeProfilePicture(profilePictureUrl);

    if (input.persist) {
      const storagePath = whatsappProfilePictureStoragePath(input.storeId, input.contact.id);
      const { error: uploadError } = await input.supabase.storage
        .from(WHATSAPP_PROFILE_PICTURE_BUCKET)
        .upload(storagePath, picture.bytes, {
          contentType: picture.contentType,
          cacheControl: '86400',
          upsert: true
        });

      if (uploadError) {
        throw new ProfilePictureStorageError(`Falha ao armazenar foto privada: ${uploadError.message}`);
      }

      await updateContactCacheMetadata(input, 'available', new Date().toISOString());
      logProfilePicture('refresh_persisted', input, {
        bytes: picture.bytes.byteLength,
        duration_ms: Date.now() - startedAt
      });
    } else {
      logProfilePicture('preview_transient', input, {
        bytes: picture.bytes.byteLength,
        duration_ms: Date.now() - startedAt
      });
    }

    return { status: 'available', picture };
  } catch (error) {
    const failureStatus: WhatsappProfilePictureStatus = error instanceof ProfilePictureStorageError
      ? 'storage_error'
      : 'upstream_error';
    await updateContactCacheMetadata(input, failureStatus);
    console.warn('[WhatsApp Profile Picture]', {
      event: 'refresh_failed',
      store: shortId(input.storeId),
      conversation: shortId(input.conversationId),
      contact: shortId(input.contact?.id),
      duration_ms: Date.now() - startedAt,
      status: failureStatus,
      error: error instanceof Error ? error.message.slice(0, 180) : 'unknown'
    });
    return { status: 'error', picture: null };
  }
}

export function refreshWhatsappProfilePicture(input: RefreshInput) {
  const key = `${input.storeId}:${input.contact?.id}`;
  const current = refreshesInFlight.get(key);
  if (current) return current;

  const refresh = performRefresh(input).finally(() => {
    if (refreshesInFlight.get(key) === refresh) refreshesInFlight.delete(key);
  });
  refreshesInFlight.set(key, refresh);
  return refresh;
}
