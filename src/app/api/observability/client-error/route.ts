import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import {
  clientErrorReportId,
  sanitizeClientErrorPayload
} from '@/lib/client/browserErrorObservability';
import { readJsonBody, RequestSecurityError } from '@/lib/server/requestSecurity';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MAX_PAYLOAD_BYTES = 8 * 1024;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX_HITS = 30;
const RATE_LIMIT_MAX_KEYS = 2048;
const traffic = new Map<string, { count: number; resetAt: number }>();

function noStoreHeaders() {
  return {
    'Cache-Control': 'private, no-store, max-age=0, must-revalidate',
    Pragma: 'no-cache'
  };
}

function isSameOriginBrowserRequest(request: Request) {
  const fetchSite = request.headers.get('sec-fetch-site');
  if (fetchSite && fetchSite !== 'same-origin') return false;

  const origin = request.headers.get('origin');
  if (!origin) return fetchSite === 'same-origin';

  try {
    const requestHost = request.headers.get('x-forwarded-host') || new URL(request.url).host;
    return new URL(origin).host === requestHost;
  } catch {
    return false;
  }
}

function rateLimitKey(request: Request) {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  const address = request.headers.get('x-real-ip') || forwarded || 'unknown';
  return createHash('sha256').update(address).digest('hex').slice(0, 24);
}

function allowRequest(request: Request) {
  const now = Date.now();
  if (traffic.size >= RATE_LIMIT_MAX_KEYS) {
    for (const [storedKey, bucket] of traffic) {
      if (bucket.resetAt <= now) traffic.delete(storedKey);
    }
    if (traffic.size >= RATE_LIMIT_MAX_KEYS) {
      const oldestKey = traffic.keys().next().value;
      if (typeof oldestKey === 'string') traffic.delete(oldestKey);
    }
  }
  const key = rateLimitKey(request);
  const current = traffic.get(key);
  if (!current || current.resetAt <= now) {
    traffic.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (current.count >= RATE_LIMIT_MAX_HITS) return false;
  current.count += 1;
  return true;
}

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status, headers: noStoreHeaders() });
}

export async function POST(request: Request) {
  const startedAt = Date.now();
  if (!isSameOriginBrowserRequest(request)) return errorResponse('Origem não permitida.', 403);
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
    return errorResponse('Content-Type não permitido.', 415);
  }
  if (!allowRequest(request)) return errorResponse('Muitas ocorrências. Aguarde e tente novamente.', 429);

  try {
    const input = await readJsonBody(request, MAX_PAYLOAD_BYTES);
    const payload = sanitizeClientErrorPayload(input);
    const reportId = clientErrorReportId(payload);

    console.error(JSON.stringify({
      level: 'error',
      event: 'browser_exception',
      report_id: reportId,
      request_id: request.headers.get('x-vercel-id') || null,
      source: payload.source,
      error_name: payload.name,
      error_message: payload.message,
      error_stack: payload.stack || null,
      error_digest: payload.digest || null,
      route: payload.route,
      build_version: payload.build_version,
      recovery: payload.recovery,
      duration_ms: Date.now() - startedAt
    }));

    return NextResponse.json(
      { accepted: true, report_id: reportId },
      { status: 202, headers: noStoreHeaders() }
    );
  } catch (error) {
    if (error instanceof RequestSecurityError) return errorResponse(error.message, error.status);
    return errorResponse('Não foi possível registrar a ocorrência.', 400);
  }
}
