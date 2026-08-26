export function normalizeWhatsappRecipient(value: unknown) {
  return String(value || '')
    .split('@')[0]
    .split(':')[0]
    .replace(/\D/g, '');
}

export function isConnectedWhatsappNumber(recipient: unknown, connectedNumber: unknown) {
  const normalizedRecipient = normalizeWhatsappRecipient(recipient);
  const normalizedConnectedNumber = normalizeWhatsappRecipient(connectedNumber);

  return Boolean(
    normalizedRecipient &&
    normalizedConnectedNumber &&
    normalizedRecipient === normalizedConnectedNumber
  );
}
