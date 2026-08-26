export class ResponseBodyTooLargeError extends Error {
  readonly limitBytes: number;

  constructor(limitBytes: number) {
    super(`Resposta remota excedeu o limite seguro de ${limitBytes} bytes.`);
    this.name = 'ResponseBodyTooLargeError';
    this.limitBytes = limitBytes;
  }
}

async function cancelBody(body: ReadableStream<Uint8Array> | null) {
  if (!body) return;
  try {
    await body.cancel();
  } catch {
    // The response may already be closed or locked. The size guard still applies.
  }
}

export async function readResponseTextWithLimit(response: Response, limitBytes: number) {
  if (!Number.isSafeInteger(limitBytes) || limitBytes <= 0) {
    throw new Error('O limite da resposta remota deve ser um inteiro positivo.');
  }

  const declaredLength = Number.parseInt(response.headers.get('content-length') || '', 10);
  if (Number.isFinite(declaredLength) && declaredLength > limitBytes) {
    await cancelBody(response.body);
    throw new ResponseBodyTooLargeError(limitBytes);
  }

  if (!response.body) return '';

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let receivedBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value?.byteLength) continue;

      receivedBytes += value.byteLength;
      if (receivedBytes > limitBytes) {
        await reader.cancel();
        throw new ResponseBodyTooLargeError(limitBytes);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(receivedBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return new TextDecoder().decode(bytes);
}
