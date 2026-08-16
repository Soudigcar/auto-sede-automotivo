import { evaluateAutocarPolicy } from '@/lib/server/autocar/policyEngine';
import { getAutocarDevClient } from '@/lib/server/autocar/devAdmin';
import { synthesizeAutocarSpeech } from '@/lib/server/autocar/audioPipeline';
import { sendEvolutionAudio } from '@/lib/server/evolutionAudio';

const LIVE_PURPOSE = 'live_audio_send';
const LIVE_PILOT_VERSION = 'autocar-live-audio-v1';

const blockedLiveCapabilities = new Set([
  'send_photos', 'send_location', 'schedule_visit', 'schedule_test_drive', 'create_follow_up',
  'transfer_lead', 'alter_pipeline', 'negotiate_price', 'grant_discount', 'alter_stock_price',
  'confirm_sale', 'promise_credit_approval', 'final_trade_appraisal'
]);

function normalizePhone(value: unknown) {
  return String(value || '').split('@')[0].split(':')[0].replace(/\D/g, '');
}

function liveKey(storeId: string, inboundMessageId: string) {
  return `autocar:${storeId}:${inboundMessageId}:${LIVE_PURPOSE}`;
}

function scopedEvolutionMessageId(whatsappNumberId: unknown, providerMessageId: unknown) {
  const numberId = String(whatsappNumberId || '').trim();
  const rawMessageId = String(providerMessageId || '').trim();
  if (!rawMessageId) return '';
  return numberId ? `evolution:${numberId}:${rawMessageId}` : `evolution:${rawMessageId}`;
}

function shadowFrom(result: any) {
  return result?.result?.shadow || result?.shadow || null;
}

function isLiveRuntimeEnvironment() {
  return ['preview', 'production'].includes(String(process.env.VERCEL_ENV || '').trim());
}

function liveGateReason(shadow: any) {
  const response = String(shadow?.response || '').trim();
  if (!response) return 'Shadow sem resposta textual segura para converter em áudio.';

  const plan = shadow?.operational_preview?.plan || {};
  if (plan?.needs_photos) return 'Pedido exige fotos; resposta de mídia especializada permanece separada do áudio conversacional.';
  if (plan?.needs_location) return 'Pedido exige localização; resposta especializada permanece separada do áudio conversacional.';

  const bookingState = String(shadow?.booking_guard?.state || 'NOT_APPLICABLE');
  if (bookingState !== 'NOT_APPLICABLE') return 'Conversa envolve agendamento; o piloto de voz não substitui o fluxo operacional de agenda.';

  const actions = Array.isArray(shadow?.proposed_actions) ? shadow.proposed_actions : [];
  for (const action of actions) {
    const capability = String(action?.capability || '');
    const effect = String(action?.decision?.effect || '');
    if (effect === 'approval' || effect === 'handoff') return `Resposta requer ${effect}; voz automática bloqueada.`;
    if (blockedLiveCapabilities.has(capability) && effect === 'allow') {
      return `Capability operacional ${capability} deve ser executada pelo piloto específico, não pelo áudio conversacional.`;
    }
  }

  return '';
}

async function currentLiveEligibility(storeId: string, conversationId: string) {
  const autocar = getAutocarDevClient();
  const [agentResult, runtimeResult] = await Promise.all([
    autocar.from('ai_store_agents')
      .select('mode,status,master_enabled,master_autopilot_allowed,store_selected_mode')
      .eq('store_id', storeId)
      .maybeSingle(),
    autocar.from('ai_runtime_conversations')
      .select('effective_mode,human_state,pause_reason')
      .eq('store_id', storeId)
      .eq('production_conversation_id', conversationId)
      .maybeSingle()
  ]);
  if (agentResult.error) throw agentResult.error;
  if (runtimeResult.error) throw runtimeResult.error;

  const agent = agentResult.data;
  const runtime = runtimeResult.data;
  const policy = evaluateAutocarPolicy({ mode: 'autopilot', capability: 'respond_audio_with_audio' });

  if (!agent?.master_enabled || !agent?.master_autopilot_allowed || agent?.store_selected_mode !== 'autopilot' || agent?.mode !== 'autopilot' || agent?.status !== 'active') {
    return { allowed: false, reason: 'Master + loja não estão efetivamente liberados para AUTOPILOT.', runtime, policy };
  }
  if (!runtime || runtime.effective_mode !== 'autopilot') return { allowed: false, reason: 'Runtime da conversa não está em AUTOPILOT.', runtime, policy };
  if (runtime.human_state !== 'autocar_active') {
    return { allowed: false, reason: `Conversa em takeover humano: ${runtime.pause_reason || runtime.human_state}.`, runtime, policy };
  }
  if (policy.effect !== 'allow') return { allowed: false, reason: policy.reason, runtime, policy };
  return { allowed: true, reason: 'Elegível para AUTOCAR LIVE AUDIO V1.', runtime, policy };
}

async function createClaim(input: {
  storeId: string;
  conversationId: string;
  inboundMessageId: string;
  effectiveMode: string;
  response: string;
  shadowClaimId?: string | null;
  gateReason?: string;
}) {
  const autocar = getAutocarDevClient();
  const now = new Date().toISOString();
  const blocked = Boolean(input.gateReason);
  const key = liveKey(input.storeId, input.inboundMessageId);
  const { data, error } = await autocar.from('ai_runtime_message_claims').insert({
    store_id: input.storeId,
    production_conversation_id: input.conversationId,
    production_message_id: input.inboundMessageId,
    purpose: LIVE_PURPOSE,
    idempotency_key: key,
    direction: 'outbound',
    message_type: 'audio',
    effective_mode: input.effectiveMode,
    status: blocked ? 'skipped' : 'ready',
    policy_capability: 'respond_audio_with_audio',
    policy_effect: blocked ? 'deny' : 'allow',
    policy_source: 'live_audio_v1_gate',
    policy_reason: input.gateReason || 'Conteúdo textual seguro aprovado para conversão em voz após revalidação do runtime.',
    result: {
      live_pilot_version: LIVE_PILOT_VERSION,
      planned_text: input.response,
      shadow_claim_id: input.shadowClaimId || null,
      external_execution: false,
      gate_reason: input.gateReason || null
    },
    completed_at: blocked ? now : null,
    updated_at: now
  }).select('*').single();

  if (error) {
    if (error.code === '23505') {
      const { data: existing, error: existingError } = await autocar.from('ai_runtime_message_claims')
        .select('*').eq('idempotency_key', key).maybeSingle();
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
    .select('result').eq('id', claimId).eq('purpose', LIVE_PURPOSE).maybeSingle();
  if (readError) throw readError;
  const { data, error } = await autocar.from('ai_runtime_message_claims')
    .update({
      ...patch,
      result: { ...(current?.result || {}), ...((patch as any).result || {}) },
      updated_at: new Date().toISOString()
    })
    .eq('id', claimId).eq('purpose', LIVE_PURPOSE).select('*').single();
  if (error) throw error;
  return data;
}

export async function attemptAutocarLiveAudioPilot(input: {
  productionSupabase: any;
  storeId: string;
  conversationId: string;
  whatsappNumberId: string;
  leadId?: string | null;
  inboundMessageId: string;
  integration: { instance_name?: string | null; status?: string | null; scope?: string | null };
  shadowResult: any;
}) {
  if (!isLiveRuntimeEnvironment()) return { sent: false, skipped: true, reason: 'AUTOCAR LIVE AUDIO V1 é bloqueado fora de Preview/Production.' };
  if (input.integration?.scope !== 'store' || input.integration?.status !== 'connected' || !input.integration?.instance_name) {
    return { sent: false, skipped: true, reason: 'Integração Evolution da loja não está conectada.' };
  }

  const shadow = shadowFrom(input.shadowResult);
  if (!shadow) return { sent: false, skipped: true, reason: 'AUTO-SHADOW não produziu resposta concluída.' };
  const response = String(shadow.response || '').trim().slice(0, 3500);
  const gateReason = liveGateReason(shadow);
  const shadowClaimId = input.shadowResult?.result?.claim?.id || null;
  const effectiveMode = String(input.shadowResult?.result?.effectiveMode || input.shadowResult?.result?.claim?.effective_mode || 'autopilot');

  const claimResult = await createClaim({
    storeId: input.storeId,
    conversationId: input.conversationId,
    inboundMessageId: input.inboundMessageId,
    effectiveMode,
    response,
    shadowClaimId,
    gateReason
  });
  if (claimResult.duplicate) return { sent: false, duplicate: true, claim: claimResult.claim, reason: 'Claim LIVE AUDIO já existe; nenhum reenvio será feito.' };
  if (gateReason || !claimResult.claim?.id) return { sent: false, skipped: true, claim: claimResult.claim, reason: gateReason || 'Claim LIVE AUDIO não ficou elegível.' };

  const eligibility = await currentLiveEligibility(input.storeId, input.conversationId);
  if (!eligibility.allowed) {
    const skipped = await updateClaim(claimResult.claim.id, {
      status: 'skipped', policy_effect: 'deny', policy_reason: eligibility.reason, completed_at: new Date().toISOString(),
      result: { external_execution: false, eligibility_reason: eligibility.reason }
    });
    return { sent: false, skipped: true, claim: skipped, reason: eligibility.reason };
  }

  const { data: conversation, error: conversationError } = await input.productionSupabase
    .from('whatsapp_conversations')
    .select('id,store_id,whatsapp_number_id,contact_id,lead_id,base_lead_id')
    .eq('id', input.conversationId).eq('store_id', input.storeId).maybeSingle();
  if (conversationError) throw conversationError;
  if (!conversation) throw new Error('Conversa canônica não encontrada para LIVE AUDIO.');

  const { data: contact, error: contactError } = await input.productionSupabase
    .from('whatsapp_contacts').select('id,phone,wa_id').eq('id', conversation.contact_id).maybeSingle();
  if (contactError) throw contactError;
  const recipient = normalizePhone(contact?.phone || contact?.wa_id);
  if (!recipient) throw new Error('Contato sem telefone válido para LIVE AUDIO.');

  try {
    const speech = await synthesizeAutocarSpeech(response);
    const evolutionResult = await sendEvolutionAudio({
      instanceName: String(input.integration.instance_name),
      number: recipient,
      bytes: speech.bytes,
      mimetype: speech.mimetype,
      fileName: speech.fileName
    });
    const providerMessageId = String(evolutionResult?.key?.id || evolutionResult?.message?.key?.id || evolutionResult?.id || '').trim();
    const sentAt = new Date().toISOString();
    const scopedId = scopedEvolutionMessageId(conversation.whatsapp_number_id, providerMessageId);

    let savedMessage: any = null;
    if (providerMessageId) {
      const { data: existing, error: existingError } = await input.productionSupabase
        .from('whatsapp_messages').select('*')
        .eq('whatsapp_number_id', conversation.whatsapp_number_id)
        .in('wa_message_id', [providerMessageId, scopedId]).limit(1).maybeSingle();
      if (existingError) throw existingError;
      savedMessage = existing;
    }

    if (!savedMessage) {
      const { data, error } = await input.productionSupabase.from('whatsapp_messages').insert({
        store_id: conversation.store_id,
        whatsapp_number_id: conversation.whatsapp_number_id,
        conversation_id: conversation.id,
        contact_id: conversation.contact_id,
        lead_id: conversation.lead_id,
        base_lead_id: conversation.base_lead_id,
        wa_message_id: scopedId || providerMessageId || null,
        direction: 'outbound',
        message_type: 'audio',
        body: response,
        status: 'sent',
        raw_payload: {
          provider: 'evolution',
          autocar_live_pilot: true,
          autocar_audio_reply: true,
          inbound_message_id: input.inboundMessageId,
          live_claim_id: claimResult.claim.id,
          speech: { version: speech.version, model: speech.model, voice: speech.voice, mimetype: speech.mimetype },
          evolution: evolutionResult
        },
        sent_at: sentAt
      }).select('*').single();
      if (error) throw error;
      savedMessage = data;
    }

    const { error: conversationUpdateError } = await input.productionSupabase
      .from('whatsapp_conversations')
      .update({ last_message: response, last_message_at: sentAt, updated_at: sentAt })
      .eq('id', conversation.id).eq('store_id', input.storeId);
    if (conversationUpdateError) throw conversationUpdateError;

    const completed = await updateClaim(claimResult.claim.id, {
      status: 'completed', policy_effect: 'allow', completed_at: sentAt,
      result: {
        external_execution: true,
        sent_text: response,
        provider: 'evolution',
        provider_message_id: providerMessageId || null,
        production_outbound_message_id: savedMessage?.id || null,
        tts_model: speech.model,
        tts_voice: speech.voice,
        sent_at: sentAt
      }
    });

    return { sent: true, live_pilot: true, claim: completed, production_message_id: savedMessage?.id || null, provider_message_id: providerMessageId || null };
  } catch (error: any) {
    const failed = await updateClaim(claimResult.claim.id, {
      status: 'failed', completed_at: new Date().toISOString(),
      result: {
        external_execution: 'unknown_or_failed',
        error: String(error?.message || error || 'Falha no LIVE AUDIO.').slice(0, 1000),
        automatic_retry_disabled: true
      }
    }).catch(() => claimResult.claim);
    return { sent: false, failed: true, claim: failed, reason: String(error?.message || error || 'Falha no LIVE AUDIO.').slice(0, 500) };
  }
}
