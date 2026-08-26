export type FollowUpMode = 'off' | 'copilot' | 'autopilot';
export type FollowUpScenarioKey =
  | 'silent_lead'
  | 'simulation_pending'
  | 'vehicle_interest'
  | 'visit_confirmation'
  | 'post_visit'
  | 'no_show'
  | 'callback_requested';

export type FollowUpStep = {
  id: string;
  delayMinutes: number;
  label: string;
  enabled: boolean;
};

export type FollowUpScenario = {
  key: FollowUpScenarioKey;
  title: string;
  description: string;
  enabled: boolean;
  steps: FollowUpStep[];
};

export type FollowUpSettings = {
  enabled: boolean;
  mode: FollowUpMode;
  allowedStart: string;
  allowedEnd: string;
  maxPerLeadPerDay: number;
  maxPerSequence: number;
  maxSequenceDays: number;
  minIntervalMinutes: number;
  cancelOnCustomerReply: true;
  cancelOnSale: true;
  cancelOnHumanTakeover: true;
  cancelOnClosedConversation: true;
};

export type FollowUpConfigV2 = {
  version: 2;
  global: FollowUpSettings;
  scenarios: FollowUpScenario[];
};

export const defaultFollowUpConfigV2: FollowUpConfigV2 = {
  version: 2,
  global: {
    enabled: false,
    mode: 'off',
    allowedStart: '08:00',
    allowedEnd: '20:00',
    maxPerLeadPerDay: 2,
    maxPerSequence: 4,
    maxSequenceDays: 7,
    minIntervalMinutes: 30,
    cancelOnCustomerReply: true,
    cancelOnSale: true,
    cancelOnHumanTakeover: true,
    cancelOnClosedConversation: true
  },
  scenarios: [
    {
      key: 'silent_lead',
      title: 'Lead ficou em silêncio',
      description: 'Retoma quando o cliente para de responder após uma interação comercial elegível.',
      enabled: false,
      steps: [
        { id: 'silent-30m', delayMinutes: 30, label: '30 minutos', enabled: true },
        { id: 'silent-4h', delayMinutes: 240, label: '4 horas', enabled: true },
        { id: 'silent-1d', delayMinutes: 1440, label: '1 dia', enabled: true },
        { id: 'silent-3d', delayMinutes: 4320, label: '3 dias', enabled: false }
      ]
    },
    {
      key: 'simulation_pending',
      title: 'Simulação pendente',
      description: 'Retoma clientes que pediram simulação e não avançaram na conversa.',
      enabled: false,
      steps: [
        { id: 'sim-2h', delayMinutes: 120, label: '2 horas', enabled: true },
        { id: 'sim-1d', delayMinutes: 1440, label: '1 dia', enabled: true }
      ]
    },
    {
      key: 'vehicle_interest',
      title: 'Interesse em veículo',
      description: 'Retoma a conversa usando o veículo de interesse já conhecido pelo contexto.',
      enabled: false,
      steps: [
        { id: 'vehicle-4h', delayMinutes: 240, label: '4 horas', enabled: true },
        { id: 'vehicle-1d', delayMinutes: 1440, label: '1 dia', enabled: true }
      ]
    },
    {
      key: 'visit_confirmation',
      title: 'Confirmar visita',
      description: 'Confirma a visita antes do horário marcado, com ajuste específico para agendamentos no mesmo dia.',
      enabled: false,
      steps: [{ id: 'visit-24h', delayMinutes: -1440, label: '24 horas antes', enabled: true }]
    },
    {
      key: 'post_visit',
      title: 'Pós-visita',
      description: 'Retoma somente quando o CRM comprova comparecimento.',
      enabled: false,
      steps: [{ id: 'post-2h', delayMinutes: 120, label: '2 horas depois', enabled: true }]
    },
    {
      key: 'no_show',
      title: 'Não compareceu',
      description: 'Recupera ausência comprovada e oferece reagendamento.',
      enabled: false,
      steps: [{ id: 'noshow-30m', delayMinutes: 30, label: '30 minutos depois', enabled: true }]
    },
    {
      key: 'callback_requested',
      title: 'Retorno solicitado pelo cliente',
      description: 'Respeita data e hora explicitamente pedidas pelo cliente; nunca inventa horário.',
      enabled: false,
      steps: []
    }
  ]
};

function asTime(value: string) {
  const match = /^(\d{2}):(\d{2})$/.exec(value || '');
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return hour * 60 + minute;
}

export function validateFollowUpConfigV2(config: FollowUpConfigV2) {
  const errors: string[] = [];
  const start = asTime(config.global.allowedStart);
  const end = asTime(config.global.allowedEnd);
  if (start === null || end === null || start >= end) errors.push('Janela de envio inválida.');
  if (config.global.maxPerLeadPerDay < 1 || config.global.maxPerLeadPerDay > 5) errors.push('Máximo diário deve ficar entre 1 e 5.');
  if (config.global.maxPerSequence < 1 || config.global.maxPerSequence > 10) errors.push('Máximo por sequência deve ficar entre 1 e 10.');
  if (config.global.maxSequenceDays < 1 || config.global.maxSequenceDays > 30) errors.push('Duração da sequência deve ficar entre 1 e 30 dias.');
  if (config.global.minIntervalMinutes < 15) errors.push('Intervalo mínimo deve ser de pelo menos 15 minutos.');
  const seen = new Set<string>();
  for (const scenario of config.scenarios) {
    if (seen.has(scenario.key)) errors.push(`Cenário duplicado: ${scenario.key}`);
    seen.add(scenario.key);
    const enabledSteps = scenario.steps.filter((step) => step.enabled);
    if (scenario.enabled && scenario.key !== 'callback_requested' && !enabledSteps.length) errors.push(`${scenario.title}: habilite ao menos uma etapa.`);
    if (enabledSteps.length > config.global.maxPerSequence) errors.push(`${scenario.title}: etapas excedem o limite global por sequência.`);
  }
  return { ok: errors.length === 0, errors };
}

export function clampStoreFollowUpSettings(master: FollowUpSettings, requested: FollowUpSettings): FollowUpSettings {
  return {
    enabled: Boolean(master.enabled && requested.enabled),
    mode: master.mode === 'off' ? 'off' : requested.mode === 'autopilot' && master.mode !== 'autopilot' ? 'copilot' : requested.mode,
    allowedStart: requested.allowedStart < master.allowedStart ? master.allowedStart : requested.allowedStart,
    allowedEnd: requested.allowedEnd > master.allowedEnd ? master.allowedEnd : requested.allowedEnd,
    maxPerLeadPerDay: Math.min(master.maxPerLeadPerDay, requested.maxPerLeadPerDay),
    maxPerSequence: Math.min(master.maxPerSequence, requested.maxPerSequence),
    maxSequenceDays: Math.min(master.maxSequenceDays, requested.maxSequenceDays),
    minIntervalMinutes: Math.max(master.minIntervalMinutes, requested.minIntervalMinutes),
    cancelOnCustomerReply: true,
    cancelOnSale: true,
    cancelOnHumanTakeover: true,
    cancelOnClosedConversation: true
  };
}
