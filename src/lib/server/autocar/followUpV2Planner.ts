import type { CommercialJourneyStage, CommercialMemoryV2 } from '@/lib/server/autocar/commercialMemoryV2';
import {
  defaultFollowUpConfigV2,
  validateFollowUpConfigV2,
  type FollowUpConfigV2,
  type FollowUpScenarioKey
} from '@/lib/server/autocar/smartFollowUpV2';

export const AUTOCAR_FOLLOW_UP_V2_VERSION = 'autocar-follow-up-v2-integrated-dry-run';

const scenarioByStage: Partial<Record<CommercialJourneyStage, FollowUpScenarioKey>> = {
  first_contact: 'silent_lead',
  discovery: 'silent_lead',
  qualification: 'silent_lead',
  vehicle_presentation: 'vehicle_interest',
  financing_trade: 'simulation_pending',
  objection: 'silent_lead',
  scheduling: 'silent_lead',
  post_visit: 'post_visit',
  negotiation: 'silent_lead',
  closing: 'silent_lead',
  unknown: 'silent_lead'
};

export function planAutocarFollowUpV2(input: {
  memory: CommercialMemoryV2 | null;
  lastCustomerMessageAt: string | null;
  lastAutocarMessageAt: string | null;
  leadStatus?: string | null;
  humanState?: string | null;
  optOut?: boolean;
  effectiveConfig?: FollowUpConfigV2 | null;
  scenarioKey?: FollowUpScenarioKey | null;
  now?: Date;
}) {
  const now = input.now || new Date();
  const memory = input.memory;
  const stage = memory?.stage || 'unknown';
  const config = input.effectiveConfig || defaultFollowUpConfigV2;
  const validation = validateFollowUpConfigV2(config);
  const scenarioKey = input.scenarioKey || scenarioByStage[stage] || null;
  const gates = {
    dry_run: true,
    external_execution: false,
    human_state: input.humanState || memory?.human_state || 'unknown',
    lead_status: String(input.leadStatus || ''),
    opt_out: input.optOut === true,
    customer_requested_human: memory?.customer_requested_human === true,
    stage,
    scenario_key: scenarioKey,
    config_version: config.version,
    config_valid: validation.ok,
    config_enabled: config.global.enabled,
    config_mode: config.global.mode
  };

  if (!validation.ok) return blocked(`Configuração efetiva inválida: ${validation.errors.join(' ')}`, gates);
  if (!config.global.enabled || config.global.mode === 'off') return blocked('Smart Follow-up está desabilitado na configuração efetiva.', gates);
  if (gates.opt_out) return blocked('Cliente opt-out; nenhum follow-up deve ser planejado.', gates);
  if (gates.customer_requested_human) return blocked('Cliente solicitou humano; automação comercial não deve disputar a conversa.', gates);
  if (gates.human_state && !['unknown', 'autocar_active'].includes(gates.human_state)) {
    return blocked('Conversa está em takeover humano ou pausada.', gates);
  }
  if (['sale_confirmed', 'won', 'lost'].includes(gates.lead_status) || ['won', 'lost'].includes(stage)) {
    return blocked('Lead encerrado para follow-up comercial automático.', gates);
  }
  if (stage === 'scheduled' && scenarioKey !== 'visit_confirmation') {
    return blocked('Lead agendado deve seguir confirmação de visita, não reengajamento genérico.', gates);
  }
  if (!scenarioKey) return blocked('Etapa sem cenário de follow-up elegível.', gates);

  const scenario = config.scenarios.find((item) => item.key === scenarioKey);
  if (!scenario?.enabled) return blocked(`Cenário ${scenarioKey} está desabilitado na configuração efetiva.`, gates);

  const lastCustomer = input.lastCustomerMessageAt ? new Date(input.lastCustomerMessageAt) : null;
  const lastAutocar = input.lastAutocarMessageAt ? new Date(input.lastAutocarMessageAt) : null;
  if (!lastCustomer || Number.isNaN(lastCustomer.getTime()) || !lastAutocar || Number.isNaN(lastAutocar.getTime())) {
    return blocked('Histórico temporal insuficiente para planejar follow-up.', gates);
  }
  if (lastCustomer.getTime() > lastAutocar.getTime()) {
    return blocked('Existe mensagem do cliente posterior à última resposta AUTOCAR; atendimento deve responder antes de qualquer follow-up.', gates);
  }

  const step = scenario.steps.filter((item) => item.enabled && item.delayMinutes >= 0).sort((a, b) => a.delayMinutes - b.delayMinutes)[0];
  if (!step) return blocked('Cenário exige agenda específica ou não possui etapa automática positiva elegível.', gates);

  const dueAt = new Date(lastAutocar.getTime() + step.delayMinutes * 60_000);
  const due = now.getTime() >= dueAt.getTime();

  return {
    version: AUTOCAR_FOLLOW_UP_V2_VERSION,
    decision: due ? 'would_plan' : 'not_due',
    reason: due
      ? `Lead elegível pelo cenário ${scenarioKey} e pela configuração efetiva.`
      : `Aguardar a etapa configurada ${step.label} do cenário ${scenarioKey}.`,
    due_at: dueAt.toISOString(),
    delay_minutes: step.delayMinutes,
    step_id: step.id,
    scenario_key: scenarioKey,
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
    delay_minutes: null,
    step_id: null,
    scenario_key: gates.scenario_key || null,
    suggested_objective: null,
    gates,
    external_execution: false
  };
}
