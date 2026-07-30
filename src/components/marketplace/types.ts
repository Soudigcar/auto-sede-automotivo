export type MarketplaceStore = {
  id: string;
  name: string;
  slug: string;
  website_url: string | null;
};

export type PublicStore = MarketplaceStore & {
  vehicle_count: number;
  featured_vehicle_image: string | null;
};

export type MarketplaceVehicle = {
  id: string;
  brand: string;
  model: string;
  version: string;
  year: string;
  mileage: string;
  color: string;
  transmission: string;
  fuel: string;
  price: number;
  image_url: string | null;
  image_urls: string[];
  is_featured: boolean;
  created_at: string;
  updated_at: string;
  store: MarketplaceStore;
};

export type MarketplaceFilters = {
  brands: string[];
  transmissions: string[];
  fuels: string[];
  min_price: number;
  max_price: number;
};
