import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

const EVOLUTION_TIMEOUT_MS = 20_000;
const WEBHOOK_SIGNATURE_HEADER = 'x-auto-controle-evolution-signature';
const VERCEL_PROTECTION_BYPASS_HEADER = 'x-vercel-protection-bypass';
const PRODUCTION_EVOLUTION_WEBHOOK_URL = 'https://sistemaautomotivo.autosede.com.br/api/webhooks/evolution';

type EvolutionRequestOptions = {
  method?: 'GET' | 'POST' | 'DELETE';
  body?: unknown;
};

export type EvolutionWebhookConfig = {
  enabled: boolean;
  url: string;
  headers?: Record<string, string>;
  byEvents: boolean;
  base64: boolean;
  events: string[];
};

export class EvolutionApiError extends Error {
  readonly status: number;
  readonly operation: string;

  constructor(message: string, status: number, operation: string) {
    super(message);
    this.name = 'EvolutionApiError';
    this.status = status;
    this.operation = operation;
  }
}

function requiredEnvironment(name: string) {
  const value = String(process.env[name] || '').trim();
  if (!value) throw new Error(`Variável privada ${name} não configurada no servidor.`);
  return value;
}

function evolutionBaseUrl() {
  return requiredEnvironment('EVOLUTION_API_URL').replace(/\/$/, '');
}

function evolutionApiKey() {
  return requiredEnvironment('EVOLUTION_API_KEY');
}

function webhookSecret() {
  return requiredEnvironment('EVOLUTION_WEBHOOK_SECRET');
}

function vercelProtectionBypassSecret() {
  if (process.env.VERCEL_ENV !== 'preview') return '';
  return requiredEnvironment('VERCEL_AUTOMATION_BYPASS_SECRET');
}

export function evolutionWebhookUrl() {
  if (process.env.VERCEL_ENV === 'production') return PRODUCTION_EVOLUTION_WEBHOOK_URL;
  return requiredEnvironment('EVOLUTION_WEBHOOK_URL').replace(/\/$/, '');
}

function sanitizeProviderMessage(value: unknown) {
  return String(value || '')
    .replace(/https?:\/\/\S+/gi, '[url]')
    .replace(/\b\d{8,}\b/g, '[número]')
    .trim()
    .slice(0, 500);
}

function providerMessages(value: unknown, depth = 0, seen = new Set<object>()): string[] {
  if (depth > 5 || value === null || value === undefined) return [];
  if (typeof value === 'string') {
    const message = sanitizeProviderMessage(value);
    return message && message !== '[object Object]' ? [message] : [];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item) => providerMessages(item, depth + 1, seen));
  }
  if (typeof value !== 'object') return [];
  if (seen.has(value)) return [];
  seen.add(value);

  const record = value as Record<string, unknown>;
  if (record.exists === false) {
    return ['O número informado não foi encontrado no WhatsApp.'];
  }

  const messages: string[] = [];
  for (const key of ['response', 'message', 'detail', 'description', 'reason', 'constraints', 'errors', 'error']) {
    if (!(key in record)) continue;
    if (key === 'constraints' && record[key] && typeof record[key] === 'object' && !Array.isArray(record[key])) {
      for (const constraint of Object.values(record[key] as Record<string, unknown>)) {
        messages.push(...providerMessages(constraint, depth + 1, seen));
      }
      continue;
    }
    messages.push(...providerMessages(record[key], depth + 1, seen));
  }
  return messages;
}

function providerReason(value: unknown, depth = 0, seen = new Set<object>()): string {
  if (depth > 5 || !value || typeof value !== 'object') return '';
  if (seen.has(value)) return '';
  seen.add(value);
  if (Array.isArray(value)) {
    for (const item of value) {
      const reason = providerReason(item, depth + 1, seen);
      if (reason) return reason;
    }
    return '';
  }
  const record = value as Record<string, unknown>;
  if (record.exists === false) return 'recipient_not_found';
  for (const item of Object.values(record)) {
    const reason = providerReason(item, depth + 1, seen);
    if (reason) return reason;
  }
  return '';
}

function evolutionOperation(path: string) {
  return path
    .split('?')[0]
    .split('/')
    .filter(Boolean)
    .slice(0, 2)
    .join('/');
}

function diagnosticValue(value: unknown) {
  if (typeof value !== 'string' && typeof value !== 'number') return undefined;
  const normalized = String(value).trim();
  if (!normalized) return undefined;
  return normalized.replace(/https?:\/\/\S+/gi, '[url]').slice(0, 80);
}

export function evolutionTransportDiagnostic(error: unknown) {
  const root = error && typeof error === 'object' ? error as Record<string, unknown> : {};
  const cause = root.cause && typeof root.cause === 'object'
    ? root.cause as Record<string, unknown>
    : {};

  return {
    error_type: error instanceof Error ? error.name || 'unknown' : 'unknown',
    error_code: diagnosticValue(root.code),
    cause_type: diagnosticValue(cause.name),
    cause_code: diagnosticValue(cause.code),
    cause_errno: diagnosticValue(cause.errno),
    cause_syscall: diagnosticValue(cause.syscall)
  };
}

export function evolutionErrorMessage(result: unknown, status: number) {
  const messages = [...new Set(providerMessages(result))]
    .filter((message) => !/^Bad Request$/i.test(message));
  return messages.join(' ').slice(0, 500) || `Evolution API respondeu com HTTP ${status}.`;
}

function evolutionTransportError(error: unknown, path: string) {
  const operation = evolutionOperation(path);
  const diagnostic = evolutionTransportDiagnostic(error);
  const timeout = diagnostic.error_type === 'TimeoutError' || diagnostic.error_type === 'AbortError';
  const status = timeout ? 504 : 503;
  const message = timeout
    ? 'A Evolution API não respondeu dentro do tempo limite.'
    : 'Não foi possível conectar à Evolution API.';

  console.error('[Evolution API] transport failure', {
    operation,
    status,
    ...diagnostic
  });
  return new EvolutionApiError(message, status, operation);
}

async function parseEvolutionResponse(response: Response, path: string) {
  const raw = await response.text();
  let result: any = {};

  if (raw) {
    try {
      result = JSON.parse(raw);
    } catch {
      result = { message: raw.slice(0, 500) };
    }
  }

  if (!response.ok) {
    const operation = evolutionOperation(path);
    const message = evolutionErrorMessage(result, response.status);
    console.error('[Evolution API] request rejected', {
      operation,
      status: response.status,
      reason: providerReason(result) || 'provider_rejected'
    });
    throw new EvolutionApiError(message, response.status, operation);
  }

  return result;
}

export async function evolutionRequest(path: string, options: EvolutionRequestOptions = {}) {
  try {
    const response = await fetch(`${evolutionBaseUrl()}${path}`, {
      method: options.method || 'GET',
      headers: {
        apikey: evolutionApiKey(),
        'Content-Type': 'application/json'
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      cache: 'no-store',
      signal: AbortSignal.timeout(EVOLUTION_TIMEOUT_MS)
    });

    return parseEvolutionResponse(response, path);
  } catch (error) {
    if (error instanceof EvolutionApiError) throw error;
    throw evolutionTransportError(error, path);
  }
}

export async function evolutionMultipartRequest(path: string, body: FormData) {
  try {
    const response = await fetch(`${evolutionBaseUrl()}${path}`, {
      method: 'POST',
      headers: {
        apikey: evolutionApiKey()
      },
      body,
      cache: 'no-store',
      signal: AbortSignal.timeout(EVOLUTION_TIMEOUT_MS)
    });

    return parseEvolutionResponse(response, path);
  } catch (error) {
    if (error instanceof EvolutionApiError) throw error;
    throw evolutionTransportError(error, path);
  }
}

export function evolutionInstanceName(scopeKey: string) {
  const normalized = scopeKey.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
  if (!normalized) throw new Error('Escopo inválido para criar a instância WhatsApp.');
  return `auto_controle_${normalized}`;
}

export function evolutionWebhookSignature(instanceName: string) {
  return createHmac('sha256', webhookSecret()).update(instanceName).digest('hex');
}

export function verifyEvolutionWebhookSignature(instanceName: string, provided: string) {
  if (!provided) return false;

  const expectedBuffer = Buffer.from(evolutionWebhookSignature(instanceName));
  const providedBuffer = Buffer.from(provided.trim());

  return expectedBuffer.length === providedBuffer.length && timingSafeEqual(expectedBuffer, providedBuffer);
}

export function evolutionWebhookSignatureHeader() {
  return WEBHOOK_SIGNATURE_HEADER;
}

function managedEvolutionWebhook(instanceName: string): EvolutionWebhookConfig {
  const headers: Record<string, string> = {
    [WEBHOOK_SIGNATURE_HEADER]: evolutionWebhookSignature(instanceName)
  };
  const protectionBypassSecret = vercelProtectionBypassSecret();

  if (protectionBypassSecret) {
    headers[VERCEL_PROTECTION_BYPASS_HEADER] = protectionBypassSecret;
  }

  return {
    enabled: true,
    url: evolutionWebhookUrl(),
    byEvents: false,
    base64: false,
    events: ['MESSAGES_UPSERT', 'CONNECTION_UPDATE'],
    headers
  };
}

export function getEvolutionWebhook(instanceName: string) {
  return evolutionRequest(`/webhook/find/${encodeURIComponent(instanceName)}`);
}

export function setEvolutionWebhook(instanceName: string, webhook: EvolutionWebhookConfig) {
  return evolutionRequest(`/webhook/set/${encodeURIComponent(instanceName)}`, {
    method: 'POST',
    body: { webhook }
  });
}

export function storedEvolutionWebhook(result: any): EvolutionWebhookConfig {
  const stored = result?.webhook || result || {};

  return {
    enabled: stored.enabled === true,
    url: cleanWebhookUrl(stored.url),
    byEvents: stored.webhookByEvents === true || stored.byEvents === true,
    base64: stored.webhookBase64 === true || stored.base64 === true,
    events: Array.isArray(stored.events) ? stored.events.map(String) : [],
    headers: stored.headers && typeof stored.headers === 'object' ? stored.headers : {}
  };
}

function cleanWebhookUrl(value: unknown) {
  const url = String(value || '').trim();
  return url || evolutionWebhookUrl();
}

export async function restoreEvolutionWebhook(instanceName: string, previous: any) {
  if (!previous) {
    return setEvolutionWebhook(instanceName, {
      enabled: false,
      url: evolutionWebhookUrl(),
      byEvents: false,
      base64: false,
      events: [],
      headers: {}
    });
  }

  return setEvolutionWebhook(instanceName, storedEvolutionWebhook(previous));
}

export async function configureManagedEvolutionWebhook(instanceName: string) {
  const expected = managedEvolutionWebhook(instanceName);
  await setEvolutionWebhook(instanceName, expected);

  const result = await getEvolutionWebhook(instanceName);
  const configured = result?.webhook || result || {};
  const headers = configured?.headers || {};
  const expectedHeaders = expected.headers || {};
  const headersConfirmed = Object.entries(expectedHeaders)
    .every(([name, value]) => headers[name] === value);

  if (
    configured.enabled !== true ||
    configured.url !== expected.url ||
    !headersConfirmed
  ) {
    throw new Error('A Evolution API não confirmou todos os cabeçalhos protegidos do webhook.');
  }

  return result;
}

export async function createEvolutionInstance(instanceName: string) {
  const instanceToken = randomUUID().replace(/-/g, '');

  return evolutionRequest('/instance/create', {
    method: 'POST',
    body: {
      instanceName,
      token: instanceToken,
      integration: 'WHATSAPP-BAILEYS',
      qrcode: true,
      rejectCall: false,
      groupsIgnore: true,
      alwaysOnline: false,
      readMessages: false,
      readStatus: false,
      syncFullHistory: false,
      webhook: managedEvolutionWebhook(instanceName)
    }
  });
}

export function connectEvolutionInstance(instanceName: string) {
  return evolutionRequest(`/instance/connect/${encodeURIComponent(instanceName)}`);
}

export function getEvolutionConnectionState(instanceName: string) {
  return evolutionRequest(`/instance/connectionState/${encodeURIComponent(instanceName)}`);
}

export function getEvolutionInstance(instanceName: string) {
  return evolutionRequest(`/instance/fetchInstances?instanceName=${encodeURIComponent(instanceName)}`);
}

export function logoutEvolutionInstance(instanceName: string) {
  return evolutionRequest(`/instance/logout/${encodeURIComponent(instanceName)}`, { method: 'DELETE' });
}

export function deleteEvolutionInstance(instanceName: string) {
  return evolutionRequest(`/instance/delete/${encodeURIComponent(instanceName)}`, { method: 'DELETE' });
}

export function sendEvolutionText(instanceName: string, number: string, text: string) {
  return evolutionRequest(`/message/sendText/${encodeURIComponent(instanceName)}`, {
    method: 'POST',
    body: {
      number,
      text,
      delay: 500,
      linkPreview: false
    }
  });
}

export function sendEvolutionLocation(instanceName: string, number: string, location: {
  name: string;
  address: string;
  latitude: number;
  longitude: number;
}) {
  return evolutionRequest(`/message/sendLocation/${encodeURIComponent(instanceName)}`, {
    method: 'POST',
    body: {
      number,
      name: location.name,
      address: location.address,
      latitude: location.latitude,
      longitude: location.longitude,
      delay: 500
    }
  });
}

export async function getEvolutionProfilePictureUrl(instanceName: string, number: string) {
  const normalizedNumber = String(number || '')
    .split('@')[0]
    .split(':')[0]
    .replace(/\D/g, '');

  if (!instanceName || normalizedNumber.length < 8) return null;

  const result = await evolutionRequest(`/chat/fetchProfilePictureUrl/${encodeURIComponent(instanceName)}`, {
    method: 'POST',
    body: { number: normalizedNumber }
  });

  const candidate =
    result?.profilePictureUrl ||
    result?.profilePicUrl ||
    result?.pictureUrl ||
    result?.url ||
    null;

  return candidate ? String(candidate).trim() || null : null;
}
