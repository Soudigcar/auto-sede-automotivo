import { getAutocarDevClient } from '@/lib/server/autocar/devAdmin';
import { evaluateAutocarOperationalShadowPolicy } from '@/lib/server/autocar/operationalPolicy';
import { sendEvolutionLocation } from '@/lib/server/evolution';

const LIVE_PURPOSE = 'live_location_send';
const LIVE_PILOT_VERSION = 'autocar-live-location-v2';

const blockedLiveCapabilities = new Set([
  'send_photos',
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

function isLiveRuntimeEnvironment() {
  return ['preview', 'production'].includes(String(process.env.VERCEL_ENV || '').trim());
}

function liveKey(storeId: string, inboundMessageId: string) {
  return `autocar:${storeId}:${inboundMessageId}:${LIVE_PURPOSE}`;
}

function safeHttpsUrl(value: unknown) {
  const url = String(value || '').trim();
  return /^https:\/\//i.test(url) ? url : '';
}

function validCoordinate(value: unknown, min: number, max: number) {
  const coordinate = typeof value === 'number' ? value : Number(String(value ?? '').trim());
  return Number.isFinite(coordinate) && coordinate >= min && coordinate <= max ? coordinate : null;
}

function buildLocationPreview(location: any) {
  const name = String(location?.label || 'Localização da loja').trim();
  const address = String(location?.address || '').trim();
  const city = String(location?.city || '').trim();
  const state = String(location?.state || '').trim();
  const postalCode = String(location?.postal_code || '').trim();
  const region = city && state ? `${city}/${state}` : city || state;
  const addressParts = [address, region, postalCode].filter(Boolean);
  return `📍 ${name}${addressParts.length ? ` — ${addressParts.join(', ')}` : ''}`;
}

function locationGate(shadow: any) {
  const preview = shadow?.operational_preview || {};
  const plan = preview?.plan || {};
  const location = preview?.location || {};

  if (!plan?.needs_location) {
    return { allowed: false, reason: 'A última mensagem não exige envio de localização.', text: '', location: null };
  }
  if (plan?.needs_photos) {
    return { allowed: false, reason: 'Pedido também exige fotos; execução combinada ainda não está liberada no LIVE LOCATION V2.', text: '', location: null };
  }

  const bookingState = String(shadow?.booking_guard?.state || 'NOT_APPLICABLE');
  if (bookingState !== 'NOT_APPLICABLE') {
    return { allowed: false, reason: 'Conversa também envolve agendamento; execução de agenda continua bloqueada.', text: '', location: null };
  }

  if (String(shadow?.response_policy?.effect || '') !== 'allow') {
    return { allowed: false, reason: 'A resposta da conversa não está liberada pela policy.', text: '', location: null };
  }

  const address = String(location?.address || '').trim();
  const mapsUrl = safeHttpsUrl(location?.maps_url);
  const latitude = validCoordinate(location?.latitude, -90, 90);
  const longitude = validCoordinate(location?.longitude, -180, 180);
  const nullIsland = latitude !== null && longitude !== null && Math.abs(latitude) <= 0.000001 && Math.abs(longitude) <= 0.000001;
  if (!location?.configured || !address || latitude === null || longitude === null || nullIsland) {
    return { allowed: false, reason: 'Localização nativa não liberada: endereço, latitude e longitude válidos precisam estar configurados no Perfil Operacional.', text: '', location: null };
  }

  const actions = Array.isArray(shadow?.proposed_actions) ? shadow.proposed_actions : [];
  const sendLocation = actions.find((action: any) => String(action?.capability || '') === 'send_location');
  if (String(sendLocation?.decision?.effect || '') !== 'allow') {
    return { allowed: false, reason: 'A capability send_location não foi liberada pelo guard operacional.', text: '', location: null };
  }

  for (const action of actions) {
    const capability = String(action?.capability || '');
    const effect = String(action?.decision?.effect || '');
    if (effect === 'approval' || effect === 'handoff') {
      return { allowed: false, reason: `A conversa requer ${effect}; localização não será enviada automaticamente.`, text: '', location: null };
    }
    if (blockedLiveCapabilities.has(capability) && effect === 'allow') {
      return { allowed: false, reason: `Capability ${capability} também foi liberada, mas continua fora do LIVE LOCATION V2.`, text: '', location: null };
    }
  }

  const policy = evaluateAutocarOperationalShadowPolicy({ capability: 'send_location', operationalPreview: preview });
  if (policy.effect !== 'allow') {
    return { allowed: false, reason: policy.reason, text: '', location: null };
  }

  const name = String(location?.label || 'Localização da loja').trim().slice(0, 120);
  const city = String(location?.city || '').trim();
  const state = String(location?.state || '').trim();
  const postalCode = String(location?.postal_code || '').trim();
  const region = city && state ? `${city}/${state}` : city || state;
  const nativeAddress = [address, region, postalCode].filter(Boolean).join(', ').slice(0, 240);
  const text = buildLocationPreview(location);
  if (!text || text.length > 3500) {
    return { allowed: false, reason: 'Prévia determinística da localização ficou inválida para envio.', text: '', location: null };
  }

  return {
    allowed: true,
    reason: policy.reason,
    text,
    location: {
      source: 'store',
      name,
      address,
      native_address: nativeAddress,
      city: city || null,
      state: state || null,
      postal_code: postalCode || null,
      latitude,
      longitude,
      maps_url: mapsUrl
    }
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
  const policy = evaluateAutocarOperationalShadowPolicy({ capability: 'send_location', operationalPreview });

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

  return { allowed: true, reason: 'Elegível para AUTOCAR LIVE LOCATION V2.', runtime, policy };
}

async function createLocationClaim(input: {
  storeId: string;
  conversationId: string;
  inboundMessageId: string;
  effectiveMode: string;
  text: string;
  trustedLocation: Record<string, unknown> | null;
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
    message_type: 'location',
    effective_mode: input.effectiveMode,
    status: blocked ? 'skipped' : 'ready',
    policy_capability: 'send_location',
    policy_effect: blocked ? 'deny' : 'allow',
    policy_source: 'live_location_pilot_gate',
    policy_reason: input.gateReason || 'AUTOCAR LIVE LOCATION V2: pin nativo oficial liberado após elegibilidade da loja e guard operacional.',
    result: {
      live_pilot_version: LIVE_PILOT_VERSION,
      planned_text: input.text,
      trusted_location: input.trustedLocation,
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

async function updateLocationClaim(claimId: string, patch: Record<string, unknown>) {
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

export async function attemptAutocarLiveLocationPilot(input: {
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
  if (!isLiveRuntimeEnvironment()) {
    return { sent: false, skipped: true, reason: 'AUTOCAR LIVE LOCATION V2 é bloqueado fora de Preview/Production.' };
  }
  if (input.integration?.scope !== 'store' || input.integration?.status !== 'connected' || !input.integration?.instance_name) {
    return { sent: false, skipped: true, reason: 'Integração Evolution da loja não está conectada.' };
  }

  const shadow = shadowFrom(input.shadowResult);
  if (!shadow) return { sent: false, skipped: true, reason: 'AUTO-SHADOW não produziu resposta concluída.' };

  const gate = locationGate(shadow);
  const shadowClaimId = input.shadowResult?.result?.claim?.id || null;
  const effectiveMode = String(input.shadowResult?.result?.effectiveMode || input.shadowResult?.result?.claim?.effective_mode || 'autopilot');

  const claimResult = await createLocationClaim({
    storeId: input.storeId,
    conversationId: input.conversationId,
    inboundMessageId: input.inboundMessageId,
    effectiveMode,
    text: gate.text || '',
    trustedLocation: gate.location || null,
    shadowClaimId,
    gateReason: gate.allowed ? undefined : gate.reason
  });

  if (claimResult.duplicate) {
    return { sent: false, duplicate: true, claim: claimResult.claim, reason: 'Claim LIVE de localização já existe; nenhum reenvio será feito.' };
  }
  if (!gate.allowed || !gate.location || !claimResult.claim?.id) {
    return { sent: false, skipped: true, claim: claimResult.claim, reason: gate.reason || 'Claim LIVE de localização não ficou elegível.' };
  }
  const trustedLocation = gate.location;

  const eligibility = await currentLiveEligibility(input.storeId, input.conversationId, shadow.operational_preview);
  if (!eligibility.allowed) {
    const skipped = await updateLocationClaim(claimResult.claim.id, {
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
  if (!conversation) throw new Error('Conversa canônica não encontrada para LIVE LOCATION V2.');

  const { data: contact, error: contactError } = await input.productionSupabase
    .from('whatsapp_contacts')
    .select('id,phone,wa_id')
    .eq('id', conversation.contact_id)
    .maybeSingle();
  if (contactError) throw contactError;
  const recipient = normalizePhone(contact?.phone || contact?.wa_id);
  if (!recipient) throw new Error('Contato sem telefone válido para LIVE LOCATION V2.');

  try {
    const evolutionResult = await sendEvolutionLocation(String(input.integration.instance_name), recipient, {
      name: trustedLocation.name,
      address: trustedLocation.native_address,
      latitude: trustedLocation.latitude,
      longitude: trustedLocation.longitude
    });
    const providerMessageId = String(
      evolutionResult?.key?.id || evolutionResult?.message?.key?.id || evolutionResult?.id || ''
    ).trim();
    const sentAt = new Date().toISOString();

    await updateLocationClaim(claimResult.claim.id, {
      result: {
        external_execution: true,
        provider: 'evolution',
        provider_message_id: providerMessageId || null,
        sent_at: sentAt
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
        message_type: 'location',
        body: gate.text,
        status: 'sent',
        raw_payload: {
          provider: 'evolution',
          autocar_live_pilot: true,
          autocar_live_location_pilot: true,
          inbound_message_id: input.inboundMessageId,
          live_claim_id: claimResult.claim.id,
          location: trustedLocation,
          trusted_location: trustedLocation,
          evolution: evolutionResult
        },
        sent_at: sentAt
      }).select('*').single();
      if (error) throw error;
      savedMessage = data;
    }

    const { error: conversationUpdateError } = await input.productionSupabase
      .from('whatsapp_conversations')
      .update({ last_message: gate.text, last_message_at: sentAt, updated_at: sentAt })
      .eq('id', conversation.id)
      .eq('store_id', input.storeId);
    if (conversationUpdateError) throw conversationUpdateError;

    const completed = await updateLocationClaim(claimResult.claim.id, {
      status: 'completed',
      policy_effect: 'allow',
      completed_at: sentAt,
      result: {
        external_execution: true,
        provider: 'evolution',
        provider_message_id: providerMessageId || null,
        production_outbound_message_id: savedMessage?.id || null,
        sent_location: trustedLocation,
        sent_preview: gate.text,
        sent_at: sentAt
      }
    });

    return {
      sent: true,
      live_location_pilot: true,
      claim: completed,
      production_message_id: savedMessage?.id || null,
      provider_message_id: providerMessageId || null
    };
  } catch (error: any) {
    const failed = await updateLocationClaim(claimResult.claim.id, {
      status: 'failed',
      completed_at: new Date().toISOString(),
      result: {
        external_execution: 'unknown_or_failed',
        error: String(error?.message || error || 'Falha no LIVE LOCATION V2.').slice(0, 1000),
        automatic_retry_disabled: true
      }
    }).catch(() => claimResult.claim);

    return {
      sent: false,
      failed: true,
      claim: failed,
      reason: String(error?.message || error || 'Falha no LIVE LOCATION V2.').slice(0, 500)
    };
  }
}
