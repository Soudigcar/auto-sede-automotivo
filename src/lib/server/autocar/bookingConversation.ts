import { autocarModelName } from '@/lib/server/autocar/client';
import { getAutocarDevClient } from '@/lib/server/autocar/devAdmin';
import { consultAutocarDayAvailability } from '@/lib/server/autocar/operationalTools';

function responseSchema(candidateVehicleIds: string[]) {
  return {
    type: 'object',
    additionalProperties: false,
    properties: {
      response: { type: 'string' },
      next_best_action: { type: 'string' },
      active_vehicle_id: { type: 'string', enum: ['', ...candidateVehicleIds] }
    },
    required: ['response', 'next_best_action', 'active_vehicle_id']
  };
}

function openAiKey() {
  const key = String(process.env.OPENAI_API_KEY || '').trim();
  if (!key) throw new Error('OPENAI_API_KEY não disponível no ambiente de Preview.');
  return key;
}

function outputText(payload: any) {
  if (typeof payload?.output_text === 'string' && payload.output_text.trim()) return payload.output_text.trim();
  for (const item of Array.isArray(payload?.output) ? payload.output : []) {
    for (const content of Array.isArray(item?.content) ? item.content : []) {
      if (content?.type === 'output_text' && typeof content.text === 'string') return content.text.trim();
    }
  }
  return '';
}

function dateFrom(shadow: any, bookingGuard: any) {
  const guarded = String(bookingGuard?.requested_date || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(guarded)) return guarded;
  const planned = String(shadow?.operational_preview?.plan?.requested_date || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(planned) ? planned : '';
}

function uniqueIds(values: unknown[]) {
  return Array.from(new Set(values.map((value) => String(value || '').trim()).filter(Boolean)));
}

async function validatedVehicleCandidates(input: {
  productionSupabase: any;
  storeId: string;
  conversationId: string;
  currentShadow: any;
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

  const historicalIds = (claims || []).flatMap((claim: any) =>
    Array.isArray(claim?.result?.referenced_vehicles)
      ? claim.result.referenced_vehicles.map((vehicle: any) => vehicle?.id)
      : []
  );
  const currentIds = Array.isArray(input.currentShadow?.referenced_vehicles)
    ? input.currentShadow.referenced_vehicles.map((vehicle: any) => vehicle?.id)
    : [];
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

async function requestBookingConversation(input: {
  instructions: string;
  payload: unknown;
  candidateVehicleIds: string[];
  maxOutputTokens: number;
}) {
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${openAiKey()}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: autocarModelName(),
      store: false,
      max_output_tokens: input.maxOutputTokens,
      instructions: input.instructions,
      input: JSON.stringify(input.payload),
      text: {
        format: {
          type: 'json_schema',
          name: 'autocar_booking_conversation',
          strict: true,
          schema: responseSchema(input.candidateVehicleIds)
        }
      }
    }),
    cache: 'no-store'
  });

  const raw = await response.json().catch(() => ({}));
  if (!response.ok) {
    return {
      parsed: null,
      error: String(raw?.error?.message || `OpenAI respondeu com HTTP ${response.status}.`).slice(0, 500)
    };
  }

  const text = outputText(raw);
  if (!text) return { parsed: null, error: 'A OpenAI retornou resposta estruturada vazia.' };

  try {
    return { parsed: JSON.parse(text), error: null };
  } catch (error: any) {
    return {
      parsed: null,
      error: String(error?.message || 'JSON incompleto na conversa de agendamento.').slice(0, 500)
    };
  }
}

export async function enhanceAutocarBookingConversation(input: {
  productionSupabase: any;
  storeId: string;
  conversationId?: string | null;
  leadId?: string | null;
  shadow: any;
  bookingGuard: any;
  bookingContext: any;
}) {
  const state = String(input.bookingGuard?.state || 'NOT_APPLICABLE');
  if (!['WAITING_CONFIRMATION', 'SLOT_UNAVAILABLE'].includes(state)) return input.shadow;
  if (String(input.bookingGuard?.booking_type || 'visit') === 'test_drive') return input.shadow;

  const requestedDate = dateFrom(input.shadow, input.bookingGuard);
  if (!requestedDate) return input.shadow;

  const [dayAvailability, vehicleCandidates] = await Promise.all([
    consultAutocarDayAvailability({
      productionSupabase: input.productionSupabase,
      storeId: input.storeId,
      date: requestedDate,
      excludeLeadId: input.leadId || null
    }),
    input.conversationId
      ? validatedVehicleCandidates({
          productionSupabase: input.productionSupabase,
          storeId: input.storeId,
          conversationId: input.conversationId,
          currentShadow: input.shadow
        })
      : Promise.resolve([])
  ]);

  const enrichedPreview = {
    ...(input.shadow?.operational_preview || {}),
    day_availability: dayAvailability
  };

  const candidateVehicleIds = vehicleCandidates.map((vehicle: any) => String(vehicle.id));
  const instructions = [
    'Você é a AUTOCAR conduzindo uma conversa comercial de agendamento de VISITA, sem executar o agendamento.',
    'Interprete a linguagem do cliente semanticamente. Não use listas rígidas de palavras-chave para entender manhã, tarde, horários, aceites ou referências contextuais.',
    'A data em requested_date já foi resolvida semanticamente por uma etapa anterior. Não troque essa data e não invente outra.',
    'day_availability é a fonte oficial para expediente e horários livres. Nunca ofereça horário que não esteja em available_slots.',
    'Nunca diga que a visita já foi agendada. Neste estágio você está apenas conduzindo a escolha e a confirmação.',
    'Se o cliente informou um dia/data, mas ainda não informou horário ou período, confirme naturalmente a data e pergunte se prefere manhã ou tarde quando houver disponibilidade nos dois períodos.',
    'Se o cliente já indicou semanticamente manhã ou tarde, ofereça de 2 a 3 horários livres daquele período, sem exigir que ele repita a preferência.',
    'Se o cliente informou um horário específico que não coincide exatamente com um slot oferecido, não o arredonde silenciosamente. Explique de forma natural os horários reais mais próximos e peça que escolha um deles.',
    'Se só houver disponibilidade em um período, explique de forma natural e ofereça horários reais desse período.',
    'Se o horário pedido ficou indisponível, informe isso sem culpar o cliente e ofereça de 2 a 3 alternativas reais próximas, preferindo o mesmo período.',
    'Se não houver nenhum horário livre no dia, informe que esse dia está sem disponibilidade e peça outro dia.',
    'Você pode mencionar o expediente real quando isso ajudar a conversa.',
    'candidate_vehicles contém apenas veículos reais, disponíveis e pertencentes à loja atual.',
    'Escolha active_vehicle_id somente quando o histórico recente deixar semanticamente inequívoco qual desses veículos continua sendo o assunto da visita.',
    'Uma resposta curta sobre agenda, período ou horário não deve trocar o veículo ativo por si só. Preserve a continuidade quando o histórico for inequívoco.',
    'Se o cliente mudar explicitamente ou semanticamente para outro veículo candidato, escolha esse novo ID.',
    'Se houver ambiguidade real entre veículos, use active_vehicle_id vazio. Nunca invente um ID e nunca escolha veículo fora de candidate_vehicles.',
    'Escreva em português do Brasil, de forma curta, humana e comercial. Evite linguagem de sistema, policy, guard ou backend.',
    'Não invente localização, estoque, desconto, financiamento, test-drive ou qualquer informação que não esteja no contexto.',
    'next_best_action deve descrever apenas o próximo passo conversacional, nunca uma execução já realizada.'
  ].join(' ');

  const payload = {
    requested_date: requestedDate,
    booking_state: state,
    latest_inbound: input.bookingContext?.latest_inbound || '',
    previous_outbound: input.bookingContext?.previous_outbound || null,
    recent_messages: Array.isArray(input.bookingContext?.recent_messages) ? input.bookingContext.recent_messages : [],
    confirmation_mode: input.bookingGuard?.confirmation_mode || 'not_confirmed',
    confirmation_evidence: input.bookingGuard?.confirmation_evidence || '',
    current_shadow_response: input.shadow?.response || '',
    current_shadow_referenced_vehicles: input.shadow?.referenced_vehicles || [],
    candidate_vehicles: vehicleCandidates,
    day_availability: dayAvailability
  };

  let parsed: any = null;
  let firstError = '';
  for (const maxOutputTokens of [850, 1400]) {
    const attempt = await requestBookingConversation({
      instructions,
      payload,
      candidateVehicleIds,
      maxOutputTokens
    });
    if (attempt.parsed) {
      parsed = attempt.parsed;
      break;
    }
    if (!firstError) firstError = attempt.error || '';
  }

  if (!parsed) {
    return {
      ...input.shadow,
      operational_preview: enrichedPreview,
      booking_conversation_version: 'autocar-booking-conversation-v2-resilient',
      booking_conversation_fallback: true,
      booking_conversation_error: firstError || 'A continuação estruturada não ficou íntegra; resposta Shadow preservada.'
    };
  }

  const activeVehicleId = String(parsed.active_vehicle_id || '').trim();
  const activeVehicle: any = activeVehicleId
    ? vehicleCandidates.find((vehicle: any) => String(vehicle.id) === activeVehicleId) || null
    : null;

  return {
    ...input.shadow,
    response: String(parsed.response || input.shadow?.response || '').trim(),
    next_best_action: String(parsed.next_best_action || input.shadow?.next_best_action || '').trim(),
    referenced_vehicles: activeVehicle ? [activeVehicle] : [],
    operational_preview: enrichedPreview,
    booking_conversation_version: 'autocar-booking-conversation-v2-resilient',
    booking_conversation_fallback: false,
    active_vehicle_resolution: {
      vehicle_id: activeVehicle?.id || null,
      candidate_count: vehicleCandidates.length,
      source: activeVehicle ? 'semantic_booking_continuity_validated_inventory' : 'ambiguous_or_none'
    }
  };
}
