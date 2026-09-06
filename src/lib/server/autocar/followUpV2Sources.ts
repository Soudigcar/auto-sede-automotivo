import type { FollowUpConfigV2, FollowUpScenarioKey } from './smartFollowUpV2';
import { followUpV2Key, type FollowUpV2Event } from './followUpV2Execution';

export type FollowUpV2Facts = {
  storeId: string; conversationId: string; leadId: string; leadStatus: string;
  inboundAt: string | null; outboundAt: string | null; outboundId: string | null;
  scheduledAt: string | null; vehicleInterest: boolean; financingPending: boolean;
  appointments: Array<{ id: string; at: string; status: string }>;
  callbacks: Array<{ id: string; at: string; explicitlyRequested: boolean; active: boolean }>;
};

/** Uses official configured offsets. Missing operational evidence never invents a trigger. */
export function planFollowUpV2Sources(facts: FollowUpV2Facts, config: FollowUpConfigV2, dryRun: boolean): FollowUpV2Event[] {
  if (!facts.inboundAt || !facts.outboundAt || !facts.outboundId) return [];
  const sources: Array<{ scenario: FollowUpScenarioKey; source: string; anchor: string }> = [];
  for (const appointment of facts.appointments) {
    if (appointment.status !== 'scheduled') continue;
    if (facts.leadStatus === 'showed_up') sources.push({ scenario: 'post_visit', source: appointment.id, anchor: appointment.at });
    else if (facts.leadStatus === 'scheduled') {
      sources.push({ scenario: 'visit_confirmation', source: appointment.id, anchor: appointment.at });
      sources.push({ scenario: 'no_show', source: appointment.id, anchor: appointment.at });
    }
  }
  for (const callback of facts.callbacks) {
    if (callback.explicitlyRequested && callback.active) sources.push({ scenario: 'callback_requested', source: callback.id, anchor: callback.at });
  }
  if (!facts.scheduledAt && facts.appointments.every(a => a.status !== 'scheduled') && !sources.length) {
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
