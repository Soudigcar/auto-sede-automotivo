const PRODUCTION_PROJECT_REF = 'wufikrdgyxrsszlbpfmv';
const PRODUCTION_WEBHOOK_HOST = 'www.autocontroleautomotivo.com.br';

export type BackfillEnvironment = 'development' | 'production';

export type BackfillConfig = {
  environment: BackfillEnvironment;
  sharedSecret: string;
  appSecret: string;
  webhookUrl: string;
  projectRef: string;
};

type EnvironmentReader = (name: string) => string | undefined;

export function clean(value: unknown) {
  return String(value ?? '').trim();
}

function required(read: EnvironmentReader, name: string) {
  const value = clean(read(name));
  if (!value) throw new Error(`missing_environment:${name}`);
  return value;
}

export function projectRefFromSupabaseUrl(value: string) {
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    return hostname.endsWith('.supabase.co') ? hostname.split('.')[0] : '';
  } catch {
    return '';
  }
}

export function resolveBackfillConfig(read: EnvironmentReader): BackfillConfig {
  const environment = required(read, 'META_LEADS_BACKFILL_ENV').toLowerCase();
  if (environment !== 'development' && environment !== 'production') {
    throw new Error('invalid_environment:META_LEADS_BACKFILL_ENV');
  }

  const supabaseUrl = required(read, 'SUPABASE_URL');
  const projectRef = projectRefFromSupabaseUrl(supabaseUrl);
  if (!projectRef) throw new Error('invalid_environment:SUPABASE_URL');

  const sharedSecret = required(read, 'META_LEADS_BACKFILL_KEY');
  if (sharedSecret.length < 32) throw new Error('weak_environment:META_LEADS_BACKFILL_KEY');

  const appSecret = required(read, 'META_APP_SECRET');
  if (appSecret.length < 16) throw new Error('weak_environment:META_APP_SECRET');

  const webhookUrl = required(read, 'META_LEADS_BACKFILL_WEBHOOK_URL');
  const allowedHost = required(read, 'META_LEADS_BACKFILL_ALLOWED_HOST').toLowerCase();
  let target: URL;
  try {
    target = new URL(webhookUrl);
  } catch {
    throw new Error('invalid_environment:META_LEADS_BACKFILL_WEBHOOK_URL');
  }

  if (
    target.protocol !== 'https:' ||
    target.username ||
    target.password ||
    target.hostname.toLowerCase() !== allowedHost ||
    target.pathname !== '/api/webhooks/meta-leads' ||
    target.search ||
    target.hash
  ) {
    throw new Error('unsafe_environment:META_LEADS_BACKFILL_WEBHOOK_URL');
  }

  const targetsProduction = target.hostname.toLowerCase() === PRODUCTION_WEBHOOK_HOST;
  const runsInProduction = projectRef === PRODUCTION_PROJECT_REF;
  if (environment === 'production' && (!runsInProduction || !targetsProduction)) {
    throw new Error('environment_mismatch:production');
  }
  if (environment === 'development' && (runsInProduction || targetsProduction)) {
    throw new Error('environment_mismatch:development');
  }

  return {
    environment,
    sharedSecret,
    appSecret,
    webhookUrl: target.toString(),
    projectRef
  };
}

async function sha256(value: string) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
}

export async function safeSecretEqual(provided: string, expected: string) {
  const [left, right] = await Promise.all([sha256(provided), sha256(expected)]);
  let difference = left.length ^ right.length;
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    difference |= (left[index] ?? 0) ^ (right[index] ?? 0);
  }
  return difference === 0;
}

export async function signMetaPayload(rawBody: string, appSecret: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(appSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody)));
  return `sha256=${Array.from(signature, (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

export function commitWasExplicitlyRequested(request: Request) {
  const url = new URL(request.url);
  return url.searchParams.get('commit') === '1' && clean(request.headers.get('x-backfill-mode')).toLowerCase() === 'commit';
}
