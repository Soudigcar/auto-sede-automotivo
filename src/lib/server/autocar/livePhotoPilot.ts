import { getAutocarDevClient } from '@/lib/server/autocar/devAdmin';
import { evaluateAutocarOperationalShadowPolicy } from '@/lib/server/autocar/operationalPolicy';
import { sendEvolutionMedia } from '@/lib/server/evolutionMedia';

const A4_PILOT_STORE_ID = '239755c3-a2d4-4cdd-9502-f1595031c924';
const LIVE_PURPOSE = 'live_photo_send';
const LIVE_PILOT_VERSION = 'autocar-live-photos-a4-v1';

const blockedLiveCapabilities = new Set([
  'send_location',
  'schedule_visit',
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

function safePhotoUrls(value: unknown) {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map((item) => String(item || '').trim()).filter((url) => /^https:\/\//i.test(url)))).slice(0, 10);
}

function liveKey(storeId: string, inboundMessageId: string) {
  return `autocar:${storeId}:${inboundMessageId}:${LIVE_PURPOSE}`;
}

function photoGate(shadow: any) {
  const preview = shadow?.operational_preview || {};
  const plan = preview?.plan || {};
  const photos = safePhotoUrls(preview?.photos?.photos);
  const photoVehicleId = String(plan?.photo_vehicle_id || '').trim();
  const trustedVehicleId = String(preview?.photos?.vehicle_id || '').trim();
  const response = String(shadow?.response || '').trim().slice(0, 500);

  if (!plan?.needs_photos) return { allowed: false, reason: 'A última mensagem não exige envio de fotos.', photos: [], caption: '', vehicleId: '' };
  if (plan?.needs_location) return { allowed: false, reason: 'Pedido também exige localização; localização LIVE continua bloqueada.', photos: [], caption: '', vehicleId: '' };

  const bookingState = String(shadow?.booking_guard?.state || 'NOT_APPLICABLE');
  if (bookingState !== 'NOT_APPLICABLE') {
    return { allowed: false, reason: 'Conversa também envolve agendamento; execução de agenda continua bloqueada.', photos: [], caption: '', vehicleId: '' };
  }

  if (!photoVehicleId || !trustedVehicleId || photoVehicleId !== trustedVehicleId) {
    return { allowed: false, reason: 'Não foi possível vincular com segurança as fotos ao veículo solicitado.', photos: [], caption: '', vehicleId: '' };
  }

  if (!preview?.photos?.configured || photos.length === 0) {
    return { allowed: false, reason: 'O backend não encontrou fotos HTTPS reais do veículo no estoque da loja.', photos: [], caption: '', vehicleId: '' };
  }

  if (String(shadow?.response_policy?.effect || '') !== 'allow') {
    return { allowed: false, reason: 'A resposta textual da conversa não está liberada pela policy.', photos: [], caption: '', vehicleId: '' };
  }

  const actions = Array.isArray(shadow?.proposed_actions) ? shadow.proposed_actions : [];
  const sendPhotos = actions.find((action: any) => String(action?.capability || '') === 'send_photos');
  if (String(sendPhotos?.decision?.effect || '') !== 'allow') {
    return { allowed: false, reason: 'A capability send_photos não foi liberada pelo guard operacional.', photos: [], caption: '', vehicleId: '' };
  }

  for (const action of actions) {
    const capability = String(action?.capability || '');
    const effect = String(action?.decision?.effect || '');
    if (effect === 'approval' || effect === 'handoff') {
      return { allowed: false, reason: `A conversa requer ${effect}; fotos não serão enviadas automaticamente.`, photos: [], caption: '', vehicleId: '' };
    }
    if (blockedLiveCapabilities.has(capability) && effect === 'allow') {
      return { allowed: false, reason: `Capability ${capability} também foi liberada, mas continua fora do LIVE PHOTOS V1.`, photos: [], caption: '', vehicleId: '' };
    }
  }

  const policy = evaluateAutocarOperationalShadowPolicy({ capability: 'send_photos', operationalPreview: preview });
  if (policy.effect !== 'allow') {
    return { allowed: false, reason: policy.reason, photos: [], caption: '', vehicleId: '' };
  }

  return {
    allowed: true,
    reason: policy.reason,
    photos,
    caption: response,
    vehicleId: trustedVehicleId,
    vehicleLabel: String(preview?.photos?.vehicle || '').trim()
  };
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
  const policy = evaluateAutocarOperationalShadowPolicy({ capability: 'send_photos', operationalPreview });

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

  return { allowed: true, reason: 'Elegível para LIVE PHOTOS V1.', runtime, policy };
}

async function createPhotoClaim(input: {
  storeId: string;
  conversationId: string;
  inboundMessageId: string;
  effectiveMode: string;
  caption: string;
  photos: string[];
  vehicleId: string;
  vehicleLabel?: string;
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
    message_type: 'image',
    effective_mode: input.effectiveMode,
    status: blocked ? 'skipped' : 'ready',
    policy_capability: 'send_photos',
    policy_effect: blocked ? 'deny' : 'allow',
    policy_source: 'live_photo_pilot_gate',
    policy_reason: input.gateReason || 'A4 LIVE PHOTOS V1: fotos reais do estoque liberadas após guard operacional.',
    result: {
      live_pilot_version: LIVE_PILOT_VERSION,
      planned_caption: input.caption,
      planned_media_urls: input.photos,
      planned_media_count: input.photos.length,
      vehicle_id: input.vehicleId,
      vehicle_label: input.vehicleLabel || null,
      shadow_claim_id: input.shadowClaimId || null,
      provider_message_ids: [],
      production_outbound_message_ids: [],
      sent_media_urls: [],
      external_execution: false,
      gate_reason: input.gateReason || null
    },
    completed_at: blocked ? now : null,
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

async function updatePhotoClaim(claimId: string, patch: Record<string, unknown>) {
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
      result: {
        ...(current?.result || {}),
        ...((patch as any).result || {})
      },
      updated_at: new Date().toISOString()
    })
    .eq('id', claimId)
    .eq('purpose', LIVE_PURPOSE)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function attemptAutocarLivePhotoPilot(input: {
  productionSupabase: any;
  storeId: string;
  conversationId: string;
  whatsappNumberId: string;
  leadId?: string | null;
  inboundMessageId: string;
  integration: {
    instance_name?: string | null;
    status?: string | null;
    scope?: string | null;
  };
  shadowResult: any;
}) {
  if (process.env.VERCEL_ENV !== 'preview') {
    return { sent: false, skipped: true, reason: 'LIVE PHOTOS V1 é bloqueado fora de Preview.' };
  }
  if (input.storeId !== A4_PILOT_STORE_ID) {
    return { sent: false, skipped: true, reason: 'LIVE PHOTOS V1 está liberado somente para A4 Multimarcas.' };
  }
  if (input.integration?.scope !== 'store' || input.integration?.status !== 'connected' || !input.integration?.instance_name) {
    return { sent: false, skipped: true, reason: 'Integração Evolution da loja não está conectada.' };
  }

  const shadow = shadowFrom(input.shadowResult);
  if (!shadow) return { sent: false, skipped: true, reason: 'AUTO-SHADOW não produziu resposta concluída.' };

  const gate = photoGate(shadow);
  const shadowClaimId = input.shadowResult?.result?.claim?.id || null;
  const effectiveMode = String(input.shadowResult?.result?.effectiveMode || input.shadowResult?.result?.claim?.effective_mode || 'autopilot');

  const claimResult = await createPhotoClaim({
    storeId: input.storeId,
    conversationId: input.conversationId,
    inboundMessageId: input.inboundMessageId,
    effectiveMode,
    caption: gate.caption || '',
    photos: gate.photos || [],
    vehicleId: gate.vehicleId || '',
    vehicleLabel: (gate as any).vehicleLabel || '',
    shadowClaimId,
    gateReason: gate.allowed ? undefined : gate.reason
  });

  if (claimResult.duplicate) {
    return { sent: false, duplicate: true, claim: claimResult.claim, reason: 'Claim LIVE de fotos já existe; nenhum reenvio será feito.' };
  }
  if (!gate.allowed || !claimResult.claim?.id) {
    return { sent: false, skipped: true, claim: claimResult.claim, reason: gate.reason || 'Claim LIVE de fotos não ficou elegível.' };
  }

  const eligibility = await currentLiveEligibility(input.storeId, input.conversationId, shadow.operational_preview);
  if (!eligibility.allowed) {
    const skipped = await updatePhotoClaim(claimResult.claim.id, {
      status: 'skipped',
      policy_effect: 'deny',
      policy_reason: eligibility.reason,
      completed_at: new Date().toISOString(),
      result: { external_execution: false, eligibility_reason: eligibility.reason }
    });
    return { sent: false, skipped: true, claim: skipped, reason: eligibility.reason };
  }

  const { data: conversation, error: conversationError } = await input.productionSupabase
    .from('whatsapp_conversations')
    .select('id,store_id,whatsapp_number_id,contact_id,lead_id,base_lead_id')
    .eq('id', input.conversationId)
    .eq('store_id', input.storeId)
    .maybeSingle();
  if (conversationError) throw conversationError;
  if (!conversation) throw new Error('Conversa canônica não encontrada para LIVE PHOTOS V1.');

  const { data: contact, error: contactError } = await input.productionSupabase
    .from('whatsapp_contacts')
    .select('id,phone,wa_id')
    .eq('id', conversation.contact_id)
    .maybeSingle();
  if (contactError) throw contactError;
  const recipient = normalizePhone(contact?.phone || contact?.wa_id);
  if (!recipient) throw new Error('Contato sem telefone válido para LIVE PHOTOS V1.');

  const providerMessageIds: string[] = [];
  const productionOutboundMessageIds: string[] = [];
  const sentMediaUrls: string[] = [];
  let lastSentAt = new Date().toISOString();

  try {
    for (let index = 0; index < gate.photos.length; index += 1) {
      if (index > 0) {
        const stillEligible = await currentLiveEligibility(input.storeId, input.conversationId, shadow.operational_preview);
        if (!stillEligible.allowed) throw new Error(`Sequência de fotos interrompida: ${stillEligible.reason}`);
      }

      const mediaUrl = gate.photos[index];
      const imageCaption = index === 0 ? gate.caption : '';
      const evolutionResult = await sendEvolutionMedia(String(input.integration.instance_name), recipient, mediaUrl, imageCaption);
      const providerMessageId = String(
        evolutionResult?.key?.id || evolutionResult?.message?.key?.id || evolutionResult?.id || ''
      ).trim();
      lastSentAt = new Date().toISOString();

      if (providerMessageId) providerMessageIds.push(providerMessageId);
      sentMediaUrls.push(mediaUrl);

      await updatePhotoClaim(claimResult.claim.id, {
        result: {
          external_execution: true,
          provider: 'evolution',
          provider_message_ids: providerMessageIds,
          sent_media_urls: sentMediaUrls,
          sent_count: sentMediaUrls.length,
          last_sent_at: lastSentAt
        }
      });

      const scopedId = scopedEvolutionMessageId(conversation.whatsapp_number_id, providerMessageId);
      let savedMessage: any = null;

      if (providerMessageId) {
        const { data: existing, error: existingError } = await input.productionSupabase
          .from('whatsapp_messages')
          .select('*')
          .eq('whatsapp_number_id', conversation.whatsapp_number_id)
          .in('wa_message_id', [providerMessageId, scopedId])
          .limit(1)
          .maybeSingle();
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
          message_type: 'image',
          body: imageCaption || '[Imagem]',
          media_url: mediaUrl,
          status: 'sent',
          raw_payload: {
            provider: 'evolution',
            autocar_live_pilot: true,
            autocar_live_photo_pilot: true,
            inbound_message_id: input.inboundMessageId,
            live_claim_id: claimResult.claim.id,
            vehicle_id: gate.vehicleId,
            photo_index: index,
            evolution: evolutionResult
          },
          sent_at: lastSentAt
        }).select('*').single();
        if (error) throw error;
        savedMessage = data;
      }

      if (savedMessage?.id) productionOutboundMessageIds.push(String(savedMessage.id));

      await updatePhotoClaim(claimResult.claim.id, {
        result: {
          production_outbound_message_ids: productionOutboundMessageIds,
          sent_count: sentMediaUrls.length
        }
      });
    }

    const summary = `[${sentMediaUrls.length} foto${sentMediaUrls.length === 1 ? '' : 's'}] ${gate.caption}`.trim();
    const { error: conversationUpdateError } = await input.productionSupabase
      .from('whatsapp_conversations')
      .update({ last_message: summary, last_message_at: lastSentAt, updated_at: lastSentAt })
      .eq('id', conversation.id)
      .eq('store_id', input.storeId);
    if (conversationUpdateError) throw conversationUpdateError;

    const completed = await updatePhotoClaim(claimResult.claim.id, {
      status: 'completed',
      policy_effect: 'allow',
      completed_at: lastSentAt,
      result: {
        external_execution: true,
        provider: 'evolution',
        provider_message_ids: providerMessageIds,
        production_outbound_message_ids: productionOutboundMessageIds,
        sent_media_urls: sentMediaUrls,
        sent_count: sentMediaUrls.length,
        sent_at: lastSentAt
      }
    });

    return {
      sent: true,
      live_photo_pilot: true,
      sent_count: sentMediaUrls.length,
      claim: completed,
      production_message_ids: productionOutboundMessageIds,
      provider_message_ids: providerMessageIds
    };
  } catch (error: any) {
    const failed = await updatePhotoClaim(claimResult.claim.id, {
      status: 'failed',
      completed_at: new Date().toISOString(),
      result: {
        external_execution: sentMediaUrls.length ? 'partial' : 'failed',
        provider_message_ids: providerMessageIds,
        production_outbound_message_ids: productionOutboundMessageIds,
        sent_media_urls: sentMediaUrls,
        sent_count: sentMediaUrls.length,
        error: String(error?.message || error || 'Falha no LIVE PHOTOS V1.').slice(0, 1000),
        automatic_retry_disabled: true
      }
    }).catch(() => claimResult.claim);

    return {
      sent: sentMediaUrls.length > 0,
      partial: sentMediaUrls.length > 0,
      failed: true,
      sent_count: sentMediaUrls.length,
      claim: failed,
      reason: String(error?.message || error || 'Falha no LIVE PHOTOS V1.').slice(0, 500)
    };
  }
}
