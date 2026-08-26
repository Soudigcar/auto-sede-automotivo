import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { readResponseTextWithLimit } from '@/lib/server/boundedResponse';

const EVOLUTION_TIMEOUT_MS = 20_000;
const WEBHOOK_SIGNATURE_HEADER = 'x-auto-controle-evolution-signature';
const VERCEL_PROTECTION_BYPASS_HEADER = 'x-vercel-protection-bypass';
const PRODUCTION_EVOLUTION_WEBHOOK_URL = 'https://sistemaautomotivo.autosede.com.br/api/webhooks/evolution';

type EvolutionRequestOptions = {
  method?: 'GET' | 'POST' | 'DELETE';
  body?: unknown;
  maxResponseBytes?: number;
};

export type EvolutionWebhookConfig = {
  enabled: boolean;
  url: string;
  headers?: Record<string, string>;
  byEvents: boolean;
  base64: boolean;
  events: string[];
};

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

function safeErrorMessage(result: any, status: number) {
  const candidate =
    result?.response?.message ||
    result?.message ||
    result?.error ||
    `Evolution API respondeu com HTTP ${status}.`;

  if (Array.isArray(candidate)) return candidate.map(String).join(', ').slice(0, 500);
  if (typeof candidate === 'object') return `Evolution API respondeu com HTTP ${status}.`;
  return String(candidate).slice(0, 500);
}

async function parseEvolutionResponse(response: Response, maxResponseBytes?: number) {
  const raw = maxResponseBytes
    ? await readResponseTextWithLimit(response, maxResponseBytes)
    : await response.text();
  let result: any = {};

  if (raw) {
    try {
      result = JSON.parse(raw);
    } catch {
      result = { message: raw.slice(0, 500) };
    }
  }

  if (!response.ok) {
    throw new Error(safeErrorMessage(result, response.status));
  }

  return result;
}

export async function evolutionRequest(path: string, options: EvolutionRequestOptions = {}) {
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

  return parseEvolutionResponse(response, options.maxResponseBytes);
}

export async function evolutionMultipartRequest(path: string, body: FormData) {
  const response = await fetch(`${evolutionBaseUrl()}${path}`, {
    method: 'POST',
    headers: {
      apikey: evolutionApiKey()
    },
    body,
    cache: 'no-store',
    signal: AbortSignal.timeout(EVOLUTION_TIMEOUT_MS)
  });

  return parseEvolutionResponse(response);
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
