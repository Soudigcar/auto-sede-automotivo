import { createHash, timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/server/storeTeam';
import { getAutocarRuntimeClient } from '@/lib/server/autocar/runtimeEnvironment';
import {
  assertFollowUpV2Environment,
  createFollowUpV2DatabasePorts
} from '@/lib/server/autocar/followUpV2Data';
import {
  executeFollowUpV2,
  followUpV2Gates,
  type FollowUpV2Event,
  type FollowUpV2Ports,
  type FollowUpV2Snapshot
} from '@/lib/server/autocar/followUpV2Execution';
import { validateFollowUpConfigV2, type FollowUpConfigV2 } from '@/lib/server/autocar/smartFollowUpV2';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const EXPECTED_BRANCH = 'test/autocar-follow-up-v2-final-homologation';
const DEV_REF = 'azszzdotbrczlhrmhrlw';
const SYNTHETIC_PREFIX = 'AUTOCAR HOMOLOGACAO V2 ';

function unavailable() {
  return NextResponse.json({ error: 'Unavailable' }, { status: 403, headers: { 'Cache-Control': 'no-store' } });
}

function harnessAvailable() {
  return process.env.VERCEL_ENV === 'preview' && process.env.VERCEL_GIT_COMMIT_REF === EXPECTED_BRANCH;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function sessionMatches(raw: string, expectedHex: unknown) {
  if (!raw || !/^[0-9a-f]{64}$/i.test(String(expectedHex || ''))) return false;
  const actual = createHash('sha256').update(raw).digest();
  const expected = Buffer.from(String(expectedHex), 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function syntheticGatePorts(base: FollowUpV2Ports): FollowUpV2Ports {
  return {
    ...base,
    async snapshot(event) {
      const state = await base.snapshot(event);
      return {
        ...state,
        masterEnabled: true,
        masterAutopilotAllowed: true,
        agentActive: true,
        storeSelectedMode: 'autopilot',
        effectiveMode: 'autopilot',
        globalPolicy: 'allow',
        storePolicy: 'allow'
        // humanState, conversation state, source validity, opt-out, sale and SAFE CORE remain real.
      };
    },
    // The final homologation harness never exposes provider transport or LIVE fallback.
    send: undefined,
    fallback: undefined
  };
}

function eventFromRow(row: any): FollowUpV2Event {
  return {
    id: row.id,
    storeId: row.store_id,
    conversationId: row.production_conversation_id,
    leadId: row.production_lead_id,
    scenario: row.scenario_key,
    stepId: row.step_id,
    sourceId: row.source_id,
    sequenceKey: row.sequence_key,
    dueAt: row.due_at,
    anchorAt: row.anchor_at,
    inboundAt: row.trigger_last_customer_message_at,
    idempotencyKey: row.idempotency_key,
    dryRun: true
  };
}

async function loadSyntheticExecution(autocar: any, eventId: string, session: string) {
  if (!isUuid(eventId)) throw new Error('invalid_event');
  const { data: row, error } = await autocar
    .from('ai_follow_up_autopilot_executions')
    .select('*')
    .eq('id', eventId)
    .eq('dry_run', true)
    .maybeSingle();
  if (error || !row) throw new Error('synthetic_execution_missing');
  if (!String(row.metadata?.homologation || '').startsWith(SYNTHETIC_PREFIX)) throw new Error('synthetic_scope_required');
  if (!sessionMatches(session, row.metadata?.homologation_session_hash)) throw new Error('credential_rejected');
  const config = row.metadata?.homologation_config as FollowUpConfigV2 | undefined;
  if (!config || !validateFollowUpConfigV2(config).ok) throw new Error('synthetic_configuration_required');
  return { row, config };
}

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer'
    }
  });
}

export async function GET(request: Request) {
  if (!harnessAvailable()) return unavailable();

  try {
    const environment = assertFollowUpV2Environment(true);
    if (environment.crmRef !== DEV_REF || environment.autocarRef !== DEV_REF) return unavailable();

    const crm = createAdminClient();
    const autocar = getAutocarRuntimeClient();
    // Proves the actual client destinations before any fixture read or model generation.
    const isolationPorts = createFollowUpV2DatabasePorts({ crm, autocar, dryRun: true });
    const url = new URL(request.url);
    const phase = String(url.searchParams.get('phase') || 'isolation');

    if (phase === 'isolation') {
      const [crmProbe, autocarProbe] = await Promise.all([
        crm.from('stores').select('id', { head: true, count: 'exact' }),
        autocar.from('ai_follow_up_autopilot_executions').select('id', { head: true, count: 'exact' })
      ]);
      if (crmProbe.error || autocarProbe.error) throw new Error('isolation_probe_failed');
      return json({
        pass: true,
        isolated: true,
        crm_ref: environment.crmRef,
        autocar_ref: environment.autocarRef,
        commit: process.env.VERCEL_GIT_COMMIT_SHA || null,
        branch: process.env.VERCEL_GIT_COMMIT_REF || null,
        dry_run: true,
        external_execution: false,
        transport_available: typeof isolationPorts.send === 'function'
      });
    }

    const eventId = String(url.searchParams.get('event_id') || '');
    const session = String(url.searchParams.get('session') || '');
    const { row, config } = await loadSyntheticExecution(autocar, eventId, session);
    const event = eventFromRow(row);
    const base = createFollowUpV2DatabasePorts({ crm, autocar, dryRun: true, syntheticConfig: config });
    const ports = syntheticGatePorts(base);

    if (phase === 'execute') {
      const result = await executeFollowUpV2(event, ports, environment);
      return json({
        pass: result.decision === 'dry_run_ready' && result.reason === 'all_gates_allow' && result.external_execution === false,
        phase,
        event_id: event.id,
        dry_run: true,
        transport_available: typeof ports.send === 'function',
        ...result
      });
    }

    if (phase === 'human_protection') {
      let generationCalled = false;
      ports.generate = async () => {
        generationCalled = true;
        throw new Error('generation_must_not_run');
      };
      const result = await executeFollowUpV2(event, ports, environment);
      return json({
        pass: result.decision === 'cancelled' && result.reason === 'human_protected' && result.external_execution === false && !generationCalled,
        phase,
        event_id: event.id,
        generation_called: generationCalled,
        transport_available: typeof ports.send === 'function',
        ...result
      });
    }

    if (phase === 'generation_invalid') {
      ports.generate = async () => ({ text: '', model: '', valid: false });
      const result = await executeFollowUpV2(event, ports, environment);
      return json({
        pass: result.decision === 'blocked' && result.reason === 'generation_invalid' && result.external_execution === false && result.generation_fail_closed === true,
        phase,
        event_id: event.id,
        transport_available: typeof ports.send === 'function',
        ...result
      });
    }

    if (phase === 'revalidate_human') {
      const { data: original, error: originalError } = await autocar
        .from('ai_runtime_conversations')
        .select('human_state,pause_reason,paused_by_source,paused_at,resumed_at,metadata')
        .eq('store_id', event.storeId)
        .eq('production_conversation_id', event.conversationId)
        .maybeSingle();
      if (originalError || !original || !String(original.metadata?.homologation || '').startsWith(SYNTHETIC_PREFIX)) {
        throw new Error('synthetic_runtime_required');
      }

      const generate = base.generate.bind(base);
      let mutationApplied = false;
      ports.generate = async (snapshot, currentEvent) => {
        const generated = await generate(snapshot, currentEvent);
        const { error: mutationError } = await autocar
          .from('ai_runtime_conversations')
          .update({
            human_state: 'human_active',
            pause_reason: 'AUTOCAR HOMOLOGACAO V2 post-generation revalidation',
            paused_by_source: 'homologation_v2',
            paused_at: new Date().toISOString()
          })
          .eq('store_id', currentEvent.storeId)
          .eq('production_conversation_id', currentEvent.conversationId);
        if (mutationError) throw new Error('synthetic_runtime_mutation_failed');
        mutationApplied = true;
        return generated;
      };

      let result;
      try {
        result = await executeFollowUpV2(event, ports, environment);
      } finally {
        const { error: restoreError } = await autocar
          .from('ai_runtime_conversations')
          .update({
            human_state: original.human_state,
            pause_reason: original.pause_reason,
            paused_by_source: original.paused_by_source,
            paused_at: original.paused_at,
            resumed_at: original.resumed_at
          })
          .eq('store_id', event.storeId)
          .eq('production_conversation_id', event.conversationId);
        if (restoreError) throw new Error('synthetic_runtime_restore_failed');
      }

      return json({
        pass: mutationApplied && result.decision === 'cancelled' && result.reason === 'human_protected' && result.external_execution === false,
        phase,
        event_id: event.id,
        mutation_applied: mutationApplied,
        runtime_restored: true,
        transport_available: typeof ports.send === 'function',
        ...result
      });
    }

    if (phase === 'concurrency') {
      const secondBase = createFollowUpV2DatabasePorts({ crm, autocar, dryRun: true, syntheticConfig: config });
      const secondPorts = syntheticGatePorts(secondBase);
      const snapshot = await ports.snapshot(event);
      const gate = followUpV2Gates(event, snapshot, new Date());
      if (gate) return json({ pass: false, phase, event_id: event.id, preclaim_gate: gate }, 409);

      const [first, second] = await Promise.all([
        ports.claim(event, snapshot),
        secondPorts.claim(event, snapshot)
      ]);
      const leases = [first.lease, second.lease].filter(Boolean);
      const denied = [first, second].find((value) => !value.lease);
      let settled = false;
      if (first.lease) {
        settled = await ports.settle(first.lease, {
          decision: 'blocked', reason: 'homologation_concurrency_complete', proposed_text: null, external_execution: false
        });
      } else if (second.lease) {
        settled = await secondPorts.settle(second.lease, {
          decision: 'blocked', reason: 'homologation_concurrency_complete', proposed_text: null, external_execution: false
        });
      }
      return json({
        pass: leases.length === 1 && denied?.reason === 'duplicate_or_leased' && settled,
        phase,
        event_id: event.id,
        leases_acquired: leases.length,
        denied_reason: denied?.reason || null,
        winning_lease_settled: settled,
        external_execution: false,
        transport_available: false
      });
    }

    if (phase === 'quota_daily' || phase === 'quota_sequence') {
      let generationCalled = false;
      ports.generate = async () => {
        generationCalled = true;
        throw new Error('generation_must_not_run');
      };
      const expectedReason = phase === 'quota_daily' ? 'daily_limit' : 'sequence_limit';
      const result = await executeFollowUpV2(event, ports, environment);
      return json({
        pass: result.decision === 'blocked' && result.reason === expectedReason && result.external_execution === false && !generationCalled,
        phase,
        event_id: event.id,
        generation_called: generationCalled,
        transport_available: typeof ports.send === 'function',
        ...result
      });
    }

    return json({ error: 'Invalid phase' }, 400);
  } catch (error: any) {
    const code = String(error?.message || 'homologation_failed_closed').slice(0, 100);
    return json({ pass: false, error: code, dry_run: true, external_execution: false }, 500);
  }
}
