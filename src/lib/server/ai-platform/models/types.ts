export type AiModelLane = 'luna' | 'terra' | 'sol';

export type AiModelTask =
  | 'semantic_extraction'
  | 'operational_planning'
  | 'commercial_reply'
  | 'commercial_followup'
  | 'post_action_confirmation'
  | 'escalation';

export type AiModelRisk = 'normal' | 'high';

export type AiModelRoutingInput = {
  agent: 'autocar';
  task: AiModelTask;
  confidence?: number | null;
  ambiguous?: boolean;
  risk?: AiModelRisk;
  explicitModel?: string | null;
};

export type AiModelRoutingDecision = {
  version: 'ai-platform-model-router-v1';
  agent: 'autocar';
  task: AiModelTask;
  lane: AiModelLane;
  model: string;
  reason: string;
  escalated: boolean;
  signals: {
    confidence: number | null;
    ambiguous: boolean;
    risk: AiModelRisk;
  };
};
