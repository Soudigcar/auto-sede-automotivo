function cleanIdentity(value: unknown) {
  if (value === null || value === undefined || typeof value === 'object') return '';
  return String(value).replace(/\s+/g, ' ').trim();
}

function normalizedIdentity(value: unknown) {
  return cleanIdentity(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function digits(value: unknown) {
  return cleanIdentity(value).replace(/\D/g, '');
}

export function evolutionMessageIsFromMe(value: unknown) {
  if (value === true || value === 1) return true;
  const normalized = cleanIdentity(value).toLowerCase();
  return normalized === 'true' || normalized === '1';
}

export function isReliableWhatsappCustomerName(
  value: unknown,
  phone: unknown,
  businessNames: unknown[] = []
) {
  const name = cleanIdentity(value);
  const normalized = normalizedIdentity(name);
  if (!name || !normalized) return false;

  const phoneDigits = digits(phone);
  const nameDigits = digits(name);
  const nameWithoutPhonePunctuation = name.replace(/[\d\s()+.-]/g, '');
  if (nameDigits.length >= 8 && !nameWithoutPhonePunctuation) return false;
  if (phoneDigits && (nameDigits === phoneDigits || nameDigits === phoneDigits.slice(-11))) return false;

  if (['voce', 'você', 'you', 'me', 'eu', 'cliente whatsapp'].includes(normalized)) return false;

  return !businessNames.some((businessName) => {
    const business = normalizedIdentity(businessName);
    const businessWithoutChannel = business.replace(/\s+whatsapp(?:\s+evolution|\s+oficial)?(?:\s.*)?$/, '').trim();
    return Boolean(
      business &&
      (business === normalized || (businessWithoutChannel.length >= 3 && businessWithoutChannel === normalized))
    );
  });
}

export function whatsappCustomerDisplayName(
  candidates: unknown[],
  phone: unknown,
  businessNames: unknown[] = []
) {
  for (const candidate of candidates) {
    if (isReliableWhatsappCustomerName(candidate, phone, businessNames)) {
      return cleanIdentity(candidate).slice(0, 180);
    }
  }

  const phoneDigits = digits(phone);
  return phoneDigits ? `Contato final ${phoneDigits.slice(-4)}` : 'Cliente WhatsApp';
}
