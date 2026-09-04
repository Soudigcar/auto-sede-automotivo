import assert from 'node:assert/strict';
import test from 'node:test';
import {
  decryptEvolutionMessageEdit,
  evolutionSecretMessageEditTarget,
  foldEvolutionMessageEdits
} from '../src/lib/server/evolutionSecretMessageEdit.ts';

function bytes(value: string) {
  return [...Buffer.from(value, 'base64')];
}

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
      message: {
        messageContextInfo: { messageSecret: bytes('AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=') },
        conversation: 'Texto antes da edição'
      }
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
          encIv: bytes('AAECAwQFBgcICQoL'),
          encPayload: bytes('le8kL+C4DCWVMKOeiKewiLCro+AEvCncN7juIcW8ZQKY'),
          secretEncType: 2
        }
      }
    }
  };

  return { original, edit };
}

test('decrypts MESSAGE_EDIT with the original message secret', () => {
  const { original, edit } = fixture();
  assert.deepEqual(decryptEvolutionMessageEdit(edit, original), {
    body: 'Texto corrigido',
    messageType: 'text'
  });
});

test('recognizes MESSAGE_EDIT and links it to the provider message id', () => {
  const { edit } = fixture();
  assert.equal(evolutionSecretMessageEditTarget(edit.raw_payload), 'TARGET123');
});

test('folds the encrypted envelope into the original message', () => {
  const { original, edit } = fixture();
  const folded = foldEvolutionMessageEdits([original, edit]);
  assert.equal(folded.length, 1);
  assert.equal(folded[0].id, original.id);
  assert.equal(folded[0].body, 'Texto corrigido');
  assert.equal(folded[0].edited, true);
  assert.equal(folded[0].edit_content_unavailable, false);
  assert.equal(folded[0].edited_at, edit.sent_at);
});

test('fails closed and keeps the known original content when authentication fails', () => {
  const { original, edit } = fixture();
  edit.raw_payload.message.secretEncryptedMessage.encPayload[0] ^= 1;
  const folded = foldEvolutionMessageEdits([original, edit]);
  assert.equal(folded.length, 1);
  assert.equal(folded[0].body, original.body);
  assert.equal(folded[0].edited, true);
  assert.equal(folded[0].edit_content_unavailable, true);
});

test('does not treat other secret envelope types as message edits', () => {
  const { edit } = fixture();
  edit.raw_payload.message.secretEncryptedMessage.secretEncType = 1;
  assert.equal(evolutionSecretMessageEditTarget(edit.raw_payload), '');
});
