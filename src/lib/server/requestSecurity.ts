import { createHmac, timingSafeEqual } from 'node:crypto';

export class RequestSecurityError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = 'RequestSecurityError';
    this.status = status;
  }
}

function utf8Bytes(value: string) {
  return Buffer.byteLength(value, 'utf8');
}

export function contentLengthExceeds(request: Request, maxBytes: number) {
  const raw = request.headers.get('content-length');
  if (!raw) return false;
  const value = Number(raw);
  return Number.isFinite(value) && value > maxBytes;
}

export async function readRawBody(request: Request, maxBytes = 256 * 1024) {
  if (contentLengthExceeds(request, maxBytes)) {
    throw new RequestSecurityError('Payload acima do limite permitido.', 413);
  }

  const raw = await request.text();
  if (utf8Bytes(raw) > maxBytes) {
    throw new RequestSecurityError('Payload acima do limite permitido.', 413);
  }
  return raw;
}

export async function readJsonBody<T = Record<string, unknown>>(request: Request, maxBytes = 256 * 1024): Promise<T> {
  const raw = await readRawBody(request, maxBytes);
  if (!raw.trim()) throw new RequestSecurityError('Payload JSON obrigatório.', 400);

  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new RequestSecurityError('Payload JSON inválido.', 400);
  }
}

export function safeEqual(left: unknown, right: unknown) {
  const leftBuffer = Buffer.from(String(left || ''), 'utf8');
  const rightBuffer = Buffer.from(String(right || ''), 'utf8');
  return leftBuffer.length > 0 && leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export function verifySha256Hmac(rawBody: string, signature: unknown, secret: unknown) {
  const normalizedSecret = String(secret || '').trim();
  const normalizedSignature = String(signature || '').trim().toLowerCase();
  if (!normalizedSecret || !normalizedSignature) return false;

  const expected = `sha256=${createHmac('sha256', normalizedSecret).update(rawBody).digest('hex')}`;
  return safeEqual(normalizedSignature, expected);
}

export function publicError(error: unknown, fallback: string) {
  if (error instanceof RequestSecurityError) {
    return { message: error.message, status: error.status };
  }
  return { message: fallback, status: 500 };
}
