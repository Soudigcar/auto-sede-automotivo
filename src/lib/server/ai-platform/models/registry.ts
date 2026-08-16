import type { AiModelLane } from '@/lib/server/ai-platform/models/types';

const DEFAULT_MODELS: Record<AiModelLane, string> = {
  luna: 'gpt-5.6-luna',
  terra: 'gpt-5.6-terra',
  sol: 'gpt-5.6-sol'
};

export function aiPlatformDefaultModel(lane: AiModelLane) {
  const override = lane === 'luna'
    ? process.env.OPENAI_AUTOCAR_LUNA_MODEL
    : lane === 'terra'
      ? process.env.OPENAI_AUTOCAR_TERRA_MODEL || process.env.OPENAI_AUTOCAR_MODEL
      : process.env.OPENAI_AUTOCAR_SOL_MODEL;

  return String(override || DEFAULT_MODELS[lane]).trim();
}

export function aiPlatformModelRegistry() {
  return {
    version: 'ai-platform-model-registry-v1' as const,
    lanes: {
      luna: { model: aiPlatformDefaultModel('luna'), role: 'structured_and_operational' },
      terra: { model: aiPlatformDefaultModel('terra'), role: 'commercial_primary' },
      sol: { model: aiPlatformDefaultModel('sol'), role: 'selective_escalation' }
    }
  };
}
