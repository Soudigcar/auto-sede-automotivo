// Normaliza links diretos, mensagens compartilhadas e registros antigos malformados da OLX.
const OLX_URL_PATTERN = /(?:https?:\/\/)?(?:www\.)?(?:[a-z0-9-]+\.)*olx\.com\.br\/[^\s<>"'`]+/gi;

function decodedVariants(value: string) {
  const variants = new Set<string>();
  let current = value.trim();

  for (let attempt = 0; attempt < 3 && current; attempt += 1) {
    variants.add(current);
    variants.add(
      current
        .replace(/&amp;/gi, '&')
        .replace(/\\u002f/gi, '/')
        .replace(/\\\//g, '/')
    );

    try {
      const decoded = decodeURIComponent(current);
      if (!decoded || decoded === current) break;
      current = decoded;
    } catch {
      break;
    }
  }

  return Array.from(variants);
}

function trimUrlPunctuation(value: string) {
  return value
    .trim()
    .replace(/^[([{<]+/, '')
    .replace(/[\])}>.,;:!?]+$/g, '');
}

export function extractCanonicalOlxUrl(value: unknown) {
  const raw = String(value || '').trim();
  if (!raw) return '';

  for (const variant of decodedVariants(raw)) {
    const matches = variant.match(OLX_URL_PATTERN) || [];

    for (const match of matches) {
      const candidate = trimUrlPunctuation(match);

      try {
        const parsed = new URL(/^https?:\/\//i.test(candidate) ? candidate : `https://${candidate}`);
        const hostname = parsed.hostname.toLowerCase().replace(/^www\./, '');

        if (hostname !== 'olx.com.br' && !hostname.endsWith('.olx.com.br')) continue;

        parsed.protocol = 'https:';
        parsed.hostname = hostname;
        parsed.username = '';
        parsed.password = '';
        parsed.search = '';
        parsed.hash = '';
        parsed.pathname = parsed.pathname.replace(/\/{2,}/g, '/').replace(/\/$/, '');

        return parsed.toString();
      } catch {
        // Tenta o próximo endereço encontrado no texto compartilhado.
      }
    }
  }

  return '';
}

export function extractOlxAdId(value: unknown) {
  const url = extractCanonicalOlxUrl(value);
  if (!url) return '';

  try {
    const matches = Array.from(new URL(url).pathname.matchAll(/(?:^|[-/])(\d{7,})(?=$|[-/])/g));
    return matches.length ? matches[matches.length - 1][1] : '';
  } catch {
    return '';
  }
}
