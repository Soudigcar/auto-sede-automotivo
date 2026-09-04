import type { NormalizedMarketListing, RadarRegionCode } from './types';
import { normalizeToken } from './pipeline';

export type MarketSegment = {
  state_code: RadarRegionCode;
  brand: string;
  model: string;
  version: string;
  manufacture_year: number | null;
  model_year: number;
  fuel: string;
  transmission: string;
  valid_listing_count: number;
  minimum_price: number;
  maximum_price: number;
  median_price: number;
  average_price: number;
  fipe_price: number | null;
  difference_to_fipe_amount: number | null;
  difference_to_fipe_percent: number | null;
  alternative_names: string[];
  divergences: unknown[];
  interpretation_rules: unknown[];
  evidence: unknown[];
  confidence: number;
};

export type MarketSuggestion = {
  segment_index: number;
  suggestion_type: 'catalog_alias' | 'price_review' | 'data_quality' | 'fipe_mapping';
  title: string;
  description: string;
  proposed_payload: Record<string, unknown>;
  source_evidence: unknown[];
  confidence: number;
};

function round(value: number, precision = 2) {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

function median(values: number[]) {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2) return sorted[middle];
  return (sorted[middle - 1] + sorted[middle]) / 2;
}

function mostFrequent(values: number[]) {
  const counts = new Map<number, number>();
  values.forEach((value) => counts.set(value, (counts.get(value) || 0) + 1));
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0] ?? null;
}

function canonical(value: string | null) {
  return normalizeToken(value);
}

function segmentKey(listing: NormalizedMarketListing) {
  return [
    canonical(listing.brand),
    canonical(listing.model),
    canonical(listing.version),
    listing.manufacture_year ?? '',
    listing.model_year ?? '',
    canonical(listing.fuel),
    canonical(listing.transmission)
  ].join('|');
}

function buildSegment(region: RadarRegionCode, listings: NormalizedMarketListing[]): MarketSegment {
  const first = listings[0];
  const prices = listings.map((item) => Number(item.price)).filter(Number.isFinite);
  const fipeValues = listings.map((item) => Number(item.fipe_price)).filter((value) => Number.isFinite(value) && value > 0);
  const medianPrice = median(prices);
  const averagePrice = prices.reduce((sum, value) => sum + value, 0) / prices.length;
  const fipePrice = mostFrequent(fipeValues);
  const difference = fipePrice ? medianPrice - fipePrice : null;
  const sourceNames = Array.from(new Set(listings.map((item) => item.source_name))).sort();
  const titles = Array.from(new Set(listings.map((item) => item.title))).slice(0, 8);
  const aliases = Array.from(new Set(listings.map((item) => item.version || '').filter(Boolean)))
    .filter((value) => canonical(value) !== canonical(first.version));

  return {
    state_code: region,
    brand: first.brand || '',
    model: first.model || '',
    version: first.version || '',
    manufacture_year: first.manufacture_year,
    model_year: Number(first.model_year),
    fuel: first.fuel || '',
    transmission: first.transmission || '',
    valid_listing_count: listings.length,
    minimum_price: Math.min(...prices),
    maximum_price: Math.max(...prices),
    median_price: round(medianPrice),
    average_price: round(averagePrice),
    fipe_price: fipePrice,
    difference_to_fipe_amount: difference === null ? null : round(difference),
    difference_to_fipe_percent: difference === null || !fipePrice ? null : round((difference / fipePrice) * 100, 4),
    alternative_names: aliases,
    divergences: [],
    interpretation_rules: [],
    evidence: [{ sources: sourceNames, titles, listing_urls: listings.slice(0, 8).map((item) => item.source_url) }],
    confidence: round(listings.reduce((sum, item) => sum + item.confidence, 0) / listings.length)
  };
}

export function aggregateMarketListings(listings: NormalizedMarketListing[]) {
  const valid = listings.filter((item) => item.listing_status === 'valid' && item.state_code && item.price);
  const regional = new Map<string, NormalizedMarketListing[]>();
  const consolidated = new Map<string, NormalizedMarketListing[]>();

  for (const listing of valid) {
    const key = segmentKey(listing);
    const regionKey = `${listing.state_code}|${key}`;
    regional.set(regionKey, [...(regional.get(regionKey) || []), listing]);
    consolidated.set(key, [...(consolidated.get(key) || []), listing]);
  }

  const segments: MarketSegment[] = [];
  for (const items of regional.values()) segments.push(buildSegment(items[0].state_code!, items));
  for (const items of consolidated.values()) segments.push(buildSegment('DF+GO', items));

  segments.sort((left, right) =>
    right.valid_listing_count - left.valid_listing_count ||
    left.state_code.localeCompare(right.state_code) ||
    left.brand.localeCompare(right.brand)
  );

  const suggestions: MarketSuggestion[] = [];
  segments.forEach((segment, index) => {
    if (segment.difference_to_fipe_percent !== null && Math.abs(segment.difference_to_fipe_percent) >= 10) {
      suggestions.push({
        segment_index: index,
        suggestion_type: 'price_review',
        title: `Revisar posicionamento de preço: ${segment.brand} ${segment.model}`,
        description: `A mediana regional está ${segment.difference_to_fipe_percent > 0 ? 'acima' : 'abaixo'} da FIPE em ${Math.abs(segment.difference_to_fipe_percent).toFixed(1)}%.`,
        proposed_payload: {
          region: segment.state_code,
          median_price: segment.median_price,
          fipe_price: segment.fipe_price,
          difference_percent: segment.difference_to_fipe_percent
        },
        source_evidence: segment.evidence,
        confidence: segment.confidence
      });
    }

    if (!segment.fipe_price) {
      suggestions.push({
        segment_index: index,
        suggestion_type: 'fipe_mapping',
        title: `Mapear FIPE: ${segment.brand} ${segment.model} ${segment.version}`,
        description: 'Os anúncios válidos não trouxeram uma referência FIPE confiável para esta combinação.',
        proposed_payload: { region: segment.state_code, model_year: segment.model_year },
        source_evidence: segment.evidence,
        confidence: Math.min(segment.confidence, 80)
      });
    }

    if (segment.valid_listing_count < 3) {
      suggestions.push({
        segment_index: index,
        suggestion_type: 'data_quality',
        title: `Amostra reduzida: ${segment.brand} ${segment.model}`,
        description: `A combinação possui apenas ${segment.valid_listing_count} anúncio(s) válido(s); não usar isoladamente para decisão comercial.`,
        proposed_payload: { minimum_recommended_sample: 3 },
        source_evidence: segment.evidence,
        confidence: 60
      });
    }
  });

  return { segments, suggestions };
}
