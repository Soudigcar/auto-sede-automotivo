import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const proxyRoute = readFileSync('src/app/api/store-whatsapp/profile-picture/route.ts', 'utf8');
const inboxRoute = readFileSync('src/app/api/store-whatsapp/route.ts', 'utf8');
const cacheService = readFileSync('src/lib/server/whatsappProfilePictureCache.ts', 'utf8');
const profileHook = readFileSync('src/hooks/useStoreWhatsappProfilePictures.ts', 'utf8');
const avatar = readFileSync('src/components/WhatsappContactAvatar.tsx', 'utf8');
const desktop = readFileSync('src/app/loja/[slug]/whatsapp/page.tsx', 'utf8');
const mobileBridge = readFileSync('src/components/WhatsappMobileInboxBridge.tsx', 'utf8');
const migration = readFileSync('supabase/migrations/20260828025428_whatsapp_profile_picture_private_cache.sql', 'utf8');

test('profile proxy repeats authentication, tenant and operational responsibility boundaries', () => {
  assert.match(proxyRoute, /authorizeStoreWhatsappPortal\(request, slug\)/);
  assert.match(proxyRoute, /\.eq\('id', conversationId\)[\s\S]*?\.eq\('store_id', store\.id\)/);
  assert.match(proxyRoute, /canAccessStoreConversation\(profile, role, conversation, lead\)/);
  assert.match(proxyRoute, /\.eq\('id', conversation\.contact_id\)[\s\S]*?\.eq\('store_id', store\.id\)/);
  assert.match(proxyRoute, /\.eq\('crm_number_id', conversation\.whatsapp_number_id\)[\s\S]*?\.eq\('store_id', store\.id\)[\s\S]*?\.eq\('scope', 'store'\)/);
});

test('browser only receives a private no-store image response or initials fallback', () => {
  assert.match(proxyRoute, /'Cache-Control': 'private, no-store, max-age=0'/);
  assert.match(proxyRoute, /'X-Content-Type-Options': 'nosniff'/);
  assert.match(proxyRoute, /status: 204/);
  assert.match(avatar, /onError=\{\(\) => \{[\s\S]*?setFailed\(true\)[\s\S]*?onImageError\?\.\(\)/);
  assert.match(avatar, /whatsappContactInitials\(name\)/);
});

test('Evolution picture URLs are removed from inbox data and never used directly by store UI', () => {
  assert.match(inboxRoute, /withoutExternalProfilePicture\(conversation\)/);
  assert.match(inboxRoute, /withoutExternalProfilePicture\(contact\)/);
  assert.doesNotMatch(inboxRoute, /load-profile-picture/);
  assert.match(profileHook, /if \(!isEvolutionConversation\(conversation\)\) return legacyConversationPicture\(conversation\)/);
  assert.match(profileHook, /\/api\/store-whatsapp\/profile-picture/);
  assert.match(desktop, /useStoreWhatsappProfilePictures/);
  assert.match(mobileBridge, /mode === 'store' \? getProfilePicture : avatarOf/);
});

test('client prefetch is bounded, deduplicated and retries one decode failure', () => {
  assert.match(profileHook, /PROFILE_PICTURE_PRELOAD_LIMIT = 20/);
  assert.match(profileHook, /PROFILE_PICTURE_MAX_CONCURRENCY = 3/);
  assert.match(profileHook, /const pictureRequests = new Map/);
  assert.match(profileHook, /Promise\.allSettled/);
  assert.match(profileHook, /if \(failures < 2\)[\s\S]*?sessionPictures\.delete\(key\)/);
});

test('Preview is read-only while durable refresh is production-gated and observable', () => {
  assert.match(proxyRoute, /persist: process\.env\.VERCEL_ENV === 'production'/);
  assert.match(cacheService, /if \(!input\.persist\) return/);
  assert.match(cacheService, /else if \(status === 'missing'\)[\s\S]*?delete metadata\.profile_picture_storage_path/);
  assert.match(cacheService, /\.remove\(\[storagePath\]\)/);
  assert.match(cacheService, /event: 'refresh_failed'/);
  assert.match(cacheService, /logProfilePicture\('refresh_persisted'/);
  assert.match(cacheService, /logProfilePicture\('preview_transient'/);
  assert.match(proxyRoute, /event: 'cache_hit'/);
});

test('versioned Storage migration provisions a private WebP-only bucket without public policies', () => {
  assert.match(migration, /'whatsapp-profile-pictures-v1'/);
  assert.match(migration, /public,\s*file_size_limit,\s*allowed_mime_types/);
  assert.match(migration, /false,\s*1048576,\s*array\['image\/webp'\]::text\[\]/);
  assert.doesNotMatch(migration, /create\s+policy/i);
  assert.doesNotMatch(migration, /storage\.objects/i);
});
