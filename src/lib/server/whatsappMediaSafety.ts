export const MAX_INLINE_MEDIA_BYTES = 4 * 1024 * 1024;
export const MAX_EVOLUTION_MEDIA_RESPONSE_BYTES = 6 * 1024 * 1024;

const MAX_SAFE_BIGINT = BigInt(Number.MAX_SAFE_INTEGER);

function safeBigInt(value: unknown) {
  if (typeof value === 'bigint') return value >= 0n ? value : null;
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value) || value < 0) return null;
    return BigInt(value);
  }
  if (typeof value === 'string' && /^\d+$/.test(value.trim())) {
    return BigInt(value.trim());
  }
  return null;
}

export function mediaFileLengthBytes(value: unknown): number | null {
  const direct = safeBigInt(value);
  if (direct !== null) return Number(direct > MAX_SAFE_BIGINT ? MAX_SAFE_BIGINT : direct);

  if (!value || typeof value !== 'object') return null;
  const longValue = value as { low?: unknown; high?: unknown; unsigned?: unknown };
  const low = Number(longValue.low);
  const high = Number(longValue.high);
  if (!Number.isInteger(low) || !Number.isInteger(high)) return null;
  if (longValue.unsigned === false && high < 0) return null;

  const combined = (BigInt(high >>> 0) << 32n) | BigInt(low >>> 0);
  return Number(combined > MAX_SAFE_BIGINT ? MAX_SAFE_BIGINT : combined);
}

export function decodedBase64ByteLength(value: string): number | null {
  const base64 = value.trim();
  if (!base64 || base64.length % 4 === 1 || !/^[A-Za-z0-9+/]*={0,2}$/.test(base64)) return null;
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - padding;
}
