import { ensureAutocarDevStore, getAutocarDevClient, type AutocarStoreMode } from '@/lib/server/autocar/devAdmin';
import { evaluateAutocarPolicy } from '@/lib/server/autocar/policyEngine';
import { prepareAutocarInboundAudio } from '@/lib/server/autocar/audioPipeline';
import { prepareAutocarInboundImage } from '@/lib/server/autocar/visionPipeline';

export type AutocarRuntimeState = 'autocar_active' | 'human_active' | 'paused';

type ProductionConversationRef = {
  storeId: string;
  conversationId: string;
  whatsappNumberId?: string | null;
  leadId?: string | null;
};

function idempotencyKey(storeId: string, messageId: string, purpose = 'autopilot_reply') {
  return `autocar:${storeId}:${messageId}:${purpose}`;
}

async function ensureRuntimeStore(productionSupabase: any, storeId: string) {
  const { data: store, error } = await productionSupabase
    .from('stores')
    .select('id,store_name,slug,status,portal_enabled')
    .eq('id', storeId)
    .maybeSingle();
  if (error) throw error;
  if (!store) throw new Error('Loja do runtime AUTOCAR não encontrada no CRM.');

  const autocar = getAutocarDevClient();
  await ensureAutocarDevStore(autocar, store);
  return { autocar, store };
}

async function readEffectiveMode(autocar: ReturnType<typeof getAutocarDevClient>, storeId: string): Promise<AutocarStoreMode> {
  const { data, error } = await autocar.from('ai_store_agents')
    .select('mode,status,master_enabled,master_autopilot_allowed,store_selected_mode')
    .eq('store_id', storeId)
    .maybeSingle();
  if (error) throw error;
  if (!data?.master_enabled || data.status !== 'active') return 'off';
  if (data.mode === 'copilot' || data.mode === 'autopilot') return data.mode;
  return 'off';
}

async function upsertRuntimeConversation(
  autocar: ReturnType<typeof getAutocarDevClient>,
  ref: ProductionConversationRef,
  effectiveMode: AutocarStoreMode,
  patch: Record<string, unknown> = {}
) {
  const now = new Date().toISOString();
  const { data: current, error: readError } = await autocar.from('ai_runtime_conversations')
    .select('*')
    .eq('store_id', ref.storeId)
    .eq('production_conversation_id', ref.conversationId)
    .maybeSingle();
  if (readError) throw readError;

  const base = {
    store_id: ref.storeId,
    production_conversation_id: ref.conversationId,
    production_whatsapp_number_id: ref.whatsappNumberId || current?.production_whatsapp_number_id || null,
    production_lead_id: ref.leadId || current?.production_lead_id || null,
    effective_mode: effectiveMode,
    updated_at: now
  };

  const { data, error } = await autocar.from('ai_runtime_conversations')
    .upsert({ ...base, ...patch }, { onConflict: 'store_id,production_conversation_id' })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function prepareAutocarSafeInbound(input: {
  productionSupabase: any;
  storeId: string;
  conversationId: string;
  whatsappNumberId: string;
  leadId?: string | null;
  messageId: string;
  messageType?: string | null;
}): Promise<any> {
  let audioPreparation: any = null;
  let visionPreparation: any = null;

  if (String(input.messageType || '') === 'audio') {
    try {
      audioPreparation = await prepareAutocarInboundAudio({
        productionSupabase: input.productionSupabase,
        storeId: input.storeId,
        conversationId: input.conversationId,
        whatsappNumberId: input.whatsappNumberId,
        messageId: input.messageId
      });
    } catch (error: any) {
      return {
        claimed: false,
        duplicate: false,
        ready: false,
        audio: {
          ready: false,
          failed: true,
          reason: String(error?.message || error || 'Falha ao transcrever áudio.').slice(0, 500)
        }
      };
    }

    if (!audioPreparation?.ready) {
      return {
        claimed: false,
        duplicate: false,
        ready: false,
        audio: audioPreparation
      };
    }
  }

  if (String(input.messageType || '') === 'image') {
    try {
      visionPreparation = await prepareAutocarInboundImage({
        productionSupabase: input.productionSupabase,
        storeId: input.storeId,
        conversationId: input.conversationId,
        whatsappNumberId: input.whatsappNumberId,
        messageId: input.messageId
      });
    } catch (error: any) {
      return {
        claimed: false,
        duplicate: false,
        ready: false,
        vision: {
          ready: false,
          failed: true,
          reason: String(error?.message || error || 'Falha ao interpretar imagem.').slice(0, 500)
        }
      };
    }

    if (!visionPreparation?.ready) {
      return {
        claimed: false,
        duplicate: false,
        ready: false,
        vision: visionPreparation
      };
    }
  }

  const { autocar } = await ensureRuntimeStore(input.productionSupabase, input.storeId);
  const effectiveMode = await readEffectiveMode(autocar, input.storeId);
  const ref: ProductionConversationRef = {
    storeId: input.storeId,
    conversationId: input.conversationId,
    whatsappNumberId: input.whatsappNumberId,
    leadId: input.leadId || null
  };

  const runtime = await upsertRuntimeConversation(autocar, ref, effectiveMode, {
    last_inbound_message_id: input.messageId
  });

  const key = idempotencyKey(input.storeId, input.messageId);
  const policy = evaluateAutocarPolicy({ mode: effectiveMode, capability: 'respond_first_contact' });
  const blockedByHuman = runtime.human_state === 'human_active' || runtime.human_state === 'paused';
  const ready = effectiveMode === 'autopilot' && !blockedByHuman && policy.effect === 'allow';
  const status = ready ? 'ready' : 'skipped';
  const reason = blockedByHuman
    ? `AUTOCAR pausada nesta conversa: ${runtime.pause_reason || runtime.human_state}.`
    : effectiveMode !== 'autopilot'
      ? `Modo efetivo ${effectiveMode.toUpperCase()} não executa resposta automática.`
      : policy.reason;

  const { data: claim, error: claimError } = await autocar.from('ai_runtime_message_claims').insert({
    store_id: input.storeId,
    production_conversation_id: input.conversationId,
    production_message_id: input.messageId,
    purpose: 'autopilot_reply',
    idempotency_key: key,
    direction: 'inbound',
    message_type: input.messageType || null,
    effective_mode: effectiveMode,
    status,
    policy_capability: 'respond_first_contact',
    policy_effect: policy.effect,
    policy_source: policy.source,
    policy_reason: policy.reason,
    result: {
      safe_core_version: 'v1',
      no_external_execution: true,
      human_state: runtime.human_state,
      reason,
      audio: audioPreparation
        ? {
            ready: true,
            version: audioPreparation.version || null,
            model: audioPreparation.model || null,
            seconds: audioPreparation.seconds || null,
            bytes: audioPreparation.bytes || null
          }
        : null,
      vision: visionPreparation
        ? {
            ready: true,
            version: visionPreparation.version || null,
            model: visionPreparation.model || null,
            bytes: visionPreparation.bytes || null,
            mimetype: visionPreparation.mimetype || null,
            usage: visionPreparation.usage || null,
            scene_type: visionPreparation.analysis?.scene_type || null,
            document_like: visionPreparation.analysis?.document_like === true
          }
        : null
    },
    completed_at: ready ? null : new Date().toISOString(),
    updated_at: new Date().toISOString()
  }).select('*').single();

  if (claimError) {
    if (claimError.code === '23505') {
      const { data: existing, error: existingError } = await autocar.from('ai_runtime_message_claims')
        .select('*')
        .eq('idempotency_key', key)
        .maybeSingle();
      if (existingError) throw existingError;
      return {
        claimed: false,
        duplicate: true,
        runtime,
        claim: existing,
        effectiveMode,
        policy,
        ready: false,
        audio: audioPreparation,
        vision: visionPreparation
      };
    }
    throw claimError;
  }

  await upsertRuntimeConversation(autocar, ref, effectiveMode, {
    last_processed_message_id: input.messageId
  });

  return {
    claimed: true,
    duplicate: false,
    runtime,
    claim,
    effectiveMode,
    policy,
    ready,
    audio: audioPreparation,
    vision: visionPreparation
  };
}

export async function completeAutocarShadowClaim(input: {
  storeId: string;
  claimId: string;
  shadow: Record<string, unknown>;
}) {
  const autocar = getAutocarDevClient();
  const now = new Date().toISOString();
  const { data: current, error: currentError } = await autocar.from('ai_runtime_message_claims')
    .select('result')
    .eq('id', input.claimId)
    .eq('store_id', input.storeId)
    .eq('purpose', 'autopilot_reply')
    .maybeSingle();
  if (currentError) throw currentError;

  const { data, error } = await autocar.from('ai_runtime_message_claims')
    .update({
      status: 'completed',
      result: {
        ...(current?.result || {}),
        shadow_mode_version: 'v1',
        no_external_execution: true,
        ...input.shadow
      },
      completed_at: now,
      updated_at: now
    })
    .eq('id', input.claimId)
    .eq('store_id', input.storeId)
    .eq('purpose', 'autopilot_reply')
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function failAutocarShadowClaim(input: {
  storeId: string;
  claimId: string;
  error: unknown;
}) {
  const autocar = getAutocarDevClient();
  const now = new Date().toISOString();
  const message = String((input.error as any)?.message || input.error || 'Falha desconhecida').slice(0, 1000);
  const { data: current } = await autocar.from('ai_runtime_message_claims')
    .select('result')
    .eq('id', input.claimId)
    .eq('store_id', input.storeId)
    .eq('purpose', 'autopilot_reply')
    .maybeSingle();
  const { data, error } = await autocar.from('ai_runtime_message_claims')
    .update({
      status: 'failed',
      result: {
        ...(current?.result || {}),
        shadow_mode_version: 'v1',
        no_external_execution: true,
        error: message
      },
      completed_at: now,
      updated_at: now
    })
    .eq('id', input.claimId)
    .eq('store_id', input.storeId)
    .eq('purpose', 'autopilot_reply')
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

function providerMessageIdFromRawPayload(rawPayload: any) {
  return String(
    rawPayload?.key?.id ||
    rawPayload?.message?.key?.id ||
    rawPayload?.id ||
    ''
  ).trim();
}

async function isOwnAutocarLiveOutbound(input: {
  productionSupabase: any;
  autocar: ReturnType<typeof getAutocarDevClient>;
  storeId: string;
  conversationId: string;
  messageId: string;
}) {
  const { data: message, error: messageError } = await input.productionSupabase
    .from('whatsapp_messages')
    .select('id,body,raw_payload,created_at,sent_at')
    .eq('id', input.messageId)
    .eq('store_id', input.storeId)
    .eq('conversation_id', input.conversationId)
    .maybeSingle();
  if (messageError) throw messageError;
  if (!message) return false;

  if (message?.raw_payload?.autocar_live_pilot === true) return true;

  const since = new Date(Date.now() - 2 * 60 * 1000).toISOString();
  const { data: claims, error: claimsError } = await input.autocar.from('ai_runtime_message_claims')
    .select('id,status,purpose,result,created_at')
    .eq('store_id', input.storeId)
    .eq('production_conversation_id', input.conversationId)
    .in('purpose', ['live_text_send', 'live_audio_send', 'live_photo_send', 'live_location_send', 'live_visit_schedule'])
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(16);
  if (claimsError) throw claimsError;

  const body = String(message.body || '').trim();
  const providerMessageId = providerMessageIdFromRawPayload(message.raw_payload);

  return (claims || []).some((claim: any) => {
    const result = claim?.result || {};

    if (claim.purpose === 'live_text_send' || claim.purpose === 'live_audio_send' || claim.purpose === 'live_location_send' || claim.purpose === 'live_visit_schedule') {
      if (String(result?.production_outbound_message_id || '') === input.messageId) return true;
      if (providerMessageId && String(result?.provider_message_id || '') === providerMessageId) return true;
      const planned = String(result?.planned_text || '').trim();
      return Boolean(body && planned && body === planned && (claim.status === 'ready' || claim.status === 'completed'));
    }

    if (claim.purpose === 'live_photo_send') {
      const productionIds = Array.isArray(result?.production_outbound_message_ids)
        ? result.production_outbound_message_ids.map(String)
        : [];
      if (productionIds.includes(input.messageId)) return true;

      const providerIds = Array.isArray(result?.provider_message_ids)
        ? result.provider_message_ids.map(String)
        : [];
      if (providerMessageId && providerIds.includes(providerMessageId)) return true;

      const plannedCaption = String(result?.planned_caption || '').trim();
      if (claim.status === 'ready' && body && plannedCaption && body === plannedCaption) return true;
    }

    return false;
  });
}

export async function markAutocarHumanActive(input: {
  productionSupabase: any;
  storeId: string;
  conversationId: string;
  whatsappNumberId?: string | null;
  leadId?: string | null;
  messageId?: string | null;
  profileId?: string | null;
  source: 'inbox' | 'whatsapp_device' | 'webhook_outbound';
}) {
  const { autocar } = await ensureRuntimeStore(input.productionSupabase, input.storeId);
  const effectiveMode = await readEffectiveMode(autocar, input.storeId);

  if (input.source === 'webhook_outbound' && input.messageId) {
    const ownLiveOutbound = await isOwnAutocarLiveOutbound({
      productionSupabase: input.productionSupabase,
      autocar,
      storeId: input.storeId,
      conversationId: input.conversationId,
      messageId: input.messageId
    });
    if (ownLiveOutbound) {
      return upsertRuntimeConversation(autocar, {
        storeId: input.storeId,
        conversationId: input.conversationId,
        whatsappNumberId: input.whatsappNumberId || null,
        leadId: input.leadId || null
      }, effectiveMode, {
        metadata: {
          last_ignored_outbound_source: 'autocar_live',
          last_ignored_outbound_message_id: input.messageId
        },
        updated_at: new Date().toISOString()
      });
    }
  }

  const now = new Date().toISOString();
  return upsertRuntimeConversation(autocar, {
    storeId: input.storeId,
    conversationId: input.conversationId,
    whatsappNumberId: input.whatsappNumberId || null,
    leadId: input.leadId || null
  }, effectiveMode, {
    human_state: 'human_active',
    pause_reason: 'Atendimento humano assumiu a conversa.',
    paused_by_profile_id: input.profileId || null,
    paused_by_source: input.source,
    paused_at: now,
    last_human_message_id: input.messageId || null,
    updated_at: now
  });
}

export async function resumeAutocarConversation(input: {
  productionSupabase: any;
  storeId: string;
  conversationId: string;
  whatsappNumberId?: string | null;
  leadId?: string | null;
}) {
  const { autocar } = await ensureRuntimeStore(input.productionSupabase, input.storeId);
  const effectiveMode = await readEffectiveMode(autocar, input.storeId);
  const now = new Date().toISOString();
  return upsertRuntimeConversation(autocar, {
    storeId: input.storeId,
    conversationId: input.conversationId,
    whatsappNumberId: input.whatsappNumberId || null,
    leadId: input.leadId || null
  }, effectiveMode, {
    human_state: 'autocar_active',
    pause_reason: null,
    paused_by_profile_id: null,
    paused_by_source: null,
    paused_at: null,
    resumed_at: now,
    updated_at: now
  });
}
