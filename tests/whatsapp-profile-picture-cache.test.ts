import assert from 'node:assert/strict';
import test from 'node:test';
import {
  WHATSAPP_PROFILE_PICTURE_ERROR_RETRY_MS,
  WHATSAPP_PROFILE_PICTURE_MISSING_RETRY_MS,
  WHATSAPP_PROFILE_PICTURE_REFRESH_MS,
  isAllowedWhatsappProfilePictureUrl,
  isRetryableWhatsappProfilePictureError,
  isSupportedWhatsappProfilePictureContentType,
  whatsappProfilePictureMetadata,
  whatsappProfilePictureNeedsRefresh,
  whatsappProfilePictureStoragePath
} from '../src/lib/whatsappProfilePicture.ts';

const now = Date.parse('2026-08-28T12:00:00.000Z');

function cache(input: Record<string, unknown>) {
  return whatsappProfilePictureMetadata(input);
}

test('private cache paths are stable per tenant and reject traversal', () => {
  assert.equal(
    whatsappProfilePictureStoragePath('store-123', 'contact-456'),
    'store-123/contact-456/avatar.webp'
  );
  assert.throws(() => whatsappProfilePictureStoragePath('../store-123', 'contact-456'));
  assert.throws(() => whatsappProfilePictureStoragePath('store-123', 'contact/456'));
  assert.throws(() => whatsappProfilePictureStoragePath('', 'contact-456'));
});

test('available pictures renew after 24 hours without hiding stale cache', () => {
  const fresh = cache({
    profile_picture_storage_path: 'store/contact/avatar.webp',
    profile_picture_source_refreshed_at: new Date(now - WHATSAPP_PROFILE_PICTURE_REFRESH_MS + 1).toISOString(),
    profile_picture_cache_status: 'available'
  });
  const stale = cache({
    ...fresh.metadata,
    profile_picture_source_refreshed_at: new Date(now - WHATSAPP_PROFILE_PICTURE_REFRESH_MS).toISOString()
  });

  assert.equal(whatsappProfilePictureNeedsRefresh(fresh, now), false);
  assert.equal(whatsappProfilePictureNeedsRefresh(stale, now), true);
});

test('missing and upstream failures use separate retry windows', () => {
  const recentMissing = cache({
    profile_picture_cache_status: 'missing',
    profile_picture_last_attempt_at: new Date(now - WHATSAPP_PROFILE_PICTURE_MISSING_RETRY_MS + 1).toISOString()
  });
  const expiredMissing = cache({
    ...recentMissing.metadata,
    profile_picture_last_attempt_at: new Date(now - WHATSAPP_PROFILE_PICTURE_MISSING_RETRY_MS).toISOString()
  });
  const recentError = cache({
    profile_picture_cache_status: 'upstream_error',
    profile_picture_last_attempt_at: new Date(now - WHATSAPP_PROFILE_PICTURE_ERROR_RETRY_MS + 1).toISOString()
  });
  const expiredError = cache({
    ...recentError.metadata,
    profile_picture_last_attempt_at: new Date(now - WHATSAPP_PROFILE_PICTURE_ERROR_RETRY_MS).toISOString()
  });

  assert.equal(whatsappProfilePictureNeedsRefresh(recentMissing, now), false);
  assert.equal(whatsappProfilePictureNeedsRefresh(expiredMissing, now), true);
  assert.equal(whatsappProfilePictureNeedsRefresh(recentError, now), false);
  assert.equal(whatsappProfilePictureNeedsRefresh(expiredError, now), true);
});

test('remote picture validation is HTTPS-only and fail-closed', () => {
  assert.equal(isAllowedWhatsappProfilePictureUrl('https://pps.whatsapp.net/v/t61/photo.jpg'), true);
  assert.equal(isAllowedWhatsappProfilePictureUrl('https://lookaside.fbsbx.com/photo.webp'), true);
  assert.equal(isAllowedWhatsappProfilePictureUrl('http://pps.whatsapp.net/photo.jpg'), false);
  assert.equal(isAllowedWhatsappProfilePictureUrl('https://user:secret@pps.whatsapp.net/photo.jpg'), false);
  assert.equal(isAllowedWhatsappProfilePictureUrl('https://whatsapp.net.evil.example/photo.jpg'), false);
  assert.equal(isAllowedWhatsappProfilePictureUrl('https://127.0.0.1/photo.jpg'), false);

  assert.equal(isSupportedWhatsappProfilePictureContentType('image/jpeg; charset=binary'), true);
  assert.equal(isSupportedWhatsappProfilePictureContentType('image/svg+xml'), false);
  assert.equal(isSupportedWhatsappProfilePictureContentType('text/html'), false);
});

test('retry is limited to transient network and upstream failures', () => {
  assert.equal(isRetryableWhatsappProfilePictureError({ status: 429 }), true);
  assert.equal(isRetryableWhatsappProfilePictureError({ status: 504 }), true);
  assert.equal(isRetryableWhatsappProfilePictureError({ name: 'TimeoutError' }), true);
  assert.equal(isRetryableWhatsappProfilePictureError({ status: 404 }), false);
  assert.equal(isRetryableWhatsappProfilePictureError({ status: 413 }), false);
});
