import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { includeRequestedConversation } from '../src/lib/server/storeWhatsappInbox.ts';

const route = readFileSync('src/app/api/store-whatsapp/route.ts', 'utf8');
const page = readFileSync('src/app/loja/[slug]/whatsapp/page.tsx', 'utf8');

test('conversation detail is resolved directly inside the authenticated store', () => {
  assert.match(route, /requestedConversationResponse[\s\S]*?\.eq\('id', conversationId\)[\s\S]*?\.eq\('store_id', store\.id\)[\s\S]*?\.maybeSingle\(\)/);
  assert.match(route, /includeRequestedConversation\(storeConversations, requestedConversation\)/);
  assert.match(route, /canAccessConversation\(profile, store, conversation, accessLeadsById\[conversation\.lead_id\]\)/);
});

test('a requested conversation older than the recent-page limit remains addressable without duplication', () => {
  const recent = Array.from({ length: 100 }, (_, index) => ({ id: `recent-${index}` }));
  const older = { id: 'older-selected' };

  const withOlder = includeRequestedConversation(recent, older);
  assert.equal(withOlder.length, 101);
  assert.equal(withOlder[0], older);
  assert.equal(recent.length, 100);

  const alreadyRecent = includeRequestedConversation(recent, recent[84]);
  assert.equal(alreadyRecent, recent);
  assert.equal(alreadyRecent.filter((item) => item.id === recent[84].id).length, 1);
});

test('message history repeats the store boundary and authenticated GET responses are not cached', () => {
  assert.match(route, /\.eq\('conversation_id', conversationId\)[\s\S]*?\.eq\('store_id', store\.id\)/);
  assert.match(route, /'Cache-Control': 'private, no-store, max-age=0'/);
  assert.match(page, /cache: 'no-store'/);
});

test('mobile inbox ignores late responses from an obsolete navigation', () => {
  assert.match(page, /const inboxRequestRef = useRef\(0\)/);
  assert.match(page, /const requestId = \+\+inboxRequestRef\.current/);
  assert.match(page, /requestId !== inboxRequestRef\.current/);
  assert.match(page, /inboxRequestRef\.current \+= 1/);
});

test('a stale or revoked conversation falls back without retaining another history on screen', () => {
  assert.match(page, /error instanceof InboxRequestError && error\.status === 404/);
  assert.match(page, /const fallbackList = await fetchInbox\(\)/);
  assert.match(page, /setConversations\(\[\]\)[\s\S]*?setSelectedId\(''\)[\s\S]*?setMessages\(\[\]\)/);
  assert.match(page, /não está mais disponível para este acesso/);
});

test('denied detail requests emit diagnostic reasons without message content', () => {
  assert.match(route, /reason: 'missing_or_store_mismatch'/);
  assert.match(route, /reason: requestedConversation\?\.lead_id && !requestedLead \? 'missing_lead' : 'responsibility_scope'/);
  assert.doesNotMatch(route, /console\.(?:warn|error)\([^\n]*message\.body/);
});
