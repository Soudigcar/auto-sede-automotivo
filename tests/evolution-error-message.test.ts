import assert from 'node:assert/strict';
import test from 'node:test';
import { evolutionErrorMessage } from '../src/lib/server/evolution.ts';
import { evolutionInstanceDetails } from '../src/lib/server/managedWhatsappEvolution.ts';

test('translates Evolution recipient lookup objects without object coercion', () => {
  const message = evolutionErrorMessage({
    status: 400,
    error: 'Bad Request',
    response: {
      message: [{ exists: false, jid: '5561993255792@s.whatsapp.net', number: '5561993255792' }]
    }
  }, 400);

  assert.equal(message, 'O número informado não foi encontrado no WhatsApp.');
  assert.doesNotMatch(message, /\[object Object\]/);
  assert.doesNotMatch(message, /5561993255792/);
});

test('extracts nested provider validation constraints and redacts long numbers', () => {
  assert.equal(
    evolutionErrorMessage({ message: [{ constraints: { isValid: 'number 556181853597 is invalid' } }] }, 400),
    'number [número] is invalid'
  );
});

test('reads the connected number from flat and nested Evolution instance responses', () => {
  assert.equal(
    evolutionInstanceDetails([{ ownerJid: '5561993255792:17@s.whatsapp.net', profileName: '7hs' }]).phoneNumber,
    '5561993255792'
  );
  assert.equal(
    evolutionInstanceDetails([{ instance: { ownerJid: '5561993255792@s.whatsapp.net' } }]).phoneNumber,
    '5561993255792'
  );
  assert.equal(
    evolutionInstanceDetails({ data: [{ instance: { number: '+55 (61) 99325-5792' } }] }).phoneNumber,
    '5561993255792'
  );
});
