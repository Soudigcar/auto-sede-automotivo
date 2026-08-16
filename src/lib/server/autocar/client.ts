import { openAiAutocarReadTools } from '@/lib/server/autocar/tools';
import {
  autocarDefaultModel,
  routeAutocarModel,
  type AutocarModelRoutingDecision,
  type AutocarModelTask
} from '@/lib/server/autocar/modelRouter';

export type AutocarResponseRequest = {
  instructions: string;
  input: string | Array<Record<string, unknown>>;
  model?: string;
  maxOutputTokens?: number;
  includeReadTools?: boolean;
  task?: AutocarModelTask;
  confidence?: number | null;
  ambiguous?: boolean;
  risk?: 'normal' | 'high';
};

export type AutocarResponsePayload = {
  payload: any;
  routing: AutocarModelRoutingDecision;
};

function requiredOpenAiKey() {
  const key = String(process.env.OPENAI_API_KEY || '').trim();
  if (!key) throw new Error('OPENAI_API_KEY não disponível no ambiente de execução.');
  return key;
}

function safeProviderMessage(payload: any, status: number) {
  const value = String(payload?.error?.message || `OpenAI respondeu com HTTP ${status}.`).trim();
  return value.slice(0, 500);
}

export function autocarModelName(explicit?: string) {
  return String(explicit || process.env.OPENAI_AUTOCAR_MODEL || process.env.OPENAI_MODEL || autocarDefaultModel('terra')).trim();
}

export function autocarOpenAiConfigured() {
  return Boolean(String(process.env.OPENAI_API_KEY || '').trim());
}

export function resolveAutocarModel(input: {
  task: AutocarModelTask;
  model?: string;
  confidence?: number | null;
  ambiguous?: boolean;
  risk?: 'normal' | 'high';
}) {
  return routeAutocarModel({
    task: input.task,
    explicitModel: input.model,
    confidence: input.confidence,
    ambiguous: input.ambiguous,
    risk: input.risk
  });
}

export async function createAutocarResponse(request: AutocarResponseRequest): Promise<AutocarResponsePayload> {
  const routing = resolveAutocarModel({
    task: request.task || 'commercial_reply',
    model: request.model,
    confidence: request.confidence,
    ambiguous: request.ambiguous,
    risk: request.risk
  });

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${requiredOpenAiKey()}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: routing.model,
      store: false,
      max_output_tokens: Math.max(128, Math.min(Number(request.maxOutputTokens || 1200), 4000)),
      instructions: request.instructions,
      input: request.input,
      ...(request.includeReadTools === false ? {} : { tools: openAiAutocarReadTools() })
    }),
    cache: 'no-store'
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(safeProviderMessage(payload, response.status));
  return { payload, routing };
}
