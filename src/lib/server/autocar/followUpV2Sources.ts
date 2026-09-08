import type { FollowUpConfigV2, FollowUpScenarioKey } from './smartFollowUpV2';
import { followUpV2Key, type FollowUpV2Event } from './followUpV2Execution';

export type FollowUpV2Facts = {
  storeId: string; conversationId: string; leadId: string; leadStatus: string;
  inboundAt: string | null; outboundAt: string | null; outboundId: string | null;
  scheduledAt: string | null; vehicleInterest: boolean; financingPending: boolean;
  appointments: Array<{ id: string; at: string; status: string }>;
  callbacks: Array<{ id: string; at: string; explicitlyRequested: boolean; active: boolean }>;
};

function parsedAt(value: string | null | undefined) {
  const parsed = value ? Date.parse(value) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

/** Uses official configured offsets. Missing or contradictory operational evidence never invents a trigger. */
export function planFollowUpV2Sources(facts: FollowUpV2Facts, config: FollowUpConfigV2, dryRun: boolean): FollowUpV2Event[] {
  if (!facts.inboundAt || !facts.outboundAt || !facts.outboundId) return [];
  const inboundMs = parsedAt(facts.inboundAt);
  const outboundMs = parsedAt(facts.outboundAt);
  // A Follow-up is only eligible after the store has answered the latest customer message.
  if (inboundMs === null || outboundMs === null || outboundMs <= inboundMs) return [];

  const sources: Array<{ scenario: FollowUpScenarioKey; source: string; anchor: string }> = [];
  const leadStatus = String(facts.leadStatus || '').trim().toLowerCase();
  const scheduledMs = parsedAt(facts.scheduledAt);

  // CRM leads.status + leads.scheduled_at are the authoritative operational evidence.
  // appointments is used only to preserve a real source id when it matches the same scheduled timestamp.
  if (scheduledMs !== null) {
    const scheduledIso = new Date(scheduledMs).toISOString();
    const matchingAppointment = facts.appointments.find((appointment) => {
      const appointmentMs = parsedAt(appointment.at);
      return appointmentMs !== null && Math.abs(appointmentMs - scheduledMs) < 60_000;
    });
    const sourceId = matchingAppointment?.id || `lead-scheduled:${facts.leadId}`;
    if (leadStatus === 'scheduled') sources.push({ scenario: 'visit_confirmation', source: sourceId, anchor: scheduledIso });
    else if (leadStatus === 'no_show') sources.push({ scenario: 'no_show', source: sourceId, anchor: scheduledIso });
    else if (leadStatus === 'showed_up') sources.push({ scenario: 'post_visit', source: sourceId, anchor: scheduledIso });
  }

  for (const callback of facts.callbacks) {
    if (callback.explicitlyRequested && callback.active && parsedAt(callback.at) !== null) {
      sources.push({ scenario: 'callback_requested', source: callback.id, anchor: new Date(Date.parse(callback.at)).toISOString() });
    }
  }

  // A historical scheduled_at without a current operational status is ambiguous; fail closed instead of starting a generic sequence.
  if (scheduledMs === null && !sources.length) {
    sources.push({ scenario: facts.financingPending ? 'simulation_pending' : facts.vehicleInterest ? 'vehicle_interest' : 'silent_lead',
      source: facts.outboundId, anchor: facts.outboundAt });
  }

  return sources.flatMap(source => {
    const scenario = config.scenarios.find(s => s.key === source.scenario);
    if (!scenario?.enabled || !Number.isFinite(Date.parse(source.anchor))) return [];
    // Callback time comes from the explicit request, not an invented scenario offset.
    const steps = source.scenario === 'callback_requested'
      ? [{ id: 'customer-requested-time', delayMinutes: 0, enabled: true }]
      : scenario.steps.filter(step => step.enabled);
    return steps.map(step => {
      const base = {
        id: '', storeId: facts.storeId, conversationId: facts.conversationId, leadId: facts.leadId,
        scenario: source.scenario, stepId: step.id, sourceId: source.source,
        anchorAt: source.anchor, inboundAt: facts.inboundAt!,
        dueAt: new Date(Date.parse(source.anchor) + step.delayMinutes * 60000).toISOString(), dryRun
      };
      return { ...base, idempotencyKey: followUpV2Key(base),
        sequenceKey: [facts.storeId, facts.leadId, source.scenario, source.source, source.anchor, facts.inboundAt].join(':') };
    });
  });
}
