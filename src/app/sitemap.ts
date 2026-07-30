import type { MetadataRoute } from 'next';
import { getPublicStores, getPublicVehicles } from '@/lib/server/marketplace';
import { OFFICIAL_PORTAL_URL, absolutePortalUrl, publicStorePath, publicVehiclePath } from '@/lib/publicRoutes';

export const revalidate = 300;

function validDate(value: string | undefined) {
  if (!value) return new Date();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticPages: MetadataRoute.Sitemap = [
    { url: OFFICIAL_PORTAL_URL, lastModified: new Date(), changeFrequency: 'daily', priority: 1 },
    { url: `${OFFICIAL_PORTAL_URL}/veiculos`, lastModified: new Date(), changeFrequency: 'daily', priority: 0.9 },
    { url: `${OFFICIAL_PORTAL_URL}/lojas`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.8 }
  ];

  try {
    const [vehicles, stores] = await Promise.all([
      getPublicVehicles({ limit: 500 }),
      getPublicStores()
    ]);

    const vehicleEntries: MetadataRoute.Sitemap = vehicles.map((vehicle) => ({
      url: absolutePortalUrl(publicVehiclePath(vehicle)),
      lastModified: validDate(vehicle.updated_at || vehicle.created_at),
      changeFrequency: 'daily',
      priority: vehicle.is_featured ? 0.9 : 0.7
    }));

    const storeEntries: MetadataRoute.Sitemap = stores.map((store) => ({
      url: absolutePortalUrl(publicStorePath(store.slug)),
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: store.vehicle_count > 0 ? 0.8 : 0.5
    }));

    return [...staticPages, ...storeEntries, ...vehicleEntries];
  } catch {
    return staticPages;
  }
}
