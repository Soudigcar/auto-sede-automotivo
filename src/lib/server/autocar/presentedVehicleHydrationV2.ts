import { safeExternalHttpUrl } from '@/lib/publicRoutes';

const INVALID_LINK_STATUSES = new Set(['rejected', 'duplicate', 'deleted', 'excluido']);

function clean(value: unknown) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function normalize(value: unknown) {
  return clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function uniqueSafeUrls(values: unknown[]) {
  return Array.from(new Set(values
    .map((value) => safeExternalHttpUrl(value))
    .filter((value): value is string => Boolean(value))));
}

function validOwnerLink(link: any) {
  if (!link?.imported_vehicle_id || !link?.store_id) return false;
  if (link?.metadata?.store_removed === true) return false;
  return !INVALID_LINK_STATUSES.has(normalize(link?.status));
}

function hydratedVehicle(row: any) {
  const photos = uniqueSafeUrls([row?.image_url, ...(Array.isArray(row?.image_urls) ? row.image_urls : [])]).slice(0, 8);
  return {
    id: String(row?.id || ''),
    brand: clean(row?.brand),
    model: clean(row?.model),
    version: clean(row?.version),
    year: clean(row?.year) || [row?.manufacture_year, row?.model_year].filter(Boolean).join('/'),
    mileage: clean(row?.mileage),
    color: clean(row?.color),
    transmission: clean(row?.transmission),
    fuel: clean(row?.fuel),
    price: Number(row?.price || 0),
    primary_photo: photos[0] || null,
    photos
  };
}

export function hydrateAutocarVehicleRowsV2(input: {
  storeId: string;
  requestedIds: string[];
  directRows?: any[];
  linkRows?: any[];
  linkedRows?: any[];
}) {
  const requestedIds = Array.from(new Set((input.requestedIds || []).map((id) => clean(id)).filter(Boolean))).slice(0, 8);
  const requestedSet = new Set(requestedIds);
  const validLinkedIds = new Set((input.linkRows || [])
    .filter(validOwnerLink)
    .map((link: any) => String(link.imported_vehicle_id || ''))
    .filter((id) => requestedSet.has(id)));

  const byId = new Map<string, any>();
  for (const row of input.directRows || []) {
    const id = String(row?.id || '');
    if (!id || !requestedSet.has(id)) continue;
    if (String(row?.store_id || '') !== input.storeId) continue;
    if (normalize(row?.status) !== 'disponivel' || row?.sold_at) continue;
    byId.set(id, row);
  }
  for (const row of input.linkedRows || []) {
    const id = String(row?.id || '');
    if (!id || !requestedSet.has(id) || !validLinkedIds.has(id)) continue;
    if (row?.store_id && String(row.store_id) !== input.storeId) continue;
    if (normalize(row?.status) !== 'disponivel' || row?.sold_at) continue;
    if (!byId.has(id)) byId.set(id, row);
  }

  const vehicles = requestedIds.map((id) => byId.get(id)).filter(Boolean).map(hydratedVehicle);
  const hydratedIds = new Set(vehicles.map((vehicle) => vehicle.id));
  return {
    requested_ids: requestedIds,
    requested_count: requestedIds.length,
    hydrated_count: vehicles.length,
    missing_ids: requestedIds.filter((id) => !hydratedIds.has(id)),
    vehicles,
    source: 'store_inventory_revalidation_read_only',
    external_execution: false
  };
}

export async function hydrateAutocarPresentedVehiclesV2(input: {
  productionSupabase: any;
  storeId: string;
  vehicleIds: string[];
}) {
  const requestedIds = Array.from(new Set((input.vehicleIds || []).map((id) => clean(id)).filter(Boolean))).slice(0, 8);
  if (!requestedIds.length) {
    return hydrateAutocarVehicleRowsV2({ storeId: input.storeId, requestedIds: [] });
  }

  const [{ data: directRows, error: directError }, { data: linkRows, error: linkError }] = await Promise.all([
    input.productionSupabase.from('site_vehicles')
      .select('id,store_id,brand,model,version,year,manufacture_year,model_year,mileage,color,transmission,fuel,price,image_url,image_urls,status,sold_at')
      .in('id', requestedIds).eq('store_id', input.storeId).eq('status', 'disponivel').is('sold_at', null),
    input.productionSupabase.from('store_vehicle_link_submissions')
      .select('store_id,imported_vehicle_id,status,metadata')
      .eq('store_id', input.storeId).in('imported_vehicle_id', requestedIds)
  ]);
  if (directError) throw directError;
  if (linkError) throw linkError;

  const validLinkedIds = Array.from(new Set((linkRows || []).filter(validOwnerLink)
    .map((link: any) => String(link.imported_vehicle_id || '')).filter(Boolean)));
  let linkedRows: any[] = [];
  if (validLinkedIds.length) {
    const { data, error } = await input.productionSupabase.from('site_vehicles')
      .select('id,store_id,brand,model,version,year,manufacture_year,model_year,mileage,color,transmission,fuel,price,image_url,image_urls,status,sold_at')
      .in('id', validLinkedIds).eq('status', 'disponivel').is('sold_at', null);
    if (error) throw error;
    linkedRows = data || [];
  }

  return hydrateAutocarVehicleRowsV2({
    storeId: input.storeId,
    requestedIds,
    directRows: directRows || [],
    linkRows: linkRows || [],
    linkedRows
  });
}
