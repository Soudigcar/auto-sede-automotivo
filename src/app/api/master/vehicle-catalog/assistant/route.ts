import { NextResponse } from 'next/server';
import { cleanText, getAdminClient, requireMaster } from '@/lib/server/masterApi';
import {
  classifyFuel,
  classifyTransmission,
  configurationIdentityKey,
  isValidYearPair,
  normalizeEngineNotation,
  normalizeVehicleText,
  parseVehicleYears,
  resolveEvidence,
  semanticVersionKey,
  type EvidenceSource
} from '@/lib/vehicleCatalogAssistantRules';

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
  fuel_source?: EvidenceSource;
  transmission_source?: EvidenceSource;
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
  raw_fuels?: string[];
  raw_transmissions?: string[];
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
  return normalizeVehicleText(cleanText(value, 1000));
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

  value = normalizeEngineNotation(value)
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

function canonicalFuel(raw: unknown) {
  return classifyFuel(raw).value;
}

function canonicalTransmission(raw: unknown) {
  return classifyTransmission(raw).value;
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

async function loadAllConfigurations(supabase: AdminClient) {
  const pageSize = 1000;
  const rows: any[] = [];

  for (let from = 0; from < 100000; from += pageSize) {
    const { data, error } = await supabase
      .from('vehicle_catalog_configurations')
      .select('id,version_id,manufacture_year,model_year,fuel_id,transmission_id')
      .order('id', { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if ((data || []).length < pageSize) break;
  }

  return rows;
}

async function loadReferenceData(supabase: AdminClient) {
  const [brandsResult, modelsResult, versionsResult, configurationsResult, fuelsResult, transmissionsResult, aliasesResult] = await Promise.all([
    supabase.from('vehicle_catalog_brands').select('*').order('name').limit(2000),
    supabase.from('vehicle_catalog_models').select('*').order('name').limit(10000),
    supabase.from('vehicle_catalog_versions').select('*').order('name').limit(20000),
    loadAllConfigurations(supabase),
    supabase.from('vehicle_catalog_fuels').select('*').limit(1000),
    supabase.from('vehicle_catalog_transmissions').select('*').limit(1000),
    supabase.from('vehicle_catalog_aliases').select('*').eq('is_active', true).limit(20000)
  ]);

  const results = [brandsResult, modelsResult, versionsResult, fuelsResult, transmissionsResult, aliasesResult];
  const error = results.find((result) => result.error)?.error;
  if (error) throw error;

  return {
    brands: brandsResult.data || [],
    models: modelsResult.data || [],
    versions: versionsResult.data || [],
    configurations: configurationsResult,
    fuels: fuelsResult.data || [],
    transmissions: transmissionsResult.data || [],
    aliases: aliasesResult.data || []
  };
}

function buildExistingMaps(reference: Awaited<ReturnType<typeof loadReferenceData>>) {
  const brandByKey = new Map<string, any>();
  const modelByKey = new Map<string, any>();
  const versionByKey = new Map<string, any>();
  const fuelByKey = new Map<string, any>();
  const transmissionByKey = new Map<string, any>();
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

  reference.versions.forEach((item: any) => versionByKey.set(`${item.model_id}:${semanticVersionKey(item.name)}`, item));
  reference.aliases
    .filter((item: any) => item.entity_type === 'version')
    .forEach((item: any) => {
      const version = reference.versions.find((entry: any) => entry.id === item.entity_id);
      if (version) versionByKey.set(`${version.model_id}:${semanticVersionKey(item.alias)}`, version);
    });

  reference.fuels.forEach((item: any) => {
    fuelByKey.set(normalizeKey(item.name), item);
    if (item.code) fuelByKey.set(normalizeKey(item.code), item);
  });
  reference.aliases
    .filter((item: any) => item.entity_type === 'fuel')
    .forEach((item: any) => {
      const fuel = reference.fuels.find((entry: any) => entry.id === item.entity_id);
      if (fuel) fuelByKey.set(normalizeKey(item.alias), fuel);
    });

  reference.transmissions.forEach((item: any) => {
    transmissionByKey.set(normalizeKey(item.name), item);
    if (item.code) transmissionByKey.set(normalizeKey(item.code), item);
  });
  reference.aliases
    .filter((item: any) => item.entity_type === 'transmission')
    .forEach((item: any) => {
      const transmission = reference.transmissions.find((entry: any) => entry.id === item.entity_id);
      if (transmission) transmissionByKey.set(normalizeKey(item.alias), transmission);
    });

  reference.configurations.forEach((item: any) => {
    configurationByKey.set(configurationIdentityKey({
      versionId: item.version_id,
      manufactureYear: item.manufacture_year,
      modelYear: item.model_year,
      fuelId: item.fuel_id,
      transmissionId: item.transmission_id
    }), item);
  });

  return { brandByKey, modelByKey, versionByKey, fuelByKey, transmissionByKey, configurationByKey };
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

  const sourceVehicles = [
    ...(siteResult.data || []).map((item: any) => normalizeSourceVehicle(item, 'site_vehicles')),
    ...(inventoryResult.data || []).map((item: any) => normalizeSourceVehicle(item, 'inventory'))
  ];

  return buildCatalogAnalysis(reference, sourceVehicles);
}

function buildCatalogAnalysis(
  reference: Awaited<ReturnType<typeof loadReferenceData>>,
  sourceVehicles: SourceVehicle[]
) {
  const existing = buildExistingMaps(reference);

  const baseGroups = new Map<string, any[]>();
  let ignored = 0;

  for (const source of sourceVehicles) {
    const brandCandidate = canonicalBrand(source.brand, existing.brandByKey);
    const officialBrand = existing.brandByKey.get(normalizeKey(brandCandidate));
    const brand = officialBrand?.name || brandCandidate;

    const modelCandidate = cleanModel(source.model, brand, source.version);
    const modelRecord = officialBrand
      ? existing.modelByKey.get(`${officialBrand.id}:${normalizeKey(modelCandidate)}`)
      : null;
    const model = modelRecord?.name || modelCandidate;

    const versionCandidate = cleanVersion(source.version, brand, model);
    const versionRecord = modelRecord && versionCandidate
      ? existing.versionByKey.get(`${modelRecord.id}:${semanticVersionKey(versionCandidate)}`)
      : null;
    const version = versionRecord?.name || versionCandidate;

    const years = parseVehicleYears(source.year, source.version);
    const fuelEvidence = resolveEvidence(source.fuel, source.version, classifyFuel);
    const transmissionEvidence = resolveEvidence(source.transmission, source.version, classifyTransmission);
    const fuelRecord = fuelEvidence.value
      ? existing.fuelByKey.get(normalizeKey(fuelEvidence.value))
      : null;
    const transmissionRecord = transmissionEvidence.value
      ? existing.transmissionByKey.get(normalizeKey(transmissionEvidence.value))
      : null;
    const fuel = fuelRecord?.name || '';
    const transmission = transmissionRecord?.name || '';

    if (!brand && !model && !version) {
      ignored += 1;
      continue;
    }

    const baseKey = [
      normalizeKey(brand),
      normalizeKey(model),
      semanticVersionKey(version),
      years.manufacture_year || '',
      years.model_year || ''
    ].join('|');
    const current = baseGroups.get(baseKey) || [];
    current.push({
      source,
      brand,
      model,
      version,
      manufacture_year: years.manufacture_year,
      model_year: years.model_year,
      fuel,
      transmission,
      fuelEvidence,
      transmissionEvidence,
      officialBrand,
      modelRecord,
      versionRecord,
      fuelRecord,
      transmissionRecord
    });
    baseGroups.set(baseKey, current);
  }

  const groups = new Map<string, any[]>();
  for (const [baseKey, observations] of baseGroups.entries()) {
    const knownFuels = new Set(observations.map((item) => item.fuel).filter(Boolean));
    const knownTransmissions = new Set(observations.map((item) => item.transmission).filter(Boolean));

    if (knownFuels.size <= 1 && knownTransmissions.size <= 1) {
      const fuel = Array.from(knownFuels)[0] || '';
      const transmission = Array.from(knownTransmissions)[0] || '';
      groups.set(`${baseKey}|${normalizeKey(fuel)}|${normalizeKey(transmission)}`, observations);
      continue;
    }

    for (const observation of observations) {
      const exactKey = `${baseKey}|${normalizeKey(observation.fuel)}|${normalizeKey(observation.transmission)}`;
      const current = groups.get(exactKey) || [];
      current.push({ ...observation, ambiguousConfigurationFamily: !observation.fuel || !observation.transmission });
      groups.set(exactKey, current);
    }
  }

  const rows: ProposalRow[] = Array.from(groups.entries()).map(([key, observations]) => {
    const warnings: string[] = [];
    const first = observations[0];
    const officialBrand = first.officialBrand;
    const modelRecord = first.modelRecord;
    const versionRecord = first.versionRecord;
    const fuel = observations.find((item) => item.fuel)?.fuel || '';
    const transmission = observations.find((item) => item.transmission)?.transmission || '';
    const fuelRecord = fuel ? existing.fuelByKey.get(normalizeKey(fuel)) : null;
    const transmissionRecord = transmission ? existing.transmissionByKey.get(normalizeKey(transmission)) : null;
    const configurationRecord = versionRecord && isValidYearPair(first.manufacture_year, first.model_year)
      ? existing.configurationByKey.get(configurationIdentityKey({
        versionId: versionRecord.id,
        manufactureYear: first.manufacture_year,
        modelYear: first.model_year,
        fuelId: fuelRecord?.id || null,
        transmissionId: transmissionRecord?.id || null
      }))
      : null;

    const rawBrands = new Set(observations.map((item) => item.source.brand).filter(Boolean));
    const rawModels = new Set(observations.map((item) => item.source.model).filter(Boolean));
    const rawVersions = new Set(observations.map((item) => item.source.version).filter(Boolean));
    const rawFuels = new Set(observations.map((item) => item.source.fuel).filter(Boolean));
    const rawTransmissions = new Set(observations.map((item) => item.source.transmission).filter(Boolean));
    const sources = new Set(observations.map((item) => item.source.source));
    const sourceIds = new Set(observations.map((item) => `${item.source.source}:${item.source.source_id}`));
    const invalidFuel = observations.some((item) => item.fuelEvidence.invalidExplicit || item.fuelEvidence.ambiguous);
    const invalidTransmission = observations.some((item) => item.transmissionEvidence.invalidExplicit || item.transmissionEvidence.ambiguous);
    const ambiguousFamily = observations.some((item) => item.ambiguousConfigurationFamily);
    const modelEqualsBrand = normalizeKey(first.model) === normalizeKey(first.brand);

    const evidenceRank: Record<EvidenceSource, number> = { source: 0, reviewed: 1, version: 2, none: 3 };
    const fuelSource = observations
      .filter((item) => item.fuel === fuel)
      .map((item) => item.fuelEvidence.source as EvidenceSource)
      .sort((a, b) => evidenceRank[a] - evidenceRank[b])[0] || 'none';
    const transmissionSource = observations
      .filter((item) => item.transmission === transmission)
      .map((item) => item.transmissionEvidence.source as EvidenceSource)
      .sort((a, b) => evidenceRank[a] - evidenceRank[b])[0] || 'none';

    if (!first.brand) warnings.push('Marca ausente ou inválida.');
    if (!first.model) warnings.push('Modelo ausente ou inválido.');
    if (modelEqualsBrand) warnings.push('O modelo repete a marca; corrija o modelo antes de aprovar.');
    if (!officialBrand && first.brand) warnings.push('Marca não encontrada na lista oficial; revise antes de cadastrar.');
    if (!isValidYearPair(first.manufacture_year, first.model_year)) warnings.push('Ano incompleto ou incompatível; revise fabricação e modelo.');
    if (!first.version) warnings.push('Versão não informada; a configuração não pode ser criada.');
    if (!fuel) warnings.push('Combustível sem comprovação; o campo foi mantido vazio.');
    if (!transmission) warnings.push('Câmbio sem comprovação; o campo foi mantido vazio.');
    if (invalidFuel) warnings.push('O texto original de combustível não corresponde a um dos 7 valores oficiais.');
    if (invalidTransmission) warnings.push('O texto original de câmbio não corresponde a um dos 5 valores oficiais.');
    if (ambiguousFamily) warnings.push('Há configurações diferentes para a mesma versão/ano; revise o campo sem evidência.');
    if (rawModels.size > 1) warnings.push(`${rawModels.size} escritas equivalentes de modelo foram agrupadas.`);
    if (rawVersions.size > 1) warnings.push(`${rawVersions.size} escritas equivalentes de versão foram agrupadas.`);

    let status = 'new';
    if (!first.brand || !first.model || !first.version || modelEqualsBrand || !isValidYearPair(first.manufacture_year, first.model_year)) {
      status = 'incomplete';
    } else if (configurationRecord) {
      status = 'existing';
    } else if (!officialBrand || !fuel || !transmission || invalidFuel || invalidTransmission || ambiguousFamily) {
      status = 'conflict';
    } else if (rawModels.size > 1 || rawVersions.size > 1 || sourceIds.size > 1) {
      status = 'duplicate';
    }

    return {
      id: stableId(key),
      selected: !['existing', 'incomplete', 'conflict'].includes(status),
      status,
      brand: first.brand,
      model: first.model,
      version: first.version,
      manufacture_year: first.manufacture_year,
      model_year: first.model_year,
      fuel,
      transmission,
      fuel_source: fuelSource,
      transmission_source: transmissionSource,
      source_count: sourceIds.size,
      sources: Array.from(sources),
      raw_brands: Array.from(rawBrands),
      raw_models: Array.from(rawModels),
      raw_versions: Array.from(rawVersions),
      raw_fuels: Array.from(rawFuels),
      raw_transmissions: Array.from(rawTransmissions),
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
    brands: reference.brands.map((item: any) => ({ id: item.id, name: item.name })),
    fuels: reference.fuels.map((item: any) => ({ id: item.id, name: item.name })),
    transmissions: reference.transmissions.map((item: any) => ({ id: item.id, name: item.name }))
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
    configurations_existing: 0,
    fuels_created: 0,
    transmissions_created: 0,
    aliases_created: 0,
    skipped: 0,
    errors: [] as { id: string; error: string }[]
  };

  const reference = await loadReferenceData(supabase);
  const existing = buildExistingMaps(reference);

  for (const row of rows) {
    try {
      const brandCandidate = canonicalBrand(row.brand, existing.brandByKey);
      const brandRecord = existing.brandByKey.get(normalizeKey(brandCandidate));
      if (!brandRecord) throw new Error('Marca não reconhecida na lista oficial.');

      const brandName = brandRecord.name;
      const modelName = cleanModel(row.model, brandName, row.version);
      const versionName = cleanVersion(row.version, brandName, modelName);
      const manufactureYear = Number(row.manufacture_year || 0) || null;
      const modelYear = Number(row.model_year || 0) || null;

      if (!modelName || normalizeKey(modelName) === normalizeKey(brandName)) {
        throw new Error('Modelo ausente ou igual à marca.');
      }
      if (!versionName) throw new Error('Versão não informada.');
      if (!isValidYearPair(manufactureYear, modelYear)) {
        throw new Error('Ano de fabricação/modelo ausente ou incompatível.');
      }

      const canonicalFuelName = row.fuel ? canonicalFuel(row.fuel) : '';
      if (row.fuel && !canonicalFuelName) throw new Error('Combustível fora da lista oficial.');
      const fuelRecord = canonicalFuelName
        ? existing.fuelByKey.get(normalizeKey(canonicalFuelName))
        : null;
      if (canonicalFuelName && !fuelRecord) throw new Error('Combustível oficial não localizado.');

      const canonicalTransmissionName = row.transmission ? canonicalTransmission(row.transmission) : '';
      if (row.transmission && !canonicalTransmissionName) throw new Error('Câmbio fora da lista oficial.');
      const transmissionRecord = canonicalTransmissionName
        ? existing.transmissionByKey.get(normalizeKey(canonicalTransmissionName))
        : null;
      if (canonicalTransmissionName && !transmissionRecord) throw new Error('Câmbio oficial não localizado.');

      const knownModel = existing.modelByKey.get(`${brandRecord.id}:${normalizeKey(modelName)}`);
      const modelOutcome = knownModel
        ? { record: knownModel, created: false }
        : await findOrCreateNamed(
          supabase,
          master,
          'vehicle_catalog_models',
          'models',
          modelName,
          {
            brand_id: brandRecord.id,
            start_year: manufactureYear,
            end_year: null
          }
        );

      if (modelOutcome.created) result.models_created += 1;

      for (const rawModel of unique(row.raw_models || [])) {
        if (await ensureAlias(supabase, master, 'model', modelOutcome.record.id, rawModel, modelName)) {
          result.aliases_created += 1;
        }
      }

      let versionRecord: any = existing.versionByKey.get(`${modelOutcome.record.id}:${semanticVersionKey(versionName)}`);
      if (!versionRecord) {
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
      }

      for (const rawVersion of unique(row.raw_versions || [])) {
        if (await ensureAlias(supabase, master, 'version', versionRecord.id, rawVersion, versionName)) {
          result.aliases_created += 1;
        }
      }

      const fuelId = fuelRecord?.id || null;
      const transmissionId = transmissionRecord?.id || null;
      let configurationQuery = supabase
        .from('vehicle_catalog_configurations')
        .select('*')
        .eq('version_id', versionRecord.id)
        .eq('manufacture_year', manufactureYear)
        .eq('model_year', modelYear);
      configurationQuery = fuelId
        ? configurationQuery.eq('fuel_id', fuelId)
        : configurationQuery.is('fuel_id', null);
      configurationQuery = transmissionId
        ? configurationQuery.eq('transmission_id', transmissionId)
        : configurationQuery.is('transmission_id', null);

      const { data: existingConfiguration, error: findConfigurationError } = await configurationQuery
        .limit(1)
        .maybeSingle();
      if (findConfigurationError) throw findConfigurationError;

      if (existingConfiguration) {
        result.configurations_existing += 1;
      } else {
        const { data: configuration, error: configurationError } = await supabase
          .from('vehicle_catalog_configurations')
          .insert({
            version_id: versionRecord.id,
            manufacture_year: manufactureYear,
            model_year: modelYear,
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
        if (configurationError?.code === '23505') {
          result.configurations_existing += 1;
        } else if (configurationError) {
          throw configurationError;
        } else {
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
