import { aiPlatformDefaultModel } from '@/lib/server/ai-platform/models/registry';
import { routeAiModel } from '@/lib/server/ai-platform/models/router';
import type {
  AiModelLane,
  AiModelRisk,
  AiModelTask
} from '@/lib/server/ai-platform/models/types';

export type AutocarModelLane = AiModelLane;
export type AutocarModelTask = AiModelTask;
export type AutocarModelRisk = AiModelRisk;

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

export function routeAutocarModel(input: AutocarModelRoutingInput): AutocarModelRoutingDecision {
  const decision = routeAiModel({
    agent: 'autocar',
    task: input.task,
    confidence: input.confidence,
    ambiguous: input.ambiguous,
    risk: input.risk,
    explicitModel: input.explicitModel
  });

  return {
    version: 'autocar-model-router-v1',
    task: decision.task,
    lane: decision.lane,
    model: decision.model,
    reason: decision.reason,
    escalated: decision.escalated,
    signals: decision.signals
  };
}

export function autocarDefaultModel(lane: AutocarModelLane) {
  return aiPlatformDefaultModel(lane);
}
