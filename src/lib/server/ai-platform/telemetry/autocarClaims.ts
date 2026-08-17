type ClaimRow = {
  store_id: string;
  purpose: string;
  status: string;
  message_type: string | null;
  policy_effect: string | null;
  created_at: string;
  completed_at: string | null;
  result: any;
};

function positiveNumber(value: unknown) {
  const number = Number(value || 0);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function increment(map: Record<string, number>, key: unknown, amount = 1) {
  const normalized = String(key || '').trim();
  if (!normalized) return;
  map[normalized] = (map[normalized] || 0) + amount;
}

function durationMs(row: ClaimRow) {
  if (!row.completed_at) return null;
  const start = new Date(row.created_at).getTime();
  const end = new Date(row.completed_at).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
  return end - start;
}

function modelEntries(row: ClaimRow) {
  const entries: Array<{ lane: string; model: string; escalated: boolean }> = [];
  const routing = row.result?.model_routing || {};
  for (const key of ['planner', 'commercial']) {
    const item = routing?.[key];
    if (!item?.model) continue;
    entries.push({
      lane: String(item.lane || '').trim(),
      model: String(item.model || '').trim(),
      escalated: item.escalated === true
    });
  }
  if (!entries.length && row.result?.model) {
    entries.push({ lane: '', model: String(row.result.model), escalated: false });
  }
  return entries;
}

export async function readAutocarClaimTelemetry(autocar: any) {
  const { data, error } = await autocar
    .from('ai_runtime_message_claims')
    .select('store_id,purpose,status,message_type,policy_effect,created_at,completed_at,result')
    .order('created_at', { ascending: false })
    .limit(500);
  if (error) throw error;

  const claims = (data || []) as ClaimRow[];
  const global = {
    claims: claims.length,
    completed: 0,
    skipped: 0,
    failed: 0,
    external_executions: 0,
    human_blocks: 0,
    input_tokens: 0,
    output_tokens: 0,
    vision_input_tokens: 0,
    vision_output_tokens: 0,
    document_input_tokens: 0,
    document_output_tokens: 0,
    model_calls: {} as Record<string, number>,
    lane_calls: {} as Record<string, number>,
    purpose_counts: {} as Record<string, number>,
    message_type_counts: {} as Record<string, number>,
    sol_escalations: 0,
    audio_inbound: 0,
    audio_outbound: 0,
    image_inbound: 0,
    document_inbound: 0,
    latency_ms_total: 0,
    latency_samples: 0
  };
  const byStore = new Map<string, typeof global>();

  function bucket(storeId: string) {
    let value = byStore.get(storeId);
    if (!value) {
      value = {
        claims: 0, completed: 0, skipped: 0, failed: 0, external_executions: 0, human_blocks: 0,
        input_tokens: 0, output_tokens: 0, vision_input_tokens: 0, vision_output_tokens: 0,
        document_input_tokens: 0, document_output_tokens: 0,
        model_calls: {}, lane_calls: {}, purpose_counts: {}, message_type_counts: {}, sol_escalations: 0,
        audio_inbound: 0, audio_outbound: 0, image_inbound: 0, document_inbound: 0,
        latency_ms_total: 0, latency_samples: 0
      };
      byStore.set(storeId, value);
    }
    return value;
  }

  for (const row of claims) {
    const targets = [global, bucket(row.store_id)];
    const models = modelEntries(row);
    const latency = durationMs(row);
    const usage = row.result?.usage || {};
    const visionUsage = row.result?.vision?.usage || {};
    const documentUsage = row.result?.document?.usage || {};
    const visionReady = row.result?.vision?.ready === true;
    const documentReady = row.result?.document?.ready === true &&
      Boolean(String(row.result?.document?.document_type || '').trim());
    const isHumanBlock = /pausada nesta conversa|human_active|atendimento humano/i.test(String(row.result?.reason || ''));
    const externalExecution = row.result?.external_execution === true;

    for (const target of targets) {
      target.claims += 1;
      if (row.status === 'completed') target.completed += 1;
      if (row.status === 'skipped') target.skipped += 1;
      if (row.status === 'failed') target.failed += 1;
      if (externalExecution) target.external_executions += 1;
      if (isHumanBlock) target.human_blocks += 1;
      target.input_tokens += positiveNumber(usage.input_tokens);
      target.output_tokens += positiveNumber(usage.output_tokens);
      target.vision_input_tokens += positiveNumber(visionUsage.input_tokens);
      target.vision_output_tokens += positiveNumber(visionUsage.output_tokens);
      target.document_input_tokens += positiveNumber(documentUsage.input_tokens);
      target.document_output_tokens += positiveNumber(documentUsage.output_tokens);
      increment(target.purpose_counts, row.purpose);
      increment(target.message_type_counts, row.message_type || 'unknown');
      if (row.purpose === 'autopilot_reply' && row.message_type === 'audio') target.audio_inbound += 1;
      if (row.purpose === 'live_audio_send' && externalExecution) target.audio_outbound += 1;
      if (row.purpose === 'autopilot_reply' && row.message_type === 'image' && visionReady) target.image_inbound += 1;
      if (row.purpose === 'autopilot_reply' && row.message_type === 'document' && documentReady) target.document_inbound += 1;
      for (const model of models) {
        increment(target.model_calls, model.model);
        increment(target.lane_calls, model.lane);
        if (model.escalated || model.lane === 'sol') target.sol_escalations += 1;
      }
      if (latency !== null) {
        target.latency_ms_total += latency;
        target.latency_samples += 1;
      }
    }
  }

  function present(value: typeof global) {
    const modelInput = value.input_tokens;
    const modelOutput = value.output_tokens;
    const visionInput = value.vision_input_tokens;
    const visionOutput = value.vision_output_tokens;
    const documentInput = value.document_input_tokens;
    const documentOutput = value.document_output_tokens;
    return {
      claims: value.claims,
      completed: value.completed,
      skipped: value.skipped,
      failed: value.failed,
      external_executions: value.external_executions,
      human_blocks: value.human_blocks,
      tokens: {
        input: modelInput + visionInput + documentInput,
        output: modelOutput + visionOutput + documentOutput,
        total: modelInput + modelOutput + visionInput + visionOutput + documentInput + documentOutput,
        vision_input: visionInput,
        vision_output: visionOutput,
        document_input: documentInput,
        document_output: documentOutput
      },
      model_calls: value.model_calls,
      lane_calls: value.lane_calls,
      sol_escalations: value.sol_escalations,
      audio: { inbound: value.audio_inbound, outbound: value.audio_outbound },
      images: { inbound: value.image_inbound },
      documents: { inbound: value.document_inbound },
      purposes: value.purpose_counts,
      message_types: value.message_type_counts,
      average_claim_latency_ms: value.latency_samples ? Math.round(value.latency_ms_total / value.latency_samples) : null
    };
  }

  return {
    source: 'ai_runtime_message_claims' as const,
    sample_limit: 500,
    pricing: { status: 'not_configured' as const, estimated_cost: null },
    global: present(global),
    stores: Object.fromEntries(Array.from(byStore.entries()).map(([storeId, value]) => [storeId, present(value)]))
  };
}
