import { createAutocarStructuredResponse } from '@/lib/server/autocar/client';
import { getAutocarDevClient } from '@/lib/server/autocar/devAdmin';

const schema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    booking_requested: { type: 'boolean' },
    booking_type: { type: 'string', enum: ['none', 'visit', 'test_drive'] },
    planner_confirmed: { type: 'boolean' },
    confirmation_mode: { type: 'string', enum: ['not_confirmed', 'explicit_request', 'contextual_acceptance'] },
    reference_source: { type: 'string', enum: ['none', 'latest_message', 'previous_shadow', 'production_history'] },
    confirmation_evidence: { type: 'string' },
    requested_date: { type: 'string' },
    requested_time: { type: 'string' }
  },
  required: [
    'booking_requested',
    'booking_type',
    'planner_confirmed',
    'confirmation_mode',
    'reference_source',
    'confirmation_evidence',
    'requested_date',
    'requested_time'
  ]
};

function saoPauloNow() {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false
  }).format(new Date());
}

function validDate(value: unknown) {
  const text = String(value || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : '';
}

function validTime(value: unknown) {
  const text = String(value || '').trim();
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(text) ? text : '';
}

function bookingContextNeedsEscalation(value: any) {
  if (!value) return false;
  const confirmed = value.planner_confirmed === true;
  const contextual = String(value.confirmation_mode || '') === 'contextual_acceptance';
  const reference = String(value.reference_source || 'none');
  if (confirmed && String(value.booking_type || 'none') === 'none') return true;
  if (confirmed && (!validDate(value.requested_date) || !validTime(value.requested_time))) return true;
  if (contextual && !['previous_shadow', 'production_history'].includes(reference)) return true;
  return false;
}

async function requestBookingContext(
  instructions: string,
  payload: unknown,
  maxOutputTokens: number,
  ambiguous = false
) {
  try {
    const result = await createAutocarStructuredResponse({
      task: 'semantic_extraction',
      ambiguous,
      instructions,
      input: payload,
      schemaName: 'autocar_booking_context',
      schema,
      maxOutputTokens
    });
    return { parsed: result.parsed, routing: result.routing, raw: result.payload, error: null };
  } catch (error: any) {
    return {
      parsed: null,
      routing: null,
      raw: null,
      error: String(error?.message || 'Falha na interpretação estruturada do contexto.').slice(0, 500)
    };
  }
}

function safeContextFallback(shadowProposal: any) {
  const previousType = String(shadowProposal?.booking_type || '');
  const bookingType = previousType === 'visit' || previousType === 'test_drive' ? previousType : 'none';
  const requestedDate = validDate(shadowProposal?.requested_date);
  const requestedTime = validTime(shadowProposal?.requested_time);
  const hasPreviousContext = Boolean(shadowProposal || requestedDate || requestedTime || bookingType !== 'none');

  return {
    booking_requested: hasPreviousContext,
    booking_type: bookingType,
    planner_confirmed: false,
    confirmation_mode: 'not_confirmed',
    reference_source: hasPreviousContext ? 'previous_shadow' : 'none',
    confirmation_evidence: 'Fallback seguro do contexto: a interpretação estruturada não ficou íntegra; nenhuma autorização de agendamento foi assumida.',
    requested_date: requestedDate,
    requested_time: requestedTime,
    resolver_fallback: true,
    resolver_version: 'autocar-booking-context-v4-router'
  };
}

export async function resolveBookingContext(input: {
  productionSupabase: any;
  storeId: string;
  conversationId: string;
}) {
  const autocar = getAutocarDevClient();
  const [messageResult, claimResult] = await Promise.all([
    input.productionSupabase.from('whatsapp_messages')
      .select('id,direction,body,sent_at,created_at')
      .eq('store_id', input.storeId)
      .eq('conversation_id', input.conversationId)
      .order('sent_at', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(12),
    autocar.from('ai_runtime_message_claims')
      .select('id,result,created_at,status')
      .eq('store_id', input.storeId)
      .eq('production_conversation_id', input.conversationId)
      .eq('purpose', 'autopilot_reply')
      .eq('status', 'completed')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
  ]);
  if (messageResult.error) throw messageResult.error;
  if (claimResult.error) throw claimResult.error;

  const ordered = (messageResult.data || []).reverse().map((message: any) => ({
    id: message.id,
    direction: String(message.direction || ''),
    body: String(message.body || '').trim(),
    sent_at: message.sent_at || message.created_at || null
  })).filter((message: any) => message.body);

  const latestInboundIndex = [...ordered].map((message: any) => message.direction).lastIndexOf('inbound');
  const latestInbound = latestInboundIndex >= 0 ? ordered[latestInboundIndex] : null;
  const productionPreviousOutbound = latestInboundIndex > 0
    ? [...ordered.slice(0, latestInboundIndex)].reverse().find((message: any) => message.direction === 'outbound') || null
    : null;

  const previousShadow = claimResult.data?.result || null;
  const shadowResponse = String(previousShadow?.response || '').trim();
  const shadowBooking = previousShadow?.booking_guard || null;
  const shadowOperational = previousShadow?.operational_preview || null;
  const shadowProposal = shadowResponse ? {
    response: shadowResponse,
    booking_state: shadowBooking?.state || null,
    booking_type: shadowBooking?.booking_type || null,
    requested_date: shadowBooking?.requested_date || shadowOperational?.plan?.requested_date || '',
    requested_time: shadowBooking?.requested_time || shadowOperational?.plan?.requested_time || ''
  } : null;

  const previousOutboundText = shadowResponse || productionPreviousOutbound?.body || null;
  const recentMessages = ordered.slice(-8);

  if (!latestInbound) {
    return {
      booking_requested: false,
      booking_type: 'none',
      planner_confirmed: false,
      confirmation_mode: 'not_confirmed',
      reference_source: 'none',
      confirmation_evidence: '',
      requested_date: '',
      requested_time: '',
      latest_inbound: '',
      previous_outbound: previousOutboundText,
      shadow_proposal: shadowProposal,
      recent_messages: recentMessages,
      resolver_fallback: false,
      resolver_version: 'autocar-booking-context-v4-router',
      model_routing: null,
      model_escalation_triggered: false
    };
  }

  const instructions = [
    'Você é o interpretador semântico de intenção de agendamento da AUTOCAR.',
    'Interprete linguagem natural pelo significado e pelo contexto; NÃO use listas rígidas de palavras-chave como critério de confirmação.',
    'Considere pontuação, emojis, abreviações, informalidade e respostas curtas como partes normais da linguagem. Exemplos como "sim!", "fechou", "pode ser", "👍" ou equivalentes podem confirmar quando o contexto anterior deixa inequívoco o que está sendo aceito.',
    'Analise principalmente a ÚLTIMA mensagem inbound e use o histórico apenas para resolver o referente dessa mensagem.',
    `Agora em America/Sao_Paulo: ${saoPauloNow()}.`,
    'Use a proposta Shadow anterior quando existir como se fosse a resposta que a AUTOCAR teria enviado; ela é memória de simulação, não prova de execução.',
    'planner_confirmed deve ser true somente quando, pela interpretação semântica do contexto, o cliente autorizou de forma inequívoca marcar uma visita/test-drive em um horário concreto.',
    'Perguntar se um horário está disponível, perguntar se pode ir ou demonstrar interesse não é confirmação para criar agendamento.',
    'confirmation_mode=explicit_request quando a própria última mensagem contém uma instrução/aceite suficientemente completa para agendar.',
    'confirmation_mode=contextual_acceptance quando a última mensagem é curta ou implícita e seu significado de confirmação depende de uma proposta concreta anterior.',
    'confirmation_mode=not_confirmed quando não houver autorização inequívoca.',
    'reference_source=previous_shadow quando data/hora vêm da proposta Shadow anterior; production_history quando vêm de uma mensagem outbound real anterior; latest_message quando a própria mensagem atual fornece o contexto suficiente; none quando não houver referência concreta.',
    'Se houver confirmação contextual de um horário já proposto, preserve exatamente requested_date YYYY-MM-DD e requested_time HH:MM desse contexto.',
    'Se não houver data/hora concretas suficientes para executar, use string vazia mesmo que haja intenção positiva.',
    'booking_type deve ser test_drive apenas quando o contexto indicar test-drive; caso contrário visit para visita à loja; none se não houver intenção de agendamento.',
    'confirmation_evidence deve explicar brevemente por que a última mensagem, dentro daquele contexto, foi ou não interpretada como confirmação. Não invente fatos.'
  ].join(' ');

  const requestPayload = {
    latest_inbound: latestInbound,
    previous_outbound: productionPreviousOutbound,
    previous_shadow_proposal: shadowProposal,
    recent_messages: recentMessages
  };

  let resolved: any = null;
  let routing: any = null;
  let firstError = '';
  let escalationTriggered = false;
  for (const maxOutputTokens of [850, 1300]) {
    const attempt = await requestBookingContext(instructions, requestPayload, maxOutputTokens);
    if (attempt.parsed) {
      resolved = attempt.parsed;
      routing = attempt.routing;
      break;
    }
    if (!firstError) firstError = attempt.error || '';
  }

  if (resolved && bookingContextNeedsEscalation(resolved)) {
    escalationTriggered = true;
    const escalation = await requestBookingContext(instructions, requestPayload, 1300, true);
    if (escalation.parsed) {
      resolved = escalation.parsed;
      routing = escalation.routing;
    } else if (!firstError) {
      firstError = escalation.error || '';
    }
  }

  const parsed = resolved || safeContextFallback(shadowProposal);

  return {
    ...parsed,
    latest_inbound: latestInbound.body,
    previous_outbound: previousOutboundText,
    shadow_proposal: shadowProposal,
    recent_messages: recentMessages,
    resolver_fallback: Boolean(parsed?.resolver_fallback),
    resolver_error: resolved ? null : firstError || 'Falha na interpretação estruturada do contexto.',
    resolver_version: 'autocar-booking-context-v4-router',
    model_escalation_triggered: escalationTriggered,
    model_routing: routing
      ? {
          version: routing.version,
          task: routing.task,
          lane: routing.lane,
          model: routing.model,
          reason: routing.reason,
          escalated: routing.escalated
        }
      : null
  };
}
