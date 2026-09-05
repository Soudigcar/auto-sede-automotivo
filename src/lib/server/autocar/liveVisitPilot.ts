import { createAutocarStructuredResponse } from '@/lib/server/autocar/client';
import { getAutocarDevClient } from '@/lib/server/autocar/devAdmin';
import { evaluateAutocarOperationalShadowPolicy } from '@/lib/server/autocar/operationalPolicy';
import {
  consultAutocarStoreLocation,
  consultAutocarVehiclePhotos
} from '@/lib/server/autocar/operationalTools';
import { sendEvolutionText } from '@/lib/server/evolution';

const LIVE_PURPOSE = 'live_visit_schedule';
const LIVE_PILOT_VERSION = 'autocar-live-visit-v2-generative';

const blockedLiveCapabilities = new Set([
  'send_photos',
  'send_location',
  'schedule_test_drive',
  'create_follow_up',
  'transfer_lead',
  'alter_pipeline',
  'negotiate_price',
  'grant_discount',
  'alter_stock_price',
  'confirm_sale',
  'promise_credit_approval',
  'final_trade_appraisal'
]);

const visitConfirmationSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    response: { type: 'string' },
    next_best_action: {
      type: 'string',
      enum: ['none', 'offer_location', 'offer_photos']
    }
  },
  required: ['response', 'next_best_action']
};

function normalizePhone(value: unknown) {
  return String(value || '').split('@')[0].split(':')[0].replace(/\D/g, '');
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

function liveKey(storeId: string, inboundMessageId: string) {
  return `autocar:${storeId}:${inboundMessageId}:${LIVE_PURPOSE}`;
}

function visitGate(shadow: any, leadId?: string | null) {
  const guard = shadow?.booking_guard || {};
  const preview = shadow?.operational_preview || {};

  if (!leadId) return { allowed: false, reason: 'Conversa sem lead canônico; agendamento automático bloqueado.', startsAt: '', durationMinutes: 60 };
  if (String(guard?.state || '') !== 'READY_TO_SCHEDULE') {
    return { allowed: false, reason: `booking_guard não está READY_TO_SCHEDULE (${String(guard?.state || 'missing')}).`, startsAt: '', durationMinutes: 60 };
  }
  if (String(guard?.booking_type || '') !== 'visit') {
    return { allowed: false, reason: 'AGENDAMENTO LIVE aceita somente VISITA; test-drive continua bloqueado.', startsAt: '', durationMinutes: 60 };
  }
  if (preview?.plan?.needs_photos || preview?.plan?.needs_location) {
    return { allowed: false, reason: 'Pedido combinado com outra execução operacional; agendamento exige confirmação de visita isolada.', startsAt: '', durationMinutes: 60 };
  }

  const revalidation = guard?.revalidation || preview?.availability_revalidation || preview?.availability || null;
  const startsAt = String(revalidation?.starts_at || '').trim();
  const durationMinutes = Math.max(15, Math.min(480, Number(revalidation?.duration_minutes || 60)));
  if (!revalidation?.available || !startsAt || Number.isNaN(new Date(startsAt).getTime())) {
    return { allowed: false, reason: 'Revalidação do calendário não forneceu slot disponível e horário ISO válido.', startsAt: '', durationMinutes };
  }

  const actions = Array.isArray(shadow?.proposed_actions) ? shadow.proposed_actions : [];
  const visitAction = actions.find((action: any) => String(action?.capability || '') === 'schedule_visit');
  if (String(visitAction?.decision?.effect || '') !== 'allow') {
    return { allowed: false, reason: 'A capability schedule_visit não foi liberada pelo guard operacional.', startsAt: '', durationMinutes };
  }

  for (const action of actions) {
    const capability = String(action?.capability || '');
    const effect = String(action?.decision?.effect || '');
    if (effect === 'approval' || effect === 'handoff') {
      return { allowed: false, reason: `A conversa requer ${effect}; visita não será criada automaticamente.`, startsAt: '', durationMinutes };
    }
    if (blockedLiveCapabilities.has(capability) && effect === 'allow') {
      return { allowed: false, reason: `Capability ${capability} também foi liberada, mas está fora do agendamento LIVE.`, startsAt: '', durationMinutes };
    }
  }

  const policy = evaluateAutocarOperationalShadowPolicy({ capability: 'schedule_visit', operationalPreview: preview });
  if (policy.effect !== 'allow') {
    return { allowed: false, reason: policy.reason, startsAt: '', durationMinutes };
  }

  return { allowed: true, reason: policy.reason, startsAt, durationMinutes };
}

async function currentLiveEligibility(storeId: string, conversationId: string, operationalPreview: any) {
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
  const policy = evaluateAutocarOperationalShadowPolicy({ capability: 'schedule_visit', operationalPreview });

  if (!agent?.master_enabled || !agent?.master_autopilot_allowed || agent?.store_selected_mode !== 'autopilot' || agent?.mode !== 'autopilot' || agent?.status !== 'active') {
    return { allowed: false, reason: 'Master + loja não estão efetivamente liberados para AUTOPILOT.', runtime, policy };
  }
  if (!runtime || runtime.effective_mode !== 'autopilot') {
    return { allowed: false, reason: 'Runtime da conversa não está em AUTOPILOT.', runtime, policy };
  }
  if (runtime.human_state !== 'autocar_active') {
    return { allowed: false, reason: `Conversa em takeover humano: ${runtime.pause_reason || runtime.human_state}.`, runtime, policy };
  }
  if (policy.effect !== 'allow') {
    return { allowed: false, reason: policy.reason, runtime, policy };
  }

  return { allowed: true, reason: 'Elegível para AUTOCAR AGENDAMENTO LIVE.', runtime, policy };
}

async function createVisitClaim(input: {
  storeId: string;
  conversationId: string;
  inboundMessageId: string;
  effectiveMode: string;
  leadId: string;
  startsAt: string;
  durationMinutes: number;
  shadowClaimId?: string | null;
  gateReason?: string;
}) {
  const autocar = getAutocarDevClient();
  const blocked = Boolean(input.gateReason);
  const now = new Date().toISOString();
  const key = liveKey(input.storeId, input.inboundMessageId);

  const { data, error } = await autocar.from('ai_runtime_message_claims').insert({
    store_id: input.storeId,
    production_conversation_id: input.conversationId,
    production_message_id: input.inboundMessageId,
    purpose: LIVE_PURPOSE,
    idempotency_key: key,
    direction: 'outbound',
    message_type: 'text',
    effective_mode: input.effectiveMode,
    status: blocked ? 'skipped' : 'ready',
    policy_capability: 'schedule_visit',
    policy_effect: blocked ? 'deny' : 'allow',
    policy_source: 'live_visit_pilot_gate',
    policy_reason: input.gateReason || 'AUTOCAR AGENDAMENTO LIVE: visita liberada após elegibilidade da loja, confirmação semântica e revalidação do calendário.',
    result: {
      live_pilot_version: LIVE_PILOT_VERSION,
      lead_id: input.leadId,
      planned_starts_at: input.startsAt,
      planned_duration_minutes: input.durationMinutes,
      planned_text: null,
      shadow_claim_id: input.shadowClaimId || null,
      db_execution: false,
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

async function updateVisitClaim(claimId: string, patch: Record<string, unknown>) {
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

async function generateVisitConfirmation(input: {
  productionSupabase: any;
  storeId: string;
  conversationId: string;
  leadId: string;
  scheduledAt: string;
  transaction: any;
}) {
  const [{ data: lead, error: leadError }, { data: messages, error: messagesError }, location] = await Promise.all([
    input.productionSupabase.from('leads')
      .select('id,customer_name,interested_vehicle,interested_vehicle_id,interested_vehicle_price,scheduled_at')
      .eq('id', input.leadId)
      .eq('assigned_store_id', input.storeId)
      .maybeSingle(),
    input.productionSupabase.from('whatsapp_messages')
      .select('direction,message_type,body,sent_at,created_at')
      .eq('store_id', input.storeId)
      .eq('conversation_id', input.conversationId)
      .order('sent_at', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(10),
    consultAutocarStoreLocation(input.storeId)
  ]);
  if (leadError) throw leadError;
  if (messagesError) throw messagesError;

  let photos: any = null;
  const vehicleId = String(lead?.interested_vehicle_id || '').trim();
  if (vehicleId) {
    photos = await consultAutocarVehiclePhotos({
      productionSupabase: input.productionSupabase,
      storeId: input.storeId,
      vehicleId
    }).catch(() => null);
  }

  const locationAvailable = Boolean(
    location?.configured &&
    String(location?.address || '').trim() &&
    Number.isFinite(Number(location?.latitude)) &&
    Number.isFinite(Number(location?.longitude))
  );
  const photosAvailable = Boolean(photos?.configured && Array.isArray(photos?.photos) && photos.photos.length);
  const recentMessages = (messages || []).reverse().map((message: any) => ({
    direction: String(message.direction || ''),
    type: String(message.message_type || 'text'),
    body: String(message.body || '').slice(0, 1600),
    sent_at: message.sent_at || message.created_at || null
  }));

  const result = await createAutocarStructuredResponse({
    task: 'commercial_followup',
    instructions: [
      'Você é a AUTOCAR respondendo imediatamente depois de uma transação REAL e bem-sucedida de agendamento de visita.',
      'A resposta ao cliente deve ser totalmente generativa e contextual. Não use, reproduza nem dependa de template ou frase fixa.',
      'Confirme a visita somente porque transaction_success é true e scheduled_at é a data/hora canônica já salva no banco.',
      'Nunca invente data, horário, veículo, localização, fotos, desconto, financiamento ou qualquer outra informação.',
      'Depois de confirmar a visita, você PODE oferecer no máximo UM próximo passo útil, somente se a capacidade correspondente estiver marcada como disponível.',
      'As únicas ofertas adicionais permitidas nesta etapa são localização da loja ou fotos do veículo atual. Não existe ordem fixa entre elas e você também pode não oferecer nada.',
      'Se oferecer localização ou fotos, apenas peça consentimento de forma natural. Não diga que já enviou; o backend aguardará uma resposta posterior do cliente.',
      'Não proponha follow-up automático, desconto, negociação de preço, crédito, alteração de pipeline, venda, test-drive ou qualquer ação protegida.',
      'Escreva em português do Brasil, de forma curta, humana e comercial, considerando a conversa recente.',
      'next_best_action deve refletir exatamente a eventual oferta feita na própria resposta; use none se não houver oferta.'
    ].join(' '),
    input: {
      transaction_success: true,
      scheduled_at: input.scheduledAt,
      transaction_code: input.transaction?.code || null,
      lead: lead || null,
      recent_messages: recentMessages,
      verified_capabilities: {
        location_available: locationAvailable,
        photos_available: photosAvailable
      }
    },
    schemaName: 'autocar_visit_confirmation_generative',
    schema: visitConfirmationSchema,
    maxOutputTokens: 650
  });

  const response = String(result.parsed?.response || '').trim();
  if (!response) throw new Error('Geração de confirmação retornou resposta vazia; fallback comercial fixo é proibido.');

  const nextBestAction = String(result.parsed?.next_best_action || 'none');
  if (nextBestAction === 'offer_location' && !locationAvailable) {
    throw new Error('Modelo tentou oferecer localização sem capacidade validada; confirmação bloqueada fail-closed.');
  }
  if (nextBestAction === 'offer_photos' && !photosAvailable) {
    throw new Error('Modelo tentou oferecer fotos sem capacidade validada; confirmação bloqueada fail-closed.');
  }

  return {
    response,
    next_best_action: nextBestAction,
    model_routing: result.routing,
    verified_capabilities: {
      location_available: locationAvailable,
      photos_available: photosAvailable
    }
  };
}

export async function attemptAutocarLiveVisitPilot(input: {
  productionSupabase: any;
  storeId: string;
  conversationId: string;
  whatsappNumberId: string;
  leadId?: string | null;
  inboundMessageId: string;
  integration: { instance_name?: string | null; status?: string | null; scope?: string | null };
  shadowResult: any;
}) {
  if (!isLiveRuntimeEnvironment()) return { sent: false, scheduled: false, skipped: true, reason: 'AGENDAMENTO LIVE é bloqueado fora de Preview/Production.' };
  if (input.integration?.scope !== 'store' || input.integration?.status !== 'connected' || !input.integration?.instance_name) {
    return { sent: false, scheduled: false, skipped: true, reason: 'Integração Evolution da loja não está conectada.' };
  }

  const shadow = shadowFrom(input.shadowResult);
  if (!shadow) return { sent: false, scheduled: false, skipped: true, reason: 'AUTO-SHADOW não produziu resposta concluída.' };

  const gate = visitGate(shadow, input.leadId);
  const shadowClaimId = input.shadowResult?.result?.claim?.id || null;
  const effectiveMode = String(input.shadowResult?.result?.effectiveMode || input.shadowResult?.result?.claim?.effective_mode || 'autopilot');

  const claimResult = await createVisitClaim({
    storeId: input.storeId,
    conversationId: input.conversationId,
    inboundMessageId: input.inboundMessageId,
    effectiveMode,
    leadId: String(input.leadId || ''),
    startsAt: gate.startsAt || '',
    durationMinutes: gate.durationMinutes || 60,
    shadowClaimId,
    gateReason: gate.allowed ? undefined : gate.reason
  });

  if (claimResult.duplicate) return { sent: false, scheduled: false, duplicate: true, claim: claimResult.claim, reason: 'Claim de agendamento já existe; nenhuma nova execução será feita.' };
  if (!gate.allowed || !claimResult.claim?.id) return { sent: false, scheduled: false, skipped: true, claim: claimResult.claim, reason: gate.reason || 'Claim de agendamento não ficou elegível.' };

  const eligibility = await currentLiveEligibility(input.storeId, input.conversationId, shadow.operational_preview);
  if (!eligibility.allowed) {
    const skipped = await updateVisitClaim(claimResult.claim.id, {
      status: 'skipped', policy_effect: 'deny', policy_reason: eligibility.reason,
      completed_at: new Date().toISOString(), result: { db_execution: false, external_execution: false, eligibility_reason: eligibility.reason }
    });
    return { sent: false, scheduled: false, skipped: true, claim: skipped, reason: eligibility.reason };
  }

  const { data: conversation, error: conversationError } = await input.productionSupabase
    .from('whatsapp_conversations')
    .select('id,store_id,whatsapp_number_id,contact_id,lead_id,base_lead_id')
    .eq('id', input.conversationId).eq('store_id', input.storeId).maybeSingle();
  if (conversationError) throw conversationError;
  if (!conversation || !conversation.lead_id || conversation.lead_id !== input.leadId) {
    throw new Error('Lead canônico da conversa mudou; agendamento automático bloqueado.');
  }

  const { data: contact, error: contactError } = await input.productionSupabase
    .from('whatsapp_contacts').select('id,phone,wa_id').eq('id', conversation.contact_id).maybeSingle();
  if (contactError) throw contactError;
  const recipient = normalizePhone(contact?.phone || contact?.wa_id);
  if (!recipient) throw new Error('Contato sem telefone válido para confirmação do agendamento.');

  const eligibilityBeforeWrite = await currentLiveEligibility(input.storeId, input.conversationId, shadow.operational_preview);
  if (!eligibilityBeforeWrite.allowed) {
    const skipped = await updateVisitClaim(claimResult.claim.id, {
      status: 'skipped', policy_effect: 'deny', policy_reason: eligibilityBeforeWrite.reason,
      completed_at: new Date().toISOString(), result: { db_execution: false, external_execution: false, eligibility_reason: eligibilityBeforeWrite.reason }
    });
    return { sent: false, scheduled: false, skipped: true, claim: skipped, reason: eligibilityBeforeWrite.reason };
  }

  const notes = `Visita confirmada pelo cliente via WhatsApp e agendada pela AUTOCAR. Mensagem inbound: ${input.inboundMessageId}`;
  const { data: rpcResult, error: rpcError } = await input.productionSupabase.rpc('autocar_schedule_visit_transaction', {
    p_store_id: input.storeId,
    p_lead_id: input.leadId,
    p_starts_at: gate.startsAt,
    p_duration_minutes: gate.durationMinutes,
    p_notes: notes
  });
  if (rpcError) throw rpcError;

  const transaction = rpcResult || {};
  if (!transaction?.success) {
    const skipped = await updateVisitClaim(claimResult.claim.id, {
      status: 'skipped', policy_effect: 'deny', policy_reason: String(transaction?.message || transaction?.code || 'Transação de agenda recusada.'),
      completed_at: new Date().toISOString(),
      result: { db_execution: false, external_execution: false, transaction }
    });
    return { sent: false, scheduled: false, skipped: true, claim: skipped, transaction, reason: String(transaction?.message || 'Transação de agenda recusada.') };
  }

  const scheduledAt = String(transaction?.scheduled_at || gate.startsAt || '').trim();
  await updateVisitClaim(claimResult.claim.id, {
    result: { db_execution: true, transaction, scheduled_at: scheduledAt }
  });

  let confirmation: any;
  try {
    confirmation = await generateVisitConfirmation({
      productionSupabase: input.productionSupabase,
      storeId: input.storeId,
      conversationId: input.conversation.id,
      leadId: String(input.leadId || ''),
      scheduledAt,
      transaction
    });
  } catch (generationError: any) {
    const failed = await updateVisitClaim(claimResult.claim.id, {
      status: 'failed', completed_at: new Date().toISOString(),
      result: {
        db_execution: true,
        external_execution: false,
        transaction,
        confirmation_generation_failed: true,
        error: String(generationError?.message || generationError || 'Falha ao gerar confirmação do agendamento.').slice(0, 1000),
        fixed_text_fallback_disabled: true,
        automatic_retry_disabled: true
      }
    }).catch(() => claimResult.claim);
    return {
      sent: false,
      scheduled: true,
      failed: true,
      claim: failed,
      transaction,
      reason: 'A visita foi salva, mas a geração da confirmação falhou; nenhum texto comercial fixo foi enviado.'
    };
  }

  const confirmationText = String(confirmation.response || '').trim();
  await updateVisitClaim(claimResult.claim.id, {
    result: {
      db_execution: true,
      external_execution: false,
      transaction,
      scheduled_at: scheduledAt,
      planned_text: confirmationText,
      generative_confirmation: true,
      next_best_action: confirmation.next_best_action,
      confirmation_model_routing: confirmation.model_routing || null,
      verified_capabilities: confirmation.verified_capabilities || null
    }
  });

  try {
    const evolutionResult = await sendEvolutionText(String(input.integration.instance_name), recipient, confirmationText);
    const providerMessageId = String(evolutionResult?.key?.id || evolutionResult?.message?.key?.id || evolutionResult?.id || '').trim();
    const sentAt = new Date().toISOString();
    const scopedId = scopedEvolutionMessageId(conversation.whatsapp_number_id, providerMessageId);

    await updateVisitClaim(claimResult.claim.id, {
      result: { db_execution: true, external_execution: true, provider: 'evolution', provider_message_id: providerMessageId || null, sent_at: sentAt }
    });

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
        message_type: 'text',
        body: confirmationText,
        status: 'sent',
        raw_payload: {
          provider: 'evolution',
          autocar_live_pilot: true,
          autocar_live_visit_pilot: true,
          generative_confirmation: true,
          next_best_action: confirmation.next_best_action,
          inbound_message_id: input.inboundMessageId,
          live_claim_id: claimResult.claim.id,
          scheduled_at: scheduledAt,
          transaction_code: transaction?.code || null,
          evolution: evolutionResult
        },
        sent_at: sentAt
      }).select('*').single();
      if (error) throw error;
      savedMessage = data;
    }

    const { error: conversationUpdateError } = await input.productionSupabase.from('whatsapp_conversations')
      .update({ last_message: confirmationText, last_message_at: sentAt, updated_at: sentAt })
      .eq('id', conversation.id).eq('store_id', input.storeId);
    if (conversationUpdateError) throw conversationUpdateError;

    const completed = await updateVisitClaim(claimResult.claim.id, {
      status: 'completed', policy_effect: 'allow', completed_at: sentAt,
      result: {
        db_execution: true, external_execution: true, transaction,
        sent_text: confirmationText, provider: 'evolution', provider_message_id: providerMessageId || null,
        production_outbound_message_id: savedMessage?.id || null, sent_at: sentAt,
        generative_confirmation: true,
        next_best_action: confirmation.next_best_action
      }
    });

    return {
      sent: true,
      scheduled: true,
      live_visit_pilot: true,
      generative_confirmation: true,
      next_best_action: confirmation.next_best_action,
      claim: completed,
      transaction,
      production_message_id: savedMessage?.id || null,
      provider_message_id: providerMessageId || null
    };
  } catch (error: any) {
    const failed = await updateVisitClaim(claimResult.claim.id, {
      status: 'failed', completed_at: new Date().toISOString(),
      result: {
        db_execution: true,
        external_execution: 'message_failed_after_schedule',
        transaction,
        error: String(error?.message || error || 'Agendamento salvo, mas confirmação no WhatsApp falhou.').slice(0, 1000),
        automatic_retry_disabled: true
      }
    }).catch(() => claimResult.claim);

    return { sent: false, scheduled: true, failed: true, claim: failed, transaction, reason: 'A visita foi salva no calendário, mas a confirmação automática no WhatsApp falhou. Retry automático desabilitado.' };
  }
}
