import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const invalidLinkStatuses = new Set(['rejected', 'duplicate', 'deleted', 'excluido']);

function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!supabaseUrl || !serviceKey) throw new Error('Configuração do servidor incompleta.');
  return createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

function clean(value: unknown) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function validOwnerLink(link: any) {
  const status = clean(link?.status).toLowerCase();
  if (!link?.imported_vehicle_id || !link?.store_id) return false;
  if (link?.metadata?.store_removed === true) return false;
  return !invalidLinkStatuses.has(status);
}

function uniqueSorted(values: unknown[]) {
  return Array.from(new Set(values.map(clean).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

export async function GET() {
  try {
    const supabase = getAdminClient();
    const { data: vehicleRows, error: vehicleError } = await supabase
      .from('site_vehicles')
      .select('id,store_id,brand,model,version,year,mileage,color,transmission,fuel,price,image_url,image_urls,is_featured,created_at')
      .eq('show_on_landing', true)
      .eq('status', 'disponivel')
      .gt('price', 0)
      .order('is_featured', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(300);

    if (vehicleError) throw vehicleError;
    const vehicles = (vehicleRows || []).filter((vehicle: any) => Number(vehicle.price || 0) > 0);
    const legacyVehicleIds = vehicles.filter((vehicle: any) => !vehicle.store_id).map((vehicle: any) => vehicle.id);

    const { data: linkRows, error: linkError } = legacyVehicleIds.length
      ? await supabase
          .from('store_vehicle_link_submissions')
          .select('id,store_id,imported_vehicle_id,status,metadata')
          .in('imported_vehicle_id', legacyVehicleIds)
      : { data: [], error: null };

    if (linkError) throw linkError;
    const validLinks = (linkRows || []).filter(validOwnerLink);
    const legacyOwnersByVehicle = new Map<string, string[]>();
    validLinks.forEach((link: any) => {
      const current = legacyOwnersByVehicle.get(link.imported_vehicle_id) || [];
      if (!current.includes(link.store_id)) current.push(link.store_id);
      legacyOwnersByVehicle.set(link.imported_vehicle_id, current);
    });

    const directStoreIds = vehicles.map((vehicle: any) => clean(vehicle.store_id)).filter(Boolean);
    const legacyStoreIds = validLinks.map((link: any) => clean(link.store_id)).filter(Boolean);
    const storeIds = Array.from(new Set([...directStoreIds, ...legacyStoreIds]));

    const { data: storeRows, error: storeError } = storeIds.length
      ? await supabase
          .from('stores')
          .select('id,store_name,slug,website_url,status,portal_enabled')
          .in('id', storeIds)
          .eq('status', 'active')
          .eq('portal_enabled', true)
      : { data: [], error: null };

    if (storeError) throw storeError;
    const storesById = new Map((storeRows || []).map((store: any) => [store.id, store]));

    const safeVehicles = vehicles.map((vehicle: any) => {
      const directOwnerId = clean(vehicle.store_id);
      const legacyOwners = legacyOwnersByVehicle.get(vehicle.id) || [];
      const ownerId = directOwnerId || (legacyOwners.length === 1 ? legacyOwners[0] : '');
      const store = ownerId ? storesById.get(ownerId) : null;
      if (!store) return null;

      const images = Array.from(new Set([
        ...(Array.isArray(vehicle.image_urls) ? vehicle.image_urls : []),
        vehicle.image_url
      ].map(clean).filter(Boolean)));

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
        store: {
          id: store.id,
          name: clean(store.store_name),
          slug: clean(store.slug),
          website_url: clean(store.website_url) || null
        }
      };
    }).filter(Boolean);

    const prices = safeVehicles.map((vehicle: any) => Number(vehicle.price)).filter((price) => price > 0);
    return NextResponse.json({
      vehicles: safeVehicles,
      total: safeVehicles.length,
      filters: {
        brands: uniqueSorted(safeVehicles.map((vehicle: any) => vehicle.brand)),
        transmissions: uniqueSorted(safeVehicles.map((vehicle: any) => vehicle.transmission)),
        fuels: uniqueSorted(safeVehicles.map((vehicle: any) => vehicle.fuel)),
        min_price: prices.length ? Math.min(...prices) : 0,
        max_price: prices.length ? Math.max(...prices) : 0
      }
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Não foi possível carregar os veículos.' }, { status: 500 });
  }
}
