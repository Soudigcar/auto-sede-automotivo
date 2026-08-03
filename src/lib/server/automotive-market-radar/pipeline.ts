import { createHash } from 'node:crypto';
import type {
  NormalizedMarketListing,
  RadarListingStatus,
  RadarStateCode,
  RawMarketListing
} from './types';

const promotionalPatterns = [
  /entrada\s*(de)?\s*r?\$?/i,
  /parcela(s)?\s*(a partir)?/i,
  /financiamento/i,
  /cons[oó]rcio/i,
  /apenas\s+\d+\s*x/i
];

const auctionPatterns = [/leil[aã]o/i, /recuperado de leil[aã]o/i, /pequena monta/i, /m[eé]dia monta/i];
const damagedPatterns = [/sinistro/i, /batid[oa]/i, /avariad[oa]/i, /dano estrutural/i];

function cleanText(value: unknown) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

export function normalizeToken(value: unknown) {
  return cleanText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

function normalizeState(value: unknown): RadarStateCode | null {
  const token = normalizeToken(value);
  if (token === 'DF' || token === 'DISTRITO FEDERAL' || token === 'BRASILIA') return 'DF';
  if (token === 'GO' || token === 'GOIAS') return 'GO';
  return null;
}

function validPrice(value: number | null | undefined) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 5000 && value <= 3000000;
}

function statusFor(raw: RawMarketListing, stateCode: RadarStateCode | null): {
  status: RadarListingStatus;
  reason: string | null;
} {
  const searchable = `${raw.title || ''} ${raw.description || ''}`;

  if (!stateCode) return { status: 'out_of_region', reason: 'Localização fora de DF/GO ou não identificada.' };
  if (!validPrice(raw.price)) return { status: 'invalid_price', reason: 'Preço ausente ou fora da faixa operacional.' };
  if (auctionPatterns.some((pattern) => pattern.test(searchable))) {
    return { status: 'auction', reason: 'Indício explícito de leilão ou monta.' };
  }
  if (damagedPatterns.some((pattern) => pattern.test(searchable))) {
    return { status: 'damaged', reason: 'Indício explícito de sinistro, avaria ou dano estrutural.' };
  }
  if (promotionalPatterns.some((pattern) => pattern.test(searchable))) {
    return { status: 'financing_entry', reason: 'Preço aparenta ser entrada, parcela ou condição financeira.' };
  }

  return { status: 'valid', reason: null };
}

function confidenceFor(raw: RawMarketListing, stateCode: RadarStateCode | null) {
  let score = 35;
  if (stateCode) score += 15;
  if (raw.brand) score += 8;
  if (raw.model) score += 8;
  if (raw.version) score += 8;
  if (raw.modelYear) score += 8;
  if (raw.fuel) score += 5;
  if (raw.transmission) score += 5;
  if (validPrice(raw.price)) score += 8;
  return Math.min(score, 100);
}

export function normalizeListing(raw: RawMarketListing): NormalizedMarketListing {
  const stateCode = normalizeState(raw.stateCode);
  const classification = statusFor(raw, stateCode);
  const normalizedKey = [
    normalizeToken(raw.brand),
    normalizeToken(raw.model),
    normalizeToken(raw.version),
    raw.manufactureYear || '',
    raw.modelYear || '',
    normalizeToken(raw.fuel),
    normalizeToken(raw.transmission)
  ].join('|');

  const contentHash = createHash('sha256')
    .update([
      normalizeToken(raw.sourceName),
      cleanText(raw.sourceUrl),
      normalizeToken(raw.title),
      raw.price ?? '',
      raw.modelYear ?? '',
      normalizeToken(raw.municipality)
    ].join('|'))
    .digest('hex');

  return {
    source_name: cleanText(raw.sourceName),
    source_url: cleanText(raw.sourceUrl),
    external_id: cleanText(raw.externalId) || null,
    municipality: cleanText(raw.municipality) || null,
    state_code: stateCode,
    title: cleanText(raw.title),
    brand: cleanText(raw.brand) || null,
    model: cleanText(raw.model) || null,
    version: cleanText(raw.version) || null,
    manufacture_year: raw.manufactureYear ?? null,
    model_year: raw.modelYear ?? null,
    fuel: cleanText(raw.fuel) || null,
    transmission: cleanText(raw.transmission) || null,
    mileage: raw.mileage ?? null,
    price: validPrice(raw.price) ? Number(raw.price) : null,
    fipe_price: validPrice(raw.fipePrice) ? Number(raw.fipePrice) : null,
    listing_status: classification.status,
    rejection_reason: classification.reason,
    normalized_key: normalizedKey,
    content_hash: contentHash,
    evidence: {
      ...(raw.evidence || {}),
      raw_state_code: raw.stateCode || null,
      raw_description: raw.description || null
    },
    confidence: confidenceFor(raw, stateCode),
    collected_at: raw.collectedAt
  };
}

export function normalizeAndDeduplicate(rawListings: RawMarketListing[]) {
  const seenUrls = new Set<string>();
  const seenExternalIds = new Set<string>();
  const seenHashes = new Set<string>();

  return rawListings.map((raw) => {
    const listing = normalizeListing(raw);
    const urlKey = listing.source_url.toLowerCase();
    const externalKey = listing.external_id
      ? `${listing.source_name.toLowerCase()}|${listing.external_id.toLowerCase()}`
      : '';

    const duplicate =
      seenUrls.has(urlKey) ||
      Boolean(externalKey && seenExternalIds.has(externalKey)) ||
      seenHashes.has(listing.content_hash);

    seenUrls.add(urlKey);
    if (externalKey) seenExternalIds.add(externalKey);
    seenHashes.add(listing.content_hash);

    if (!duplicate) return listing;

    return {
      ...listing,
      listing_status: 'duplicate' as const,
      rejection_reason: 'Duplicidade identificada por URL, ID externo ou hash de conteúdo.'
    };
  });
}
