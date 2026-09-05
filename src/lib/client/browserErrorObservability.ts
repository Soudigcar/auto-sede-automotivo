export const CLIENT_ERROR_ENDPOINT = '/api/observability/client-error';
export const CLIENT_ERROR_RECOVERY_PARAM = '__client_recovery';
export const CLIENT_ERROR_RECOVERY_KEY = 'auto-controle:client-error-recovery:v1';

export const CLIENT_ERROR_SOURCES = [
  'global-boundary',
  'autocar-boundary',
  'window-error',
  'unhandled-rejection'
] as const;

export type ClientErrorSource = (typeof CLIENT_ERROR_SOURCES)[number];
export type ClientErrorRecovery = 'not_applicable' | 'scheduled' | 'blocked';

export type ClientErrorPayload = {
  source: ClientErrorSource;
  name: string;
  message: string;
  stack: string;
  digest: string;
  route: string;
  build_version: string;
  recovery: ClientErrorRecovery;
};

type RecoveryAttempt = {
  buildVersion: string;
  fingerprint: string;
  attemptedAt: number;
};

const reportedFingerprints = new Set<string>();
let inMemoryRecoveryAttempted = false;

function truncate(value: string, maxLength: number) {
  return value.slice(0, maxLength);
}

function redactUrls(value: string) {
  return value.replace(/https?:\/\/[^\s)\]}>"']+/gi, (rawUrl) => {
    try {
      const url = new URL(rawUrl);
      return `${url.origin}${url.pathname}`;
    } catch {
      return '[URL]';
    }
  });
}

export function sanitizeClientErrorText(value: unknown, maxLength = 500) {
  if (typeof value !== 'string') return '';

  const sanitized = redactUrls(value)
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [REDACTED]')
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[JWT]')
    .replace(/(["']?)(token|access[_-]?token|refresh[_-]?token|authorization|password|senha|secret|client[_-]?secret|api[_-]?key|cookie|set-cookie|session(?:[_-]?id)?)\1\s*[:=]\s*["']?[^,;}\s"']+/gi, '$2=[REDACTED]')
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[EMAIL]')
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi, '[UUID]')
    .replace(/\b\d{8,}\b/g, '[NUMBER]')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return truncate(sanitized, maxLength);
}

export function sanitizeClientErrorRoute(value: unknown) {
  const raw = typeof value === 'string' ? value : '/';

  try {
    const url = new URL(raw, 'https://client-error.invalid');
    const pathname = url.pathname.startsWith('/') ? url.pathname : '/';
    return truncate(pathname.replace(/\/{2,}/g, '/'), 240) || '/';
  } catch {
    return '/';
  }
}

function sanitizeClientErrorName(value: unknown) {
  const sanitized = sanitizeClientErrorText(value, 80).replace(/[^A-Za-z0-9_. -]/g, '');
  return sanitized || 'Error';
}

function sanitizeClientErrorDigest(value: unknown) {
  return sanitizeClientErrorText(value, 120).replace(/[^A-Za-z0-9_.:-]/g, '');
}

function sanitizeClientErrorSource(value: unknown): ClientErrorSource {
  return CLIENT_ERROR_SOURCES.includes(value as ClientErrorSource)
    ? value as ClientErrorSource
    : 'window-error';
}

function sanitizeClientErrorRecovery(value: unknown): ClientErrorRecovery {
  return value === 'scheduled' || value === 'blocked' ? value : 'not_applicable';
}

function errorSnapshot(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
      digest: 'digest' in error ? (error as Error & { digest?: unknown }).digest : ''
    };
  }

  if (typeof error === 'string') {
    return { name: 'Error', message: error, stack: '', digest: '' };
  }

  return { name: 'Error', message: 'Exceção não identificada no navegador.', stack: '', digest: '' };
}

export function sanitizeClientErrorPayload(value: unknown): ClientErrorPayload {
  const input = value && typeof value === 'object' ? value as Record<string, unknown> : {};

  return {
    source: sanitizeClientErrorSource(input.source),
    name: sanitizeClientErrorName(input.name),
    message: sanitizeClientErrorText(input.message, 500) || 'Erro sem mensagem disponível.',
    stack: sanitizeClientErrorText(input.stack, 1800),
    digest: sanitizeClientErrorDigest(input.digest),
    route: sanitizeClientErrorRoute(input.route),
    build_version: sanitizeClientErrorText(input.build_version, 160) || 'unknown',
    recovery: sanitizeClientErrorRecovery(input.recovery)
  };
}

export function buildClientErrorPayload(
  error: unknown,
  source: ClientErrorSource,
  recovery: ClientErrorRecovery,
  context: { route?: string; buildVersion?: string } = {}
) {
  const snapshot = errorSnapshot(error);
  return sanitizeClientErrorPayload({
    ...snapshot,
    source,
    recovery,
    route: context.route || '/',
    build_version: context.buildVersion || 'unknown'
  });
}

export function fingerprintClientError(payload: ClientErrorPayload) {
  const input = [payload.name, payload.message, payload.digest, payload.route, payload.build_version].join('|');
  let hash = 0x811c9dc5;

  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function clientErrorReportId(payload: ClientErrorPayload) {
  return `WEB-${fingerprintClientError(payload).toUpperCase()}`;
}

export function isRecoverableBundleError(error: unknown) {
  const snapshot = errorSnapshot(error);
  const searchable = `${snapshot.name || ''} ${snapshot.message || ''} ${snapshot.stack || ''}`;

  return /chunkloaderror|loading (?:css )?chunk [^ ]+ failed|failed to load chunk|load chunk [^ ]+ failed|failed to (?:fetch|load) dynamically imported module|importing a module script failed|failed to load module script|css chunk load failed|unable to preload css/i.test(searchable);
}

export function shouldReserveBundleRecovery(
  previous: RecoveryAttempt | null,
  buildVersion: string,
  hasRecoveryMarker: boolean
) {
  if (hasRecoveryMarker) return false;
  if (!previous) return true;
  return previous.buildVersion !== buildVersion;
}

function browserBuildVersion() {
  return sanitizeClientErrorText(document.documentElement.dataset.appVersion, 160) || 'unknown';
}

function browserRoute() {
  return sanitizeClientErrorRoute(window.location.pathname);
}

function readRecoveryAttempt() {
  try {
    const value = JSON.parse(window.sessionStorage.getItem(CLIENT_ERROR_RECOVERY_KEY) || 'null');
    if (
      !value ||
      typeof value.buildVersion !== 'string' ||
      typeof value.fingerprint !== 'string' ||
      typeof value.attemptedAt !== 'number'
    ) return null;
    return value as RecoveryAttempt;
  } catch {
    return null;
  }
}

function reserveBundleRecovery(payload: ClientErrorPayload) {
  if (!isRecoverableBundleError(`${payload.name} ${payload.message} ${payload.stack}`)) return false;

  const url = new URL(window.location.href);
  const historyAttemptedForBuild = Boolean(
    window.history.state &&
    typeof window.history.state === 'object' &&
    window.history.state.__autoControleClientRecovery === payload.build_version
  );
  const previous = readRecoveryAttempt();
  if (
    inMemoryRecoveryAttempted ||
    historyAttemptedForBuild ||
    !shouldReserveBundleRecovery(previous, payload.build_version, url.searchParams.has(CLIENT_ERROR_RECOVERY_PARAM))
  ) return false;

  const attempt: RecoveryAttempt = {
    buildVersion: payload.build_version,
    fingerprint: fingerprintClientError(payload),
    attemptedAt: Date.now()
  };

  inMemoryRecoveryAttempted = true;
  try {
    window.sessionStorage.setItem(CLIENT_ERROR_RECOVERY_KEY, JSON.stringify(attempt));
  } catch {
    // O marcador de URL e o history.state continuam protegendo contra loop sem sessionStorage.
  }
  return true;
}

async function reportPayload(payload: ClientErrorPayload) {
  const fallbackReportId = clientErrorReportId(payload);
  const fingerprint = fingerprintClientError(payload);
  if (reportedFingerprints.has(fingerprint)) return fallbackReportId;
  reportedFingerprints.add(fingerprint);

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 1500);

  try {
    const response = await fetch(CLIENT_ERROR_ENDPOINT, {
      method: 'POST',
      cache: 'no-store',
      credentials: 'same-origin',
      keepalive: true,
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const body = await response.json().catch(() => null);
    const reportId = sanitizeClientErrorText(body?.report_id, 32);
    return /^WEB-[A-F0-9]{8}$/.test(reportId) ? reportId : fallbackReportId;
  } catch {
    return fallbackReportId;
  } finally {
    window.clearTimeout(timeout);
  }
}

async function reloadWithCurrentBundle(payload: ClientErrorPayload) {
  try {
    await Promise.race([
      (async () => {
        const registration = await navigator.serviceWorker?.getRegistration?.();
        await registration?.update();
        registration?.waiting?.postMessage({ type: 'SKIP_WAITING' });
      })(),
      new Promise<void>((resolve) => window.setTimeout(resolve, 750))
    ]);
  } catch {
    // O reload versionado ainda solicita os assets atuais sem depender do service worker.
  }

  const url = new URL(window.location.href);
  url.searchParams.set(CLIENT_ERROR_RECOVERY_PARAM, fingerprintClientError(payload));
  window.location.replace(url.toString());
}

export async function observeBrowserException(
  error: unknown,
  source: ClientErrorSource,
  options: { allowBundleRecovery?: boolean } = {}
) {
  const base = buildClientErrorPayload(error, source, 'not_applicable', {
    route: browserRoute(),
    buildVersion: browserBuildVersion()
  });
  const recoverable = options.allowBundleRecovery !== false && isRecoverableBundleError(error);
  const recoveryReserved = recoverable && reserveBundleRecovery(base);
  const payload = { ...base, recovery: recoveryReserved ? 'scheduled' : recoverable ? 'blocked' : 'not_applicable' } as ClientErrorPayload;
  const reportId = await reportPayload(payload);

  if (recoveryReserved) await reloadWithCurrentBundle(payload);
  return { reportId, recoveryScheduled: recoveryReserved };
}

export function consumeClientRecoveryMarker() {
  const url = new URL(window.location.href);
  if (!url.searchParams.has(CLIENT_ERROR_RECOVERY_PARAM)) return;

  url.searchParams.delete(CLIENT_ERROR_RECOVERY_PARAM);
  const previousState = window.history.state && typeof window.history.state === 'object'
    ? window.history.state
    : {};
  window.history.replaceState(
    { ...previousState, __autoControleClientRecovery: browserBuildVersion() },
    '',
    `${url.pathname}${url.search}${url.hash}`
  );
}
