/** Pure reference implementation; SQL aggregation must preserve this contract. */
export const HUMAN_RESPONSE_DEFINITION = 'human_first_response_lead_v1';
export type MessageEvidence = {
  id: string; store_id: string; conversation_id: string; lead_id?: string | null;
  wa_message_id?: string | null; direction: string; status?: string | null;
  message_type?: string | null; sent_at?: string | null; created_at?: string | null;
  raw_payload?: Record<string, unknown> | null;
};
export type ConversationEvidence = { id: string; store_id: string; lead_id: string | null };
export type Authorship = 'human' | 'autocar' | 'system' | 'indeterminate';

export function resolveMessageTime(message: Pick<MessageEvidence, 'sent_at' | 'created_at'>) {
  // An invalid explicit send time is not silently replaced by insertion time.
  const source = message.sent_at ? 'sent_at' : 'created_at_fallback';
  const value = message.sent_at || message.created_at;
  const at = value ? Date.parse(value) : NaN;
  return { at: Number.isFinite(at) ? at : null, source } as const;
}

export function classifyMessageAuthor(message: MessageEvidence): Authorship {
  const payload = message.raw_payload || {};
  if (['system', 'internal'].includes(String(message.message_type).toLowerCase()) ||
      ['system', 'internal'].includes(String(payload.metric_sender_type))) return 'system';
  if (payload.metric_sender_type === 'autocar' || Object.entries(payload).some(([key, value]) =>
    key.startsWith('autocar_') && value !== false && value !== null && value !== undefined)) return 'autocar';
  if (payload.metric_sender_type === 'human' && payload.metric_sender_source === 'crm' &&
      typeof payload.metric_sender_user_id === 'string' && payload.metric_sender_user_id.trim()) return 'human';
  return 'indeterminate';
}

export function percentile(values: number[], quantile: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = (sorted.length - 1) * quantile;
  const lower = Math.floor(index);
  return sorted[lower] + (sorted[Math.ceil(index)] - sorted[lower]) * (index - lower);
}

export function measureHumanFirstResponse(input: {
  storeId: string; leadIds: Set<string>; conversations: ConversationEvidence[];
  messages: MessageEvidence[]; asOf: string; historyComplete: boolean;
}) {
  const asOf = Date.parse(input.asOf);
  if (!Number.isFinite(asOf)) throw new Error('Invalid snapshot time');
  const conversations = new Map(input.conversations.filter(c => c.store_id === input.storeId &&
    c.lead_id && input.leadIds.has(c.lead_id)).map(c => [c.id, c]));
  const deduplicated = new Map<string, MessageEvidence>();
  for (const message of [...input.messages].sort((a, b) => a.id.localeCompare(b.id))) {
    const conversation = conversations.get(message.conversation_id);
    if (!conversation || message.store_id !== input.storeId ||
        (message.lead_id && message.lead_id !== conversation.lead_id)) continue;
    const key = `${message.conversation_id}:${message.wa_message_id || message.id}`;
    const existing = deduplicated.get(key);
    // Prefer confirmed send evidence, then the earliest original send timestamp.
    const rank = (m: MessageEvidence) => ['sent', 'delivered', 'read'].includes(String(m.status).toLowerCase()) ? 0 : 1;
    if (!existing || rank(message) < rank(existing) || (rank(message) === rank(existing) &&
      (resolveMessageTime(message).at ?? Infinity) < (resolveMessageTime(existing).at ?? Infinity))) deduplicated.set(key, message);
  }
  const byLead = new Map<string, MessageEvidence[]>();
  for (const message of deduplicated.values()) {
    const leadId = conversations.get(message.conversation_id)!.lead_id!;
    byLead.set(leadId, [...(byLead.get(leadId) || []), message]);
  }
  const measurements = [...byLead].flatMap(([lead_id, messages]) => {
    const rows = messages.map(message => ({ message, ...resolveMessageTime(message) }))
      .filter(r => r.at === null || r.at <= asOf);
    const inbound = rows.filter(r => r.message.direction === 'inbound' && r.at !== null &&
      !['failed', 'pending'].includes(String(r.message.status)) && classifyMessageAuthor(r.message) !== 'system')
      .sort((a, b) => a.at! - b.at!)[0];
    if (!inbound) return [];
    const candidates = rows.filter(r => r.message.direction === 'outbound' &&
      (r.at === null || r.at >= inbound.at!) && !['failed', 'pending'].includes(String(r.message.status)));
    const human = candidates.filter(r => r.at !== null && classifyMessageAuthor(r.message) === 'human' &&
      ['sent', 'delivered', 'read'].includes(String(r.message.status)))
      .sort((a, b) => a.at! - b.at!)[0];
    const uncertain = candidates.some(r => (r.at === null || !human || r.at <= human.at!) &&
      (classifyMessageAuthor(r.message) === 'indeterminate' || (classifyMessageAuthor(r.message) === 'human' &&
        (r.at === null || !['sent', 'delivered', 'read'].includes(String(r.message.status))))));
    const classification = uncertain ? 'indeterminate' : human ? 'measured' : 'unanswered';
    return [{ lead_id, classification, first_customer_message_at: new Date(inbound.at!).toISOString(),
      first_human_response_at: human ? new Date(human.at!).toISOString() : null,
      response_minutes: classification === 'measured' ? (human!.at! - inbound.at!) / 60000 : null,
      inbound_time_source: inbound.source, response_time_source: human?.source ?? null }];
  });
  const values = measurements.flatMap(m => m.response_minutes === null ? [] : [m.response_minutes]);
  const eligible = measurements.length;
  const indeterminate = measurements.filter(m => m.classification === 'indeterminate').length;
  return { measurements, summary: {
    eligible_leads: eligible, measured_leads: values.length,
    unanswered_leads: eligible - values.length - indeterminate, indeterminate_leads: indeterminate,
    coverage_percent: eligible ? values.length / eligible * 100 : 0,
    classification_coverage_percent: eligible ? (eligible - indeterminate) / eligible * 100 : 0,
    average_minutes: values.length ? values.reduce((a, b) => a + b, 0) / values.length : null,
    median_minutes: percentile(values, .5), p50: percentile(values, .5), p90_minutes: percentile(values, .9),
    history_complete: input.historyComplete, definition_version: HUMAN_RESPONSE_DEFINITION, as_of: input.asOf
  } };
}
