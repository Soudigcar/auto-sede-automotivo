export type RadarStateCode = 'DF' | 'GO';
export type RadarRegionCode = RadarStateCode | 'DF+GO';

export type RadarListingStatus =
  | 'valid'
  | 'duplicate'
  | 'invalid_price'
  | 'promotional'
  | 'auction'
  | 'damaged'
  | 'financing_entry'
  | 'version_conflict'
  | 'out_of_region'
  | 'other_rejected';

export type RawMarketListing = {
  sourceName: string;
  sourceUrl: string;
  externalId?: string | null;
  municipality?: string | null;
  stateCode?: string | null;
  title: string;
  description?: string | null;
  brand?: string | null;
  model?: string | null;
  version?: string | null;
  manufactureYear?: number | null;
  modelYear?: number | null;
  fuel?: string | null;
  transmission?: string | null;
  mileage?: number | null;
  price?: number | null;
  fipePrice?: number | null;
  collectedAt: string;
  evidence?: Record<string, unknown>;
};

export type NormalizedMarketListing = {
  source_name: string;
  source_url: string;
  external_id: string | null;
  municipality: string | null;
  state_code: RadarStateCode;
  title: string;
  brand: string | null;
  model: string | null;
  version: string | null;
  manufacture_year: number | null;
  model_year: number | null;
  fuel: string | null;
  transmission: string | null;
  mileage: number | null;
  price: number | null;
  fipe_price: number | null;
  listing_status: RadarListingStatus;
  rejection_reason: string | null;
  normalized_key: string;
  content_hash: string;
  evidence: Record<string, unknown>;
  confidence: number;
  collected_at: string;
};

export type MarketSourceAdapter = {
  id: string;
  label: string;
  collect: (signal?: AbortSignal) => Promise<RawMarketListing[]>;
};
