import { createClient } from '@supabase/supabase-js';
import type { MarketplaceFilters, MarketplaceStore, MarketplaceVehicle, PublicStore } from '@/components/marketplace/types';
import { safeExternalHttpUrl, slugifyPublicText } from '@/lib/publicRoutes';

const invalidLinkStatuses = new Set(['rejected', 'duplicate', 'deleted', 'excluido']);

interface VehicleRow {
  id: string;
  store_id: string | null;
  brand: string | null;
  model: string | null;
  version: string | null;
  year: string | null;
  mileage: string | null;
  color: string | null;
  transmission: string | null;
  fuel: string | null;
  price: number | string | null;
  image_url: string | null;
  image_urls: unknown;
  is_featured: boolean | null;
  created_at: string | null;
  updated_at: string | null;
}

interface LinkRow {
  store_id: string | null;
  imported_vehicle_id: string | null;
  status: string | null;
  metadata: Record<string, unknown> | null;
}

interface StoreRow {
  id: string;
  store_name: string | null;
  slug: string | null;
  website_url: string | null;
}

function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!supabaseUrl || !serviceKey) throw new Error('Configuração do servidor incompleta.');
  return createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

function clean(value: unknown) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function validOwnerLink(link: LinkRow) {
  const status = clean(link.status).toLowerCase();
  if (!link.imported_vehicle_id || !link.store_id) return false;
  if (link.metadata?.store_removed === true) return false;
  return !invalidLinkStatuses.has(status);
}

function uniqueSorted(values: unknown[]) {
  return Array.from(new Set(values.map(clean).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

function resolvedStoreSlug(store: StoreRow) {
  const configured = clean(store.slug);
  if (configured) return configured;
  return `${slugifyPublicText(store.store_name) || 'loja'}-${store.id.slice(0, 8)}`;
}

function normalizeStore(store: StoreRow): MarketplaceStore {
  return {
    id: store.id,
    name: clean(store.store_name),
    slug: resolvedStoreSlug(store),
    website_url: safeExternalHttpUrl(store.website_url)
  };
}

export async function getPublicVehicles(options?: { vehicleIds?: string[]; storeId?: string; limit?: number }) {
  const supabase = getAdminClient();
  const limit = Math.min(Math.max(Number(options?.limit || 300), 1), 500);
  let vehicleQuery = supabase
    .from('site_vehicles')
    .select('id,store_id,brand,model,version,year,mileage,color,transmission,fuel,price,image_url,image_urls,is_featured,created_at,updated_at')
    .eq('show_on_landing', true)
    .eq('status', 'disponivel')
    .gt('price', 0)
    .order('is_featured', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit);

  if (options?.vehicleIds?.length) {
    vehicleQuery = vehicleQuery.in('id', options.vehicleIds);
  }

  const { data: vehicleRows, error: vehicleError } = await vehicleQuery;
  if (vehicleError) throw vehicleError;

  const vehicles = ((vehicleRows || []) as VehicleRow[]).filter((vehicle) => Number(vehicle.price || 0) > 0);
  const legacyVehicleIds = vehicles.filter((vehicle) => !vehicle.store_id).map((vehicle) => vehicle.id);

  const { data: linkRows, error: linkError } = legacyVehicleIds.length
    ? await supabase
        .from('store_vehicle_link_submissions')
        .select('store_id,imported_vehicle_id,status,metadata')
        .in('imported_vehicle_id', legacyVehicleIds)
    : { data: [], error: null };

  if (linkError) throw linkError;
  const validLinks = ((linkRows || []) as LinkRow[]).filter(validOwnerLink);
  const legacyOwnersByVehicle = new Map<string, string[]>();

  validLinks.forEach((link) => {
    if (!link.imported_vehicle_id || !link.store_id) return;
    const current = legacyOwnersByVehicle.get(link.imported_vehicle_id) || [];
    if (!current.includes(link.store_id)) current.push(link.store_id);
    legacyOwnersByVehicle.set(link.imported_vehicle_id, current);
  });

  const directStoreIds = vehicles.map((vehicle) => clean(vehicle.store_id)).filter(Boolean);
  const legacyStoreIds = validLinks.map((link) => clean(link.store_id)).filter(Boolean);
  const storeIds = Array.from(new Set([...directStoreIds, ...legacyStoreIds]));

  const { data: storeRows, error: storeError } = storeIds.length
    ? await supabase
        .from('stores')
        .select('id,store_name,slug,website_url')
        .in('id', storeIds)
        .eq('status', 'active')
        .eq('portal_enabled', true)
    : { data: [], error: null };

  if (storeError) throw storeError;
  const storesById = new Map(((storeRows || []) as StoreRow[]).map((store) => [store.id, normalizeStore(store)]));

  const safeVehicles = vehicles
    .map((vehicle): MarketplaceVehicle | null => {
      const directOwnerId = clean(vehicle.store_id);
      const legacyOwners = legacyOwnersByVehicle.get(vehicle.id) || [];
      const ownerId = directOwnerId || (legacyOwners.length === 1 ? legacyOwners[0] : '');
      const store = ownerId ? storesById.get(ownerId) : null;
      if (!store) return null;

      const rawImages = Array.isArray(vehicle.image_urls) ? vehicle.image_urls : [];
      const images = Array.from(new Set([...rawImages, vehicle.image_url].map(clean).filter(Boolean)));

      return {
        id: vehicle.id,
        brand: clean(vehicle.brand),
        model: clean(vehicle.model),
        version: clean(vehicle.version),
        year: clean(vehicle.year),
        mileage: clean(vehicle.mileage),
        color: clean(vehicle.color),
        transmission: clean(vehicle.transmission),
        fuel: clean(vehicle.fuel),
        price: Number(vehicle.price),
        image_url: images[0] || null,
        image_urls: images,
        is_featured: Boolean(vehicle.is_featured),
        created_at: clean(vehicle.created_at),
        updated_at: clean(vehicle.updated_at),
        store
      };
    })
    .filter((vehicle): vehicle is MarketplaceVehicle => Boolean(vehicle));

  return options?.storeId ? safeVehicles.filter((vehicle) => vehicle.store.id === options.storeId) : safeVehicles;
}

export async function getPublicVehicleById(id: string) {
  if (!id) return null;
  const vehicles = await getPublicVehicles({ vehicleIds: [id], limit: 1 });
  return vehicles[0] || null;
}

export async function getPublicStores(): Promise<PublicStore[]> {
  const supabase = getAdminClient();
  const [vehicles, storeResult] = await Promise.all([
    getPublicVehicles({ limit: 500 }),
    supabase
      .from('stores')
      .select('id,store_name,slug,website_url')
      .eq('status', 'active')
      .eq('portal_enabled', true)
      .order('store_name', { ascending: true })
  ]);

  if (storeResult.error) throw storeResult.error;
  const countByStore = new Map<string, number>();
  const imageByStore = new Map<string, string | null>();

  vehicles.forEach((vehicle) => {
    countByStore.set(vehicle.store.id, (countByStore.get(vehicle.store.id) || 0) + 1);
    if (!imageByStore.has(vehicle.store.id)) imageByStore.set(vehicle.store.id, vehicle.image_url);
  });

  return ((storeResult.data || []) as StoreRow[]).map((row) => {
    const store = normalizeStore(row);
    return {
      ...store,
      vehicle_count: countByStore.get(store.id) || 0,
      featured_vehicle_image: imageByStore.get(store.id) || null
    };
  });
}

export async function getPublicStoreBySlug(slug: string) {
  const stores = await getPublicStores();
  return stores.find((store) => store.slug === slug) || null;
}

export function marketplaceFilters(vehicles: MarketplaceVehicle[]): MarketplaceFilters {
  const prices = vehicles.map((vehicle) => Number(vehicle.price)).filter((price) => price > 0);
  return {
    brands: uniqueSorted(vehicles.map((vehicle) => vehicle.brand)),
    transmissions: uniqueSorted(vehicles.map((vehicle) => vehicle.transmission)),
    fuels: uniqueSorted(vehicles.map((vehicle) => vehicle.fuel)),
    min_price: prices.length ? Math.min(...prices) : 0,
    max_price: prices.length ? Math.max(...prices) : 0
  };
}
