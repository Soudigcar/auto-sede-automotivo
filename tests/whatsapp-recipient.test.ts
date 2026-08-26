import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  isConnectedWhatsappNumber,
  normalizeWhatsappRecipient
} from '../src/lib/server/whatsappRecipient.ts';

const textRoute = readFileSync('src/app/api/whatsapp/messages/send/route.ts', 'utf8');
const attachmentRoute = readFileSync('src/app/api/whatsapp/messages/send-attachment/route.ts', 'utf8');

test('normalizes WhatsApp JIDs without keeping multi-device suffixes', () => {
  assert.equal(normalizeWhatsappRecipient('5561993255792:17@s.whatsapp.net'), '5561993255792');
  assert.equal(normalizeWhatsappRecipient('+55 (61) 99325-5792'), '5561993255792');
});

test('detects only a valid exact match with the connected WhatsApp number', () => {
  assert.equal(isConnectedWhatsappNumber('5561993255792', '5561993255792@s.whatsapp.net'), true);
  assert.equal(isConnectedWhatsappNumber('556181853597', '5561993255792'), false);
  assert.equal(isConnectedWhatsappNumber('', ''), false);
});

test('text and attachment sends fail safely before calling the provider for the connected number', () => {
  for (const route of [textRoute, attachmentRoute]) {
    assert.match(route, /isConnectedWhatsappNumber\(recipient|isConnectedWhatsappNumber\(evolutionRecipient/);
    assert.match(route, /code: 'SELF_RECIPIENT'/);
    assert.match(route, /próprio número conectado da loja/);
  }
});

test('provider failures have a typed response and safe diagnostic stage', () => {
  for (const route of [textRoute, attachmentRoute]) {
    assert.match(route, /error instanceof EvolutionApiError/);
    assert.match(route, /stage: failureStage/);
    assert.match(route, /code: 'EVOLUTION_SEND_FAILED'/);
  }
});
