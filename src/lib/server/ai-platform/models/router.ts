import { aiPlatformDefaultModel } from '@/lib/server/ai-platform/models/registry';
import type {
  AiModelLane,
  AiModelRisk,
  AiModelRoutingDecision,
  AiModelRoutingInput,
  AiModelTask
} from '@/lib/server/ai-platform/models/types';

function normalizedConfidence(value: unknown) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.max(0, Math.min(number, 1));
}

function defaultLane(task: AiModelTask): AiModelLane {
  if (task === 'semantic_extraction' || task === 'operational_planning') return 'luna';
  if (task === 'escalation') return 'sol';
  return 'terra';
}

export function routeAiModel(input: AiModelRoutingInput): AiModelRoutingDecision {
  const confidence = normalizedConfidence(input.confidence);
  const ambiguous = input.ambiguous === true;
  const risk: AiModelRisk = input.risk === 'high' ? 'high' : 'normal';

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
  const model = explicitModel || aiPlatformDefaultModel(lane);
  if (explicitModel) reason = `${reason} Modelo explícito preservado pelo chamador.`;

  return {
    version: 'ai-platform-model-router-v1',
    agent: input.agent,
    task: input.task,
    lane,
    model,
    reason,
    escalated: lane === 'sol',
    signals: { confidence, ambiguous, risk }
  };
}
