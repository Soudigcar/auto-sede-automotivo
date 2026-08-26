import assert from 'node:assert/strict';
import test from 'node:test';

import { collapseWhatsappConversations, relatedWhatsappConversationIds } from '../src/lib/server/storeWhatsappInbox.ts';

test('collapses duplicate conversations from the same channel and normalized phone', () => {
  const collapsed = collapseWhatsappConversations([
    {
      id: 'legacy-conversation',
      whatsapp_number_id: 'store-number',
      last_message_at: '2026-08-26T15:38:00Z',
      unread_count: 1,
      status: 'open',
      contact: { phone: '(61) 8185-3597', profile_name: 'Contato final 3597' },
      lead: { customer_phone: '6181853597', customer_name: 'Contato final 3597' },
      base_lead: null
    },
    {
      id: 'canonical-conversation',
      whatsapp_number_id: 'store-number',
      last_message_at: '2026-08-26T16:04:00Z',
      unread_count: 2,
      status: 'open',
      contact: { phone: '+55 61 8185-3597', profile_name: 'Gilberto Castro' },
      lead: { customer_phone: '556181853597', customer_name: 'Gilberto Castro' },
      base_lead: null
    }
  ]);

  assert.equal(collapsed.length, 1);
  assert.equal(collapsed[0].id, 'canonical-conversation');
  assert.deepEqual(collapsed[0].related_conversation_ids, ['canonical-conversation', 'legacy-conversation']);
  assert.equal(collapsed[0].contact?.profile_name, 'Gilberto Castro');
  assert.equal(collapsed[0].unread_count, 3);
});

test('does not collapse the same customer across different store WhatsApp channels', () => {
  const collapsed = collapseWhatsappConversations([
    { id: 'channel-a', whatsapp_number_id: 'number-a', contact: { phone: '556181853597' } },
    { id: 'channel-b', whatsapp_number_id: 'number-b', contact: { phone: '556181853597' } }
  ]);

  assert.equal(collapsed.length, 2);
});

test('mark-read resolves only the duplicate group that contains the selected conversation', () => {
  const conversations = [
    { id: 'selected', whatsapp_number_id: 'number-a', contact: { phone: '556181853597' } },
    { id: 'duplicate', whatsapp_number_id: 'number-a', contact: { phone: '(61) 8185-3597' } },
    { id: 'other-customer', whatsapp_number_id: 'number-a', contact: { phone: '556199999999' } },
    { id: 'other-channel', whatsapp_number_id: 'number-b', contact: { phone: '556181853597' } }
  ];

  assert.deepEqual(
    relatedWhatsappConversationIds(conversations, 'selected'),
    ['selected', 'duplicate']
  );
});
