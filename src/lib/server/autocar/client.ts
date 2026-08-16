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

export type AutocarStructuredResponseRequest = Omit<AutocarResponseRequest, 'input'> & {
  input: unknown;
  schemaName: string;
  schema: Record<string, unknown>;
};

export type AutocarResponsePayload = {
  payload: any;
  routing: AutocarModelRoutingDecision;
};

export type AutocarStructuredResponsePayload = AutocarResponsePayload & {
  parsed: any;
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

export function autocarOutputText(payload: any) {
  if (typeof payload?.output_text === 'string' && payload.output_text.trim()) return payload.output_text.trim();
  for (const item of Array.isArray(payload?.output) ? payload.output : []) {
    for (const content of Array.isArray(item?.content) ? item.content : []) {
      if (content?.type === 'output_text' && typeof content.text === 'string' && content.text.trim()) return content.text.trim();
    }
  }
  return '';
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

async function requestAutocarResponse(request: AutocarResponseRequest, extraBody: Record<string, unknown> = {}): Promise<AutocarResponsePayload> {
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
      ...(request.includeReadTools === false ? {} : { tools: openAiAutocarReadTools() }),
      ...extraBody
    }),
    cache: 'no-store'
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(safeProviderMessage(payload, response.status));
  return { payload, routing };
}

export async function createAutocarResponse(request: AutocarResponseRequest): Promise<AutocarResponsePayload> {
  return requestAutocarResponse(request);
}

export async function createAutocarStructuredResponse(request: AutocarStructuredResponseRequest): Promise<AutocarStructuredResponsePayload> {
  const result = await requestAutocarResponse({
    ...request,
    input: JSON.stringify(request.input),
    includeReadTools: false
  }, {
    text: {
      format: {
        type: 'json_schema',
        name: request.schemaName,
        strict: true,
        schema: request.schema
      }
    }
  });

  const text = autocarOutputText(result.payload);
  if (!text) throw new Error(`A OpenAI não retornou ${request.schemaName}.`);

  try {
    return { ...result, parsed: JSON.parse(text) };
  } catch {
    throw new Error(`A resposta estruturada ${request.schemaName} não pôde ser interpretada.`);
  }
}
