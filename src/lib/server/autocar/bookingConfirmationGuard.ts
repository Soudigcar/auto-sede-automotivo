import { consultAutocarAvailability } from '@/lib/server/autocar/operationalTools';

export type BookingGuardState = 'WAITING_CONFIRMATION' | 'READY_TO_SCHEDULE' | 'SLOT_UNAVAILABLE' | 'NOT_APPLICABLE';

export type BookingContext = {
  booking_requested?: boolean;
  booking_type?: 'none' | 'visit' | 'test_drive' | string;
  planner_confirmed?: boolean;
  confirmation_mode?: 'not_confirmed' | 'explicit_request' | 'contextual_acceptance' | string;
  reference_source?: 'none' | 'latest_message' | 'previous_shadow' | 'production_history' | string;
  confirmation_evidence?: string;
  requested_date?: string;
  requested_time?: string;
  latest_inbound?: string;
  previous_outbound?: string | null;
  shadow_proposal?: {
    response?: string | null;
    booking_state?: string | null;
    booking_type?: string | null;
    requested_date?: string | null;
    requested_time?: string | null;
  } | null;
};

function validDate(value: unknown) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));
}

function validTime(value: unknown) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value || ''));
}

function contextualReferenceIsCoherent(context: BookingContext) {
  if (context.confirmation_mode !== 'contextual_acceptance') return true;

  if (context.reference_source === 'previous_shadow') {
    const proposal = context.shadow_proposal;
    if (!proposal) return false;
    return Boolean(
      proposal.requested_date &&
      proposal.requested_time &&
      String(proposal.requested_date) === String(context.requested_date || '') &&
      String(proposal.requested_time) === String(context.requested_time || '')
    );
  }

  return context.reference_source === 'production_history';
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
      reason: 'Nenhum agendamento foi identificado pela interpretação semântica nesta mensagem.',
      booking_type: context.booking_type || 'none',
      requested_date: context.requested_date || '',
      requested_time: context.requested_time || '',
      revalidated: false,
      revalidation: null
    };
  }

  if (!context.planner_confirmed) {
    return {
      state: 'WAITING_CONFIRMATION' as BookingGuardState,
      explicit_confirmation: false,
      confirmation_mode: context.confirmation_mode || 'not_confirmed',
      reference_source: context.reference_source || 'none',
      confirmation_evidence: context.confirmation_evidence || '',
      reason: 'A AUTOCAR ainda não interpretou uma autorização inequívoca do cliente para criar o agendamento.',
      booking_type: context.booking_type || 'visit',
      requested_date: context.requested_date || '',
      requested_time: context.requested_time || '',
      revalidated: false,
      revalidation: null
    };
  }

  if (!contextualReferenceIsCoherent(context)) {
    return {
      state: 'WAITING_CONFIRMATION' as BookingGuardState,
      explicit_confirmation: true,
      confirmation_mode: context.confirmation_mode || 'contextual_acceptance',
      reference_source: context.reference_source || 'none',
      confirmation_evidence: context.confirmation_evidence || '',
      reason: 'A AUTOCAR interpretou confirmação, mas o backend não encontrou uma proposta concreta anterior coerente para a referência contextual.',
      booking_type: context.booking_type || 'visit',
      requested_date: context.requested_date || '',
      requested_time: context.requested_time || '',
      revalidated: false,
      revalidation: null
    };
  }

  if (!validDate(context.requested_date) || !validTime(context.requested_time)) {
    return {
      state: 'WAITING_CONFIRMATION' as BookingGuardState,
      explicit_confirmation: true,
      confirmation_mode: context.confirmation_mode || 'explicit_request',
      reference_source: context.reference_source || 'latest_message',
      confirmation_evidence: context.confirmation_evidence || '',
      reason: 'O cliente confirmou a intenção, mas o backend ainda não possui data e horário estruturados suficientes para agendar.',
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
      confirmation_mode: context.confirmation_mode || 'explicit_request',
      reference_source: context.reference_source || 'latest_message',
      confirmation_evidence: context.confirmation_evidence || '',
      reason: 'A AUTOCAR interpretou a confirmação, mas o Calendário foi revalidado e o horário não está mais disponível.',
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
    confirmation_mode: context.confirmation_mode || 'explicit_request',
    reference_source: context.reference_source || 'latest_message',
    confirmation_evidence: context.confirmation_evidence || '',
    reason: 'A AUTOCAR interpretou confirmação inequívoca e o backend revalidou o Calendário imediatamente antes da ação simulada.',
    booking_type: context.booking_type || 'visit',
    requested_date: String(context.requested_date),
    requested_time: String(context.requested_time),
    revalidated: true,
    revalidated_at: new Date().toISOString(),
    revalidation
  };
}
