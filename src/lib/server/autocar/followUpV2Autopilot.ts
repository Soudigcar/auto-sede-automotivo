import { createHash } from 'node:crypto';
import { sendEvolutionText } from '@/lib/server/evolution';
import { getAutocarRuntimeClient, evaluateAutocarExternalExecutionGate } from '@/lib/server/autocar/runtimeEnvironment';
import {
  FOLLOW_UP_V2_AUTOPILOT_CANARY_STORE_ID,
  readStoreFollowUpV2
} from '@/lib/server/autocar/followUpV2ConfigStore';
import { evaluateFollowUpCopilotCandidate, withinFollowUpAllowedWindow } from '@/lib/server/autocar/followUpV2CopilotQueue';
import { generateContextualFollowUpReopening, looksLikeNonLeadAutomation } from '@/lib/server/autocar/followUpV2ContextualReopening';

export const FOLLOW_UP_AUTOPILOT_VERSION = 'autocar-follow-up-v2-autopilot-canary-v1';
export const FOLLOW_UP_AUTOPILOT_MAX_SENDS_PER_RUN = 3;
export const FOLLOW_UP_AUTOPILOT_CANARY_STORE_ID = FOLLOW_UP_V2_AUTOPILOT_CANARY_STORE_ID;

const terminalLeadStatuses = new Set(['won', 'lost', 'sale_confirmed', 'sold', 'closed', 'cancelled']);
const optOutSignals = [
  /não\s+(quero|desejo)\s+(mais\s+)?(receber|mensagens|contato)/i,
  /pare\s+de\s+(mandar|enviar|me\s+chamar)/i,
  /não\s+me\s+(chame|mande|envie)\s+mais/i,
  /remov(a|e)\s+(meu\s+)?(número|numero|contato)/i,
  /retir(a|e)\s+(meu\s+)?(número|numero|contato)/i,
  /descadastr(a|e)/i,
  /^\s*(stop|unsubscribe|sair)\s*[.!]?\s*$/i
];

function dateValue(value: unknown) {
  const date = value ? new Date(String(value)) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
}

function normalizePhone(value: unknown) {
  return String(value || '').split('@')[0].split(':')[0].replace(/\D/g, '');
}

function scopedEvolutionMessageId(whatsappNumberId: unknown, providerMessageId: unknown) {
  const numberId = String(whatsappNumberId || '').trim();
  const raw = String(providerMessageId || '').trim();
  if (!raw) return '';
  return numberId ? `evolution:${numberId}:${raw}` : `evolution:${raw}`;
}

function saoPauloDayStart(now: Date) {
  const date = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(now);
  return new Date(`${date}T00:00:00-03:00`).toISOString();
}

export function hasFollowUpOptOut(messages: Array<{ direction?: unknown; body?: unknown }>) {
  const inbound = messages.filter((message) => String(message.direction) === 'inbound').slice(-12);
  return inbound.some((message) => {
    const body = String(message.body || '').trim();
    return body.length > 0 && optOutSignals.some((pattern) => pattern.test(body));
  });
}

export function contextualAutopilotQuality(plan: any) {
  const text = String(plan?.suggested_message || '').trim();
  const structural = Boolean(
    plan?.is_commercial_conversation === true &&
    !plan?.block_reason &&
    String(plan?.last_topic || '').trim() &&
    String(plan?.pending_thread || '').trim() &&
    String(plan?.reopening_hook || '').trim() &&
    String(plan?.commercial_objective || '').trim() &&
    text
  );
  if (!structural) return { safe: false, score: 0.35, reason: 'Mapa contextual incompleto ou conversa não comercial.' };
  if (text.length > 600 || (text.match(/\?/g) || []).length > 1) {
    return { safe: false, score: 0.68, reason: 'Mensagem longa ou com perguntas múltiplas; requer revisão humana.' };
  }
  if (/como posso ajudar|qual veículo você procura|qual veiculo voce procura/i.test(text)) {
    return { safe: false, score: 0.62, reason: 'Abertura genérica detectada; requer revisão humana.' };
  }
  if (/aprova(d[oa])?|aprovação garantida|credito garantido|crédito garantido|desconto garantido/i.test(text)) {
    return { safe: false, score: 0.2, reason: 'Promessa financeira/comercial protegida detectada.' };
  }
  const avoid = Array.isArray(plan?.avoid_repeating) ? plan.avoid_repeating.length : 0;
  const score = avoid > 0 ? 0.93 : 0.84;
  return { safe: score >= 0.85, score, reason: score >= 0.85 ? 'Reabertura contextual apta ao canário.' : 'Contexto insuficiente para AUTOPILOT.' };
}

async function capabilityAllowsFollowUp(autocar: any) {
  const { data, error } = await autocar.from('ai_global_capability_policies')
    .select('capability,effect,is_active,version,reason')
    .eq('capability', 'create_follow_up')
    .eq('is_active', true)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return {
    allowed: data?.effect === 'allow',
    reason: data?.effect === 'allow'
      ? 'Capability create_follow_up liberada pelo Master.'
      : String(data?.reason || 'Capability create_follow_up não está liberada.')
  };
}

async function readBundle(productionSupabase: any, conversationId: string) {
  const { data: conversation, error: conversationError } = await productionSupabase
    .from('whatsapp_conversations')
    .select('id,store_id,whatsapp_number_id,contact_id,lead_id,base_lead_id,status,last_message_at')
    .eq('id', conversationId)
    .eq('store_id', FOLLOW_UP_AUTOPILOT_CANARY_STORE_ID)
    .maybeSingle();
  if (conversationError) throw conversationError;
  if (!conversation) return null;

  const [leadResult, baseLeadResult, commercialResult, messagesResult, contactResult, integrationResult] = await Promise.all([
    conversation.lead_id
      ? productionSupabase.from('leads')
        .select('id,assigned_store_id,customer_name,customer_phone,status,interested_vehicle,interested_vehicle_id,interested_vehicle_price,scheduled_at,notes,origin')
        .eq('id', conversation.lead_id).eq('assigned_store_id', FOLLOW_UP_AUTOPILOT_CANARY_STORE_ID).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    conversation.base_lead_id
      ? productionSupabase.from('leads_base').select('id,name,phone,status,source,campaign_name').eq('id', conversation.base_lead_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    conversation.lead_id
      ? productionSupabase.from('lead_commercial_details')
        .select('lead_id,payment_type,financing_bank,has_down_payment,down_payment_value,financed_amount,installment_count,installment_value,has_trade_in,trade_vehicle_name')
        .eq('lead_id', conversation.lead_id).eq('store_id', FOLLOW_UP_AUTOPILOT_CANARY_STORE_ID).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    productionSupabase.from('whatsapp_messages')
      .select('id,direction,message_type,body,raw_payload,sent_at,created_at')
      .eq('store_id', FOLLOW_UP_AUTOPILOT_CANARY_STORE_ID)
      .eq('conversation_id', conversation.id)
      .order('sent_at', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(40),
    productionSupabase.from('whatsapp_contacts').select('id,phone,wa_id').eq('id', conversation.contact_id).maybeSingle(),
    productionSupabase.from('store_whatsapp_integrations')
      .select('id,store_id,crm_number_id,instance_name,status,scope')
      .eq('store_id', FOLLOW_UP_AUTOPILOT_CANARY_STORE_ID)
      .eq('crm_number_id', conversation.whatsapp_number_id)
      .eq('scope', 'store')
      .maybeSingle()
  ]);
  for (const result of [leadResult, baseLeadResult, commercialResult, messagesResult, contactResult, integrationResult]) {
    if (result.error) throw result.error;
  }
  return {
    conversation,
    lead: leadResult.data,
    baseLead: baseLeadResult.data,
    commercial: commercialResult.data,
    messages: messagesResult.data || [],
    contact: contactResult.data,
    integration: integrationResult.data
  };
}

async function readRuntime(autocar: any, conversationId: string) {
  const { data, error } = await autocar.from('ai_runtime_conversations')
    .select('production_conversation_id,human_state,effective_mode,pause_reason,updated_at')
    .eq('store_id', FOLLOW_UP_AUTOPILOT_CANARY_STORE_ID)
    .eq('production_conversation_id', conversationId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function blockExecution(autocar: any, executionId: string, reason: string, metadata: Record<string, unknown> = {}) {
  const { error } = await autocar.from('ai_follow_up_autopilot_executions').update({
    status: 'blocked', reason: reason.slice(0, 1000), metadata, completed_at: new Date().toISOString(), updated_at: new Date().toISOString()
  }).eq('id', executionId).eq('status', 'claimed');
  if (error) throw error;
  return { sent: false, blocked: true, reason };
}

async function fallbackCopilot(autocar: any, execution: any, candidate: any, generated: any, quality: any) {
  const text = String(generated?.plan?.suggested_message || '').trim();
  if (text) {
    const idempotencyKey = `autopilot-fallback:${candidate.idempotency_key}`;
    const { error } = await autocar.from('ai_follow_up_copilot_suggestions').upsert({
      store_id: FOLLOW_UP_AUTOPILOT_CANARY_STORE_ID,
      production_conversation_id: candidate.conversation_id,
      production_lead_id: candidate.lead_id,
      scenario_key: candidate.scenario_key,
      step_id: candidate.step_id,
      due_at: candidate.due_at,
      context_last_message_at: candidate.last_store_message_at,
      suggested_message: text.slice(0, 4000),
      status: 'pending',
      idempotency_key: idempotencyKey,
      model: generated?.model || null,
      usage: generated?.usage || {},
      metadata: {
        contextual_reopening: true,
        autopilot_fallback: true,
        execution_id: execution.id,
        quality_score: quality.score,
        quality_reason: quality.reason,
        last_topic: generated?.plan?.last_topic || '',
        pending_thread: generated?.plan?.pending_thread || '',
        reopening_hook: generated?.plan?.reopening_hook || '',
        avoid_repeating: generated?.plan?.avoid_repeating || []
      },
      updated_at: new Date().toISOString()
    }, { onConflict: 'idempotency_key' });
    if (error) throw error;
  }
  const { error: updateError } = await autocar.from('ai_follow_up_autopilot_executions').update({
    status: 'fallback_copilot',
    planned_message: text || null,
    model: generated?.model || null,
    confidence: quality.score,
    reason: quality.reason,
    metadata: { contextual_reopening: true, autopilot_fallback: true },
    completed_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }).eq('id', execution.id).eq('status', 'claimed');
  if (updateError) throw updateError;
  return { sent: false, fallback_copilot: true, reason: quality.reason };
}

async function executionCaps(autocar: any, config: any, candidate: any, now: Date) {
  const dayStart = saoPauloDayStart(now);
  const todayQuery = autocar.from('ai_follow_up_autopilot_executions')
    .select('id,created_at', { count: 'exact', head: false })
    .eq('store_id', FOLLOW_UP_AUTOPILOT_CANARY_STORE_ID)
    .eq('status', 'sent')
    .gte('created_at', dayStart);
  const todayResult = candidate.lead_id ? await todayQuery.eq('production_lead_id', candidate.lead_id) : await todayQuery.eq('production_conversation_id', candidate.conversation_id);
  if (todayResult.error) throw todayResult.error;
  if (Number(todayResult.count || todayResult.data?.length || 0) >= config.global.maxPerLeadPerDay) {
    return { allowed: false, reason: 'Limite diário de Follow-up deste lead atingido.' };
  }

  const { data: sequence, error: sequenceError } = await autocar.from('ai_follow_up_autopilot_executions')
    .select('id,status,scenario_key,step_id,trigger_last_customer_message_at,trigger_last_store_message_at,created_at,completed_at,metadata')
    .eq('store_id', FOLLOW_UP_AUTOPILOT_CANARY_STORE_ID)
    .eq('production_conversation_id', candidate.conversation_id)
    .eq('scenario_key', candidate.scenario_key)
    .eq('status', 'sent')
    .eq('trigger_last_customer_message_at', candidate.last_customer_message_at)
    .order('created_at', { ascending: true });
  if (sequenceError) throw sequenceError;
  const sentSequence = sequence || [];
  if (sentSequence.length >= config.global.maxPerSequence) return { allowed: false, reason: 'Limite máximo da sequência atingido.' };

  const scenario = config.scenarios.find((row: any) => row.key === candidate.scenario_key);
  const steps = (scenario?.steps || []).filter((step: any) => step.enabled && step.delayMinutes >= 0).slice(0, config.global.maxPerSequence);
  const nextStep = steps[sentSequence.length];
  if (!nextStep) return { allowed: false, reason: 'Não há próxima etapa habilitada nesta sequência.' };

  const firstAnchor = sentSequence[0]?.metadata?.sequence_anchor_at || candidate.last_store_message_at;
  const anchor = dateValue(firstAnchor);
  if (!anchor) return { allowed: false, reason: 'Âncora temporal inválida para a sequência.' };
  const maxEnd = anchor.getTime() + config.global.maxSequenceDays * 86_400_000;
  if (now.getTime() > maxEnd) return { allowed: false, reason: 'Duração máxima da sequência encerrada.' };
  const dueAt = new Date(anchor.getTime() + Number(nextStep.delayMinutes) * 60_000);
  if (now.getTime() < dueAt.getTime()) return { allowed: false, not_due: true, reason: `Próxima etapa ainda não venceu (${nextStep.label}).` };

  const latestSent = sentSequence.length ? dateValue(sentSequence[sentSequence.length - 1]?.completed_at || sentSequence[sentSequence.length - 1]?.created_at) : null;
  if (latestSent && now.getTime() - latestSent.getTime() < config.global.minIntervalMinutes * 60_000) {
    return { allowed: false, not_due: true, reason: 'Intervalo mínimo entre Follow-ups ainda não foi cumprido.' };
  }
  return { allowed: true, step: nextStep, sequence_anchor_at: anchor.toISOString(), sequence_index: sentSequence.length };
}

async function claimExecution(autocar: any, candidate: any, step: any, sequenceAnchor: string, sequenceIndex: number) {
  const rawKey = [FOLLOW_UP_AUTOPILOT_VERSION, candidate.conversation_id, candidate.scenario_key, step.id, candidate.last_customer_message_at, sequenceAnchor].join(':');
  const key = createHash('sha256').update(rawKey).digest('hex');
  const { data, error } = await autocar.from('ai_follow_up_autopilot_executions').insert({
    store_id: FOLLOW_UP_AUTOPILOT_CANARY_STORE_ID,
    production_conversation_id: candidate.conversation_id,
    production_lead_id: candidate.lead_id,
    scenario_key: candidate.scenario_key,
    step_id: step.id,
    due_at: candidate.due_at,
    trigger_last_customer_message_at: candidate.last_customer_message_at,
    trigger_last_store_message_at: candidate.last_store_message_at,
    idempotency_key: key,
    status: 'claimed',
    metadata: { version: FOLLOW_UP_AUTOPILOT_VERSION, sequence_anchor_at: sequenceAnchor, sequence_index: sequenceIndex }
  }).select('*').single();
  if (error) {
    if (error.code === '23505') return { duplicate: true, execution: null };
    throw error;
  }
  return { duplicate: false, execution: data };
}

async function immediateRevalidation(productionSupabase: any, autocar: any, config: any, candidate: any, plannedMessage: string) {
  const bundle = await readBundle(productionSupabase, candidate.conversation_id);
  if (!bundle) return { allowed: false, reason: 'Conversa não existe mais.' };
  const runtime = await readRuntime(autocar, candidate.conversation_id);
  const current = evaluateFollowUpCopilotCandidate({
    config,
    conversation: bundle.conversation,
    lead: bundle.lead,
    commercial: bundle.commercial,
    runtimeConversation: runtime,
    messages: bundle.messages,
    requiredMode: 'autopilot'
  });
  if (!current.candidate) return { allowed: false, reason: `Revalidação bloqueou: ${current.reason}` };
  if (current.candidate.last_customer_message_at !== candidate.last_customer_message_at) return { allowed: false, reason: 'Cliente respondeu ou o contexto mudou durante a preparação.' };
  if (hasFollowUpOptOut(bundle.messages)) return { allowed: false, reason: 'Opt-out detectado imediatamente antes do envio.' };
  if (looksLikeNonLeadAutomation(bundle.messages)) return { allowed: false, reason: 'Contato promocional/indevido detectado.' };
  if (!bundle.integration || bundle.integration.status !== 'connected' || !bundle.integration.instance_name) return { allowed: false, reason: 'Integração WhatsApp da A4 não está conectada.' };
  const recipient = normalizePhone(bundle.contact?.phone || bundle.contact?.wa_id);
  if (!recipient) return { allowed: false, reason: 'Contato sem telefone válido.' };
  if (!plannedMessage.trim()) return { allowed: false, reason: 'Mensagem final vazia.' };
  return { allowed: true, bundle, runtime, recipient };
}

async function sendClaimedExecution(productionSupabase: any, autocar: any, config: any, candidate: any, execution: any, generated: any, quality: any, sequence: any) {
  const text = String(generated.plan.suggested_message || '').trim().slice(0, 4000);
  const { error: plannedError } = await autocar.from('ai_follow_up_autopilot_executions').update({
    planned_message: text,
    model: generated.model || null,
    confidence: quality.score,
    reason: quality.reason,
    metadata: {
      ...(execution.metadata || {}),
      sequence_anchor_at: sequence.sequence_anchor_at,
      sequence_index: sequence.sequence_index,
      contextual_reopening: true,
      last_topic: generated.plan.last_topic,
      pending_thread: generated.plan.pending_thread,
      reopening_hook: generated.plan.reopening_hook,
      avoid_repeating: generated.plan.avoid_repeating || []
    },
    updated_at: new Date().toISOString()
  }).eq('id', execution.id).eq('status', 'claimed');
  if (plannedError) throw plannedError;

  const externalGate = await evaluateAutocarExternalExecutionGate();
  if (!externalGate.allowed) return blockExecution(autocar, execution.id, externalGate.reason, { external_gate: externalGate });
  const capability = await capabilityAllowsFollowUp(autocar);
  if (!capability.allowed) return blockExecution(autocar, execution.id, capability.reason, { capability: 'create_follow_up' });
  if (!withinFollowUpAllowedWindow(config, new Date())) return blockExecution(autocar, execution.id, 'Janela de envio encerrou durante a preparação.');

  const revalidated = await immediateRevalidation(productionSupabase, autocar, config, candidate, text);
  if (!revalidated.allowed) return blockExecution(autocar, execution.id, revalidated.reason);
  const bundle: any = revalidated.bundle;

  try {
    const evolutionResult = await sendEvolutionText(String(bundle.integration.instance_name), String(revalidated.recipient), text);
    const providerMessageId = String(evolutionResult?.key?.id || evolutionResult?.message?.key?.id || evolutionResult?.id || '').trim();
    const sentAt = new Date().toISOString();
    const scopedId = scopedEvolutionMessageId(bundle.conversation.whatsapp_number_id, providerMessageId);
    let savedMessage: any = null;
    if (providerMessageId) {
      const existing = await productionSupabase.from('whatsapp_messages').select('*')
        .eq('whatsapp_number_id', bundle.conversation.whatsapp_number_id)
        .in('wa_message_id', [providerMessageId, scopedId]).limit(1).maybeSingle();
      if (existing.error) throw existing.error;
      savedMessage = existing.data;
    }
    if (!savedMessage) {
      const inserted = await productionSupabase.from('whatsapp_messages').insert({
        store_id: bundle.conversation.store_id,
        whatsapp_number_id: bundle.conversation.whatsapp_number_id,
        conversation_id: bundle.conversation.id,
        contact_id: bundle.conversation.contact_id,
        lead_id: bundle.conversation.lead_id,
        base_lead_id: bundle.conversation.base_lead_id,
        wa_message_id: scopedId || providerMessageId || null,
        direction: 'outbound',
        message_type: 'text',
        body: text,
        status: 'sent',
        raw_payload: {
          provider: 'evolution',
          autocar_follow_up_autopilot: true,
          follow_up_execution_id: execution.id,
          evolution: evolutionResult
        },
        sent_at: sentAt
      }).select('*').single();
      if (inserted.error) throw inserted.error;
      savedMessage = inserted.data;
    }
    const conversationUpdate = await productionSupabase.from('whatsapp_conversations').update({
      last_message: text, last_message_at: sentAt, updated_at: sentAt
    }).eq('id', bundle.conversation.id).eq('store_id', FOLLOW_UP_AUTOPILOT_CANARY_STORE_ID);
    if (conversationUpdate.error) throw conversationUpdate.error;

    const completed = await autocar.from('ai_follow_up_autopilot_executions').update({
      status: 'sent',
      provider_message_id: providerMessageId || null,
      production_outbound_message_id: savedMessage?.id || null,
      completed_at: sentAt,
      updated_at: sentAt
    }).eq('id', execution.id).eq('status', 'claimed');
    if (completed.error) throw completed.error;

    const scenario = config.scenarios.find((row: any) => row.key === candidate.scenario_key);
    await autocar.from('ai_follow_up_performance_events').insert({
      store_id: FOLLOW_UP_AUTOPILOT_CANARY_STORE_ID,
      scenario_key: candidate.scenario_key,
      production_conversation_id: candidate.conversation_id,
      production_lead_id: candidate.lead_id,
      event_type: 'sent',
      attribution_window_minutes: scenario?.attributionWindowMinutes || 1440,
      source_occurred_at: sentAt,
      attributed_to_follow_up: true,
      metadata: { autopilot: true, canary: true, execution_id: execution.id, model: generated.model || null }
    });
    return { sent: true, execution_id: execution.id, conversation_id: candidate.conversation_id, message_id: savedMessage?.id || null };
  } catch (error: any) {
    const reason = String(error?.message || error || 'Falha no envio AUTOPILOT.').slice(0, 1000);
    await autocar.from('ai_follow_up_autopilot_executions').update({
      status: 'failed', reason, completed_at: new Date().toISOString(), updated_at: new Date().toISOString()
    }).eq('id', execution.id).eq('status', 'claimed');
    return { sent: false, failed: true, reason };
  }
}

async function processConversation(productionSupabase: any, autocar: any, config: any, conversationId: string, now: Date) {
  const bundle = await readBundle(productionSupabase, conversationId);
  if (!bundle) return { sent: false, skipped: true, reason: 'Conversa não encontrada.' };
  const runtime = await readRuntime(autocar, conversationId);
  if (hasFollowUpOptOut(bundle.messages)) return { sent: false, blocked: true, reason: 'Cliente realizou opt-out.' };
  const evaluated = evaluateFollowUpCopilotCandidate({
    config,
    conversation: bundle.conversation,
    lead: bundle.lead,
    commercial: bundle.commercial,
    runtimeConversation: runtime,
    messages: bundle.messages,
    requiredMode: 'autopilot',
    now
  });
  if (!evaluated.candidate) return { sent: false, skipped: true, reason: evaluated.reason };
  const candidate = evaluated.candidate;

  const caps = await executionCaps(autocar, config, candidate, now);
  if (!caps.allowed) return { sent: false, skipped: true, reason: caps.reason };
  const claim = await claimExecution(autocar, candidate, caps.step, caps.sequence_anchor_at, caps.sequence_index);
  if (claim.duplicate || !claim.execution) return { sent: false, duplicate: true, reason: 'Execução AUTOPILOT já reivindicada.' };

  const textMessages = bundle.messages.slice().reverse().map((message: any) => ({
    direction: String(message.direction || ''),
    message_type: String(message.message_type || 'text'),
    body: String(message.body || '').trim(),
    sent_at: message.sent_at || message.created_at || null
  })).filter((message: any) => Boolean(message.body));

  let generated: any;
  try {
    generated = await generateContextualFollowUpReopening({
      store: { id: FOLLOW_UP_AUTOPILOT_CANARY_STORE_ID, store_name: 'A4 Multimarcas' },
      lead: bundle.lead,
      baseLead: bundle.baseLead,
      commercial: bundle.commercial,
      messages: textMessages,
      inventorySupabase: productionSupabase,
      scenarioKey: candidate.scenario_key
    });
  } catch (error: any) {
    return blockExecution(autocar, claim.execution.id, `Falha ao gerar reabertura: ${String(error?.message || error).slice(0, 600)}`);
  }
  const quality = contextualAutopilotQuality(generated.plan);
  if (!quality.safe) return fallbackCopilot(autocar, claim.execution, candidate, generated, quality);
  return sendClaimedExecution(productionSupabase, autocar, config, candidate, claim.execution, generated, quality, caps);
}

export async function runA4FollowUpAutopilot(input: { productionSupabase: any; now?: Date; maxSends?: number }) {
  const now = input.now || new Date();
  const maxSends = Math.max(1, Math.min(Number(input.maxSends || FOLLOW_UP_AUTOPILOT_MAX_SENDS_PER_RUN), FOLLOW_UP_AUTOPILOT_MAX_SENDS_PER_RUN));
  const autocar = getAutocarRuntimeClient();
  const configBundle = await readStoreFollowUpV2(autocar, FOLLOW_UP_AUTOPILOT_CANARY_STORE_ID);
  const config = configBundle.effective;
  if (!config.global.enabled || config.global.mode !== 'autopilot') {
    return { success: true, enabled: false, sent: 0, results: [], reason: 'A4 não está efetivamente em AUTOPILOT de Follow-up.' };
  }
  if (!withinFollowUpAllowedWindow(config, now)) {
    return { success: true, enabled: true, sent: 0, results: [], reason: 'Fora da janela efetiva da A4.' };
  }

  const { data: conversations, error } = await input.productionSupabase.from('whatsapp_conversations')
    .select('id,last_message_at')
    .eq('store_id', FOLLOW_UP_AUTOPILOT_CANARY_STORE_ID)
    .eq('status', 'open')
    .order('last_message_at', { ascending: true })
    .limit(60);
  if (error) throw error;

  const results: any[] = [];
  let sent = 0;
  for (const conversation of conversations || []) {
    if (sent >= maxSends) break;
    try {
      const result = await processConversation(input.productionSupabase, autocar, config, conversation.id, now);
      results.push({ conversation_id: conversation.id, ...result });
      if (result.sent) sent += 1;
    } catch (error: any) {
      results.push({ conversation_id: conversation.id, sent: false, failed: true, reason: String(error?.message || error).slice(0, 600) });
    }
  }
  return { success: true, enabled: true, store_id: FOLLOW_UP_AUTOPILOT_CANARY_STORE_ID, sent, scanned: (conversations || []).length, results };
}

export async function matchesClaimedFollowUpAutopilotOutbound(input: { conversationId: string; body: string }) {
  const body = String(input.body || '').trim();
  if (!body) return false;
  const autocar = getAutocarRuntimeClient();
  const cutoff = new Date(Date.now() - 3 * 60_000).toISOString();
  const { data, error } = await autocar.from('ai_follow_up_autopilot_executions')
    .select('id,planned_message,status,created_at')
    .eq('store_id', FOLLOW_UP_AUTOPILOT_CANARY_STORE_ID)
    .eq('production_conversation_id', input.conversationId)
    .in('status', ['claimed', 'sent'])
    .gte('created_at', cutoff)
    .order('created_at', { ascending: false })
    .limit(5);
  if (error) return false;
  return (data || []).some((row: any) => String(row.planned_message || '').trim() === body);
}
