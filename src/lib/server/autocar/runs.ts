import { currentAutocarExternalReferenceColumns } from '@/lib/server/autocar/runtimeEnvironment';
import type { AutocarExecutionContext } from '@/lib/server/autocar/context';

export async function createAutocarRun(input: {
  supabase: any;
  context: AutocarExecutionContext;
  idempotencyKey: string;
}) {
  if (!input.context.agentId) throw new Error('Agente AUTOCAR ativo obrigatório para criar run.');
  const columns = currentAutocarExternalReferenceColumns();
  const row: Record<string, unknown> = {
    store_id: input.context.storeId,
    agent_id: input.context.agentId,
    mode: input.context.mode,
    status: 'queued',
    idempotency_key: input.idempotencyKey
  };
  row[columns.runs.conversationId] = input.context.conversationId;
  row[columns.runs.leadId] = input.context.leadId;
  row[columns.runs.triggerMessageId] = input.context.triggerMessageId;

  const { data, error } = await input.supabase.from('ai_agent_runs').insert(row).select('*').single();
  if (error) throw error;
  return data;
}

export async function appendAutocarEvent(input: {
  supabase: any;
  context: AutocarExecutionContext;
  runId: string;
  eventType: string;
  status?: string | null;
  toolName?: string | null;
  action?: string | null;
  requestSummary?: Record<string, unknown>;
  resultSummary?: Record<string, unknown>;
  model?: string | null;
  durationMs?: number | null;
  error?: string | null;
}) {
  if (!input.context.agentId) throw new Error('Agente AUTOCAR ativo obrigatório para registrar evento.');
  const columns = currentAutocarExternalReferenceColumns();
  const row: Record<string, unknown> = {
    store_id: input.context.storeId,
    agent_id: input.context.agentId,
    run_id: input.runId,
    event_type: input.eventType,
    status: input.status || null,
    tool_name: input.toolName || null,
    action: input.action || null,
    request_summary: input.requestSummary || {},
    result_summary: input.resultSummary || {},
    model: input.model || null,
    duration_ms: input.durationMs ?? null,
    error: input.error ? input.error.slice(0, 1000) : null
  };
  row[columns.events.conversationId] = input.context.conversationId;
  row[columns.events.leadId] = input.context.leadId;

  const { data, error } = await input.supabase.from('ai_agent_events').insert(row).select('id,created_at').single();
  if (error) throw error;
  return data;
}

export async function finishAutocarRun(input: {
  supabase: any;
  context: AutocarExecutionContext;
  runId: string;
  status: 'completed' | 'failed' | 'skipped' | 'cancelled';
  primaryModel?: string | null;
  usage?: { inputTokens?: number; outputTokens?: number; cachedTokens?: number };
  errorCode?: string | null;
  errorMessage?: string | null;
}) {
  const { data, error } = await input.supabase.from('ai_agent_runs').update({
    status: input.status,
    primary_model: input.primaryModel || null,
    input_tokens: Math.max(0, Number(input.usage?.inputTokens || 0)),
    output_tokens: Math.max(0, Number(input.usage?.outputTokens || 0)),
    cached_tokens: Math.max(0, Number(input.usage?.cachedTokens || 0)),
    completed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    error_code: input.errorCode || null,
    error_message: input.errorMessage ? input.errorMessage.slice(0, 1000) : null
  }).eq('id', input.runId).eq('store_id', input.context.storeId).select('*').single();
  if (error) throw error;
  return data;
}
