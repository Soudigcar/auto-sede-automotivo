import { absolutePortalUrl, publicVehiclePath, safeExternalHttpUrl } from '@/lib/publicRoutes';

const INVALID_LINK_STATUSES = new Set(['rejected', 'duplicate', 'deleted', 'excluido']);
const STOP_WORDS = new Set([
  'a','o','as','os','um','uma','uns','umas','de','do','da','dos','das','e','ou','com','sem','para','pra','por','no','na','nos','nas',
  'tem','têm','ter','voce','voces','você','vocês','carro','carros','veiculo','veiculos','veículo','veículos','quero','procuro','busco','algum','alguma',
  'qual','quais','me','mostra','mostrar','manda','mandar','disponivel','disponiveis','disponível','disponíveis','hoje','ai','aí'
]);

export type AutocarInventoryVehicle = {
  id: string;
  brand: string;
  model: string;
  version: string;
  year: string;
  manufacture_year: number | null;
  model_year: number | null;
  mileage: string;
  color: string;
  transmission: string;
  fuel: string;
  price: number;
  primary_photo: string | null;
  photos: string[];
  portal_url: string | null;
  source_url: string | null;
  published: boolean;
  match_score: number;
};

export type AutocarInventoryIndexVehicle = Pick<
  AutocarInventoryVehicle,
  'id' | 'brand' | 'model' | 'version' | 'year' | 'mileage' | 'color' | 'transmission' | 'fuel' | 'price' | 'portal_url'
>;

export type AutocarInventoryContext = {
  store_id: string;
  available_count: number;
  matched_count: number;
  matching_vehicles: AutocarInventoryVehicle[];
  inventory_index: AutocarInventoryIndexVehicle[];
  constraints: {
    max_price: number | null;
    min_year: number | null;
    transmission: string | null;
  };
  source: 'production_read_only';
};

function clean(value: unknown) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function normalize(value: unknown) {
  return clean(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function compactNormalize(value: unknown) {
  return normalize(value).replace(/[^a-z0-9]/g, '');
}

function uniqueSafeUrls(values: unknown[]) {
  return Array.from(new Set(values.map((value) => safeExternalHttpUrl(value)).filter((value): value is string => Boolean(value))));
}

function parseMoney(raw: string, suffix?: string) {
  const normalized = raw.replace(/\s/g, '').replace(/\.(?=\d{3}(?:\D|$))/g, '').replace(',', '.');
  const value = Number(normalized.replace(/[^\d.]/g, ''));
  if (!Number.isFinite(value) || value <= 0) return null;
  return suffix && /^(mil|k)$/i.test(suffix) ? Math.round(value * 1000) : Math.round(value);
}

function queryConstraints(query: string) {
  const text = normalize(query);
  const maxPriceMatch = text.match(/(?:ate|max(?:imo)?|no maximo)\s*(?:r\$\s*)?([\d.,]+)\s*(mil|k)?/i);
  const maxPrice = maxPriceMatch ? parseMoney(maxPriceMatch[1], maxPriceMatch[2]) : null;
  const minYearMatch = text.match(/(?:a partir de|depois de|acima de|desde)\s*(20\d{2})|\b(20\d{2})\s*(?:pra|para)?\s*cima\b/i);
  const minYear = Number(minYearMatch?.[1] || minYearMatch?.[2] || 0) || null;
  let transmission: string | null = null;
  if (/\bautomatic[oa]s?\b|\bauto\b|\bcvt\b/i.test(text)) transmission = 'automatico';
  else if (/\bmanual\b/i.test(text)) transmission = 'manual';
  return { maxPrice, minYear, transmission };
}

function meaningfulTokens(query: string) {
  return normalize(query)
    .split(/[^a-z0-9]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2 && !STOP_WORDS.has(token) && !/^\d+$/.test(token))
    .slice(0, 16);
}

function vehicleYear(row: any) {
  const matches = String(row?.year || '').match(/20\d{2}/g) || [];
  const lastYear = matches.length ? matches[matches.length - 1] : null;
  return Number(row?.model_year || row?.manufacture_year || lastYear || 0) || null;
}

function matchesConstraints(row: any, constraints: ReturnType<typeof queryConstraints>) {
  const price = Number(row?.price || 0);
  if (constraints.maxPrice && (!price || price > constraints.maxPrice)) return false;
  const year = vehicleYear(row);
  if (constraints.minYear && (!year || year < constraints.minYear)) return false;
  if (constraints.transmission === 'automatico') {
    const transmission = normalize(row?.transmission);
    if (!/(automatic|cvt|dct|tiptronic)/.test(transmission)) return false;
  }
  if (constraints.transmission === 'manual' && !/manual/.test(normalize(row?.transmission))) return false;
  return true;
}

function scoreVehicle(row: any, rawQuery: string, tokens: string[]) {
  const normalizedQuery = normalize(rawQuery);
  const compactQuery = compactNormalize(rawQuery);
  const brand = normalize(row?.brand);
  const model = normalize(row?.model);
  const version = normalize(row?.version);
  const compactBrand = compactNormalize(row?.brand);
  const compactModel = compactNormalize(row?.model);
  const compactVersion = compactNormalize(row?.version);
  const haystack = normalize([row?.brand, row?.model, row?.version, row?.year, row?.transmission, row?.fuel, row?.color].filter(Boolean).join(' '));
  const compactHaystack = compactNormalize(haystack);
  let score = 0;

  if (model && normalizedQuery.includes(model)) score += 140;
  else if (compactModel.length >= 2 && compactQuery.includes(compactModel)) score += 140;
  if (brand && normalizedQuery.includes(brand)) score += 60;
  else if (compactBrand.length >= 2 && compactQuery.includes(compactBrand)) score += 60;
  if (version && version.length >= 3 && normalizedQuery.includes(version)) score += 45;
  else if (compactVersion.length >= 3 && compactQuery.includes(compactVersion)) score += 45;

  tokens.forEach((token) => {
    const compactToken = compactNormalize(token);
    if (haystack.includes(token) || (compactToken.length >= 2 && compactHaystack.includes(compactToken))) score += 18;
  });
  return score;
}

function validOwnerLink(link: any) {
  if (!link?.imported_vehicle_id || !link?.store_id) return false;
  if (link?.metadata?.store_removed === true) return false;
  return !INVALID_LINK_STATUSES.has(normalize(link?.status));
}

function toVehicle(row: any, portalEnabled: boolean, score: number): AutocarInventoryVehicle {
  const brand = clean(row?.brand);
  const model = clean(row?.model);
  const version = clean(row?.version);
  const year = clean(row?.year) || [row?.manufacture_year, row?.model_year].filter(Boolean).join('/');
  const photos = uniqueSafeUrls([row?.image_url, ...(Array.isArray(row?.image_urls) ? row.image_urls : [])]).slice(0, 8);
  const published = portalEnabled && row?.show_on_landing === true && Number(row?.price || 0) > 0;
  const portalUrl = published && row?.id
    ? absolutePortalUrl(publicVehiclePath({ id: String(row.id), brand, model, year } as any))
    : null;

  return {
    id: String(row?.id || ''),
    brand,
    model,
    version,
    year,
    manufacture_year: row?.manufacture_year == null ? null : Number(row.manufacture_year),
    model_year: row?.model_year == null ? null : Number(row.model_year),
    mileage: clean(row?.mileage),
    color: clean(row?.color),
    transmission: clean(row?.transmission),
    fuel: clean(row?.fuel),
    price: Number(row?.price || 0),
    primary_photo: photos[0] || null,
    photos,
    portal_url: portalUrl,
    source_url: safeExternalHttpUrl(row?.source_url),
    published,
    match_score: score
  };
}

export async function loadAutocarInventory(input: {
  supabase: any;
  storeId: string;
  query: string;
  matchLimit?: number;
  indexLimit?: number;
}): Promise<AutocarInventoryContext> {
  if (!input?.supabase) throw new Error('Cliente de estoque não informado para a AUTOCAR.');
  const storeId = clean(input.storeId);
  if (!storeId) throw new Error('Loja obrigatória para consultar estoque AUTOCAR.');

  const [{ data: store, error: storeError }, { data: directRows, error: directError }, { data: linkRows, error: linkError }] = await Promise.all([
    input.supabase.from('stores').select('id,portal_enabled').eq('id', storeId).maybeSingle(),
    input.supabase.from('site_vehicles')
      .select('id,store_id,brand,model,version,year,manufacture_year,model_year,mileage,color,transmission,fuel,price,image_url,image_urls,status,show_on_landing,source_url,created_at,updated_at,sold_at')
      .eq('store_id', storeId).eq('status', 'disponivel').is('sold_at', null)
      .order('updated_at', { ascending: false }).limit(250),
    input.supabase.from('store_vehicle_link_submissions')
      .select('store_id,imported_vehicle_id,status,metadata').eq('store_id', storeId).limit(500)
  ]);
  if (storeError) throw storeError;
  if (directError) throw directError;
  if (linkError) throw linkError;
  if (!store) throw new Error('Loja não encontrada para consulta de estoque AUTOCAR.');

  const validLinks = (linkRows || []).filter(validOwnerLink);
  const linkedIds = Array.from(new Set(validLinks.map((link: any) => String(link.imported_vehicle_id || '')).filter(Boolean)));
  let legacyRows: any[] = [];
  if (linkedIds.length) {
    const { data, error } = await input.supabase.from('site_vehicles')
      .select('id,store_id,brand,model,version,year,manufacture_year,model_year,mileage,color,transmission,fuel,price,image_url,image_urls,status,show_on_landing,source_url,created_at,updated_at,sold_at')
      .in('id', linkedIds).eq('status', 'disponivel').is('sold_at', null).limit(250);
    if (error) throw error;
    legacyRows = (data || []).filter((row: any) => !row.store_id || row.store_id === storeId);
  }

  const byId = new Map<string, any>();
  [...(directRows || []), ...legacyRows].forEach((row: any) => { if (row?.id) byId.set(String(row.id), row); });
  const rows = Array.from(byId.values());
  const tokens = meaningfulTokens(input.query);
  const constraints = queryConstraints(input.query);
  const constraintActive = Boolean(constraints.maxPrice || constraints.minYear || constraints.transmission);

  const scored = rows
    .filter((row) => matchesConstraints(row, constraints))
    .map((row) => ({ row, score: scoreVehicle(row, input.query, tokens) }))
    .sort((a, b) => b.score - a.score || Number(a.row?.price || 0) - Number(b.row?.price || 0));

  const hasSpecificSearch = tokens.length > 0;
  let selected = scored.filter((item) => item.score > 0);
  if (!selected.length && (!hasSpecificSearch || constraintActive)) selected = scored;

  const matchLimit = Math.max(1, Math.min(Number(input.matchLimit || 12), 30));
  const indexLimit = Math.max(matchLimit, Math.min(Number(input.indexLimit || 80), 150));
  const portalEnabled = store.portal_enabled === true;
  const matchingVehicles = selected.slice(0, matchLimit).map((item) => toVehicle(item.row, portalEnabled, item.score));
  const inventoryIndex = rows.slice(0, indexLimit).map((row) => {
    const vehicle = toVehicle(row, portalEnabled, 0);
    return {
      id: vehicle.id,
      brand: vehicle.brand,
      model: vehicle.model,
      version: vehicle.version,
      year: vehicle.year,
      mileage: vehicle.mileage,
      color: vehicle.color,
      transmission: vehicle.transmission,
      fuel: vehicle.fuel,
      price: vehicle.price,
      portal_url: vehicle.portal_url
    };
  });

  return {
    store_id: storeId,
    available_count: rows.length,
    matched_count: matchingVehicles.length,
    matching_vehicles: matchingVehicles,
    inventory_index: inventoryIndex,
    constraints: { max_price: constraints.maxPrice, min_year: constraints.minYear, transmission: constraints.transmission },
    source: 'production_read_only'
  };
}
