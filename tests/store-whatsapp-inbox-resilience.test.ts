import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { includeRequestedConversation } from '../src/lib/server/storeWhatsappInbox.ts';

const route = readFileSync('src/app/api/store-whatsapp/route.ts', 'utf8');
const page = readFileSync('src/app/loja/[slug]/whatsapp/page.tsx', 'utf8');
const mobileBridge = readFileSync('src/components/WhatsappMobileInboxBridge.tsx', 'utf8');
const masterPage = readFileSync('src/app/master/whatsapp/inbox/page.tsx', 'utf8');

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
  assert.match(route, /\.in\('conversation_id', selectedConversation\.related_conversation_ids\)[\s\S]*?\.eq\('store_id', store\.id\)/);
  assert.match(route, /selected_conversation_id: selectedConversation\?\.id \|\| null/);
  assert.match(route, /'Cache-Control': 'private, no-store, max-age=0'/);
  assert.match(page, /cache: 'no-store'/);
});

test('desktop and mobile inboxes ignore late responses from an obsolete navigation', () => {
  for (const inbox of [page, mobileBridge]) {
    assert.match(inbox, /const inboxRequestRef = useRef\(0\)/);
    assert.match(inbox, /const requestId = \+\+inboxRequestRef\.current/);
    assert.match(inbox, /requestId !== inboxRequestRef\.current/);
    assert.match(inbox, /inboxRequestRef\.current \+= 1/);
  }
});

test('desktop and mobile fall back from stale access without retaining another history', () => {
  assert.match(page, /error instanceof InboxRequestError && error\.status === 404/);
  assert.match(mobileBridge, /error instanceof MobileInboxRequestError && error\.status === 404/);

  for (const inbox of [page, mobileBridge]) {
    assert.match(inbox, /const fallbackList = await fetchInbox\(\)/);
    assert.match(inbox, /setConversations\(\[\]\)[\s\S]*?setSelectedId\(''\)[\s\S]*?setMessages\(\[\]\)/);
    assert.match(inbox, /não está mais disponível para este acesso/);
  }
});

test('mobile AUTOCAR lookup failures do not replace the chat status banner', () => {
  const loadAutocar = mobileBridge.slice(
    mobileBridge.indexOf('async function loadAutocar'),
    mobileBridge.indexOf('async function fetchInbox')
  );

  assert.match(loadAutocar, /setAutocarError\(apiErrorMessage\(error/);
  assert.doesNotMatch(loadAutocar, /setStatusMessage/);
});

test('desktop inbox never renders structured API errors as object coercions', () => {
  assert.match(page, /import \{ apiErrorMessage \}/);
  assert.match(page, /new InboxRequestError\(apiErrorMessage\(result/);
  assert.match(page, /setStatusMessage\(apiErrorMessage\(error, 'Erro ao enviar mensagem\.'\)\)/);
  assert.doesNotMatch(page, /new Error\(result\.error \|\|/);
  assert.doesNotMatch(page, /setStatusMessage\(error\?\.message \|\|/);
});

test('Master desktop inbox uses the same structured API error formatter', () => {
  assert.match(masterPage, /import \{ apiErrorMessage \}/);
  assert.match(masterPage, /new Error\(apiErrorMessage\(result, 'Não foi possível carregar Inbox WhatsApp\.'\)\)/);
  assert.match(masterPage, /setStatusMessage\(apiErrorMessage\(result, 'Não foi possível marcar como lida\.'\)\)/);
  assert.match(masterPage, /new Error\(apiErrorMessage\(result, 'Não foi possível enviar mensagem\.'\)\)/);
  assert.doesNotMatch(masterPage, /new Error\(result\.error \|\|/);
  assert.doesNotMatch(masterPage, /setStatusMessage\(result\.error \|\|/);
});

test('denied detail requests emit diagnostic reasons without message content', () => {
  assert.match(route, /reason: 'missing_or_store_mismatch'/);
  assert.match(route, /reason: requestedConversation\?\.lead_id && !requestedLead \? 'missing_lead' : 'responsibility_scope'/);
  assert.doesNotMatch(route, /console\.(?:warn|error)\([^\n]*message\.body/);
});
