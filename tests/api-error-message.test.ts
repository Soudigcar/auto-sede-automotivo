import assert from 'node:assert/strict';
import test from 'node:test';
import { apiErrorMessage } from '../src/lib/client/apiErrorMessage.ts';

test('extracts readable messages from nested API error payloads', () => {
  assert.equal(
    apiErrorMessage({ error: { message: 'Evolution desconectada.' } }, 'Falha no envio.'),
    'Evolution desconectada.'
  );
  assert.equal(
    apiErrorMessage({ error: { code: 'provider_error' }, message: 'Canal temporariamente indisponível.' }, 'Falha no envio.'),
    'Canal temporariamente indisponível.'
  );
  assert.equal(
    apiErrorMessage([{ detail: 'Primeiro erro' }, { message: 'Segundo erro' }], 'Falha no envio.'),
    'Primeiro erro, Segundo erro'
  );
});

test('never exposes an object coercion as the user-facing error', () => {
  assert.equal(apiErrorMessage({ error: { code: 'provider_error' } }, 'Falha no envio.'), 'Falha no envio.');
  assert.equal(apiErrorMessage('[object Object]', 'Falha no envio.'), 'Falha no envio.');
  assert.equal(apiErrorMessage('O WhatsApp recusou o envio. [object Object]', 'Falha no envio.'), 'O WhatsApp recusou o envio.');
  assert.equal(apiErrorMessage(new Error('Sessão expirada.'), 'Falha no envio.'), 'Sessão expirada.');
});
