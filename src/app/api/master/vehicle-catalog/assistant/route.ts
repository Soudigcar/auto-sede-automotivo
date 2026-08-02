import { NextResponse } from 'next/server';
import { cleanText, getAdminClient, requireMaster } from '@/lib/server/masterApi';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type AdminClient = ReturnType<typeof getAdminClient>;

type SourceVehicle = {
  source: 'site_vehicles' | 'inventory';
  source_id: string;
  brand: string;
  model: string;
  version: string;
  year: string;
  fuel: string;
  transmission: string;
};

type ProposalRow = {
  id: string;
  selected?: boolean;
  status?: string;
  brand: string;
  model: string;
  version: string;
  manufacture_year: number | null;
  model_year: number | null;
  fuel: string;
  transmission: string;
  source_count?: number;
  sources?: string[];
  raw_brands?: string[];
  raw_models?: string[];
  raw_versions?: string[];
  warnings?: string[];
  existing?: {
    brand_id?: string | null;
    model_id?: string | null;
    version_id?: string | null;
    configuration_id?: string | null;
  };
};

const brandAliases: Record<string, string> = {
  'mercedes': 'Mercedes-Benz',
  'mercedes benz': 'Mercedes-Benz',
  'vw': 'Volkswagen',
  'volks': 'Volkswagen',
  'caoa': 'Caoa Chery',
  'chery': 'Caoa Chery',
  'caoa chery': 'Caoa Chery',
  'landrover': 'Land Rover',
  'land rover': 'Land Rover',
  'mini cooper': 'Mini',
  'jac motors': 'JAC',
  'great wall': 'GWM',
  'great wall motors': 'GWM',
  'gm': 'Chevrolet'
};

const ignoredValues = new Set([
  '',
  '-',
  '/',
  'a conferir',
  'nao informado',
  'não informado',
  'teste',
  'null',
  'undefined',
  'seu',
  'em'
]);

function decodeHtml(value: unknown) {
  return String(value || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => {
      try { return String.fromCodePoint(Number.parseInt(hex, 16)); } catch { return ''; }
    })
    .replace(/&#(\d+);/g, (_, decimal) => {
      try { return String.fromCodePoint(Number.parseInt(decimal, 10)); } catch { return ''; }
    });
}

function normalizeKey(value: unknown) {
  return decodeHtml(cleanText(value, 1000))
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function titleCase(value: unknown) {
  const acronyms = new Set([
    'ABS', 'AMG', 'AT', 'AWD', 'BMW', 'BYD', 'CVT', 'DSG', 'EX', 'EXL', 'GAC', 'GL', 'GLI', 'GNV',
    'GT', 'GTI', 'GTS', 'GWM', 'HGT', 'JAC', 'JMC', 'LT', 'LTZ', 'LX', 'LXS', 'LXR', 'LXL', 'MT',
    'MPI', 'RS', 'S', 'SE', 'SEL', 'SL', 'SV', 'TDI', 'TSI', 'V6', 'V8', 'XEI', 'XL', 'XLS', 'XLT'
  ]);

  return cleanText(value, 300)
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => {
      const upper = part.toUpperCase();
      if (acronyms.has(upper)) return upper;
      if (/^\d+(?:\.\d+)?$/.test(part)) return part;
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join(' ');
}

function unique(values: unknown[]) {
  return Array.from(new Set(values.map((item) => cleanText(item, 500)).filter(Boolean)));
}

function stableId(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `catalog-${(hash >>> 0).toString(36)}`;
}

function slugify(value: unknown) {
  return normalizeKey(value).replace(/\s+/g, '-').slice(0, 180);
}

function canonicalBrand(raw: unknown, officialBrands: Map<string, any>) {
  const key = normalizeKey(raw);
  if (!key || ignoredValues.has(key)) return '';

  const direct = officialBrands.get(key);
  if (direct?.name) return direct.name;

  const mapped = brandAliases[key];
  if (mapped) {
    const official = officialBrands.get(normalizeKey(mapped));
    return official?.name || mapped;
  }

  return titleCase(raw);
}

function cleanModel(raw: unknown, brand: string, rawVersion: unknown) {
  let value = decodeHtml(cleanText(raw, 220));
  const normalized = normalizeKey(value);
  if (!normalized || ignoredValues.has(normalized)) return '';

  value = value
    .replace(new RegExp(`^${brand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+`, 'i'), '')
    .replace(/\b(?:19|20)\d{2}\b/g, ' ')
    .replace(/\b(?:flex|gasolina|diesel|etanol|alcool|álcool|hibrido|híbrido|eletrico|elétrico)\b/gi, ' ')
    .replace(/\bem\s+bras[ií]lia\b.*$/i, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const key = normalizeKey(value);
  const versionKey = normalizeKey(rawVersion);

  if (key === 'hr v' || key === 'hrv') return 'HR-V';
  if (key === 'wr v' || key === 'wrv') return 'WR-V';
  if (key === 'cr v' || key === 'crv') return 'CR-V';
  if (key === 't' && versionKey.startsWith('cross')) return 'T-Cross';
  if (key === 'nivus comfortline') return 'Nivus';

  return titleCase(value)
    .replace(/\bHr V\b/g, 'HR-V')
    .replace(/\bWr V\b/g, 'WR-V')
    .replace(/\bCr V\b/g, 'CR-V');
}

function cleanVersion(raw: unknown, brand: string, model: string) {
  let value = decodeHtml(cleanText(raw, 500));
  const normalized = normalizeKey(value);
  if (!normalized || ignoredValues.has(normalized)) return '';

  value = value
    .replace(/\s*\/\s*(?:19|20)\d{2}(?:\s*\/\s*(?:19|20)\d{2})?.*$/i, '')
    .replace(/\bem\s+bras[ií]lia\b.*$/i, '')
    .replace(/\b(?:19|20)\d{2}\b/g, ' ')
    .replace(new RegExp(`^${brand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+`, 'i'), '')
    .replace(new RegExp(`^${model.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+`, 'i'), '')
    .replace(/\s+/g, ' ')
    .trim();

  if (model === 'T-Cross') value = value.replace(/^cross\s+/i, '');
  if (model === 'Nivus') value = value.replace(/^nivus\s+/i, '');

  value = value
    .replace(/\b(10)(MT|AT)\b/gi, '1.0 $2')
    .replace(/\b(13)(MT|AT)?\b/gi, (_, __, suffix) => `1.3${suffix ? ` ${suffix}` : ''}`)
    .replace(/\b(14)(MT|AT)?\b/gi, (_, __, suffix) => `1.4${suffix ? ` ${suffix}` : ''}`)
    .replace(/\b(16)(MT|AT|SV|SL)?\b/gi, (_, __, suffix) => `1.6${suffix ? ` ${suffix}` : ''}`)
    .replace(/\b(18)(MT|AT)?\b/gi, (_, __, suffix) => `1.8${suffix ? ` ${suffix}` : ''}`)
    .replace(/\b(20)(MT|AT|D)?\b/gi, (_, __, suffix) => `2.0${suffix ? ` ${suffix}` : ''}`)
    .replace(/\s+/g, ' ')
    .trim();

  return titleCase(value)
    .replace(/\bCvt\b/g, 'CVT')
    .replace(/\bTsi\b/g, 'TSI')
    .replace(/\bMpi\b/g, 'MPI')
    .replace(/\bGti\b/g, 'GTI');
}

function parseYears(raw: unknown) {
  const years = Array.from(String(raw || '').matchAll(/\b(19|20)\d{2}\b/g)).map((match) => Number(match[0]));
  if (!years.length) return { manufacture_year: null, model_year: null };
  if (years.length === 1) return { manufacture_year: years[0], model_year: years[0] };
  return { manufacture_year: years[0], model_year: years[1] };
}

function canonicalFuel(raw: unknown) {
  const key = normalizeKey(raw);
  if (!key || ignoredValues.has(key)) return '';
  if (key.includes('flex')) return 'Flex';
  if (key.includes('diesel')) return 'Diesel';
  if (key.includes('gasolina')) return 'Gasolina';
  if (key.includes('etanol') || key.includes('alcool')) return 'Etanol';
  if (key.includes('eletric')) return 'Elétrico';
  if (key.includes('hibrid')) return 'Híbrido';
  if (key.includes('gnv')) return 'GNV';
  return titleCase(raw);
}

function canonicalTransmission(raw: unknown) {
  const key = normalizeKey(raw);
  if (!key || ignoredValues.has(key)) return '';
  if (key.includes('cvt')) return 'CVT';
  if (key.includes('dupla embreagem') || key.includes('dsg') || key.includes('dct')) return 'Dupla embreagem';
  if (key.includes('automatiz')) return 'Automatizado';
  if (key.includes('automatic')) return 'Automático';
  if (key.includes('manual') || key === 'mt') return 'Manual';
  return titleCase(raw);
}

function inferEngine(version: string) {
  const match = version.match(/\b([0-9])\.([0-9])\b/);
  if (!match) return null;
  const value = Number(`${match[1]}.${match[2]}`);
  return value >= 0.6 && value <= 8 ? value : null;
}

function normalizeSourceVehicle(item: any, source: SourceVehicle['source']): SourceVehicle {
  return {
    source,
    source_id: cleanText(item.id, 80),
    brand: cleanText(item.brand, 200),
    model: cleanText(item.model, 240),
    version: cleanText(item.version, 600),
    year: source === 'inventory'
      ? [item.manufacture_year, item.model_year].filter(Boolean).join('/')
      : cleanText(item.year, 80),
    fuel: cleanText(item.fuel, 120),
    transmission: source === 'inventory' ? '' : cleanText(item.transmission, 160)
  };
}

async function loadReferenceData(supabase: AdminClient) {
  const [brandsResult, modelsResult, versionsResult, configurationsResult, fuelsResult, transmissionsResult, aliasesResult] = await Promise.all([
    supabase.from('vehicle_catalog_brands').select('*').order('name').limit(2000),
    supabase.from('vehicle_catalog_models').select('*').order('name').limit(10000),
    supabase.from('vehicle_catalog_versions').select('*').order('name').limit(20000),
    supabase.from('vehicle_catalog_configurations').select('*').limit(30000),
    supabase.from('vehicle_catalog_fuels').select('*').limit(1000),
    supabase.from('vehicle_catalog_transmissions').select('*').limit(1000),
    supabase.from('vehicle_catalog_aliases').select('*').eq('is_active', true).limit(20000)
  ]);

  const results = [brandsResult, modelsResult, versionsResult, configurationsResult, fuelsResult, transmissionsResult, aliasesResult];
  const error = results.find((result) => result.error)?.error;
  if (error) throw error;

  return {
    brands: brandsResult.data || [],
    models: modelsResult.data || [],
    versions: versionsResult.data || [],
    configurations: configurationsResult.data || [],
    fuels: fuelsResult.data || [],
    transmissions: transmissionsResult.data || [],
    aliases: aliasesResult.data || []
  };
}

function buildExistingMaps(reference: Awaited<ReturnType<typeof loadReferenceData>>) {
  const brandByKey = new Map<string, any>();
  const modelByKey = new Map<string, any>();
  const versionByKey = new Map<string, any>();
  const configurationByKey = new Map<string, any>();

  reference.brands.forEach((item: any) => brandByKey.set(normalizeKey(item.name), item));
  reference.aliases
    .filter((item: any) => item.entity_type === 'brand')
    .forEach((item: any) => {
      const brand = reference.brands.find((entry: any) => entry.id === item.entity_id);
      if (brand) brandByKey.set(normalizeKey(item.alias), brand);
    });

  reference.models.forEach((item: any) => modelByKey.set(`${item.brand_id}:${normalizeKey(item.name)}`, item));
  reference.aliases
    .filter((item: any) => item.entity_type === 'model')
    .forEach((item: any) => {
      const model = reference.models.find((entry: any) => entry.id === item.entity_id);
      if (model) modelByKey.set(`${model.brand_id}:${normalizeKey(item.alias)}`, model);
    });

  reference.versions.forEach((item: any) => versionByKey.set(`${item.model_id}:${normalizeKey(item.name)}`, item));
  reference.aliases
    .filter((item: any) => item.entity_type === 'version')
    .forEach((item: any) => {
      const version = reference.versions.find((entry: any) => entry.id === item.entity_id);
      if (version) versionByKey.set(`${version.model_id}:${normalizeKey(item.alias)}`, version);
    });

  reference.configurations.forEach((item: any) => {
    configurationByKey.set(`${item.version_id}:${item.manufacture_year}:${item.model_year}`, item);
  });

  return { brandByKey, modelByKey, versionByKey, configurationByKey };
}

async function analyzeCatalog(supabase: AdminClient) {
  const [reference, siteResult, inventoryResult] = await Promise.all([
    loadReferenceData(supabase),
    supabase
      .from('site_vehicles')
      .select('id,brand,model,version,year,fuel,transmission,status,updated_at')
      .neq('status', 'excluido')
      .order('updated_at', { ascending: false })
      .limit(5000),
    supabase
      .from('inventory')
      .select('id,brand,model,version,manufacture_year,model_year,fuel,status,updated_at')
      .neq('status', 'deleted')
      .order('updated_at', { ascending: false })
      .limit(5000)
  ]);

  if (siteResult.error) throw siteResult.error;
  if (inventoryResult.error) throw inventoryResult.error;

  const officialBrands = new Map(reference.brands.map((item: any) => [normalizeKey(item.name), item]));
  const existing = buildExistingMaps(reference);
  const sourceVehicles = [
    ...(siteResult.data || []).map((item: any) => normalizeSourceVehicle(item, 'site_vehicles')),
    ...(inventoryResult.data || []).map((item: any) => normalizeSourceVehicle(item, 'inventory'))
  ];

  const groups = new Map<string, any>();
  let ignored = 0;

  for (const source of sourceVehicles) {
    const brand = canonicalBrand(source.brand, officialBrands);
    const model = cleanModel(source.model, brand, source.version);
    const version = cleanVersion(source.version, brand, model);
    const years = parseYears(source.year || source.version);
    const fuel = canonicalFuel(source.fuel || source.version);
    const transmission = canonicalTransmission(source.transmission || source.version);

    if (!brand && !model && !version) {
      ignored += 1;
      continue;
    }

    const key = [normalizeKey(brand), normalizeKey(model), normalizeKey(version), years.manufacture_year || '', years.model_year || ''].join('|');
    const current = groups.get(key) || {
      brand,
      model,
      version,
      manufacture_year: years.manufacture_year,
      model_year: years.model_year,
      fuels: new Set<string>(),
      transmissions: new Set<string>(),
      sources: new Set<string>(),
      source_ids: new Set<string>(),
      raw_brands: new Set<string>(),
      raw_models: new Set<string>(),
      raw_versions: new Set<string>()
    };

    if (fuel) current.fuels.add(fuel);
    if (transmission) current.transmissions.add(transmission);
    current.sources.add(source.source);
    current.source_ids.add(`${source.source}:${source.source_id}`);
    if (source.brand) current.raw_brands.add(source.brand);
    if (source.model) current.raw_models.add(source.model);
    if (source.version) current.raw_versions.add(source.version);
    groups.set(key, current);
  }

  const rows: ProposalRow[] = Array.from(groups.entries()).map(([key, group]) => {
    const warnings: string[] = [];
    const brandKey = normalizeKey(group.brand);
    const officialBrand = existing.brandByKey.get(brandKey);
    const modelRecord = officialBrand ? existing.modelByKey.get(`${officialBrand.id}:${normalizeKey(group.model)}`) : null;
    const versionRecord = modelRecord && group.version
      ? existing.versionByKey.get(`${modelRecord.id}:${normalizeKey(group.version)}`)
      : null;
    const configurationRecord = versionRecord && group.manufacture_year && group.model_year
      ? existing.configurationByKey.get(`${versionRecord.id}:${group.manufacture_year}:${group.model_year}`)
      : null;

    const fuels = Array.from(group.fuels) as string[];
    const transmissions = Array.from(group.transmissions) as string[];

    if (!group.brand) warnings.push('Marca ausente ou inválida.');
    if (!group.model) warnings.push('Modelo ausente ou inválido.');
    if (!officialBrand && group.brand) warnings.push('Marca não encontrada na lista oficial; revise antes de cadastrar.');
    if (fuels.length > 1) warnings.push(`Combustíveis divergentes: ${fuels.join(', ')}.`);
    if (transmissions.length > 1) warnings.push(`Câmbios divergentes: ${transmissions.join(', ')}.`);
    if (group.raw_models.size > 1) warnings.push(`${group.raw_models.size} escritas de modelo foram agrupadas.`);
    if (group.raw_versions.size > 1) warnings.push(`${group.raw_versions.size} escritas de versão foram agrupadas.`);
    if (!group.manufacture_year || !group.model_year) warnings.push('Ano incompleto; a configuração não será criada até a revisão.');
    if (!group.version) warnings.push('Versão não informada; será possível cadastrar apenas a marca e o modelo.');

    let status = 'new';
    if (!group.brand || !group.model) status = 'incomplete';
    else if (configurationRecord || (!group.version && modelRecord)) status = 'existing';
    else if (fuels.length > 1 || transmissions.length > 1 || (!officialBrand && Boolean(group.brand))) status = 'conflict';
    else if (group.raw_models.size > 1 || group.raw_versions.size > 1 || group.source_ids.size > 1) status = 'duplicate';

    return {
      id: stableId(key),
      selected: !['existing', 'incomplete', 'conflict'].includes(status),
      status,
      brand: group.brand,
      model: group.model,
      version: group.version,
      manufacture_year: group.manufacture_year,
      model_year: group.model_year,
      fuel: fuels[0] || '',
      transmission: transmissions[0] || '',
      source_count: group.source_ids.size,
      sources: Array.from(group.sources),
      raw_brands: Array.from(group.raw_brands),
      raw_models: Array.from(group.raw_models),
      raw_versions: Array.from(group.raw_versions),
      warnings,
      existing: {
        brand_id: officialBrand?.id || null,
        model_id: modelRecord?.id || null,
        version_id: versionRecord?.id || null,
        configuration_id: configurationRecord?.id || null
      }
    };
  });

  const rank: Record<string, number> = { conflict: 0, incomplete: 1, duplicate: 2, new: 3, existing: 4 };
  rows.sort((a, b) => (rank[a.status || 'new'] ?? 9) - (rank[b.status || 'new'] ?? 9)
    || String(a.brand).localeCompare(String(b.brand), 'pt-BR')
    || String(a.model).localeCompare(String(b.model), 'pt-BR')
    || String(a.version).localeCompare(String(b.version), 'pt-BR'));

  const statusCount = (status: string) => rows.filter((row) => row.status === status).length;

  return {
    generated_at: new Date().toISOString(),
    summary: {
      scanned: sourceVehicles.length,
      ignored,
      groups: rows.length,
      new: statusCount('new'),
      duplicates: statusCount('duplicate'),
      conflicts: statusCount('conflict'),
      incomplete: statusCount('incomplete'),
      existing: statusCount('existing')
    },
    rows,
    brands: reference.brands.map((item: any) => ({ id: item.id, name: item.name }))
  };
}

async function writeAudit(supabase: AdminClient, master: any, action: string, resource: string, record: any) {
  if (!record?.id) return;
  await supabase.from('audit_logs').insert({
    user_id: master.id,
    user_role: 'master',
    action_type: action,
    entity_type: `vehicle_catalog_${resource}`,
    entity_id: record.id,
    old_value: null,
    new_value: record
  });
}

async function findOrCreateNamed(
  supabase: AdminClient,
  master: any,
  table: string,
  resource: string,
  name: string,
  extra: Record<string, any> = {}
) {
  const normalized = normalizeKey(name);
  let query = supabase.from(table).select('*').eq('normalized_name', normalized).limit(1);
  for (const [column, value] of Object.entries(extra)) {
    if (column.endsWith('_id') && value) query = query.eq(column, value);
  }
  const { data: found, error: findError } = await query.maybeSingle();
  if (findError) throw findError;
  if (found) return { record: found, created: false };

  const payload: Record<string, any> = {
    name,
    is_active: true,
    metadata: { source: 'catalog_assistant' },
    created_by: master.id,
    updated_by: master.id,
    ...extra
  };
  if (table === 'vehicle_catalog_brands') payload.slug = slugify(name);

  const { data, error } = await supabase.from(table).insert(payload).select('*').single();
  if (error) throw error;
  await writeAudit(supabase, master, 'vehicle_catalog_assistant_create', resource, data);
  return { record: data, created: true };
}

async function ensureAlias(
  supabase: AdminClient,
  master: any,
  entityType: string,
  entityId: string,
  alias: string,
  officialName: string
) {
  const normalized = normalizeKey(alias);
  if (!normalized || normalized === normalizeKey(officialName) || ignoredValues.has(normalized)) return false;

  const { data: existing, error: findError } = await supabase
    .from('vehicle_catalog_aliases')
    .select('id')
    .eq('entity_type', entityType)
    .eq('normalized_alias', normalized)
    .limit(1)
    .maybeSingle();
  if (findError) throw findError;
  if (existing) return false;

  const { data, error } = await supabase.from('vehicle_catalog_aliases').insert({
    entity_type: entityType,
    entity_id: entityId,
    alias: cleanText(alias, 220),
    source: 'catalog_assistant',
    is_active: true,
    metadata: { official_name: officialName },
    created_by: master.id,
    updated_by: master.id
  }).select('*').single();
  if (error) throw error;
  await writeAudit(supabase, master, 'vehicle_catalog_assistant_alias', 'aliases', data);
  return true;
}

async function applyRows(supabase: AdminClient, master: any, rawRows: unknown) {
  if (!Array.isArray(rawRows)) throw new Error('Nenhuma linha foi enviada para aprovação.');
  if (rawRows.length > 1500) throw new Error('A aprovação em lote aceita no máximo 1.500 linhas por vez.');

  const rows = rawRows.filter((item: any) => item && item.selected !== false) as ProposalRow[];
  const result = {
    processed: 0,
    brands_created: 0,
    models_created: 0,
    versions_created: 0,
    configurations_created: 0,
    fuels_created: 0,
    transmissions_created: 0,
    aliases_created: 0,
    skipped: 0,
    errors: [] as { id: string; error: string }[]
  };

  for (const row of rows) {
    try {
      const brandName = cleanText(row.brand, 120);
      const modelName = cleanText(row.model, 140);
      const versionName = cleanText(row.version, 180);
      if (!brandName || !modelName) {
        result.skipped += 1;
        continue;
      }

      const brandOutcome = await findOrCreateNamed(
        supabase,
        master,
        'vehicle_catalog_brands',
        'brands',
        brandName
      );
      if (brandOutcome.created) result.brands_created += 1;

      const modelOutcome = await findOrCreateNamed(
        supabase,
        master,
        'vehicle_catalog_models',
        'models',
        modelName,
        {
          brand_id: brandOutcome.record.id,
          start_year: row.manufacture_year || null,
          end_year: null
        }
      );
      if (modelOutcome.created) result.models_created += 1;

      for (const rawModel of unique(row.raw_models || [])) {
        if (await ensureAlias(supabase, master, 'model', modelOutcome.record.id, rawModel, modelName)) {
          result.aliases_created += 1;
        }
      }

      let versionRecord: any = null;
      if (versionName) {
        const versionOutcome = await findOrCreateNamed(
          supabase,
          master,
          'vehicle_catalog_versions',
          'versions',
          versionName,
          {
            model_id: modelOutcome.record.id,
            engine_name: inferEngine(versionName) ? `${inferEngine(versionName)} L` : null,
            engine_displacement: inferEngine(versionName)
          }
        );
        versionRecord = versionOutcome.record;
        if (versionOutcome.created) result.versions_created += 1;

        for (const rawVersion of unique(row.raw_versions || [])) {
          if (await ensureAlias(supabase, master, 'version', versionRecord.id, rawVersion, versionName)) {
            result.aliases_created += 1;
          }
        }
      }

      let fuelId: string | null = null;
      if (row.fuel) {
        const fuelOutcome = await findOrCreateNamed(
          supabase,
          master,
          'vehicle_catalog_fuels',
          'fuels',
          canonicalFuel(row.fuel)
        );
        fuelId = fuelOutcome.record.id;
        if (fuelOutcome.created) result.fuels_created += 1;
      }

      let transmissionId: string | null = null;
      if (row.transmission) {
        const transmissionOutcome = await findOrCreateNamed(
          supabase,
          master,
          'vehicle_catalog_transmissions',
          'transmissions',
          canonicalTransmission(row.transmission)
        );
        transmissionId = transmissionOutcome.record.id;
        if (transmissionOutcome.created) result.transmissions_created += 1;
      }

      if (versionRecord && row.manufacture_year && row.model_year) {
        const { data: existingConfiguration, error: findConfigurationError } = await supabase
          .from('vehicle_catalog_configurations')
          .select('*')
          .eq('version_id', versionRecord.id)
          .eq('manufacture_year', row.manufacture_year)
          .eq('model_year', row.model_year)
          .limit(1)
          .maybeSingle();
        if (findConfigurationError) throw findConfigurationError;

        if (!existingConfiguration) {
          const { data: configuration, error: configurationError } = await supabase
            .from('vehicle_catalog_configurations')
            .insert({
              version_id: versionRecord.id,
              manufacture_year: row.manufacture_year,
              model_year: row.model_year,
              fuel_id: fuelId,
              transmission_id: transmissionId,
              engine_name: inferEngine(versionName) ? `${inferEngine(versionName)} L` : null,
              engine_displacement: inferEngine(versionName),
              notes: 'Criado após revisão no assistente de construção automática do catálogo.',
              is_active: true,
              metadata: {
                source: 'catalog_assistant',
                source_count: row.source_count || 1,
                sources: row.sources || []
              },
              created_by: master.id,
              updated_by: master.id
            })
            .select('*')
            .single();
          if (configurationError) throw configurationError;
          result.configurations_created += 1;
          await writeAudit(supabase, master, 'vehicle_catalog_assistant_create', 'configurations', configuration);
        }
      }

      result.processed += 1;
    } catch (error: any) {
      result.errors.push({ id: row.id || 'unknown', error: error?.message || 'Falha ao processar a linha.' });
    }
  }

  return result;
}

export async function POST(request: Request) {
  try {
    const supabase = getAdminClient();
    const master = await requireMaster(request, supabase);
    if (!master) return NextResponse.json({ error: 'Acesso restrito ao perfil Master.' }, { status: 403 });

    const body = await request.json().catch(() => ({}));
    const action = cleanText(body.action || 'analyze', 40);

    if (action === 'analyze') {
      return NextResponse.json(await analyzeCatalog(supabase));
    }

    if (action === 'apply') {
      const result = await applyRows(supabase, master, body.rows);
      return NextResponse.json({ ok: true, result });
    }

    return NextResponse.json({ error: 'Ação inválida.' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Não foi possível executar o assistente.' }, { status: 500 });
  }
}
