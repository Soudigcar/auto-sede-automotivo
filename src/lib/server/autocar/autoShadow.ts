import {
  completeAutocarShadowClaim,
  failAutocarShadowClaim,
  prepareAutocarSafeInbound
} from '@/lib/server/autocar/safeRuntime';
import { generateAutocarShadowReply } from '@/lib/server/autocar/shadowReply';
import { evaluateAutocarOperationalShadowPolicy } from '@/lib/server/autocar/operationalPolicy';
import { resolveBookingContext } from '@/lib/server/autocar/bookingContextResolver';
import { evaluateBookingConfirmationGuard } from '@/lib/server/autocar/bookingConfirmationGuard';
import { enhanceAutocarBookingConversation } from '@/lib/server/autocar/bookingConversation';
import { attemptAutocarLiveTextPilot } from '@/lib/server/autocar/liveTextPilot';
import { attemptAutocarLivePhotoPilot } from '@/lib/server/autocar/livePhotoPilot';
import { attemptAutocarLiveLocationPilot } from '@/lib/server/autocar/liveLocationPilot';
import { attemptAutocarLiveVisitPilot } from '@/lib/server/autocar/liveVisitPilot';
import { attemptAutocarVehicleStatePilot } from '@/lib/server/autocar/liveVehicleStatePilot';
import type { AutocarCapability, AutocarPolicyDecision } from '@/lib/server/autocar/types';

function bookingDecision(bookingGuard: any): { decision: AutocarPolicyDecision; simulation: string } {
  if (bookingGuard?.state === 'READY_TO_SCHEDULE') {
    return {
      decision: {
        effect: 'allow',
        source: 'operational_guard',
        reason: 'Confirmação semântica recebida e Calendário revalidado imediatamente antes da ação simulada.'
      },
      simulation: 'ready_to_schedule'
    };
  }

  if (bookingGuard?.state === 'SLOT_UNAVAILABLE') {
    return {
      decision: {
        effect: 'deny',
        source: 'operational_guard',
        reason: 'O cliente confirmou, mas o horário ficou indisponível na revalidação do Calendário.'
      },
      simulation: 'slot_unavailable'
    };
  }

  return {
    decision: {
      effect: 'deny',
      source: 'operational_guard',
      reason: 'Aguardando confirmação semântica inequívoca do cliente antes de qualquer agendamento.'
    },
    simulation: 'waiting_confirmation'
  };
}

function finalizeOperationalShadow(shadow: any, bookingGuard: any) {
  const preview = shadow?.operational_preview || {};
  const existing = Array.isArray(shadow?.proposed_actions) ? shadow.proposed_actions : [];
  const byCapability = new Map<string, any>();

  for (const action of existing) {
    const capability = String(action?.capability || '') as AutocarCapability;
    if (!capability) continue;

    if (capability === 'schedule_visit' || capability === 'schedule_test_drive') {
      const guarded = bookingDecision(bookingGuard);
      byCapability.set(capability, { ...action, capability, ...guarded });
      continue;
    }

    const decision = evaluateAutocarOperationalShadowPolicy({ capability, operationalPreview: preview });
    byCapability.set(capability, {
      ...action,
      capability,
      decision,
      simulation: decision.effect === 'allow' ? 'would_execute' : decision.effect
    });
  }

  const inferred: Array<{ capability: AutocarCapability; reason: string }> = [];
  if (preview?.plan?.needs_photos) {
    inferred.push({ capability: 'send_photos', reason: 'Cliente solicitou fotos do veículo identificado no estoque.' });
  }
  if (preview?.plan?.needs_location) {
    inferred.push({ capability: 'send_location', reason: 'Cliente solicitou a localização da loja.' });
  }
  if (preview?.plan?.needs_availability || bookingGuard?.state !== 'NOT_APPLICABLE') {
    inferred.push({
      capability: bookingGuard?.booking_type === 'test_drive' ? 'schedule_test_drive' : 'schedule_visit',
      reason: 'Intenção de agendamento detectada; execução condicionada à confirmação semântica e revalidação do Calendário.'
    });
  }

  for (const action of inferred) {
    if (action.capability === 'schedule_visit' || action.capability === 'schedule_test_drive') {
      const guarded = bookingDecision(bookingGuard);
      byCapability.set(action.capability, { capability: action.capability, reason: action.reason, ...guarded });
      continue;
    }

    const decision = evaluateAutocarOperationalShadowPolicy({ capability: action.capability, operationalPreview: preview });
    byCapability.set(action.capability, {
      capability: action.capability,
      reason: action.reason,
      decision,
      simulation: decision.effect === 'allow' ? 'would_execute' : decision.effect
    });
  }

  const finalPreview = bookingGuard?.revalidated && bookingGuard?.revalidation
    ? { ...preview, availability_revalidation: bookingGuard.revalidation }
    : preview;

  return {
    ...shadow,
    operational_preview: finalPreview,
    booking_guard: bookingGuard,
    proposed_actions: Array.from(byCapability.values()),
    operational_policy_version: 'autocar-operational-policy-v1',
    booking_guard_version: 'autocar-booking-confirmation-v2-semantic',
    no_external_execution: true
  };
}

function conversationalTextShadowResult(baseResult: any, shadow: any) {
  const state = String(shadow?.booking_guard?.state || 'NOT_APPLICABLE');
  if (!['WAITING_CONFIRMATION', 'SLOT_UNAVAILABLE'].includes(state)) return baseResult;

  return {
    ...baseResult,
    result: {
      ...baseResult.result,
      shadow: {
        ...shadow,
        booking_guard: {
          ...shadow.booking_guard,
          state: 'NOT_APPLICABLE',
          conversational_original_state: state
        }
      }
    }
  };
}

export async function processAutocarShadowInbound(input: {
  productionSupabase: any;
  storeId: string;
  conversation: {
    id: string;
    whatsapp_number_id: string;
    lead_id?: string | null;
  };
  message: {
    id: string;
    message_type?: string | null;
  };
  allowLivePilot?: boolean;
}) {
  const prepared = await prepareAutocarSafeInbound({
    productionSupabase: input.productionSupabase,
    storeId: input.storeId,
    conversationId: input.conversation.id,
    whatsappNumberId: input.conversation.whatsapp_number_id,
    leadId: input.conversation.lead_id || null,
    messageId: input.message.id,
    messageType: input.message.message_type || null
  });

  if (prepared.duplicate || !prepared.ready || !prepared.claim?.id) {
    return { success: true, shadow_mode: true, no_external_execution: true, result: prepared };
  }

  try {
    const [generated, bookingContext] = await Promise.all([
      generateAutocarShadowReply({
        productionSupabase: input.productionSupabase,
        storeId: input.storeId,
        conversationId: input.conversation.id
      }),
      resolveBookingContext({
        productionSupabase: input.productionSupabase,
        storeId: input.storeId,
        conversationId: input.conversation.id
      })
    ]);

    const bookingGuard = await evaluateBookingConfirmationGuard({
      productionSupabase: input.productionSupabase,
      storeId: input.storeId,
      leadId: input.conversation.lead_id || null,
      bookingContext
    });

    const conversationalGenerated = await enhanceAutocarBookingConversation({
      productionSupabase: input.productionSupabase,
      storeId: input.storeId,
      conversationId: input.conversation.id,
      leadId: input.conversation.lead_id || null,
      shadow: generated,
      bookingGuard,
      bookingContext
    });

    const shadow = finalizeOperationalShadow(conversationalGenerated, bookingGuard);
    const completedClaim = await completeAutocarShadowClaim({
      storeId: input.storeId,
      claimId: prepared.claim.id,
      shadow: shadow as unknown as Record<string, unknown>
    });

    const baseResult = {
      success: true,
      shadow_mode: true,
      no_external_execution: true,
      result: { ...prepared, claim: completedClaim, shadow }
    };

    if (input.allowLivePilot === false) return baseResult;

    try {
      const { data: integration, error: integrationError } = await input.productionSupabase
        .from('store_whatsapp_integrations')
        .select('instance_name,status,scope')
        .eq('store_id', input.storeId)
        .eq('crm_number_id', input.conversation.whatsapp_number_id)
        .eq('scope', 'store')
        .maybeSingle();
      if (integrationError) throw integrationError;

      let vehicleState: any = {
        updated: false,
        skipped: true,
        reason: 'Nenhum veículo principal foi alterado nesta mensagem.'
      };
      try {
        vehicleState = await attemptAutocarVehicleStatePilot({
          productionSupabase: input.productionSupabase,
          storeId: input.storeId,
          conversationId: input.conversation.id,
          leadId: input.conversation.lead_id || null,
          inboundMessageId: input.message.id,
          shadowResult: baseResult
        });
      } catch (vehicleStateError: any) {
        console.warn('[AUTOCAR VEHICLE STATE V1] Falha best effort; demais ações LIVE continuam.', {
          storeId: input.storeId,
          conversationId: input.conversation.id,
          inboundMessageId: input.message.id,
          error: vehicleStateError?.message || String(vehicleStateError)
        });
        vehicleState = {
          updated: false,
          failed: true,
          best_effort: true,
          reason: String(vehicleStateError?.message || vehicleStateError || 'Falha no Vehicle State V1.').slice(0, 500)
        };
      }

      const liveText = await attemptAutocarLiveTextPilot({
        productionSupabase: input.productionSupabase,
        storeId: input.storeId,
        conversationId: input.conversation.id,
        whatsappNumberId: input.conversation.whatsapp_number_id,
        leadId: input.conversation.lead_id || null,
        inboundMessageId: input.message.id,
        integration: integration || {},
        shadowResult: conversationalTextShadowResult(baseResult, shadow)
      });

      let livePhotos: any = {
        sent: false,
        skipped: true,
        reason: 'A última mensagem não exige envio de fotos.'
      };
      if (shadow?.operational_preview?.plan?.needs_photos === true) {
        livePhotos = await attemptAutocarLivePhotoPilot({
          productionSupabase: input.productionSupabase,
          storeId: input.storeId,
          conversationId: input.conversation.id,
          whatsappNumberId: input.conversation.whatsapp_number_id,
          leadId: input.conversation.lead_id || null,
          inboundMessageId: input.message.id,
          integration: integration || {},
          shadowResult: baseResult
        });
      }

      let liveLocation: any = {
        sent: false,
        skipped: true,
        reason: 'A última mensagem não exige envio de localização.'
      };
      if (shadow?.operational_preview?.plan?.needs_location === true) {
        liveLocation = await attemptAutocarLiveLocationPilot({
          productionSupabase: input.productionSupabase,
          storeId: input.storeId,
          conversationId: input.conversation.id,
          whatsappNumberId: input.conversation.whatsapp_number_id,
          leadId: input.conversation.lead_id || null,
          inboundMessageId: input.message.id,
          integration: integration || {},
          shadowResult: baseResult
        });
      }

      let liveVisit: any = {
        sent: false,
        scheduled: false,
        skipped: true,
        reason: 'A última mensagem não exige execução de agendamento.'
      };
      if (shadow?.booking_guard?.state !== 'NOT_APPLICABLE') {
        liveVisit = await attemptAutocarLiveVisitPilot({
          productionSupabase: input.productionSupabase,
          storeId: input.storeId,
          conversationId: input.conversation.id,
          whatsappNumberId: input.conversation.whatsapp_number_id,
          leadId: input.conversation.lead_id || null,
          inboundMessageId: input.message.id,
          integration: integration || {},
          shadowResult: baseResult
        });
      }

      return {
        ...baseResult,
        live_pilot: {
          sent: Boolean(liveText?.sent || livePhotos?.sent || liveLocation?.sent || liveVisit?.sent),
          vehicle_state: vehicleState,
          text: liveText,
          photos: livePhotos,
          location: liveLocation,
          visit: liveVisit
        }
      };
    } catch (liveError: any) {
      console.warn('[AUTOCAR LIVE PILOT] Falha best effort após Shadow; Shadow permanece concluído.', {
        storeId: input.storeId,
        conversationId: input.conversation.id,
        inboundMessageId: input.message.id,
        error: liveError?.message || String(liveError)
      });
      return {
        ...baseResult,
        live_pilot: {
          sent: false,
          failed: true,
          best_effort: true,
          reason: String(liveError?.message || liveError || 'Falha no LIVE PILOT.').slice(0, 500)
        }
      };
    }
  } catch (shadowError: any) {
    const failedClaim = await failAutocarShadowClaim({
      storeId: input.storeId,
      claimId: prepared.claim.id,
      error: shadowError
    });

    return {
      error: shadowError?.message || 'Falha ao gerar resposta Shadow.',
      shadow_mode: true,
      no_external_execution: true,
      claim: failedClaim
    };
  }
}
