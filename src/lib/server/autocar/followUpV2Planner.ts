import type { CommercialJourneyStage, CommercialMemoryV2 } from '@/lib/server/autocar/commercialMemoryV2';

export const AUTOCAR_FOLLOW_UP_V2_VERSION = 'autocar-follow-up-v2-foundation-dry-run';

const delayHoursByStage: Record<CommercialJourneyStage, number> = {
  first_contact: 4,
  discovery: 4,
  qualification: 4,
  vehicle_presentation: 6,
  financing_trade: 8,
  objection: 10,
  scheduling: 4,
  scheduled: 0,
  post_visit: 6,
  negotiation: 8,
  closing: 6,
  won: 0,
  lost: 0,
  unknown: 8
};

export function planAutocarFollowUpV2(input: {
  memory: CommercialMemoryV2 | null;
  lastCustomerMessageAt: string | null;
  lastAutocarMessageAt: string | null;
  leadStatus?: string | null;
  humanState?: string | null;
  optOut?: boolean;
  now?: Date;
}) {
  const now = input.now || new Date();
  const memory = input.memory;
  const stage = memory?.stage || 'unknown';
  const gates = {
    dry_run: true,
    external_execution: false,
    human_state: input.humanState || memory?.human_state || 'unknown',
    lead_status: String(input.leadStatus || ''),
    opt_out: input.optOut === true,
    customer_requested_human: memory?.customer_requested_human === true,
    stage
  };

  if (gates.opt_out) return blocked('Cliente opt-out; nenhum follow-up deve ser planejado.', gates);
  if (gates.customer_requested_human) return blocked('Cliente solicitou humano; automação comercial não deve disputar a conversa.', gates);
  if (gates.human_state && !['unknown', 'autocar_active'].includes(gates.human_state)) {
    return blocked('Conversa está em takeover humano ou pausada.', gates);
  }
  if (['sale_confirmed', 'won', 'lost'].includes(gates.lead_status) || ['won', 'lost'].includes(stage)) {
    return blocked('Lead encerrado para follow-up comercial automático.', gates);
  }
  if (stage === 'scheduled') {
    return blocked('Lead agendado deve seguir fluxo específico de confirmação de visita, não reengajamento genérico.', gates);
  }

  const lastCustomer = input.lastCustomerMessageAt ? new Date(input.lastCustomerMessageAt) : null;
  const lastAutocar = input.lastAutocarMessageAt ? new Date(input.lastAutocarMessageAt) : null;
  if (!lastCustomer || Number.isNaN(lastCustomer.getTime()) || !lastAutocar || Number.isNaN(lastAutocar.getTime())) {
    return blocked('Histórico temporal insuficiente para planejar follow-up.', gates);
  }
  if (lastCustomer.getTime() > lastAutocar.getTime()) {
    return blocked('Existe mensagem do cliente posterior à última resposta AUTOCAR; atendimento deve responder antes de qualquer follow-up.', gates);
  }

  const delayHours = delayHoursByStage[stage];
  if (!delayHours) return blocked('Etapa não elegível para reengajamento automático.', gates);
  const dueAt = new Date(lastAutocar.getTime() + delayHours * 60 * 60 * 1000);
  const due = now.getTime() >= dueAt.getTime();

  return {
    version: AUTOCAR_FOLLOW_UP_V2_VERSION,
    decision: due ? 'would_plan' : 'not_due',
    reason: due
      ? `Lead elegível para retomada contextual da etapa ${stage}.`
      : `Aguardar a janela mínima de ${delayHours}h da etapa ${stage}.`,
    due_at: dueAt.toISOString(),
    delay_hours: delayHours,
    suggested_objective: memory?.next_best_action || `Retomar a conversa a partir da etapa ${stage}, sem mensagem genérica.`,
    gates,
    external_execution: false
  } as const;
}

function blocked(reason: string, gates: Record<string, unknown>) {
  return {
    version: AUTOCAR_FOLLOW_UP_V2_VERSION,
    decision: 'blocked' as const,
    reason,
    due_at: null,
    delay_hours: null,
    suggested_objective: null,
    gates,
    external_execution: false
  };
}
