import assert from 'node:assert/strict';
import test from 'node:test';
import { microphoneAccessErrorMessage } from '../src/lib/client/microphoneAccessError.ts';

test('distinguishes browser permission from a macOS microphone block', () => {
  const error = new DOMException('Permission denied', 'NotAllowedError');
  assert.match(microphoneAccessErrorMessage(error, 'granted'), /macOS bloqueou o microfone/);
  assert.match(microphoneAccessErrorMessage(error, 'denied'), /bloqueado para este site/);
});

test('explains missing and busy microphone devices', () => {
  assert.match(
    microphoneAccessErrorMessage(new DOMException('Missing', 'NotFoundError'), 'granted'),
    /Nenhum microfone foi encontrado/
  );
  assert.match(
    microphoneAccessErrorMessage(new DOMException('Busy', 'NotReadableError'), 'granted'),
    /ocupado/
  );
});
