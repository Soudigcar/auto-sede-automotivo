import assert from 'node:assert/strict';
import test from 'node:test';
import { measureHumanFirstResponse, resolveMessageTime, type MessageEvidence } from '../src/lib/humanFirstResponse';
const time = (minutes: number) => new Date(Date.UTC(2026, 0, 1, 0, minutes)).toISOString();
const human = { metric_sender_type: 'human', metric_sender_source: 'crm', metric_sender_user_id: 'synthetic-agent' };
const message = (id: string, minute: number, patch: Partial<MessageEvidence> = {}): MessageEvidence => ({
  id, store_id: 'synthetic-store', conversation_id: 'conversation-a', lead_id: 'lead-a', direction: 'outbound',
  status: 'sent', sent_at: time(minute), raw_payload: human, ...patch
});
const inbound = message('inbound', 0, { direction: 'inbound', status: 'received', raw_payload: {} });
function measure(messages: MessageEvidence[]) {
  return measureHumanFirstResponse({ storeId: 'synthetic-store', leadIds: new Set(['lead-a']),
    conversations: ['conversation-a', 'conversation-b'].map(id => ({ id, lead_id: 'lead-a', store_id: 'synthetic-store' })),
    messages, asOf: time(100), historyComplete: true });
}
const cases: Array<[string, MessageEvidence[], number | null, string]> = [
  ['one conversation', [inbound, message('reply', 5)], 5, 'measured'],
  ['response in another conversation', [inbound, message('reply', 5, { conversation_id: 'conversation-b' })], 5, 'measured'],
  ['new conversation does not restart clock', [inbound, message('inbound-b', 4, { conversation_id: 'conversation-b', direction: 'inbound' }), message('reply', 8, { conversation_id: 'conversation-b' })], 8, 'measured'],
  ['multiple inbound', [inbound, { ...inbound, id: 'inbound-2', sent_at: time(3) }, message('reply', 6)], 6, 'measured'],
  ['outbound before inbound', [message('early', -1), inbound, message('reply', 5)], 5, 'measured'],
  ['autocar before human', [inbound, message('ai', 1, { raw_payload: { autocar_live_pilot: true } }), message('reply', 5)], 5, 'measured'],
  ['only autocar', [inbound, message('ai', 1, { raw_payload: { autocar_follow_up_v2: true } })], null, 'unanswered'],
  ['human first', [inbound, message('reply', 1), message('ai', 5, { raw_payload: { autocar_live_pilot: true } })], 1, 'measured'],
  ['indeterminate before human', [inbound, message('unknown', 1, { raw_payload: {} }), message('reply', 5)], null, 'indeterminate'],
  ['indeterminate after human', [inbound, message('reply', 1), message('unknown', 5, { raw_payload: {} })], 1, 'measured'],
  ['no response', [inbound], null, 'unanswered'],
  ['failed response', [inbound, message('failed', 1, { status: 'failed' })], null, 'unanswered'],
  ['pending response', [inbound, message('pending', 1, { status: 'pending' })], null, 'unanswered'],
  ['unknown delivery', [inbound, message('unknown', 1, { status: 'unknown' })], null, 'indeterminate'],
  ['system response', [inbound, message('system', 1, { message_type: 'system' })], null, 'unanswered'],
  ['internal response', [inbound, message('internal', 1, { raw_payload: { metric_sender_type: 'internal' } })], null, 'unanswered'],
  ['created_at fallback', [inbound, message('fallback', 1, { sent_at: null, created_at: time(4) })], 4, 'measured'],
  ['invalid send time not hidden', [inbound, message('bad', 1, { sent_at: 'invalid', created_at: time(4) })], null, 'indeterminate'],
  ['missing timestamps', [inbound, message('bad', 1, { sent_at: null, created_at: null })], null, 'indeterminate'],
  ['delivered uses original send time', [inbound, message('delivered', 3, { status: 'delivered', created_at: time(10) })], 3, 'measured'],
  ['read uses original send time', [inbound, message('read', 3, { status: 'read', created_at: time(20) })], 3, 'measured'],
  ['cross store excluded', [inbound, message('foreign', 1, { store_id: 'foreign-store' })], null, 'unanswered'],
  ['conflicting lead excluded', [inbound, message('foreign', 1, { lead_id: 'foreign-lead' })], null, 'unanswered'],
  ['false autocar marker', [inbound, message('reply', 2, { raw_payload: { ...human, autocar_live_pilot: false } })], 2, 'measured']
];
for (const [name, messages, expected, classification] of cases) test(name, () => {
  const result = measure(messages);
  assert.equal(result.measurements[0].response_minutes, expected);
  assert.equal(result.measurements[0].classification, classification);
  const s = result.summary;
  assert.equal(s.eligible_leads, s.measured_leads + s.unanswered_leads + s.indeterminate_leads);
});
for (const change of ['sale', 'loss', 'owner transfer']) test(`${change} cannot restart a message-based clock`, () => {
  assert.equal(measure([inbound, message('reply', 5)]).summary.median_minutes, 5);
});
test('duplicate and provider retry are one response', () => {
  const reply = message('reply', 5, { wa_message_id: 'provider-synthetic' });
  assert.equal(measure([inbound, reply, reply, { ...reply, id: 'retry', sent_at: time(8) }]).summary.measured_leads, 1);
  assert.equal(measure([inbound, reply, { ...reply, id: 'retry', sent_at: time(8) }]).summary.median_minutes, 5);
});
test('fallback provenance is explicit', () => assert.equal(resolveMessageTime({ created_at: time(0) }).source, 'created_at_fallback'));
test('invalid inbound is not eligible', () => assert.equal(measure([{ ...inbound, sent_at: 'invalid' }]).summary.eligible_leads, 0));
