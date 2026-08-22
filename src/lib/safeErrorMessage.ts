function clip(value: string, maxLength: number) {
  return value.replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function extractMessage(value: unknown, maxLength: number, depth = 0): string {
  if (typeof value === 'string') return clip(value, maxLength);
  if (!value || typeof value !== 'object' || depth > 3) return '';

  if (value instanceof Error) {
    const message = clip(value.message || '', maxLength);
    if (message) return message;
  }

  const record = value as Record<string, unknown>;
  for (const key of ['message', 'error', 'details', 'description', 'hint']) {
    const message = extractMessage(record[key], maxLength, depth + 1);
    if (message) return message;
  }

  return '';
}

export function safeErrorMessage(value: unknown, fallback: string, maxLength = 500) {
  const message = extractMessage(value, maxLength);
  return message || clip(fallback, maxLength);
}
