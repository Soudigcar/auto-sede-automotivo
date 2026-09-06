import { createAutocarStructuredResponse } from '@/lib/server/autocar/client';
import { getAutocarDevClient } from '@/lib/server/autocar/devAdmin';
import {
  consultAutocarStoreLocation,
  consultAutocarVehiclePhotos
} from '@/lib/server/autocar/operationalTools';
import { evolutionDisplayBody } from '@/lib/server/evolutionMessage';

const continuitySchema = (vehicleIds: string[]) => ({
  type: 'object',
  additionalProperties: false,
  properties: {
    pending_action: {
      type: 'string',
      enum: ['none', 'send_location', 'send_photos']
    },
    resolution: {
      type: 'string',
      enum: ['not_applicable', 'direct_request', 'accepted', 'declined', 'unclear']
    },
    vehicle_id: { type: 'string', enum: ['', ...vehicleIds] },
    reason: { type: 'string' }
  },
  required: ['pending_action', 'resolution', 'vehicle_id', 'reason']
});

const replySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    response: { type: 'string' },
    next_best_action: { type: 'string' }
  },
  required: ['response', 'next_best_action']
};

function bodyOf(message: any) {
  return String(evolutionDisplayBody(message?.body, message?.raw_payload) || '').trim();
}

function uniqueIds(values: unknown[]) {
  return Array.from(new Set(values.map((value) => String(value || '').trim()).filter(Boolean)));
}

export function isAutocarContinuityExecutionSafe(continuity: any) {
  if (!continuity) return true;
  return ['accepted', 'direct_request'].includes(String(continuity.resolution || ''))
    && ['send_location', 'send_photos'].includes(String(continuity.pending_action || ''))
    && continuity.execution_ready === true
    && continuity.fail_closed === false;
}

async function validatedVehicleCandidates(input: {
  productionSupabase: any;
  storeId: string;
  conversationId: string;
  shadow: any;
}) {
  const autocar = getAutocarDevClient();
  const { data: claims, error } = await autocar.from('ai_runtime_message_claims')
    .select('result,created_at')
    .eq('store_id', input.storeId)
    .eq('production_conversation_id', input.conversationId)
    .eq('purpose', 'autopilot_reply')
    .eq('status', 'completed')
    .order('created_at', { ascending: false })
    .limit(8);
  if (error) throw error;

  const historicalIds = (claims || []).flatMap((claim: any) => {
    const result = claim?.result || {};
    const referenced = Array.isArray(result?.referenced_vehicles) ? result.referenced_vehicles : [];
    const presented = Array.isArray(result?.presented_vehicles) ? result.presented_vehicles : [];
    return [...referenced, ...presented].map((vehicle: any) => vehicle?.id);
  });
  const currentIds = [
    ...(Array.isArray(input.shadow?.referenced_vehicles) ? input.shadow.referenced_vehicles : []),
    ...(Array.isArray(input.shadow?.presented_vehicles) ? input.shadow.presented_vehicles : [])
  ].map((vehicle: any) => vehicle?.id);
  const candidateIds = uniqueIds([...currentIds, ...historicalIds]).slice(0, 12);
  if (!candidateIds.length) return [];

  const { data, error: vehicleError } = await input.productionSupabase.from('site_vehicles')
    .select('id,brand,model,version,year,model_year,color,price,status,sold_at')
    .eq('store_id', input.storeId)
    .in('id', candidateIds)
    .eq('status', 'disponivel')
    .is('sold_at', null);
  if (vehicleError) throw vehicleError;

  const byId = new Map((data || []).map((vehicle: any) => [String(vehicle.id), vehicle]));
  return candidateIds.map((id) => byId.get(id)).filter(Boolean);
}

async function generateContinuityReply(input: {
  recentMessages: any[];
  pendingAction: string;
  executionReady: boolean;
  reason: string;
  operationalData: any;
  currentShadow: any;
}) {
  const result = await createAutocarStructuredResponse({
    task: 'commercial_followup',
    instructions: [
      'Você é a AUTOCAR continuando uma conversa comercial já em andamento.',
      'Escreva a resposta ao cliente de forma totalmente generativa e contextual; não reproduza template, frase fixa ou sequência obrigatória.',
      'pending_action representa uma única ação operacional pedida diretamente pelo cliente ou aceita semanticamente após uma oferta anterior.',
      'Se execution_ready for true, a ação ainda será executada pelo backend depois desta geração: não diga que ela já foi concluída, enviada ou realizada.',
      'Se execution_ready for false, não prometa execução; esclareça naturalmente o que falta para continuar.',
      'Use operational_data apenas como fonte factual. Nunca invente endereço, fotos, veículo, disponibilidade, preço, desconto, financiamento ou resultado operacional.',
      'next_best_action deve ser um próximo passo conversacional útil e contextual, no máximo um de cada vez. Não imponha uma sequência fixa entre localização, fotos, financiamento ou agendamento.',
      'Quando fizer sentido sugerir outra ação, peça consentimento de forma natural. Quando não fizer sentido, não force uma nova oferta.',
      'A resposta deve ser curta, humana, comercial e em português do Brasil.'
    ].join(' '),
    input: {
      conversa_recente: input.recentMessages,
      pending_action: input.pendingAction,
      execution_ready: input.executionReady,
      reason: input.reason,
      operational_data: input.operationalData,
      resposta_generativa_anterior: input.currentShadow?.response || '',
      next_best_action_anterior: input.currentShadow?.next_best_action || ''
    },
    schemaName: 'autocar_conversation_continuity_reply',
    schema: replySchema,
    maxOutputTokens: 650
  });
  return {
    response: String(result.parsed?.response || '').trim(),
    next_best_action: String(result.parsed?.next_best_action || '').trim(),
    routing: result.routing
  };
}

export async function enhanceAutocarConversationContinuity(input: {
  productionSupabase: any;
  storeId: string;
  conversationId: string;
  shadow: any;
  bookingGuard?: any;
}) {
  const bookingState = String(input.bookingGuard?.state || input.shadow?.booking_guard?.state || 'NOT_APPLICABLE');
  if (bookingState !== 'NOT_APPLICABLE') {
    return {
      ...input.shadow,
      conversation_continuity: {
        version: 'autocar-conversation-continuity-v1-generative',
        pending_action: 'none',
        resolution: 'not_applicable',
        execution_ready: false,
        reason: 'Booking ativo tem prioridade sobre ações conversacionais secundárias.'
      }
    };
  }

  const { data: messages, error: messagesError } = await input.productionSupabase
    .from('whatsapp_messages')
    .select('id,direction,message_type,body,raw_payload,sent_at,created_at')
    .eq('store_id', input.storeId)
    .eq('conversation_id', input.conversationId)
    .order('sent_at', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(14);
  if (messagesError) throw messagesError;

  const recentMessages = (messages || []).reverse().map((message: any) => ({
    id: message.id,
    direction: String(message.direction || ''),
    type: String(message.message_type || 'text'),
    body: bodyOf(message).slice(0, 1800),
    sent_at: message.sent_at || message.created_at || null
  })).filter((message: any) => Boolean(message.body));

  const latestInboundIndex = [...recentMessages].map((message: any) => message.direction).lastIndexOf('inbound');
  if (latestInboundIndex < 0) return input.shadow;
  const latestInbound = recentMessages[latestInboundIndex];
  const previousOutbound = [...recentMessages.slice(0, latestInboundIndex)].reverse()
    .find((message: any) => message.direction === 'outbound') || null;
  if (!previousOutbound) return input.shadow;

  const candidates = await validatedVehicleCandidates({
    productionSupabase: input.productionSupabase,
    storeId: input.storeId,
    conversationId: input.conversationId,
    shadow: input.shadow
  });
  const vehicleIds = candidates.map((vehicle: any) => String(vehicle.id));

  let parsed: any;
  let routing: any;
  try {
    const result = await createAutocarStructuredResponse({
      task: 'semantic_extraction',
      instructions: [
        'Resolva semanticamente se a mensagem inbound mais recente faz UM pedido operacional direto e inequívoco ou responde a UMA oferta operacional explícita feita pela AUTOCAR no outbound anterior.',
        'As únicas ações pendentes reconhecidas aqui são enviar localização da loja ou enviar fotos de um veículo real.',
        'Não use listas de palavras-chave nem correspondência literal para decidir aceite ou recusa; interprete o sentido, o histórico e a referência conversacional.',
        'Só marque accepted quando o outbound anterior realmente pediu consentimento para uma única ação e a resposta atual aceitar essa ação de forma inequívoca.',
        'Marque direct_request para um pedido novo, direto e inequívoco de localização ou fotos; esse pedido não exige oferta nem consentimento solicitado no outbound anterior.',
        'Se houver mais de uma ação plausível ou se a referência estiver ambígua, use none/unclear e não autorize execução. Um aceite curto sem oferta anterior inequívoca não é direct_request.',
        'Para send_photos, vehicle_id precisa ser um ID exato de candidate_vehicles e o histórico deve identificar semanticamente um único veículo. Se houver dúvida, deixe vazio.',
        'Nunca transforme uma confirmação de agendamento, negociação, desconto, crédito, venda ou atendimento humano em send_location ou send_photos.'
      ].join(' '),
      input: {
        latest_inbound: latestInbound,
        previous_outbound: previousOutbound,
        recent_messages: recentMessages.slice(-10),
        candidate_vehicles: candidates
      },
      schemaName: 'autocar_pending_action_resolution',
      schema: continuitySchema(vehicleIds),
      maxOutputTokens: 500
    });
    parsed = result.parsed;
    routing = result.routing;
  } catch (error: any) {
    return {
      ...input.shadow,
      conversation_continuity: {
        version: 'autocar-conversation-continuity-v1-generative',
        pending_action: 'none',
        resolution: 'unclear',
        execution_ready: false,
        fail_closed: true,
        error: String(error?.message || error || 'Falha ao resolver continuidade conversacional.').slice(0, 500)
      }
    };
  }

  const pendingAction = String(parsed?.pending_action || 'none');
  const resolution = String(parsed?.resolution || 'not_applicable');
  const vehicleId = String(parsed?.vehicle_id || '').trim();
  if (!['accepted', 'direct_request'].includes(resolution) || !['send_location', 'send_photos'].includes(pendingAction)) {
    return {
      ...input.shadow,
      conversation_continuity: {
        version: 'autocar-conversation-continuity-v1-generative',
        pending_action: pendingAction,
        resolution,
        vehicle_id: vehicleId || null,
        execution_ready: false,
        reason: String(parsed?.reason || '').slice(0, 500),
        model_routing: routing || null
      }
    };
  }

  const preview = input.shadow?.operational_preview || {};
  const plan = { ...(preview?.plan || {}) };
  let operationalData: any = null;
  let executionReady = false;

  if (pendingAction === 'send_location') {
    operationalData = await consultAutocarStoreLocation(input.storeId);
    executionReady = Boolean(
      operationalData?.configured &&
      String(operationalData?.address || '').trim() &&
      Number.isFinite(Number(operationalData?.latitude)) &&
      Number.isFinite(Number(operationalData?.longitude))
    );
    plan.needs_location = executionReady;
    plan.needs_photos = false;
  } else {
    const validVehicle = vehicleId && vehicleIds.includes(vehicleId)
      ? candidates.find((vehicle: any) => String(vehicle.id) === vehicleId) || null
      : null;
    if (validVehicle) {
      operationalData = await consultAutocarVehiclePhotos({
        productionSupabase: input.productionSupabase,
        storeId: input.storeId,
        vehicleId
      });
      executionReady = Boolean(operationalData?.configured && Array.isArray(operationalData?.photos) && operationalData.photos.length);
      plan.needs_photos = executionReady;
      plan.photo_vehicle_id = executionReady ? vehicleId : '';
      plan.needs_location = false;
    }
  }

  let generatedReply: any = null;
  try {
    generatedReply = await generateContinuityReply({
      recentMessages: recentMessages.slice(-10),
      pendingAction,
      executionReady,
      reason: String(parsed?.reason || '').slice(0, 500),
      operationalData,
      currentShadow: input.shadow
    });
  } catch (error: any) {
    generatedReply = {
      response: '',
      next_best_action: '',
      routing: null,
      error: String(error?.message || error || 'Falha ao gerar continuação comercial.').slice(0, 500)
    };
  }

  return {
    ...input.shadow,
    response: String(generatedReply?.response || '').trim(),
    next_best_action: String(generatedReply?.next_best_action || '').trim(),
    operational_preview: {
      ...preview,
      plan,
      ...(pendingAction === 'send_location' ? { location: operationalData } : {}),
      ...(pendingAction === 'send_photos' ? { photos: operationalData } : {})
    },
    conversation_continuity: {
      version: 'autocar-conversation-continuity-v1-generative',
      pending_action: pendingAction,
      resolution,
      vehicle_id: vehicleId || null,
      execution_ready: executionReady,
      reason: String(parsed?.reason || '').slice(0, 500),
      fail_closed: !executionReady || !String(generatedReply?.response || '').trim(),
      classifier_model_routing: routing || null,
      reply_model_routing: generatedReply?.routing || null,
      reply_generation_error: generatedReply?.error || null
    }
  };
}
