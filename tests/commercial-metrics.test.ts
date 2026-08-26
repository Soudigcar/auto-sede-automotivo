import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateConversion, calculateResponseTimes, isAutocarOutbound } from '../src/lib/commercialMetrics';

test('tempo de resposta exclui AUTOCAR e usa a primeira resposta humana posterior', () => {
  const conversations = [{ id: 'conversation-1', lead_id: 'lead-1' }];
  const messages = [
    { conversation_id: 'conversation-1', direction: 'inbound', sent_at: '2026-08-23T12:00:00Z' },
    { conversation_id: 'conversation-1', direction: 'outbound', sent_at: '2026-08-23T12:00:10Z', raw_payload: { autocar_live_pilot: true } },
    { conversation_id: 'conversation-1', direction: 'outbound', sent_at: '2026-08-23T12:15:00Z', raw_payload: { metric_sender_type: 'human', metric_sender_user_id: 'user-1' } }
  ];

  const result = calculateResponseTimes(conversations, messages);
  assert.equal(result.summary.measured_conversations, 1);
  assert.equal(result.summary.average_minutes, 15);
  assert.equal(result.measurements[0].responder_user_id, 'user-1');
});

test('tempo de resposta informa cobertura e conversas sem resposta', () => {
  const conversations = [
    { id: 'conversation-1', lead_id: 'lead-1' },
    { id: 'conversation-2', lead_id: 'lead-2' }
  ];
  const messages = [
    { conversation_id: 'conversation-1', direction: 'inbound', sent_at: '2026-08-23T12:00:00Z' },
    { conversation_id: 'conversation-1', direction: 'outbound', sent_at: '2026-08-23T12:05:00Z' },
    { conversation_id: 'conversation-2', direction: 'inbound', sent_at: '2026-08-23T12:00:00Z' }
  ];

  const result = calculateResponseTimes(conversations, messages);
  assert.equal(result.summary.eligible_conversations, 2);
  assert.equal(result.summary.measured_conversations, 1);
  assert.equal(result.summary.unanswered_conversations, 1);
  assert.equal(result.summary.coverage_percent, 50);
});

test('conversão usa leads distintos da coorte e ignora venda cancelada ou duplicada', () => {
  const leads = [{ id: 'lead-1' }, { id: 'lead-2' }, { id: 'lead-3' }];
  const sales = [
    { id: 'sale-1', lead_id: 'lead-1', status: 'confirmed', confirmed_at: '2026-08-20T12:00:00Z' },
    { id: 'sale-2', lead_id: 'lead-1', status: 'confirmed', confirmed_at: '2026-08-21T12:00:00Z' },
    { id: 'sale-3', lead_id: 'lead-2', status: 'cancelled', confirmed_at: '2026-08-21T12:00:00Z' },
    { id: 'sale-4', lead_id: 'outside', status: 'confirmed', confirmed_at: '2026-08-21T12:00:00Z' }
  ];

  assert.deepEqual(calculateConversion(leads, sales), {
    eligible_leads: 3,
    converted_leads: 1,
    conversion_rate: 33.33
  });
});

test('marcadores conhecidos identificam saída automática', () => {
  assert.equal(isAutocarOutbound({ raw_payload: { autocar_live_photo_pilot: true } }), true);
  assert.equal(isAutocarOutbound({ raw_payload: { metric_sender_type: 'human' } }), false);
  assert.equal(isAutocarOutbound({ autocar_live_photo_pilot: 'true' }), true);
  assert.equal(isAutocarOutbound({ metric_sender_type: 'human' }), false);
});

test('tempo de resposta aceita os campos JSON projetados sem carregar raw_payload', () => {
  const result = calculateResponseTimes(
    [{ id: 'conversation-1', lead_id: 'lead-1' }],
    [
      { conversation_id: 'conversation-1', direction: 'inbound', sent_at: '2026-08-23T12:00:00Z' },
      { conversation_id: 'conversation-1', direction: 'outbound', sent_at: '2026-08-23T12:00:10Z', autocar_live_pilot: 'true' },
      { conversation_id: 'conversation-1', direction: 'outbound', sent_at: '2026-08-23T12:03:00Z', metric_sender_type: 'human', metric_sender_user_id: 'user-2' }
    ]
  );

  assert.equal(result.measurements[0].response_minutes, 3);
  assert.equal(result.measurements[0].responder_user_id, 'user-2');
});
