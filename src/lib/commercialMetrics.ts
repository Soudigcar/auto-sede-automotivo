export type MetricRow = Record<string, any>;

export type ResponseTimeSummary = {
  eligible_conversations: number;
  measured_conversations: number;
  unanswered_conversations: number;
  coverage_percent: number;
  average_minutes: number | null;
  median_minutes: number | null;
  p90_minutes: number | null;
};

export type LeadResponseMeasurement = {
  lead_id: string;
  conversation_id: string;
  first_inbound_at: string;
  first_human_response_at: string | null;
  response_minutes: number | null;
  responder_user_id: string | null;
};

const AUTOCAR_MARKERS = [
  'autocar_live_pilot',
  'autocar_live_photo_pilot',
  'autocar_audio_reply',
  'autocar_live_location_pilot',
  'autocar_live_visit_pilot',
  'autocar_human_handoff'
];

function timestamp(row: MetricRow) {
  const value = row.sent_at || row.created_at;
  const parsed = value ? new Date(String(value)).getTime() : NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function round(value: number, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function percentile(sorted: number[], value: number) {
  if (!sorted.length) return null;
  if (sorted.length === 1) return sorted[0];
  const index = (sorted.length - 1) * value;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

export function isAutocarOutbound(message: MetricRow) {
  const payload = message?.raw_payload && typeof message.raw_payload === 'object' ? message.raw_payload : {};
  if (payload.metric_sender_type === 'autocar') return true;
  return AUTOCAR_MARKERS.some((marker) => payload[marker] === true || payload[marker] != null);
}

export function calculateResponseTimes(
  conversations: MetricRow[],
  messages: MetricRow[],
  allowedLeadIds?: Set<string>
) {
  const messagesByConversation = new Map<string, MetricRow[]>();
  for (const message of messages) {
    const conversationId = String(message.conversation_id || '');
    if (!conversationId) continue;
    const rows = messagesByConversation.get(conversationId) || [];
    rows.push(message);
    messagesByConversation.set(conversationId, rows);
  }

  const measurements: LeadResponseMeasurement[] = [];
  for (const conversation of conversations) {
    const conversationId = String(conversation.id || '');
    const leadId = String(conversation.lead_id || '');
    if (!conversationId || !leadId || (allowedLeadIds && !allowedLeadIds.has(leadId))) continue;

    const rows = (messagesByConversation.get(conversationId) || [])
      .map((message) => ({ message, at: timestamp(message) }))
      .filter((item): item is { message: MetricRow; at: number } => item.at !== null)
      .sort((left, right) => left.at - right.at);
    const inbound = rows.find((item) => String(item.message.direction).toLowerCase() === 'inbound');
    if (!inbound) continue;

    const outbound = rows.find((item) => (
      item.at >= inbound.at &&
      String(item.message.direction).toLowerCase() === 'outbound' &&
      !isAutocarOutbound(item.message)
    ));

    measurements.push({
      lead_id: leadId,
      conversation_id: conversationId,
      first_inbound_at: new Date(inbound.at).toISOString(),
      first_human_response_at: outbound ? new Date(outbound.at).toISOString() : null,
      response_minutes: outbound ? Math.max(0, (outbound.at - inbound.at) / 60_000) : null,
      responder_user_id: outbound
        ? String(outbound.message?.raw_payload?.metric_sender_user_id || '').trim() || null
        : null
    });
  }

  const values = measurements
    .map((item) => item.response_minutes)
    .filter((value): value is number => value !== null && Number.isFinite(value))
    .sort((left, right) => left - right);
  const eligible = measurements.length;
  const measured = values.length;
  const summary: ResponseTimeSummary = {
    eligible_conversations: eligible,
    measured_conversations: measured,
    unanswered_conversations: Math.max(0, eligible - measured),
    coverage_percent: eligible ? round((measured / eligible) * 100, 1) : 0,
    average_minutes: measured ? round(values.reduce((sum, value) => sum + value, 0) / measured) : null,
    median_minutes: measured ? round(percentile(values, 0.5) || 0) : null,
    p90_minutes: measured ? round(percentile(values, 0.9) || 0) : null
  };

  return { summary, measurements };
}

export function calculateConversion(leads: MetricRow[], sales: MetricRow[], periodEnd?: string) {
  const eligibleLeadIds = new Set(leads.map((lead) => String(lead.id || '')).filter(Boolean));
  const end = periodEnd ? new Date(`${periodEnd}T23:59:59.999Z`).getTime() : null;
  const soldLeadIds = new Set<string>();

  for (const sale of sales) {
    const status = String(sale.status || 'confirmed').toLowerCase();
    if (['cancelled', 'canceled'].includes(status)) continue;
    const leadId = String(sale.lead_id || '');
    if (!leadId || !eligibleLeadIds.has(leadId)) continue;
    const confirmedAt = timestamp({ sent_at: sale.confirmed_at, created_at: sale.created_at });
    if (end !== null && confirmedAt !== null && confirmedAt > end) continue;
    soldLeadIds.add(leadId);
  }

  return {
    eligible_leads: eligibleLeadIds.size,
    converted_leads: soldLeadIds.size,
    conversion_rate: eligibleLeadIds.size ? round((soldLeadIds.size / eligibleLeadIds.size) * 100) : 0
  };
}

export function responseByLeadId(measurements: LeadResponseMeasurement[]) {
  const result = new Map<string, LeadResponseMeasurement>();
  for (const measurement of measurements) {
    const current = result.get(measurement.lead_id);
    if (!current || measurement.first_inbound_at < current.first_inbound_at) {
      result.set(measurement.lead_id, measurement);
    }
  }
  return result;
}
