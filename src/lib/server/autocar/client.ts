import { openAiAutocarReadTools } from '@/lib/server/autocar/tools';

export type AutocarResponseRequest = {
  instructions: string;
  input: string | Array<Record<string, unknown>>;
  model?: string;
  maxOutputTokens?: number;
  includeReadTools?: boolean;
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
  return String(explicit || process.env.OPENAI_AUTOCAR_MODEL || process.env.OPENAI_MODEL || 'gpt-5').trim();
}

export function autocarOpenAiConfigured() {
  return Boolean(String(process.env.OPENAI_API_KEY || '').trim());
}

export async function createAutocarResponse(request: AutocarResponseRequest) {
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${requiredOpenAiKey()}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: autocarModelName(request.model),
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
  return payload;
}
