import type { MarketSourceAdapter, RawMarketListing } from '../types';

type JsonFeedAdapterOptions = {
  id: string;
  label: string;
  endpoint: string;
  headers?: Record<string, string>;
  mapItem: (item: unknown) => RawMarketListing | null;
};

export function createJsonFeedAdapter(options: JsonFeedAdapterOptions): MarketSourceAdapter {
  return {
    id: options.id,
    label: options.label,
    async collect(signal?: AbortSignal) {
      const response = await fetch(options.endpoint, {
        method: 'GET',
        headers: {
          accept: 'application/json',
          'user-agent': 'AutoControleAutomotivo-MarketRadar/1.0',
          ...(options.headers || {})
        },
        cache: 'no-store',
        signal
      });

      if (!response.ok) {
        throw new Error(`${options.label}: resposta HTTP ${response.status}.`);
      }

      const payload = await response.json();
      const items = Array.isArray(payload)
        ? payload
        : Array.isArray(payload?.items)
          ? payload.items
          : Array.isArray(payload?.results)
            ? payload.results
            : [];

      return items
        .map((item: unknown) => options.mapItem(item))
        .filter((item: RawMarketListing | null): item is RawMarketListing => Boolean(item));
    }
  };
}
