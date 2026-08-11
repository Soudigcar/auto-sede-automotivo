import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

const EVOLUTION_TIMEOUT_MS = 20_000;
const WEBHOOK_SIGNATURE_HEADER = 'x-auto-controle-evolution-signature';

type EvolutionRequestOptions = {
  method?: 'GET' | 'POST' | 'DELETE';
  body?: unknown;
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

export function evolutionWebhookUrl() {
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
    throw new Error(safeErrorMessage(result, response.status));
  }

  return result;
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
      webhook: {
        enabled: true,
        url: evolutionWebhookUrl(),
        byEvents: false,
        base64: false,
        events: ['MESSAGES_UPSERT', 'CONNECTION_UPDATE'],
        headers: {
          [WEBHOOK_SIGNATURE_HEADER]: evolutionWebhookSignature(instanceName)
        }
      }
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
