import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { whatsappMediaResponsePolicy } from '../src/lib/server/whatsappMediaSafety.ts';

const storeInboxRoute = readFileSync('src/app/api/store-whatsapp/route.ts', 'utf8');
const storePortal = readFileSync('src/lib/server/storePortal.ts', 'utf8');
const mediaRoute = readFileSync('src/app/api/whatsapp/messages/media/route.ts', 'utf8');
const sendRoute = readFileSync('src/app/api/whatsapp/messages/send/route.ts', 'utf8');
const attachmentRoute = readFileSync('src/app/api/whatsapp/messages/send-attachment/route.ts', 'utf8');
const locationRoute = readFileSync('src/app/api/whatsapp/messages/send-location/route.ts', 'utf8');
const commerceMediaRoute = readFileSync('src/app/api/whatsapp/messages/send-media/route.ts', 'utf8');
const desktopMedia = readFileSync('src/components/WhatsappMediaMessage.tsx', 'utf8');
const mobileMedia = readFileSync('src/components/WhatsappMobileMediaMessage.tsx', 'utf8');
const masterInbox = readFileSync('src/app/api/master/whatsapp/inbox/route.ts', 'utf8');
const realtimeSync = readFileSync('src/components/StoreWhatsappRealtimeSync.tsx', 'utf8');
const rootLayout = readFileSync('src/app/layout.tsx', 'utf8');
const storeLayout = readFileSync('src/app/loja/[slug]/layout.tsx', 'utf8');

test('documents never inherit an active provider MIME and are always downloaded', () => {
  for (const mime of ['text/html', 'Text/HTML; charset=utf-8', 'application/xhtml+xml', 'image/svg+xml', 'application/pdf']) {
    assert.deepEqual(whatsappMediaResponsePolicy('document', mime), {
      contentType: 'application/octet-stream',
      disposition: 'attachment'
    });
  }
  assert.equal(whatsappMediaResponsePolicy('image', 'image/svg+xml'), null);
  assert.equal(whatsappMediaResponsePolicy('image', 'text/html'), null);
  assert.deepEqual(whatsappMediaResponsePolicy('image', 'image/png; charset=binary'), {
    contentType: 'image/png',
    disposition: 'inline'
  });
  assert.deepEqual(whatsappMediaResponsePolicy('video', 'video/mp4'), {
    contentType: 'video/mp4',
    disposition: 'inline'
  });
  assert.deepEqual(whatsappMediaResponsePolicy('audio', 'audio/ogg'), {
    contentType: 'audio/ogg',
    disposition: 'inline'
  });
});

test('media API applies the server policy and both clients download documents instead of opening active blobs', () => {
  assert.match(mediaRoute, /whatsappMediaResponsePolicy/);
  assert.match(mediaRoute, /responsePolicy\.contentType/);
  assert.match(mediaRoute, /responsePolicy\.disposition/);
  assert.match(mediaRoute, /'X-Content-Type-Options': 'nosniff'/);
  for (const client of [desktopMedia, mobileMedia]) {
    assert.match(client, /type === 'document' \? '&download=1'/);
    assert.match(client, /download=\{body \|\| 'documento-whatsapp'\}/);
    const documentBranch = client.slice(client.indexOf("type === 'document'"), client.indexOf("type === 'document'") + 1_500);
    assert.doesNotMatch(documentBranch, /target="_blank"/);
  }
});

test('every store WhatsApp HTTP entry point enforces store lifecycle before sensitive work', () => {
  assert.match(storeInboxRoute, /authorizeStoreWhatsappPortal\(request, slug\)/);
  assert.match(storePortal, /role==='master'&&input\.allowMasterWhenStoreUnavailable/);
  assert.match(storePortal, /isOperationalStoreSaas\(store\)/);
  for (const route of [mediaRoute, sendRoute, attachmentRoute, locationRoute, commerceMediaRoute]) {
    assert.match(route, /canUseStoreWhatsapp\(supabase, profile,/);
  }
  assert.ok(sendRoute.indexOf('canUseStoreWhatsapp') < sendRoute.indexOf("failureStage = 'conversation_context'"));
  assert.ok(attachmentRoute.indexOf('canUseStoreWhatsapp') < attachmentRoute.indexOf("failureStage = 'conversation_context'"));
  assert.ok(mediaRoute.lastIndexOf('canUseStoreWhatsapp') < mediaRoute.indexOf('evolutionRequest('));
  assert.ok(locationRoute.lastIndexOf('canUseStoreWhatsapp') < locationRoute.indexOf('readManagedEvolutionState(integration)'));
  assert.ok(commerceMediaRoute.lastIndexOf('canUseStoreWhatsapp') < commerceMediaRoute.indexOf('readManagedEvolutionState(integration)'));
});

test('location and commerce media share live-state, self-recipient and pre-send takeover safeguards', () => {
  for (const route of [locationRoute, commerceMediaRoute]) {
    assert.match(route, /readManagedEvolutionState/);
    assert.match(route, /resolveEvolutionAvailability/);
    assert.match(route, /isConnectedWhatsappNumber/);
    assert.match(route, /code: 'SELF_RECIPIENT'/);
  }
  assert.ok(commerceMediaRoute.indexOf('markAutocarHumanActive({') < commerceMediaRoute.indexOf('for (let index'));
});

test('store and Master mark-read operate on server-validated duplicate groups', () => {
  assert.match(storeInboxRoute, /relatedWhatsappConversationIds\(authorizedRelatedRows, conversationId\)/);
  assert.match(storeInboxRoute, /\.in\('id', idsToMarkRead\)/);
  assert.match(masterInbox, /collapseWhatsappConversations\(enrichedConversations\)/);
  assert.match(masterInbox, /relatedWhatsappConversationIds\(enrichedRelatedRows, conversationId\)/);
  assert.match(masterInbox, /\.in\('conversation_id', selectedConversation\.related_conversation_ids\)/);
  assert.match(masterInbox, /\.in\('id', idsToMarkRead\)/);
  assert.doesNotMatch(storeInboxRoute, /slice\(0, 50\)/);
  assert.doesNotMatch(masterInbox, /slice\(0, 50\)/);
});

test('collapsed histories keep the newest bounded messages and present them chronologically', () => {
  assert.match(storeInboxRoute, /\.order\('sent_at', \{ ascending: false \}\)[\s\S]*?\.limit\(250\)/);
  assert.match(storeInboxRoute, /messages = \[\.\.\.\(messageRows \|\| \[\]\)\]\.reverse\(\)\.map/);
  assert.match(masterInbox, /\.order\('created_at', \{ ascending: false \}\)[\s\S]*?\.limit\(300\)/);
  assert.match(masterInbox, /messages = \[\.\.\.\(messageRows \|\| \[\]\)\]\.reverse\(\)\.map/);
});

test('collaborators refresh through the protected API without subscribing to store-wide Realtime rows', () => {
  assert.doesNotMatch(rootLayout, /<StoreWhatsappRealtimeSync/);
  assert.match(storeLayout, /<StorePortalShell>[\s\S]*?<StoreWhatsappRealtimeSync/);

  const connectRealtime = realtimeSync.slice(
    realtimeSync.indexOf('async function connectRealtime'),
    realtimeSync.indexOf('void connectRealtime()')
  );
  assert.match(connectRealtime, /if \(!canSubscribeStoreWideWhatsappRealtime\(profileRole\)\) return/);
  assert.ok(
    connectRealtime.indexOf('canSubscribeStoreWideWhatsappRealtime(profileRole)') <
      connectRealtime.indexOf('.channel(')
  );
  assert.match(realtimeSync, /window\.setInterval\([\s\S]*?queueRefresh\('fallback'\)/);
  assert.match(realtimeSync, /button\[aria-label="Atualizar conversas"\]/);
});

test('store WhatsApp reads and mutations repeat the assigned-lead authorization boundary', () => {
  assert.match(storeInboxRoute, /canAccessConversation\(profile, store, conversation, accessLeadsById\[conversation\.lead_id\]\)/);
  assert.match(storeInboxRoute, /if \(!conversation \|\| !canAccessConversation\(profile, store, conversation, lead\)\)/);
  for (const route of [sendRoute, locationRoute]) assert.match(route, /canAccessStoreConversation/);
  for (const route of [attachmentRoute, commerceMediaRoute, mediaRoute]) assert.match(route, /canAccessStoreLead/);
});
