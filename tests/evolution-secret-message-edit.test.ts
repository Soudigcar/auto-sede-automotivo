import assert from 'node:assert/strict';
import test from 'node:test';
import {
  evolutionSecretMessageEditTarget,
  foldEvolutionMessageEdits
} from '../src/lib/server/evolutionSecretMessageEdit.ts';

function fixture() {
  const original = {
    id: 'original-row',
    whatsapp_number_id: 'number-1',
    wa_message_id: 'evolution:number-1:TARGET123',
    direction: 'inbound',
    message_type: 'text',
    body: 'Texto antes da edição',
    status: 'received',
    sent_at: '2026-09-04T18:00:42.000Z',
    raw_payload: {
      key: { id: 'TARGET123', remoteJid: '5561999999999@s.whatsapp.net', fromMe: false },
      message: { messageContextInfo: { messageSecret: Array(32).fill(7) }, conversation: 'Texto antes da edição' }
    }
  };

  const edit = {
    id: 'edit-row',
    whatsapp_number_id: 'number-1',
    wa_message_id: 'evolution:number-1:EDIT456',
    direction: 'inbound',
    message_type: 'secretencrypted',
    body: '[Mensagem secretEncryptedMessage]',
    status: 'received',
    sent_at: '2026-09-04T18:00:49.000Z',
    raw_payload: {
      key: { id: 'EDIT456', remoteJid: '5561999999999@s.whatsapp.net', fromMe: false },
      messageType: 'secretEncryptedMessage',
      message: {
        secretEncryptedMessage: {
          targetMessageKey: { id: 'TARGET123', remoteJid: '5561999999999@s.whatsapp.net', fromMe: true },
          encIv: Array(12).fill(1),
          encPayload: Array(40).fill(2),
          secretEncType: 2
        }
      }
    }
  };

  return { original, edit };
}

test('recognizes MESSAGE_EDIT and links it to the provider message id', () => {
  const { edit } = fixture();
  assert.equal(evolutionSecretMessageEditTarget(edit.raw_payload), 'TARGET123');
});

test('hides the encrypted envelope and keeps the original message on authentication failure', () => {
  const { original, edit } = fixture();
  const folded = foldEvolutionMessageEdits([original, edit]);
  assert.equal(folded.length, 1);
  assert.equal(folded[0].id, original.id);
  assert.equal(folded[0].body, original.body);
  assert.equal(folded[0].edited, true);
  assert.equal(folded[0].edit_content_unavailable, true);
  assert.equal(folded[0].edited_at, edit.sent_at);
});

test('does not treat other secret envelope types as message edits', () => {
  const { edit } = fixture();
  edit.raw_payload.message.secretEncryptedMessage.secretEncType = 1;
  assert.equal(evolutionSecretMessageEditTarget(edit.raw_payload), '');
});
