import { getAutocarDevClient } from '@/lib/server/autocar/devAdmin';
import { evaluateAutocarPolicy } from '@/lib/server/autocar/policyEngine';
import { sendEvolutionText } from '@/lib/server/evolution';

export const AUTOCAR_HUMAN_HANDOFF_PILOT_STORE_ID = '239755c3-a2d4-4cdd-9502-f1595031c924';
export const AUTOCAR_HUMAN_HANDOFF_PREVIEW_BRANCH = 'fix/autocar-a4-production-handoff';
const LIVE_PURPOSE = 'live_human_handoff';
const LIVE_VERSION = 'autocar-human-handoff-v2-production-a4';
const SAFE_ACK = 'Vou encaminhar seu atendimento para nossa equipe continuar com você por aqui.';

type RuntimeSnapshot = {
  effective_mode?: string | null;
  human_state?: string | null;
  pause_reason?: string | null;
  paused_by_profile_id?: string | null;
  paused_by_source?: string | null;
  paused_at?: string | null;
  resumed_at?: string | null;
  production_whatsapp_number_id?: string | null;
  last_inbound_message_id?: string | null;
};

export function evaluateAutocarHumanHandoffScope(input: {
  storeId: string;
  vercelEnv?: string | null;
  gitRef?: string | null;
}) {
  if (input.storeId !== AUTOCAR_HUMAN_HANDOFF_PILOT_STORE_ID) {
    return {
      allowed: false,
      reason: 'Human Handoff V2 está restrito à A4 Multimarcas nesta fase.'
    };
  }

  const environment = String(input.vercelEnv || '').trim();
  if (environment === 'production') {
    return { allowed: true, reason: 'Human Handoff V2 liberado para A4 em Production.' };
  }

  if (environment === 'preview') {
    const gitRef = String(input.gitRef || '').trim();
    if (gitRef === AUTOCAR_HUMAN_HANDOFF_PREVIEW_BRANCH) {
      return { allowed: true, reason: 'Human Handoff V2 liberado no Preview corretivo da A4.' };
    }
    return {
      allowed: false,
      reason: 'Human Handoff V2 Preview está restrito à branch corretiva autorizada.'
    };
  }

  return {
    allowed: false,
    reason: 'Human Handoff V2 está bloqueado fora de Preview autorizado ou Production.'
  };
}

export function buildAutocarHumanHandoffRollbackPatch(runtime: RuntimeSnapshot, restoredAt: string) {
  return {
    human_state: runtime.human_state || 'autocar_active',
    pause_reason: runtime.pause_reason ?? null,
    paused_by_profile_id: runtime.paused_by_profile_id ?? null,
    paused_by_source: runtime.paused_by_source ?? null,
    paused_at: runtime.paused_at ?? null,
    resumed_at: runtime.resumed_at ?? null,
    updated_at: restoredAt
  };
}

function normalizePhone(value: unknown) {
  return String(value || '').split('@')[0].split(':')[0].replace(/\D/g, '');
}

function scopedEvolutionMessageId(whatsappNumberId: unknown, providerMessageId: unknown) {
  const numberId = String(whatsappNumberId || '').trim();
  const rawMessageId = String(providerMessageId || '').trim();
  if (!rawMessageId) return '';
  return numberId ? `evolution:${numberId}:${rawMessageId}` : `evolution:${rawMessageId}`;
}

function liveKey(storeId: string, inboundMessageId: string) {
  return `autocar:${storeId}:${inboundMessageId}:${LIVE_PURPOSE}`;
}

function shadowFrom(result: any) {
  return result?.result?.shadow || result?.shadow || null;
}

function pilotScopeReason(storeId: string) {
  const scope = evaluateAutocarHumanHandoffScope({
    storeId,
    vercelEnv: process.env.VERCEL_ENV,
    gitRef: process.env.VERCEL_GIT_COMMIT_REF
  });
  return scope.allowed ? '' : scope.reason;
}

function transferAction(shadow: any) {
  const actions = Array.isArray(shadow?.proposed_actions) ? shadow.proposed_actions : [];
  const explicit = actions.find((action: any) => String(action?.capability || '') === 'transfer_lead');
  if (explicit) {
    return {
      required: true,
      reason: String(explicit?.reason || 'A conversa requer continuidade com atendimento humano.').trim(),
      source_capability: 'transfer_lead'
    };
  }

  const protectedAction = actions.find((action: any) => {
    const effect = String(action?.decision?.effect || '');
    return effect === 'handoff' || effect === 'approval';
  });
  if (protectedAction) {
    return {
      required: true,
      reason: String(protectedAction?.reason || 'Uma consequência protegida requer validação humana.').trim(),
      source_capability: String(protectedAction?.capability || 'protected_action')
    };
  }

  return { required: false, reason: '', source_capability: null };
}

async function eligibility(storeId: string, conversationId: string) {
  const autocar = getAutocarDevClient();
  const [agentResult, runtimeResult] = await Promise.all([
    autocar.from('ai_store_agents')
      .select('mode,status,master_enabled,master_autopilot_allowed,store_selected_mode')
      .eq('store_id', storeId)
      .maybeSingle(),
    autocar.from('ai_runtime_conversations')
      .select('effective_mode,human_state,pause_reason,paused_by_profile_id,paused_by_source,paused_at,resumed_at,production_whatsapp_number_id,last_inbound_message_id')
      .eq('store_id', storeId)
      .eq('production_conversation_id', conversationId)
      .maybeSingle()
  ]);
  if (agentResult.error) throw agentResult.error;
  if (runtimeResult.error) throw runtimeResult.error;

  const agent = agentResult.data;
  const runtime = runtimeResult.data;
  const policy = evaluateAutocarPolicy({ mode: 'autopilot', capability: 'transfer_lead' });

  if (!agent?.master_enabled || !agent?.master_autopilot_allowed || agent?.store_selected_mode !== 'autopilot' || agent?.mode !== 'autopilot' || agent?.status !== 'active') {
    return { allowed: false, reason: 'Master + loja não estão efetivamente liberados para AUTOPILOT.', runtime, policy };
  }
  if (!runtime || runtime.effective_mode !== 'autopilot') {
    return { allowed: false, reason: 'Runtime da conversa não está em AUTOPILOT.', runtime, policy };
  }
  if (runtime.human_state !== 'autocar_active') {
    return { allowed: false, reason: `Conversa já está em takeover humano: ${runtime.pause_reason || runtime.human_state}.`, runtime, policy };
  }
  if (policy.effect !== 'handoff') {
    return { allowed: false, reason: `Policy transfer_lead não retornou handoff: ${policy.reason}`, runtime, policy };
  }

  return { allowed: true, reason: 'Human Handoff V2 elegível para A4.', runtime, policy };
}

export async function revalidateAutocarCanonicalInbound(input: {
  productionSupabase: any;
  storeId: string;
  conversationId: string;
  whatsappNumberId: string;
  inboundMessageId: string;
}) {
  const [conversationResult, inboundResult, latestInboundResult] = await Promise.all([
    input.productionSupabase
      .from('whatsapp_conversations')
      .select('id,store_id,whatsapp_number_id')
      .eq('id', input.conversationId)
      .eq('store_id', input.storeId)
      .eq('whatsapp_number_id', input.whatsappNumberId)
      .maybeSingle(),
    input.productionSupabase
      .from('whatsapp_messages')
      .select('id,message_type,direction,conversation_id,whatsapp_number_id,created_at')
      .eq('id', input.inboundMessageId)
      .eq('store_id', input.storeId)
      .eq('conversation_id', input.conversationId)
      .eq('whatsapp_number_id', input.whatsappNumberId)
      .eq('direction', 'inbound')
      .maybeSingle(),
    input.productionSupabase
      .from('whatsapp_messages')
      .select('id,created_at')
      .eq('store_id', input.storeId)
      .eq('conversation_id', input.conversationId)
      .eq('whatsapp_number_id', input.whatsappNumberId)
      .eq('direction', 'inbound')
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(1)
      .maybeSingle()
  ]);

  if (conversationResult.error) throw conversationResult.error;
  if (inboundResult.error) throw inboundResult.error;
  if (latestInboundResult.error) throw latestInboundResult.error;

  if (!conversationResult.data) {
    return { allowed: false, reason: 'Conversa canônica não corresponde à loja e ao número WhatsApp informados.' };
  }
  if (!inboundResult.data) {
    return { allowed: false, reason: 'Mensagem canônica não existe como inbound da conversa e do número WhatsApp informados.' };
  }
  if (!latestInboundResult.data || latestInboundResult.data.id !== input.inboundMessageId) {
    return { allowed: false, reason: 'A mensagem inbound não é mais a mais recente da conversa; nenhuma ação será executada.' };
  }

  return {
    allowed: true,
    reason: 'Mensagem inbound canônica e mais recente revalidada.',
    inbound: inboundResult.data
  };
}

async function createClaim(input: {
  storeId: string;
  conversationId: string;
  inboundMessageId: string;
  effectiveMode: string;
  shadowClaimId?: string | null;
  handoffReason: string;
  sourceCapability?: string | null;
}) {
  const autocar = getAutocarDevClient();
  const now = new Date().toISOString();
  const key = liveKey(input.storeId, input.inboundMessageId);
  const { data, error } = await autocar.from('ai_runtime_message_claims').insert({
    store_id: input.storeId,
    production_conversation_id: input.conversationId,
    production_message_id: input.inboundMessageId,
    purpose: LIVE_PURPOSE,
    idempotency_key: key,
    direction: 'outbound',
    message_type: 'handoff_action',
    effective_mode: input.effectiveMode,
    status: 'ready',
    policy_capability: 'transfer_lead',
    policy_effect: 'handoff',
    policy_source: 'human_handoff_v2_gate',
    policy_reason: input.handoffReason,
    result: {
      live_pilot_version: LIVE_VERSION,
      shadow_claim_id: input.shadowClaimId || null,
      source_capability: input.sourceCapability || null,
      planned_ack: SAFE_ACK,
      runtime_pause_execution: false,
      runtime_restore_execution: false,
      external_execution: false
    },
    updated_at: now
  }).select('*').single();

  if (error) {
    if (error.code === '23505') {
      const { data: existing, error: existingError } = await autocar.from('ai_runtime_message_claims')
        .select('*')
        .eq('idempotency_key', key)
        .maybeSingle();
      if (existingError) throw existingError;
      return { created: false, duplicate: true, claim: existing };
    }
    throw error;
  }

  return { created: true, duplicate: false, claim: data };
}

async function updateClaim(claimId: string, patch: Record<string, unknown>) {
  const autocar = getAutocarDevClient();
  const { data: current, error: readError } = await autocar.from('ai_runtime_message_claims')
    .select('result')
    .eq('id', claimId)
    .eq('purpose', LIVE_PURPOSE)
    .maybeSingle();
  if (readError) throw readError;

  const { data, error } = await autocar.from('ai_runtime_message_claims')
    .update({
      ...patch,
      result: { ...(current?.result || {}), ...((patch as any).result || {}) },
      updated_at: new Date().toISOString()
    })
    .eq('id', claimId)
    .eq('purpose', LIVE_PURPOSE)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

async function restoreRuntimeAfterFailedHandoff(input: {
  autocar: any;
  storeId: string;
  conversationId: string;
  whatsappNumberId: string;
  inboundMessageId: string;
  pauseStartedAt: string;
  runtimeBeforePause: RuntimeSnapshot;
}) {
  const restoredAt = new Date().toISOString();
  const patch = buildAutocarHumanHandoffRollbackPatch(input.runtimeBeforePause, restoredAt);
  const { data, error } = await input.autocar.from('ai_runtime_conversations')
    .update(patch)
    .eq('store_id', input.storeId)
    .eq('production_conversation_id', input.conversationId)
    .eq('production_whatsapp_number_id', input.whatsappNumberId)
    .eq('last_inbound_message_id', input.inboundMessageId)
    .eq('effective_mode', 'autopilot')
    .eq('human_state', 'human_active')
    .eq('paused_by_source', 'autocar_handoff')
    .eq('paused_at', input.pauseStartedAt)
    .select('store_id,production_conversation_id,effective_mode,human_state,pause_reason,paused_by_source,paused_at,resumed_at')
    .maybeSingle();
  if (error) throw error;
  return { restored: Boolean(data), runtime: data || null, restoredAt };
}

export async function attemptAutocarHumanHandoffPilot(input: {
  productionSupabase: any;
  storeId: string;
  conversationId: string;
  whatsappNumberId: string;
  inboundMessageId: string;
  integration: {
    instance_name?: string | null;
    status?: string | null;
    scope?: string | null;
  };
  shadowResult: any;
}) {
  const scopeReason = pilotScopeReason(input.storeId);
  if (scopeReason) return { handed_off: false, skipped: true, reason: scopeReason };

  const shadow = shadowFrom(input.shadowResult);
  if (!shadow) return { handed_off: false, skipped: true, reason: 'AUTO-SHADOW não produziu contexto concluído.' };

  const transfer = transferAction(shadow);
  if (!transfer.required) {
    return { handed_off: false, skipped: true, reason: 'Nenhuma transferência humana foi requerida nesta mensagem.' };
  }

  const shadowClaimId = input.shadowResult?.result?.claim?.id || null;
  const effectiveMode = String(input.shadowResult?.result?.effectiveMode || input.shadowResult?.result?.claim?.effective_mode || 'autopilot');
  const claimResult = await createClaim({
    storeId: input.storeId,
    conversationId: input.conversationId,
    inboundMessageId: input.inboundMessageId,
    effectiveMode,
    shadowClaimId,
    handoffReason: transfer.reason,
    sourceCapability: transfer.source_capability
  });

  if (claimResult.duplicate) {
    const alreadyCompleted = String(claimResult.claim?.status || '') === 'completed';
    return {
      handed_off: alreadyCompleted,
      duplicate: true,
      claim: claimResult.claim,
      reason: 'Claim de handoff já existe; nenhuma segunda transferência será executada.'
    };
  }
  if (!claimResult.claim?.id) {
    return { handed_off: false, skipped: true, reason: 'Claim de handoff não ficou elegível.' };
  }

  const eligible = await eligibility(input.storeId, input.conversationId);
  if (!eligible.allowed) {
    const skipped = await updateClaim(claimResult.claim.id, {
      status: 'skipped',
      policy_effect: 'deny',
      policy_reason: eligible.reason,
      completed_at: new Date().toISOString(),
      result: { runtime_pause_execution: false, external_execution: false, eligibility_reason: eligible.reason }
    });
    return { handed_off: false, skipped: true, claim: skipped, reason: eligible.reason };
  }

  if (input.integration?.scope !== 'store' || input.integration?.status !== 'connected' || !input.integration?.instance_name) {
    const reason = 'Human Handoff exige integração Evolution da A4 conectada antes de pausar o runtime.';
    const skipped = await updateClaim(claimResult.claim.id, {
      status: 'skipped',
      policy_effect: 'deny',
      policy_reason: reason,
      completed_at: new Date().toISOString(),
      result: { runtime_pause_execution: false, runtime_restore_execution: false, external_execution: false }
    });
    return { handed_off: false, skipped: true, claim: skipped, reason };
  }

  const canonicalInbound = await revalidateAutocarCanonicalInbound({
    productionSupabase: input.productionSupabase,
    storeId: input.storeId,
    conversationId: input.conversationId,
    whatsappNumberId: input.whatsappNumberId,
    inboundMessageId: input.inboundMessageId
  });
  const runtimeMatchesInbound = String(eligible.runtime?.last_inbound_message_id || '') === input.inboundMessageId;
  const runtimeMatchesNumber = String(eligible.runtime?.production_whatsapp_number_id || '') === input.whatsappNumberId;
  if (!canonicalInbound.allowed || !runtimeMatchesInbound || !runtimeMatchesNumber) {
    const reason = !canonicalInbound.allowed
      ? canonicalInbound.reason
      : !runtimeMatchesInbound
        ? 'Runtime da conversa avançou para outra mensagem inbound; nenhuma ação será executada.'
        : 'Runtime da conversa não corresponde ao número WhatsApp informado; nenhuma ação será executada.';
    const skipped = await updateClaim(claimResult.claim.id, {
      status: 'skipped',
      policy_effect: 'deny',
      policy_reason: reason,
      completed_at: new Date().toISOString(),
      result: {
        runtime_pause_execution: false,
        runtime_restore_execution: false,
        external_execution: false,
        canonical_inbound_revalidation: false,
        revalidation_reason: reason
      }
    });
    return { handed_off: false, skipped: true, claim: skipped, reason };
  }

  const autocar = getAutocarDevClient();
  const pauseStartedAt = new Date().toISOString();
  const pauseReason = `AUTOCAR encaminhou para atendimento humano: ${transfer.reason}`.slice(0, 500);
  const { data: pausedRuntime, error: pauseError } = await autocar.from('ai_runtime_conversations')
    .update({
      human_state: 'human_active',
      pause_reason: pauseReason,
      paused_by_profile_id: null,
      paused_by_source: 'autocar_handoff',
      paused_at: pauseStartedAt,
      updated_at: pauseStartedAt
    })
    .eq('store_id', input.storeId)
    .eq('production_conversation_id', input.conversationId)
    .eq('production_whatsapp_number_id', input.whatsappNumberId)
    .eq('last_inbound_message_id', input.inboundMessageId)
    .eq('effective_mode', 'autopilot')
    .eq('human_state', 'autocar_active')
    .select('store_id,production_conversation_id,effective_mode,human_state,pause_reason,paused_by_source,paused_at')
    .maybeSingle();
  if (pauseError) throw pauseError;

  if (!pausedRuntime) {
    const skipped = await updateClaim(claimResult.claim.id, {
      status: 'skipped',
      policy_effect: 'deny',
      policy_reason: 'Runtime mudou concorrentemente; nenhuma transferência automática foi aplicada.',
      completed_at: new Date().toISOString(),
      result: { runtime_pause_execution: false, runtime_restore_execution: false, external_execution: false, concurrent_runtime_change: true }
    });
    return { handed_off: false, skipped: true, claim: skipped, reason: 'Runtime mudou concorrentemente.' };
  }

  let providerSendSucceeded = false;

  try {
    const { data: conversation, error: conversationError } = await input.productionSupabase
      .from('whatsapp_conversations')
      .select('id,store_id,whatsapp_number_id,contact_id,lead_id,base_lead_id')
      .eq('id', input.conversationId)
      .eq('store_id', input.storeId)
      .eq('whatsapp_number_id', input.whatsappNumberId)
      .maybeSingle();
    if (conversationError) throw conversationError;
    if (!conversation) throw new Error('Conversa canônica não encontrada para confirmação do handoff.');

    const { data: contact, error: contactError } = await input.productionSupabase
      .from('whatsapp_contacts')
      .select('id,phone,wa_id')
      .eq('id', conversation.contact_id)
      .maybeSingle();
    if (contactError) throw contactError;
    const recipient = normalizePhone(contact?.phone || contact?.wa_id);
    if (!recipient) throw new Error('Contato sem telefone válido para confirmação do handoff.');

    const evolutionResult = await sendEvolutionText(String(input.integration.instance_name), recipient, SAFE_ACK);
    providerSendSucceeded = true;
    const providerMessageId = String(evolutionResult?.key?.id || evolutionResult?.message?.key?.id || evolutionResult?.id || '').trim();
    const sentAt = new Date().toISOString();
    const scopedId = scopedEvolutionMessageId(conversation.whatsapp_number_id, providerMessageId);

    let savedMessage: any = null;
    if (providerMessageId) {
      const { data: existing, error: existingError } = await input.productionSupabase
        .from('whatsapp_messages')
        .select('id')
        .eq('store_id', input.storeId)
        .eq('conversation_id', conversation.id)
        .eq('whatsapp_number_id', conversation.whatsapp_number_id)
        .eq('direction', 'outbound')
        .in('wa_message_id', [providerMessageId, scopedId])
        .limit(1)
        .maybeSingle();
      if (existingError) throw existingError;
      savedMessage = existing;
    }

    if (!savedMessage) {
      const { data, error: saveError } = await input.productionSupabase.from('whatsapp_messages').insert({
        store_id: conversation.store_id,
        whatsapp_number_id: conversation.whatsapp_number_id,
        conversation_id: conversation.id,
        contact_id: conversation.contact_id,
        lead_id: conversation.lead_id,
        base_lead_id: conversation.base_lead_id,
        wa_message_id: scopedId || providerMessageId || null,
        direction: 'outbound',
        message_type: 'text',
        body: SAFE_ACK,
        status: 'sent',
        raw_payload: {
          provider: 'evolution',
          autocar_human_handoff: true,
          inbound_message_id: input.inboundMessageId,
          live_claim_id: claimResult.claim.id,
          evolution: evolutionResult
        },
        sent_at: sentAt
      }).select('id').single();
      if (saveError) throw saveError;
      savedMessage = data;
    }

    const { error: conversationUpdateError } = await input.productionSupabase.from('whatsapp_conversations')
      .update({ last_message: SAFE_ACK, last_message_at: sentAt, updated_at: sentAt })
      .eq('id', conversation.id)
      .eq('store_id', input.storeId);
    if (conversationUpdateError) throw conversationUpdateError;

    const completedAt = new Date().toISOString();
    const completed = await updateClaim(claimResult.claim.id, {
      status: 'completed',
      policy_effect: 'handoff',
      completed_at: completedAt,
      result: {
        runtime_pause_execution: true,
        runtime_restore_execution: false,
        external_execution: true,
        canonical_inbound_revalidation: true,
        pause_reason: pauseReason,
        acknowledgement: {
          sent: true,
          provider: 'evolution',
          provider_message_id: providerMessageId || null,
          production_outbound_message_id: savedMessage?.id || null,
          sent_at: sentAt
        },
        completed_at: completedAt
      }
    });

    return {
      handed_off: true,
      sent: true,
      claim: completed,
      runtime: pausedRuntime,
      acknowledgement: completed?.result?.acknowledgement || null,
      reason: pauseReason
    };
  } catch (error: any) {
    const failureReason = String(error?.message || error || 'Falha ao concluir Human Handoff.').slice(0, 500);
    let rollback: any = { restored: false, failed: false, reason: '' };

    try {
      const restored = await restoreRuntimeAfterFailedHandoff({
        autocar,
        storeId: input.storeId,
        conversationId: input.conversationId,
        whatsappNumberId: input.whatsappNumberId,
        inboundMessageId: input.inboundMessageId,
        pauseStartedAt,
        runtimeBeforePause: eligible.runtime || {}
      });
      rollback = {
        restored: restored.restored,
        failed: false,
        concurrent_change: !restored.restored,
        restored_at: restored.restoredAt
      };
    } catch (rollbackError: any) {
      rollback = {
        restored: false,
        failed: true,
        reason: String(rollbackError?.message || rollbackError || 'Falha ao restaurar runtime após handoff incompleto.').slice(0, 500)
      };
    }

    let failedClaim: any = claimResult.claim;
    try {
      failedClaim = await updateClaim(claimResult.claim.id, {
        status: 'skipped',
        policy_effect: 'deny',
        policy_reason: `Human Handoff não concluído: ${failureReason}`.slice(0, 500),
        completed_at: new Date().toISOString(),
        result: {
          runtime_pause_execution: true,
          runtime_restore_execution: rollback.restored === true,
          external_execution: providerSendSucceeded,
          canonical_inbound_revalidation: true,
          automatic_retry_disabled: true,
          failure_reason: failureReason,
          rollback
        }
      });
    } catch {
      // O claim idempotente já existe e impede um segundo envio automático, mesmo se a marcação final falhar.
    }

    return {
      handed_off: false,
      sent: providerSendSucceeded,
      failed: true,
      skipped: true,
      claim: failedClaim,
      rollback,
      reason: rollback.restored
        ? 'Human Handoff falhou antes da conclusão; runtime restaurado com segurança e retry automático bloqueado.'
        : 'Human Handoff falhou antes da conclusão; retry automático bloqueado e runtime exige verificação humana.'
    };
  }
}
