import { createHash } from 'node:crypto';
import type { FollowUpConfigV2, FollowUpScenarioKey } from './smartFollowUpV2';
import { withinFollowUpAllowedWindow } from './followUpV2CopilotQueue';

export const FOLLOW_UP_V2_CANARY = '239755c3-a2d4-4cdd-9502-f1595031c924';
export type FollowUpV2Event = {
  id: string; storeId: string; conversationId: string; leadId: string;
  scenario: FollowUpScenarioKey; stepId: string; sourceId: string;
  sequenceKey: string; dueAt: string; anchorAt: string; inboundAt: string;
  idempotencyKey: string; dryRun: boolean;
};
export type FollowUpV2Snapshot = {
  config: FollowUpConfigV2;
  masterEnabled: boolean; masterAutopilotAllowed: boolean; agentActive: boolean;
  storeSelectedMode: string; effectiveMode: string; humanState: string;
  globalPolicy: string; storePolicy: string; safeCore: boolean;
  conversationOpen: boolean; leadEligible: boolean; saleConfirmed: boolean;
  optedOut: boolean; latestInboundAt: string | null; sourceValid: boolean;
  sourceAnchorAt: string | null;
  context: Record<string, unknown>;
};
export type FollowUpV2Decision = 'blocked' | 'cancelled' | 'superseded';
export type FollowUpV2Generated = {
  text: string; model: string; valid: boolean;
  qualityReason?: string; qualityScore?: number; usage?: Record<string, unknown>;
};
export type FollowUpV2Lease = { id: string; owner: string; token: string };
export type FollowUpV2Outcome = {
  decision: FollowUpV2Decision | 'dry_run_ready' | 'sent' | 'delivery_unknown';
  reason: string; proposed_text: string | null;
  external_execution: false | true | null;
  generation_fail_closed?: boolean; fallback_copilot?: boolean;
  model?: string; provider_message_id?: string; production_outbound_message_id?: string;
  gates?: Record<string, unknown>;
};
export type FollowUpV2Ports = {
  now(): Date;
  snapshot(event: FollowUpV2Event): Promise<FollowUpV2Snapshot>;
  claim(event: FollowUpV2Event, snapshot: FollowUpV2Snapshot): Promise<{ lease?: FollowUpV2Lease; reason?: string; audited?: boolean }>;
  // Every transition must compare the lease owner/token; stale workers fail closed.
  settle(lease: FollowUpV2Lease, outcome: FollowUpV2Outcome): Promise<boolean>;
  audit(event: FollowUpV2Event, outcome: FollowUpV2Outcome): Promise<void>;
  generate(snapshot: FollowUpV2Snapshot, event: FollowUpV2Event): Promise<FollowUpV2Generated>;
  // Advisory fallback is optional and must never perform provider I/O.
  fallback?: (event: FollowUpV2Event, snapshot: FollowUpV2Snapshot, generated: FollowUpV2Generated) => Promise<boolean>;
  // Arm persists delivery_unknown BEFORE provider I/O; an expired worker cannot arm.
  arm(lease: FollowUpV2Lease, generated: FollowUpV2Generated): Promise<boolean>;
  send?: (event: FollowUpV2Event, text: string) => Promise<{ providerMessageId: string; productionOutboundMessageId?: string }>;
};

const timestamp = (value: string | null) => value ? Date.parse(value) : NaN;
export function followUpV2Gates(event: FollowUpV2Event, state: FollowUpV2Snapshot, now: Date): FollowUpV2Outcome | null {
  const deny = (reason: string, decision: FollowUpV2Decision = 'blocked'): FollowUpV2Outcome =>
    ({ decision, reason, proposed_text: null, external_execution: false });
  if (!state.masterEnabled || !state.agentActive) return deny('master_disabled');
  if (!state.masterAutopilotAllowed) return deny('master_autopilot_denied');
  if (state.storeSelectedMode !== 'autopilot' || state.effectiveMode !== 'autopilot') return deny('mode_not_autopilot');
  if (state.humanState !== 'autocar_active') return deny('human_protected', 'cancelled');
  if (!state.conversationOpen) return deny('conversation_closed', 'cancelled');
  if (state.saleConfirmed) return deny('sale_confirmed', 'cancelled');
  if (!state.leadEligible) return deny('lead_ineligible', 'cancelled');
  if (state.optedOut) return deny('opt_out', 'cancelled');
  if (!Number.isFinite(timestamp(state.latestInboundAt)) || timestamp(state.latestInboundAt) !== timestamp(event.inboundAt)) return deny('new_inbound', 'superseded');
  if (!state.sourceValid) return deny('source_cancelled', 'cancelled');
  if (timestamp(state.sourceAnchorAt) !== timestamp(event.anchorAt)) return deny('source_changed', 'superseded');
  if (state.globalPolicy !== 'allow' || state.storePolicy !== 'allow') return deny('policy_denied');
  if (!state.config.global.enabled || state.config.global.mode !== 'autopilot') return deny('follow_up_disabled');
  if (!state.safeCore) return deny('safe_core_denied');
  const scenario = state.config.scenarios.find(s => s.key === event.scenario);
  if (!scenario?.enabled) return deny('scenario_disabled');
  if (event.scenario !== 'callback_requested' && !scenario.steps.some(s => s.id === event.stepId && s.enabled)) return deny('step_disabled');
  if (!Number.isFinite(timestamp(event.dueAt)) || !Number.isFinite(timestamp(event.anchorAt))) return deny('invalid_time');
  if (timestamp(event.dueAt) > now.getTime()) return deny('not_due');
  if (now.getTime() > timestamp(event.anchorAt) + state.config.global.maxSequenceDays * 86400000) return deny('sequence_expired', 'cancelled');
  if (!withinFollowUpAllowedWindow(state.config, now)) return deny('outside_window');
  return null;
}

export function followUpV2Key(input: Pick<FollowUpV2Event, 'storeId' | 'conversationId' | 'scenario' | 'stepId' | 'sourceId' | 'anchorAt' | 'inboundAt'>) {
  return createHash('sha256').update(JSON.stringify(['follow-up-v2', input.storeId, input.conversationId,
    input.scenario, input.stepId, input.sourceId, input.anchorAt, input.inboundAt])).digest('hex');
}

/** Same orchestration for Preview and the future canary. Preview has no transport. */
export async function executeFollowUpV2(event: FollowUpV2Event, ports: FollowUpV2Ports, environment: {
  vercelEnv: string; crmRef: string; autocarRef: string; liveAuthorized: boolean;
}): Promise<FollowUpV2Outcome> {
  const isolated = environment.vercelEnv === 'preview' && environment.crmRef === 'azszzdotbrczlhrmhrlw'
    && environment.autocarRef === 'azszzdotbrczlhrmhrlw';
  const live = environment.vercelEnv === 'production' && environment.crmRef === 'wufikrdgyxrsszlbpfmv'
    && environment.autocarRef === 'icmwdggbvijexjgrvsbl' && event.storeId === FOLLOW_UP_V2_CANARY && environment.liveAuthorized;
  // No database read or generation until both destinations have been proved.
  if ((event.dryRun && !isolated) || (!event.dryRun && !live)) {
    return { decision: 'blocked', reason: 'environment_isolation', proposed_text: null, external_execution: false };
  }
  const before = await ports.snapshot(event);
  let evidence = before;
  // Capture only operational facts; never serialize conversation/model context into gates.
  const withEvidence = (result: FollowUpV2Outcome): FollowUpV2Outcome => ({...result,gates:{
    master_enabled:evidence.masterEnabled,master_autopilot_allowed:evidence.masterAutopilotAllowed,
    agent_active:evidence.agentActive,store_selected_mode:evidence.storeSelectedMode,
    effective_mode:evidence.effectiveMode,human_state:evidence.humanState,
    global_policy:evidence.globalPolicy,store_policy:evidence.storePolicy,
    follow_up_enabled:evidence.config.global.enabled,follow_up_mode:evidence.config.global.mode,
    conversation_open:evidence.conversationOpen,lead_eligible:evidence.leadEligible,
    sale_confirmed:evidence.saleConfirmed,opted_out:evidence.optedOut,source_valid:evidence.sourceValid,
    inbound_unchanged:timestamp(evidence.latestInboundAt)===timestamp(event.inboundAt),
    source_unchanged:timestamp(evidence.sourceAnchorAt)===timestamp(event.anchorAt),
    max_per_lead_per_day:evidence.config.global.maxPerLeadPerDay,
    min_interval_minutes:evidence.config.global.minIntervalMinutes,
    safe_core:evidence.safeCore,scenario:event.scenario,idempotency_key:event.idempotencyKey
  }});
  const denied = followUpV2Gates(event, before, ports.now());
  if (denied) { const result=withEvidence(denied); await ports.audit(event, result); return result; }
  const claimed = await ports.claim(event, before);
  if (!claimed.lease) {
    const result = withEvidence({ decision: 'blocked', reason: claimed.reason || 'claim_denied', proposed_text: null, external_execution: false });
    if (!claimed.audited) await ports.audit(event, result);
    return result;
  }
  const lease = claimed.lease;
  const finish = async (result: FollowUpV2Outcome) => {
    const recorded=withEvidence(result);
    if (!await ports.settle(lease, recorded)) return { decision: 'blocked' as const, reason: 'lease_lost', proposed_text: null, external_execution: false as const };
    return recorded;
  };
  let generated: FollowUpV2Generated;
  try { generated = await ports.generate(before, event); }
  catch { return finish({ decision: 'blocked', reason: 'generation_failed', proposed_text: null, external_execution: false, generation_fail_closed: true }); }

  const usableGeneration = Boolean(generated.model?.trim() && generated.text?.trim() && generated.text.length <= 600);
  if (!usableGeneration) {
    return finish({ decision: 'blocked', reason: 'generation_invalid', proposed_text: null, external_execution: false, generation_fail_closed: true });
  }

  // Re-read every gate after generation before either an advisory fallback or LIVE arming.
  const after = await ports.snapshot(event);
  evidence = after;
  const stopped = followUpV2Gates(event, after, ports.now());
  if (stopped) return finish(stopped);

  if (!generated.valid) {
    if (!event.dryRun && ports.fallback) {
      try {
        if (await ports.fallback(event, after, generated)) {
          return finish({ decision: 'blocked', reason: 'fallback_copilot', proposed_text: generated.text, model: generated.model,
            external_execution: false, generation_fail_closed: true, fallback_copilot: true });
        }
      } catch {
        return finish({ decision: 'blocked', reason: 'fallback_copilot_failed', proposed_text: null, model: generated.model,
          external_execution: false, generation_fail_closed: true });
      }
    }
    return finish({ decision: 'blocked', reason: 'generation_invalid', proposed_text: null, model: generated.model,
      external_execution: false, generation_fail_closed: true });
  }

  if (event.dryRun) return finish({ decision: 'dry_run_ready', reason: 'all_gates_allow', proposed_text: generated.text, model: generated.model, external_execution: false });
  if (!ports.send) return finish({ decision: 'blocked', reason: 'transport_unavailable', proposed_text: null, external_execution: false });
  if (!await ports.arm(lease,generated)) return { decision: 'blocked', reason: 'lease_lost', proposed_text: null, external_execution: false };
  // Arming is the last database mutation before a final read-only operational gate.
  evidence = await ports.snapshot(event);
  const final = followUpV2Gates(event, evidence, ports.now());
  if (final) return finish(final);
  try {
    const sent = await ports.send(event, generated.text);
    if (!sent.providerMessageId) throw new Error('Missing provider receipt');
    const result = withEvidence({ decision: 'sent', reason: 'provider_confirmed', proposed_text: generated.text,
      model: generated.model, external_execution: true, provider_message_id: sent.providerMessageId,
      production_outbound_message_id: sent.productionOutboundMessageId });
    // A persistence failure must NEVER turn a confirmed provider send into external_execution=false.
    try { await ports.settle(lease, result); } catch { /* durable armed state prohibits retries */ }
    return result;
  } catch {
    const result = withEvidence({ decision: 'delivery_unknown', reason: 'provider_result_unknown', proposed_text: null, external_execution: null, model: generated.model });
    try { await ports.settle(lease, result); } catch { /* preserve durable armed state */ }
    return result;
  }
}
