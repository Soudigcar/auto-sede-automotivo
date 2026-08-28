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

export type AsaasSandboxSafety = {
  enabled: boolean;
  paymentConfirmationEnabled: boolean;
  failureTestEnabled: boolean;
  stage13ActivationEnabled: boolean;
  syntheticStoreId: string;
  failureSyntheticStoreId: string;
  stage13SyntheticStoreId: string;
  syntheticStoreIds: string[];
  previewBaseUrl: string;
  webhookBypassConfigured: boolean;
  errors: string[];
};

export type AsaasCheckoutResult = {
  id: string;
  link: string;
  status: string;
  externalReference: string;
};

export type AsaasCheckoutCustomerData = {
  name: string;
  cpfCnpj: string;
  email: string;
  phone: string;
  address: string;
  addressNumber: number;
  complement?: string;
  province: string;
  postalCode: string;
  city: number;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ASAAS_SANDBOX_CHECKOUT_HOST = 'sandbox.asaas.com';
const ASAAS_WEBHOOK_NAME = 'Auto Controle SaaS DEV';
const ASAAS_WEBHOOK_EVENTS = [
  'CHECKOUT_CREATED',
  'CHECKOUT_PAID',
  'CHECKOUT_CANCELED',
  'CHECKOUT_EXPIRED',
  'SUBSCRIPTION_CREATED',
  'SUBSCRIPTION_UPDATED',
  'SUBSCRIPTION_INACTIVATED',
  'SUBSCRIPTION_DELETED',
  'PAYMENT_CREATED',
  'PAYMENT_UPDATED',
  'PAYMENT_CONFIRMED',
  'PAYMENT_RECEIVED',
  'PAYMENT_CREDIT_CARD_CAPTURE_REFUSED',
  'PAYMENT_OVERDUE',
  'PAYMENT_REFUNDED',
  'PAYMENT_DELETED',
  'PAYMENT_CHARGEBACK_REQUESTED',
  'PAYMENT_CHARGEBACK_DISPUTE'
] as const;

function explicitTrue(value: unknown) {
  return String(value || '').trim().toLowerCase() === 'true';
}

function safePreviewBaseUrl(value: unknown) {
  try {
    const url = new URL(String(value || '').trim());
    if (url.protocol !== 'https:' || !url.hostname.endsWith('.vercel.app')) return '';
    url.pathname = '';
    url.search = '';
    url.hash = '';
    return url.toString().replace(/\/$/, '');
  } catch {
    return '';
  }
}

export function readAsaasSandboxSafety(
  environment: NodeJS.ProcessEnv = process.env
): AsaasSandboxSafety {
  const errors: string[] = [];
  const syntheticStoreId = String(environment.BILLING_ASAAS_SYNTHETIC_STORE_ID || '').trim();
  const failureSyntheticStoreId = String(
    environment.BILLING_ASAAS_FAILURE_SYNTHETIC_STORE_ID || ''
  ).trim();
  const stage13SyntheticStoreId = String(
    environment.BILLING_ASAAS_STAGE13_SYNTHETIC_STORE_ID || ''
  ).trim();
  const failureTestRequested = explicitTrue(
    environment.BILLING_ASAAS_SANDBOX_FAILURE_TEST_ENABLED
  );
  const stage13ActivationRequested = explicitTrue(
    environment.BILLING_PREVIEW_STAGE13_ACTIVATION_ENABLED
  );
  const previewBaseUrl = safePreviewBaseUrl(environment.BILLING_ASAAS_PREVIEW_BASE_URL);
  const webhookBypassConfigured = Boolean(
    String(environment.VERCEL_AUTOMATION_BYPASS_SECRET || '').trim()
  );

  if (String(environment.VERCEL_ENV || '').trim().toLowerCase() !== 'preview') {
    errors.push('A integracao Asaas Sandbox funciona somente no Vercel Preview.');
  }
  if (String(environment.ASAAS_ENV || 'sandbox').trim().toLowerCase() !== 'sandbox') {
    errors.push('A etapa 3 aceita somente ASAAS_ENV=sandbox.');
  }
  if (!UUID_PATTERN.test(syntheticStoreId)) {
    errors.push('A loja sintetica autorizada nao esta configurada.');
  }
  if (failureTestRequested && !UUID_PATTERN.test(failureSyntheticStoreId)) {
    errors.push('A segunda loja sintetica da etapa 5 nao esta configurada.');
  }
  if (failureTestRequested && safeEqual(syntheticStoreId, failureSyntheticStoreId)) {
    errors.push('As lojas sinteticas positiva e negativa devem ser diferentes.');
  }
  if (stage13ActivationRequested && !UUID_PATTERN.test(stage13SyntheticStoreId)) {
    errors.push('A terceira loja sintetica da etapa 13 nao esta configurada.');
  }
  if (
    stage13ActivationRequested
    && [syntheticStoreId, failureSyntheticStoreId].some((value) => (
      UUID_PATTERN.test(value) && safeEqual(value, stage13SyntheticStoreId)
    ))
  ) {
    errors.push('A loja sintetica da etapa 13 deve ser diferente das lojas anteriores.');
  }
  if (!previewBaseUrl) {
    errors.push('A URL base do Preview de billing nao esta configurada com seguranca.');
  }
  if (!webhookBypassConfigured) {
    errors.push('O bypass de automacao do Preview nao esta configurado para o Webhook.');
  }
  if (!explicitTrue(environment.BILLING_ASAAS_SANDBOX_ENABLED)) {
    errors.push('A integracao Asaas Sandbox permanece desabilitada.');
  }

  return {
    enabled: errors.length === 0,
    paymentConfirmationEnabled: errors.length === 0
      && explicitTrue(environment.BILLING_ASAAS_SANDBOX_PAYMENT_CONFIRMATION_ENABLED),
    failureTestEnabled: errors.length === 0 && failureTestRequested,
    stage13ActivationEnabled: errors.length === 0 && stage13ActivationRequested,
    syntheticStoreId,
    failureSyntheticStoreId,
    stage13SyntheticStoreId,
    syntheticStoreIds: [syntheticStoreId, failureSyntheticStoreId, stage13SyntheticStoreId]
      .filter((value, index, values) => UUID_PATTERN.test(value) && values.indexOf(value) === index),
    previewBaseUrl,
    webhookBypassConfigured,
    errors
  };
}

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

function asaasErrorMessage(body: any, fallback: string) {
  const descriptions = Array.isArray(body?.errors)
    ? body.errors
        .map((entry: any) => String(entry?.description || '').trim())
        .filter(Boolean)
        .slice(0, 3)
    : [];
  return descriptions.join(' ') || fallback;
}

async function asaasRequest<T>(
  configuration: AsaasServerConfiguration,
  path: string,
  init: RequestInit,
  fetchImplementation: typeof fetch = fetch
): Promise<T> {
  if (configuration.environment !== 'sandbox') {
    throw Object.assign(new Error('A etapa 3 nao pode chamar o Asaas Production.'), {
      code: 'ASAAS_PRODUCTION_FORBIDDEN'
    });
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetchImplementation(`${configuration.baseUrl}${path}`, {
      ...init,
      headers: {
        ...asaasApiHeaders(configuration),
        ...(init.headers || {})
      },
      cache: 'no-store',
      redirect: 'error',
      signal: controller.signal
    });
    const text = await response.text();
    let body: any = {};
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = {};
      }
    }
    if (!response.ok) {
      throw Object.assign(
        new Error(asaasErrorMessage(body, `O Asaas Sandbox respondeu com HTTP ${response.status}.`)),
        { code: 'ASAAS_API_ERROR', status: response.status }
      );
    }
    return body as T;
  } finally {
    clearTimeout(timeout);
  }
}

export function formatAsaasDateTime(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw new Error('Data de vencimento do trial invalida.');
  }
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day} ${map.hour}:${map.minute}:${map.second}`;
}

export function asaasSandboxCheckoutLink(checkoutId: unknown) {
  const id = String(checkoutId || '').trim();
  if (!UUID_PATTERN.test(id)) return '';
  return `https://${ASAAS_SANDBOX_CHECKOUT_HOST}/checkoutSession/show/${encodeURIComponent(id)}`;
}

function validatedCheckoutLink(value: unknown, checkoutId: string) {
  try {
    const url = new URL(String(value || ''));
    if (url.protocol !== 'https:' || url.hostname !== ASAAS_SANDBOX_CHECKOUT_HOST) {
      throw new Error('Host de Checkout inesperado.');
    }
    return url.toString();
  } catch {
    const fallback = asaasSandboxCheckoutLink(checkoutId);
    if (!fallback) throw new Error('O Asaas Sandbox nao retornou um Checkout valido.');
    return fallback;
  }
}

export async function createAsaasRecurringCheckout(
  configuration: AsaasServerConfiguration,
  input: {
    externalReference: string;
    planName: string;
    amountCents: number;
    includedUsers: number;
    trialEndsAt: string;
    previewBaseUrl: string;
    customerData?: AsaasCheckoutCustomerData;
  },
  fetchImplementation: typeof fetch = fetch
): Promise<AsaasCheckoutResult> {
  const externalReference = String(input.externalReference || '').trim().slice(0, 200);
  const amountCents = Number(input.amountCents || 0);
  const trialEndsAt = new Date(input.trialEndsAt);
  if (!externalReference) throw new Error('Referencia interna da assinatura ausente.');
  if (!Number.isInteger(amountCents) || amountCents !== 149700) {
    throw new Error('O Checkout Sandbox aceita somente o plano Profissional de R$ 1.497.');
  }
  if (!Number.isFinite(trialEndsAt.getTime()) || trialEndsAt.getTime() <= Date.now() + 5 * 60_000) {
    throw new Error('O Checkout deve ser criado antes do termino do trial.');
  }
  const previewBaseUrl = safePreviewBaseUrl(input.previewBaseUrl);
  if (!previewBaseUrl) throw new Error('URL segura do Preview ausente.');
  const customerData = input.customerData
    ? {
        name: String(input.customerData.name || '').trim().replace(/\s+/g, ' ').slice(0, 180),
        cpfCnpj: String(input.customerData.cpfCnpj || '').replace(/\D/g, ''),
        email: String(input.customerData.email || '').trim().toLowerCase().slice(0, 254),
        phone: String(input.customerData.phone || '').replace(/\D/g, ''),
        address: String(input.customerData.address || '').trim().replace(/\s+/g, ' ').slice(0, 255),
        addressNumber: Number(input.customerData.addressNumber),
        complement: String(input.customerData.complement || '').trim().replace(/\s+/g, ' ').slice(0, 255),
        province: String(input.customerData.province || '').trim().replace(/\s+/g, ' ').slice(0, 100),
        postalCode: String(input.customerData.postalCode || '').replace(/\D/g, ''),
        city: Number(input.customerData.city)
      }
    : null;
  if (customerData && (
    customerData.name.length < 3
    || !/^\d{14}$/.test(customerData.cpfCnpj)
    || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerData.email)
    || !/^[1-9]\d{9,10}$/.test(customerData.phone)
    || customerData.address.length < 3
    || !Number.isSafeInteger(customerData.addressNumber)
    || customerData.addressNumber <= 0
    || customerData.province.length < 2
    || !/^\d{8}$/.test(customerData.postalCode)
    || !Number.isSafeInteger(customerData.city)
    || customerData.city <= 0
  )) {
    throw new Error('Os dados pre-preenchidos do Checkout Sandbox sao invalidos.');
  }

  const body = {
    billingTypes: ['CREDIT_CARD'],
    chargeTypes: ['RECURRENT'],
    minutesToExpire: 1440,
    externalReference,
    ...(customerData ? { customerData } : {}),
    callback: {
      successUrl: `${previewBaseUrl}/master/billing?asaas_checkout=success`,
      cancelUrl: `${previewBaseUrl}/master/billing?asaas_checkout=cancelled`,
      expiredUrl: `${previewBaseUrl}/master/billing?asaas_checkout=expired`
    },
    items: [{
      externalReference: 'professional',
      name: String(input.planName || 'Profissional').trim().slice(0, 80),
      description: `Auto Controle Automotivo + I.A AUTOCAR para ate ${input.includedUsers || 5} usuarios`,
      quantity: 1,
      value: amountCents / 100
    }],
    subscription: {
      cycle: 'MONTHLY',
      nextDueDate: formatAsaasDateTime(trialEndsAt)
    }
  };

  const response = await asaasRequest<any>(configuration, '/checkouts', {
    method: 'POST',
    body: JSON.stringify(body)
  }, fetchImplementation);
  const id = String(response?.id || '').trim();
  if (!UUID_PATTERN.test(id)) throw new Error('O Asaas Sandbox retornou um ID de Checkout invalido.');
  return {
    id,
    link: validatedCheckoutLink(response?.link, id),
    status: String(response?.status || 'ACTIVE').trim().slice(0, 40),
    externalReference
  };
}

export async function confirmAsaasSandboxPayment(
  configuration: AsaasServerConfiguration,
  paymentId: string,
  fetchImplementation: typeof fetch = fetch
) {
  const normalizedPaymentId = String(paymentId || '').trim();
  if (!/^pay_[a-z0-9_-]{8,240}$/i.test(normalizedPaymentId)) {
    throw new Error('A cobranca Sandbox possui identificador invalido.');
  }
  const response = await asaasRequest<any>(
    configuration,
    `/sandbox/payment/${encodeURIComponent(normalizedPaymentId)}/confirm`,
    { method: 'POST' },
    fetchImplementation
  );
  const returnedId = String(response?.id || normalizedPaymentId).trim();
  if (returnedId !== normalizedPaymentId) {
    throw new Error('O Asaas Sandbox confirmou uma cobranca diferente da autorizada.');
  }
  return {
    id: returnedId,
    status: String(response?.status || 'CONFIRMED').trim().toUpperCase().slice(0, 80)
  };
}

export async function forceAsaasSandboxPaymentOverdue(
  configuration: AsaasServerConfiguration,
  paymentId: string,
  fetchImplementation: typeof fetch = fetch
) {
  const normalizedPaymentId = String(paymentId || '').trim();
  if (!/^pay_[a-z0-9_-]{8,240}$/i.test(normalizedPaymentId)) {
    throw new Error('A cobranca Sandbox possui identificador invalido.');
  }
  const response = await asaasRequest<any>(
    configuration,
    `/sandbox/payment/${encodeURIComponent(normalizedPaymentId)}/overdue`,
    { method: 'POST' },
    fetchImplementation
  );
  const returnedId = String(response?.id || normalizedPaymentId).trim();
  if (returnedId !== normalizedPaymentId) {
    throw new Error('O Asaas Sandbox alterou uma cobranca diferente da autorizada.');
  }
  return {
    id: returnedId,
    status: String(response?.status || 'OVERDUE').trim().toUpperCase().slice(0, 80)
  };
}

export async function refundAsaasSandboxPayment(
  configuration: AsaasServerConfiguration,
  paymentId: string,
  fetchImplementation: typeof fetch = fetch
) {
  const normalizedPaymentId = String(paymentId || '').trim();
  if (!/^pay_[a-z0-9_-]{8,240}$/i.test(normalizedPaymentId)) {
    throw new Error('A cobranca Sandbox possui identificador invalido.');
  }
  const response = await asaasRequest<any>(
    configuration,
    `/payments/${encodeURIComponent(normalizedPaymentId)}/refund`,
    {
      method: 'POST',
      body: JSON.stringify({ description: 'Homologacao sintetica da etapa 5 em modo observe' })
    },
    fetchImplementation
  );
  const returnedId = String(response?.id || normalizedPaymentId).trim();
  if (returnedId !== normalizedPaymentId) {
    throw new Error('O Asaas Sandbox estornou uma cobranca diferente da autorizada.');
  }
  return {
    id: returnedId,
    status: String(response?.status || 'REFUNDED').trim().toUpperCase().slice(0, 80)
  };
}

function webhookTargetUrl(safety: AsaasSandboxSafety, environment: NodeJS.ProcessEnv) {
  const bypass = String(environment.VERCEL_AUTOMATION_BYPASS_SECRET || '').trim();
  if (!safety.enabled || !bypass) throw new Error(safety.errors[0] || 'Webhook Sandbox indisponivel.');
  const url = new URL('/api/webhooks/asaas', `${safety.previewBaseUrl}/`);
  url.searchParams.set('x-vercel-protection-bypass', bypass);
  return url.toString();
}

const STAGE_FIVE_TEST_EVENTS = new Set([
  'PAYMENT_CREDIT_CARD_CAPTURE_REFUSED',
  'PAYMENT_CHARGEBACK_REQUESTED',
  'PAYMENT_CHARGEBACK_DISPUTE',
  'PAYMENT_CONFIRMED'
]);

export async function deliverAsaasSandboxTestWebhook(
  configuration: AsaasServerConfiguration,
  safety: AsaasSandboxSafety,
  body: any,
  environment: NodeJS.ProcessEnv = process.env,
  fetchImplementation: typeof fetch = fetch
) {
  if (!safety.failureTestEnabled || !configuration.webhookConfigured) {
    throw new Error('A homologacao negativa da etapa 5 permanece desabilitada.');
  }
  const eventId = String(body?.id || '').trim();
  const eventType = String(body?.event || '').trim().toUpperCase();
  const paymentId = String(body?.payment?.id || '').trim();
  const subscriptionId = String(body?.payment?.subscription || '').trim();
  if (
    !/^evt_stage5_[a-z0-9_-]{8,220}$/i.test(eventId)
    || !STAGE_FIVE_TEST_EVENTS.has(eventType)
    || !/^pay_[a-z0-9_-]{8,240}$/i.test(paymentId)
    || !/^sub_[a-z0-9_-]{8,240}$/i.test(subscriptionId)
    || Number(body?.payment?.value) !== 1497
    || String(body?.payment?.billingType || '').toUpperCase() !== 'CREDIT_CARD'
  ) {
    throw new Error('O evento sintetico da etapa 5 nao corresponde ao cenario autorizado.');
  }
  const targetUrl = webhookTargetUrl(safety, environment);
  const response = await fetchImplementation(targetUrl, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      'asaas-access-token': configuration.webhookToken
    },
    body: JSON.stringify(body),
    cache: 'no-store',
    redirect: 'error'
  });
  const text = await response.text();
  let result: any = {};
  if (text) {
    try {
      result = JSON.parse(text);
    } catch {
      result = {};
    }
  }
  if (!response.ok || result?.received !== true) {
    throw new Error(String(result?.error || `O webhook de homologacao respondeu com HTTP ${response.status}.`));
  }
  return {
    duplicate: result.duplicate === true,
    processing_status: String(result.processing_status || '').slice(0, 40)
  };
}

export async function ensureAsaasSandboxWebhook(
  configuration: AsaasServerConfiguration,
  safety: AsaasSandboxSafety,
  environment: NodeJS.ProcessEnv = process.env,
  fetchImplementation: typeof fetch = fetch
) {
  if (!configuration.webhookConfigured) {
    throw new Error(configuration.errors[0] || 'Token do Webhook Asaas nao configurado.');
  }
  const targetUrl = webhookTargetUrl(safety, environment);
  const list = await asaasRequest<any>(configuration, '/webhooks?offset=0&limit=100', {
    method: 'GET'
  }, fetchImplementation);
  const existing = (Array.isArray(list?.data) ? list.data : []).find((entry: any) => (
    String(entry?.name || '').trim() === ASAAS_WEBHOOK_NAME
  ));
  const body = {
    name: ASAAS_WEBHOOK_NAME,
    url: targetUrl,
    email: 'billing-sandbox@example.com',
    enabled: true,
    interrupted: false,
    apiVersion: 3,
    authToken: configuration.webhookToken,
    sendType: 'SEQUENTIALLY',
    events: [...ASAAS_WEBHOOK_EVENTS]
  };
  const id = String(existing?.id || '').trim();
  const result = await asaasRequest<any>(configuration, id ? `/webhooks/${encodeURIComponent(id)}` : '/webhooks', {
    method: id ? 'PUT' : 'POST',
    body: JSON.stringify(body)
  }, fetchImplementation);
  return {
    id: String(result?.id || id || '').trim(),
    created: !id,
    enabled: result?.enabled !== false,
    interrupted: result?.interrupted === true
  };
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
            'confirmedDate', 'nextDueDate', 'cycle', 'billingType', 'customer',
            'subscription', 'externalReference'
          ])
        : null
    }
  };
}
