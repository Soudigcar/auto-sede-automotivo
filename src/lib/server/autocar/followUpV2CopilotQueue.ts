import { createHash } from 'node:crypto';
import type { FollowUpConfigV2, FollowUpMode, FollowUpScenarioKey } from '@/lib/server/autocar/smartFollowUpV2';
import { looksLikeNonLeadAutomation } from '@/lib/server/autocar/followUpV2ContextualReopening';

export const FOLLOW_UP_COPILOT_ELIGIBLE_SCENARIOS = [
  'silent_lead',
  'simulation_pending',
  'vehicle_interest'
] as const satisfies readonly FollowUpScenarioKey[];

export type FollowUpCopilotCandidate = {
  conversation_id: string;
  lead_id: string | null;
  customer_name: string;
  interested_vehicle: string | null;
  scenario_key: (typeof FOLLOW_UP_COPILOT_ELIGIBLE_SCENARIOS)[number];
  step_id: string;
  step_label: string;
  due_at: string;
  last_customer_message_at: string;
  last_store_message_at: string;
  idempotency_key: string;
};

function dateValue(value: unknown) {
  const parsed = value ? new Date(String(value)) : null;
  return parsed && !Number.isNaN(parsed.getTime()) ? parsed : null;
}

function closedLeadStatus(value: unknown) {
  const status = String(value || '').trim().toLowerCase();
  return ['won', 'lost', 'sale_confirmed', 'sold', 'closed', 'cancelled'].includes(status);
}

function scenarioForLead(lead: any, commercial: any): FollowUpCopilotCandidate['scenario_key'] | null {
  if (lead?.scheduled_at) return null;
  const payment = String(commercial?.payment_type || '').toLowerCase();
  const financingEvidence = payment.includes('financ')
    || commercial?.financed_amount != null
    || commercial?.installment_value != null
    || commercial?.installment_count != null
    || Boolean(commercial?.financing_bank);
  if (financingEvidence) return 'simulation_pending';
  if (lead?.interested_vehicle_id || String(lead?.interested_vehicle || '').trim()) return 'vehicle_interest';
  return 'silent_lead';
}

export function withinFollowUpAllowedWindow(config: FollowUpConfigV2, now: Date) {
  const current = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).format(now);
  return current >= config.global.allowedStart && current <= config.global.allowedEnd;
}

export function evaluateFollowUpCopilotCandidate(input: {
  config: FollowUpConfigV2;
  conversation: any;
  lead: any | null;
  commercial: any | null;
  runtimeConversation: any | null;
  messages: any[];
  now?: Date;
  requiredMode?: Extract<FollowUpMode, 'copilot' | 'autopilot'>;
}): { candidate: FollowUpCopilotCandidate | null; reason: string } {
  const now = input.now || new Date();
  const requiredMode = input.requiredMode || 'copilot';
  const { config, conversation, lead, commercial, runtimeConversation } = input;

  if (!config.global.enabled || config.global.mode !== requiredMode) {
    return { candidate: null, reason: `Follow-up efetivo não está em ${requiredMode.toUpperCase()}.` };
  }
  if (!withinFollowUpAllowedWindow(config, now)) {
    return { candidate: null, reason: 'Fora da janela permitida do Follow-up.' };
  }
  if (String(conversation?.status || '').toLowerCase() !== 'open') {
    return { candidate: null, reason: 'Conversa não está aberta.' };
  }
  if (runtimeConversation?.human_state !== 'autocar_active') {
    return { candidate: null, reason: 'Conversa está sob controle humano, pausada ou sem estado AUTOCAR seguro.' };
  }
  if (!lead || closedLeadStatus(lead.status)) {
    return { candidate: null, reason: 'Lead ausente ou encerrado.' };
  }
  if (looksLikeNonLeadAutomation(input.messages || [])) {
    return { candidate: null, reason: 'Conversa parece automação promocional/contato indevido e não é elegível para Follow-up comercial.' };
  }

  const ordered = [...(input.messages || [])]
    .map((message) => ({ ...message, _at: dateValue(message.sent_at || message.created_at) }))
    .filter((message) => message._at)
    .sort((a, b) => b._at.getTime() - a._at.getTime());
  const latest = ordered[0];
  const latestInbound = ordered.find((message) => String(message.direction) === 'inbound');
  const latestOutbound = ordered.find((message) => String(message.direction) === 'outbound');
  if (!latestInbound || !latestOutbound) {
    return { candidate: null, reason: 'Histórico insuficiente para follow-up seguro.' };
  }
  if (String(latest?.direction) !== 'outbound') {
    return { candidate: null, reason: 'A última mensagem é do cliente; atendimento deve responder antes do Follow-up.' };
  }
  if (latestInbound._at.getTime() > latestOutbound._at.getTime()) {
    return { candidate: null, reason: 'Cliente respondeu depois da última mensagem da loja.' };
  }

  const scenarioKey = scenarioForLead(lead, commercial);
  if (!scenarioKey || !FOLLOW_UP_COPILOT_ELIGIBLE_SCENARIOS.includes(scenarioKey)) {
    return { candidate: null, reason: 'Cenário exige fato operacional ainda não elegível para varredura automática.' };
  }
  const scenario = config.scenarios.find((row) => row.key === scenarioKey);
  if (!scenario?.enabled) return { candidate: null, reason: 'Jornada desabilitada na configuração efetiva.' };
  const step = scenario.steps
    .filter((row) => row.enabled && row.delayMinutes >= 0)
    .sort((a, b) => a.delayMinutes - b.delayMinutes)[0];
  if (!step) return { candidate: null, reason: 'Jornada sem etapa positiva habilitada.' };

  const dueAt = new Date(latestOutbound._at.getTime() + step.delayMinutes * 60_000);
  if (now.getTime() < dueAt.getTime()) return { candidate: null, reason: 'Follow-up ainda não venceu.' };

  const rawKey = ['contextual-reopening-v2', requiredMode, conversation.id, scenarioKey, step.id, latestOutbound._at.toISOString()].join(':');
  return {
    reason: requiredMode === 'autopilot'
      ? 'Elegível para revalidação AUTOPILOT antes do envio.'
      : 'Elegível para rascunho COPILOT com revisão humana.',
    candidate: {
      conversation_id: String(conversation.id),
      lead_id: lead?.id ? String(lead.id) : null,
      customer_name: String(lead?.customer_name || 'Cliente'),
      interested_vehicle: String(lead?.interested_vehicle || '').trim() || null,
      scenario_key: scenarioKey,
      step_id: String(step.id),
      step_label: String(step.label || ''),
      due_at: dueAt.toISOString(),
      last_customer_message_at: latestInbound._at.toISOString(),
      last_store_message_at: latestOutbound._at.toISOString(),
      idempotency_key: createHash('sha256').update(rawKey).digest('hex')
    }
  };
}
