export type AutocarModelLane = 'luna' | 'terra' | 'sol';

export type AutocarModelTask =
  | 'semantic_extraction'
  | 'operational_planning'
  | 'commercial_reply'
  | 'commercial_followup'
  | 'post_action_confirmation'
  | 'escalation';

export type AutocarModelRisk = 'normal' | 'high';

export type AutocarModelRoutingInput = {
  task: AutocarModelTask;
  confidence?: number | null;
  ambiguous?: boolean;
  risk?: AutocarModelRisk;
  explicitModel?: string | null;
};

export type AutocarModelRoutingDecision = {
  version: 'autocar-model-router-v1';
  task: AutocarModelTask;
  lane: AutocarModelLane;
  model: string;
  reason: string;
  escalated: boolean;
  signals: {
    confidence: number | null;
    ambiguous: boolean;
    risk: AutocarModelRisk;
  };
};

const DEFAULT_MODELS: Record<AutocarModelLane, string> = {
  luna: 'gpt-5.6-luna',
  terra: 'gpt-5.6-terra',
  sol: 'gpt-5.6-sol'
};

function envModel(lane: AutocarModelLane) {
  const laneOverride = lane === 'luna'
    ? process.env.OPENAI_AUTOCAR_LUNA_MODEL
    : lane === 'terra'
      ? process.env.OPENAI_AUTOCAR_TERRA_MODEL || process.env.OPENAI_AUTOCAR_MODEL
      : process.env.OPENAI_AUTOCAR_SOL_MODEL;

  return String(laneOverride || DEFAULT_MODELS[lane]).trim();
}

function normalizedConfidence(value: unknown) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.max(0, Math.min(number, 1));
}

function defaultLane(task: AutocarModelTask): AutocarModelLane {
  if (task === 'semantic_extraction' || task === 'operational_planning') return 'luna';
  if (task === 'escalation') return 'sol';
  return 'terra';
}

export function routeAutocarModel(input: AutocarModelRoutingInput): AutocarModelRoutingDecision {
  const confidence = normalizedConfidence(input.confidence);
  const ambiguous = input.ambiguous === true;
  const risk: AutocarModelRisk = input.risk === 'high' ? 'high' : 'normal';

  let lane = defaultLane(input.task);
  let reason = lane === 'luna'
    ? 'Tarefa estruturada/repetitiva roteada para Luna.'
    : lane === 'terra'
      ? 'Conversa comercial principal roteada para Terra.'
      : 'Escalada explícita roteada para Sol.';

  if (input.task !== 'escalation' && (risk === 'high' || ambiguous || (confidence !== null && confidence < 0.55))) {
    lane = 'sol';
    reason = risk === 'high'
      ? 'Caso de maior risco de raciocínio escalado para Sol.'
      : ambiguous
        ? 'Ambiguidade relevante escalada para Sol.'
        : 'Baixa confiança de interpretação escalada para Sol.';
  }

  const explicitModel = String(input.explicitModel || '').trim();
  const model = explicitModel || envModel(lane);
  if (explicitModel) reason = `${reason} Modelo explícito preservado pelo chamador.`;

  return {
    version: 'autocar-model-router-v1',
    task: input.task,
    lane,
    model,
    reason,
    escalated: lane === 'sol',
    signals: { confidence, ambiguous, risk }
  };
}

export function autocarDefaultModel(lane: AutocarModelLane) {
  return envModel(lane);
}
