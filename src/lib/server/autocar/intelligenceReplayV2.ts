import { generateAutocarShadowReply } from '@/lib/server/autocar/shadowReply';
import { classifyAutocarHumanRequestV2 } from '@/lib/server/autocar/humanRequestClassifierV2';
import { resolveAutocarHandoffV2 } from '@/lib/server/autocar/handoffSemanticsV2';
import { createAutocarHistoricalReadClientV2, loadAutocarReplayMessagesV2 } from '@/lib/server/autocar/replayMessageHistoryV2';
import { buildAutocarVehiclePresentationV2 } from '@/lib/server/autocar/vehiclePresentationV2';
import { buildAutocarSingleVehicleMediaV2 } from '@/lib/server/autocar/singleVehicleMediaV2';
import { hydrateAutocarPresentedVehiclesV2 } from '@/lib/server/autocar/presentedVehicleHydrationV2';

export const AUTOCAR_INTELLIGENCE_REPLAY_VERSION = 'autocar-intelligence-replay-v2-presented-vehicle-hydration-preview';

function normalizeReplayText(value: unknown) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function explicitTransferLanguage(value: unknown) {
  const text = normalizeReplayText(value);
  return /(vou|vamos|posso)\s+(te\s+)?(encaminhar|transferir|passar)\b|encaminh(ar|ando)\s+(seu|o)\s+atendimento|transferir\s+(para|pro|pra)\s+(um|uma|o|a)?\s*(vendedor|consultor|gerente|atendente|equipe)/i.test(text);
}

function unsupportedVerificationPromise(value: unknown) {
  const text = normalizeReplayText(value);
  return /\b(vou|vamos|posso|podemos|preciso)\s+(verificar|consultar|confirmar|checar)\b|\bquer\s+que\s+eu\s+(verifique|consulte|confirme|cheque)\b|\bdeixa\s+eu\s+(verificar|consultar|confirmar|checar)\b/i.test(text);
}

function prematurePhotoSentClaim(value: unknown) {
  const text = normalizeReplayText(value);
  return /\b(ja|acabei de)\s+(te\s+)?(enviei|mandei|encaminhei)\s+(as\s+|algumas\s+|essas\s+)?fotos\b|\bfotos\s+(ja\s+)?(enviadas|mandadas|encaminhadas)\b/i.test(text);
}

export function evaluateAutocarReplayV2(input: {
  customerRequestedHuman: boolean;
  shadow: any;
  vehiclePresentation?: any;
  singleVehicleMedia?: any;
  presentedVehicleHydration?: any;
}) {
  const rawActions = Array.isArray(input.shadow?.proposed_actions) ? input.shadow.proposed_actions : [];
  const rawTransferActions = rawActions.filter((action: any) => String(action?.capability || '') === 'transfer_lead');
  const handoff = resolveAutocarHandoffV2({ customerRequestedHuman: input.customerRequestedHuman, proposedActions: rawActions });
  const transferLanguageWithoutRequest = !input.customerRequestedHuman && explicitTransferLanguage(input.shadow?.response);
  const transferActionWithoutRequest = !input.customerRequestedHuman && rawTransferActions.length > 0;
  const unsupportedVerification = unsupportedVerificationPromise(input.shadow?.response) || unsupportedVerificationPromise(input.shadow?.next_best_action);
  const presentation = input.vehiclePresentation || null;
  const singleMedia = input.singleVehicleMedia || null;
  const hydration = input.presentedVehicleHydration || null;
  const prematurePhotoClaim = prematurePhotoSentClaim(input.shadow?.response) || prematurePhotoSentClaim(input.shadow?.next_best_action);
  const presentedVehicleRevalidationFailed = Boolean(hydration && Number(hydration.requested_count || 0) !== Number(hydration.hydrated_count || 0));
  const vehiclePresentationRegression = Boolean(
    presentation?.regression_flags?.too_many_vehicle_options
    || presentation?.regression_flags?.missing_primary_photo
    || presentation?.regression_flags?.invalid_grounded_card
    || presentedVehicleRevalidationFailed
  );
  const singleVehicleMediaRegression = Boolean(
    singleMedia?.regression_flags?.invalid_vehicle_reference_count
    || singleMedia?.regression_flags?.missing_grounded_photos
    || (singleMedia?.mode === 'single_vehicle_media' && prematurePhotoClaim)
  );
  return {
    version: AUTOCAR_INTELLIGENCE_REPLAY_VERSION,
    pass: !(transferLanguageWithoutRequest || transferActionWithoutRequest || unsupportedVerification || vehiclePresentationRegression || singleVehicleMediaRegression),
    customer_requested_human: input.customerRequestedHuman,
    handoff,
    regression_flags: {
      transfer_action_without_customer_request: transferActionWithoutRequest,
      transfer_language_without_customer_request: transferLanguageWithoutRequest,
      unsupported_verification_promise: unsupportedVerification,
      too_many_vehicle_options: Boolean(presentation?.regression_flags?.too_many_vehicle_options),
      missing_primary_photo: Boolean(presentation?.regression_flags?.missing_primary_photo),
      invalid_grounded_card: Boolean(presentation?.regression_flags?.invalid_grounded_card),
      presented_vehicle_revalidation_failed: presentedVehicleRevalidationFailed,
      invalid_single_vehicle_reference_count: Boolean(singleMedia?.regression_flags?.invalid_vehicle_reference_count),
      missing_single_vehicle_grounded_photos: Boolean(singleMedia?.regression_flags?.missing_grounded_photos),
      premature_photo_sent_claim: Boolean(singleMedia?.mode === 'single_vehicle_media' && prematurePhotoClaim)
    },
    raw_transfer_actions: rawTransferActions,
    effective_actions: input.customerRequestedHuman ? rawActions : rawActions.filter((action: any) => String(action?.capability || '') !== 'transfer_lead'),
    external_execution: false
  };
}

export async function replayAutocarConversationV2(input: {
  productionSupabase: any;
  storeId: string;
  conversationId: string;
  messageId?: string | null;
}) {
  const { data: conversation, error: conversationError } = await input.productionSupabase
    .from('whatsapp_conversations').select('id,store_id').eq('id', input.conversationId).eq('store_id', input.storeId).maybeSingle();
  if (conversationError) throw conversationError;
  if (!conversation) throw new Error('Conversa não encontrada para replay AUTOCAR V2.');

  const replayMessages = await loadAutocarReplayMessagesV2({
    productionSupabase: input.productionSupabase,
    storeId: input.storeId,
    conversationId: input.conversationId,
    messageId: input.messageId || null,
    limit: 12
  });

  const transcript = replayMessages.messages.map((message: any) => ({
    id: String(message.id || ''),
    direction: String(message.direction || ''),
    type: String(message.message_type || 'text'),
    body: String(message.body || '').trim().slice(0, 2000),
    sent_at: message.sent_at || message.created_at || null
  })).filter((message: any) => Boolean(message.body));
  const currentInbound = transcript.find((message: any) => message.id === String(replayMessages.currentInbound.id));
  if (!currentInbound?.body) throw new Error('Replay exige uma mensagem inbound textual recente ou histórica.');

  const humanRequest = await classifyAutocarHumanRequestV2({
    currentInbound: currentInbound.body,
    recentConversation: transcript.map((message: any) => ({ direction: message.direction, body: message.body }))
  });

  const shadowSupabase = replayMessages.historical
    ? createAutocarHistoricalReadClientV2({
        productionSupabase: input.productionSupabase,
        cutoff: {
          sent_at: replayMessages.currentInbound.sent_at,
          created_at: replayMessages.currentInbound.created_at
        }
      })
    : input.productionSupabase;

  const shadow = await generateAutocarShadowReply({
    productionSupabase: shadowSupabase,
    storeId: input.storeId,
    conversationId: input.conversationId
  });
  const referencedVehicles = Array.isArray(shadow.referenced_vehicles) ? shadow.referenced_vehicles : [];
  const presentedVehicleIds = (Array.isArray(shadow.presented_vehicles) ? shadow.presented_vehicles : [])
    .map((vehicle: any) => String(vehicle?.id || '').trim()).filter(Boolean).slice(0, 3);
  const presentedVehicleHydration = await hydrateAutocarPresentedVehiclesV2({
    productionSupabase: input.productionSupabase,
    storeId: input.storeId,
    vehicleIds: presentedVehicleIds
  });
  const presentedVehicles = presentedVehicleHydration.vehicles;
  const vehiclePresentation = buildAutocarVehiclePresentationV2({
    referencedVehicles: presentedVehicles,
    aiResponse: shadow.response
  });
  const singleVehicleMedia = buildAutocarSingleVehicleMediaV2({
    referencedVehicles,
    proposedActions: shadow.proposed_actions,
    aiResponse: shadow.response
  });
  const evaluation = evaluateAutocarReplayV2({
    customerRequestedHuman: humanRequest.customer_requested_human,
    shadow,
    vehiclePresentation,
    singleVehicleMedia,
    presentedVehicleHydration
  });

  return {
    version: AUTOCAR_INTELLIGENCE_REPLAY_VERSION,
    store_id: input.storeId,
    conversation_id: input.conversationId,
    replay_selection: {
      mode: replayMessages.historical ? 'historical_message' : 'latest_inbound',
      message_id: currentInbound.id,
      conversation_cutoff_applied: replayMessages.historical,
      future_messages_excluded: replayMessages.historical,
      inventory_snapshot: 'current_read_only',
      crm_snapshot: 'current_read_only'
    },
    current_inbound: { id: currentInbound.id, body: currentInbound.body, sent_at: currentInbound.sent_at },
    human_request: humanRequest,
    shadow: {
      response: shadow.response,
      summary: shadow.summary,
      next_best_action: shadow.next_best_action,
      proposed_actions: shadow.proposed_actions,
      referenced_vehicles: referencedVehicles,
      presented_vehicles: presentedVehicles,
      presented_vehicle_hydration: presentedVehicleHydration,
      vehicle_presentation: vehiclePresentation,
      single_vehicle_media: singleVehicleMedia,
      intelligence: shadow.intelligence,
      model: shadow.model,
      model_routing: shadow.model_routing,
      usage: shadow.usage
    },
    evaluation,
    no_external_execution: true
  };
}
