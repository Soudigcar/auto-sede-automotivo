import { consultAutocarAvailability } from '@/lib/server/autocar/operationalTools';

export type BookingGuardState = 'WAITING_CONFIRMATION' | 'READY_TO_SCHEDULE' | 'SLOT_UNAVAILABLE' | 'NOT_APPLICABLE';

export type BookingContext = {
  booking_requested?: boolean;
  booking_type?: 'none' | 'visit' | 'test_drive' | string;
  planner_confirmed?: boolean;
  confirmation_evidence?: string;
  requested_date?: string;
  requested_time?: string;
  latest_inbound?: string;
  previous_outbound?: string | null;
};

function normalize(value: unknown) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function hasConcreteSchedulingProposal(value: unknown) {
  const text = normalize(value);
  if (!text) return false;
  const hasSchedulingWord = /(agend|marc|visita|test.?drive|horario)/.test(text);
  const hasTime = /\b(?:[01]?\d|2[0-3])(?::[0-5]\d|h(?:[0-5]\d)?)\b/.test(text);
  return hasSchedulingWord && hasTime;
}

function explicitConfirmationSignal(latestInbound: unknown, previousOutbound: unknown) {
  const text = normalize(latestInbound);
  if (!text) return { confirmed: false, signal: 'empty_message' };

  const strongPatterns = [
    /\bpode (?:agendar|marcar|confirmar)\b/,
    /\b(?:quero|pode) (?:deixar )?(?:agendad[oa]|marcad[oa])\b/,
    /\b(?:agende|agenda|marque|marca) (?:pra|para) mim\b/,
    /\bconfirmo\b/,
    /\bpode deixar (?:agendad[oa]|marcad[oa])\b/,
    /\bfechado(?: para| as| às| em)?\b/,
    /\bcombinado\b/,
    /\bconfirmad[oa]\b/
  ];

  if (strongPatterns.some((pattern) => pattern.test(text))) {
    return { confirmed: true, signal: 'explicit_action_phrase' };
  }

  const simpleYes = /^(sim|sim pode|pode ser|ok|okay|beleza|perfeito|isso|certo|fechado|combinado)[.! ]*$/.test(text);
  if (simpleYes && hasConcreteSchedulingProposal(previousOutbound)) {
    return { confirmed: true, signal: 'contextual_yes_to_concrete_slot' };
  }

  return { confirmed: false, signal: simpleYes ? 'ambiguous_yes_without_concrete_slot' : 'no_confirmation_phrase' };
}

export async function evaluateBookingConfirmationGuard(input: {
  productionSupabase: any;
  storeId: string;
  leadId?: string | null;
  bookingContext?: BookingContext | null;
}) {
  const context = input.bookingContext || {};
  const bookingRelevant = Boolean(
    context.booking_requested ||
    context.planner_confirmed ||
    context.requested_date ||
    context.requested_time ||
    (context.booking_type && context.booking_type !== 'none')
  );

  if (!bookingRelevant) {
    return {
      state: 'NOT_APPLICABLE' as BookingGuardState,
      explicit_confirmation: false,
      reason: 'Nenhum agendamento foi solicitado nesta mensagem.',
      booking_type: context.booking_type || 'none',
      requested_date: context.requested_date || '',
      requested_time: context.requested_time || '',
      revalidated: false,
      revalidation: null
    };
  }

  const lexical = explicitConfirmationSignal(context.latest_inbound, context.previous_outbound);
  const explicitConfirmation = Boolean(context.planner_confirmed && lexical.confirmed);

  if (!explicitConfirmation) {
    return {
      state: 'WAITING_CONFIRMATION' as BookingGuardState,
      explicit_confirmation: false,
      confirmation_signal: lexical.signal,
      planner_confirmed: Boolean(context.planner_confirmed),
      reason: 'Aguardando confirmação explícita do cliente antes de qualquer agendamento.',
      booking_type: context.booking_type || 'visit',
      requested_date: context.requested_date || '',
      requested_time: context.requested_time || '',
      revalidated: false,
      revalidation: null
    };
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(context.requested_date || '')) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(String(context.requested_time || ''))) {
    return {
      state: 'WAITING_CONFIRMATION' as BookingGuardState,
      explicit_confirmation: true,
      confirmation_signal: lexical.signal,
      reason: 'O cliente confirmou a intenção, mas ainda não há data e horário concretos suficientes para agendar.',
      booking_type: context.booking_type || 'visit',
      requested_date: context.requested_date || '',
      requested_time: context.requested_time || '',
      revalidated: false,
      revalidation: null
    };
  }

  const revalidation = await consultAutocarAvailability({
    productionSupabase: input.productionSupabase,
    storeId: input.storeId,
    date: String(context.requested_date),
    time: String(context.requested_time),
    excludeLeadId: input.leadId || null
  });

  if (!revalidation.available) {
    return {
      state: 'SLOT_UNAVAILABLE' as BookingGuardState,
      explicit_confirmation: true,
      confirmation_signal: lexical.signal,
      reason: 'O cliente confirmou, mas o Calendário foi revalidado e o horário não está mais disponível.',
      booking_type: context.booking_type || 'visit',
      requested_date: String(context.requested_date),
      requested_time: String(context.requested_time),
      revalidated: true,
      revalidated_at: new Date().toISOString(),
      revalidation
    };
  }

  return {
    state: 'READY_TO_SCHEDULE' as BookingGuardState,
    explicit_confirmation: true,
    confirmation_signal: lexical.signal,
    reason: 'Confirmação explícita recebida e Calendário revalidado imediatamente antes da ação simulada.',
    booking_type: context.booking_type || 'visit',
    requested_date: String(context.requested_date),
    requested_time: String(context.requested_time),
    revalidated: true,
    revalidated_at: new Date().toISOString(),
    revalidation
  };
}
