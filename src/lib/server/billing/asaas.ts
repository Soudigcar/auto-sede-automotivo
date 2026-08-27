import { safeEqual } from '@/lib/server/requestSecurity';

export type AsaasEnvironment = 'sandbox' | 'production';

const ASAAS_BASE_URLS: Record<AsaasEnvironment, string> = {
  sandbox: 'https://api-sandbox.asaas.com/v3',
  production: 'https://api.asaas.com/v3'
};

export type AsaasServerConfiguration = {
  environment: AsaasEnvironment;
  baseUrl: string;
  apiKey: string;
  webhookToken: string;
  apiConfigured: boolean;
  webhookConfigured: boolean;
  errors: string[];
};

export function readAsaasServerConfiguration(
  environment: NodeJS.ProcessEnv = process.env
): AsaasServerConfiguration {
  const selected = String(environment.ASAAS_ENV || 'sandbox').trim().toLowerCase();
  const asaasEnvironment: AsaasEnvironment = selected === 'production' ? 'production' : 'sandbox';
  const apiKey = String(environment.ASAAS_API_KEY || '').trim();
  const webhookToken = String(environment.ASAAS_WEBHOOK_TOKEN || '').trim();
  const errors: string[] = [];

  if (selected && selected !== 'sandbox' && selected !== 'production') {
    errors.push('ASAAS_ENV deve ser sandbox ou production.');
  }
  if (asaasEnvironment === 'sandbox' && apiKey.startsWith('$aact_prod_')) {
    errors.push('A chave de Production nao pode ser usada no Sandbox.');
  }
  if (asaasEnvironment === 'production' && apiKey.startsWith('$aact_hmlg_')) {
    errors.push('A chave de Sandbox nao pode ser usada em Production.');
  }
  if (webhookToken && (webhookToken.length < 32 || webhookToken.length > 255 || /\s/.test(webhookToken))) {
    errors.push('ASAAS_WEBHOOK_TOKEN deve ter entre 32 e 255 caracteres e nao conter espacos.');
  }
  if (apiKey && webhookToken && safeEqual(apiKey, webhookToken)) {
    errors.push('O token do Webhook deve ser diferente da API Key do Asaas.');
  }

  return {
    environment: asaasEnvironment,
    baseUrl: ASAAS_BASE_URLS[asaasEnvironment],
    apiKey,
    webhookToken,
    apiConfigured: Boolean(apiKey) && errors.length === 0,
    webhookConfigured: Boolean(webhookToken) && errors.length === 0,
    errors
  };
}

export function asaasApiHeaders(configuration: AsaasServerConfiguration) {
  if (!configuration.apiConfigured) {
    throw new Error(configuration.errors[0] || 'API do Asaas nao configurada no servidor.');
  }
  return {
    accept: 'application/json',
    'content-type': 'application/json',
    access_token: configuration.apiKey,
    'user-agent': 'AutoControleAutomotivo/1.0'
  };
}

export function isAuthorizedAsaasWebhook(request: Request, configuration = readAsaasServerConfiguration()) {
  if (!configuration.webhookConfigured) return false;
  return safeEqual(request.headers.get('asaas-access-token'), configuration.webhookToken);
}

function pick(source: any, keys: string[]) {
  return Object.fromEntries(keys.filter((key) => source?.[key] !== undefined).map((key) => [key, source[key]]));
}

export function minimalAsaasWebhookPayload(body: any) {
  const objectEntry = ['payment', 'subscription', 'checkout']
    .map((key) => [key, body?.[key]] as const)
    .find(([, value]) => value && typeof value === 'object');
  const [objectType, objectValue] = objectEntry || [null, null];

  return {
    provider_event_id: String(body?.id || '').trim().slice(0, 240),
    event_type: String(body?.event || '').trim().slice(0, 160),
    provider_object_type: objectType,
    provider_object_id: objectValue ? String(objectValue.id || '').trim().slice(0, 240) || null : null,
    payload: {
      id: String(body?.id || '').trim().slice(0, 240),
      event: String(body?.event || '').trim().slice(0, 160),
      dateCreated: body?.dateCreated || null,
      account: pick(body?.account, ['id', 'ownerId']),
      object: objectValue
        ? pick(objectValue, [
            'id', 'object', 'status', 'value', 'netValue', 'dueDate', 'paymentDate',
            'billingType', 'customer', 'subscription', 'externalReference'
          ])
        : null
    }
  };
}
