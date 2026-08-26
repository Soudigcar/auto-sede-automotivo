function cleanMessage(value: unknown) {
  if (typeof value !== 'string') return '';
  const message = value.trim();
  if (!message || message === '[object Object]') return '';
  return message;
}

function extractApiErrorMessage(payload: unknown): string {
  const direct = cleanMessage(payload);
  if (direct) return direct;

  if (Array.isArray(payload)) {
    const messages = payload
      .map((item) => extractApiErrorMessage(item))
      .filter(Boolean);
    if (messages.length) return messages.join(', ').slice(0, 500);
  }

  if (payload && typeof payload === 'object') {
    const record = payload as Record<string, unknown>;
    const candidates = [
      record.error,
      record.message,
      record.detail,
      record.error_description,
      record.response
    ];

    for (const candidate of candidates) {
      if (candidate === payload) continue;
      const message = extractApiErrorMessage(candidate);
      if (message) return message;
    }
  }

  return '';
}

export function apiErrorMessage(payload: unknown, fallback: string) {
  return extractApiErrorMessage(payload) || cleanMessage(fallback) || 'Não foi possível concluir a operação.';
}
