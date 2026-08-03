import { normalizeVehicleOption } from '@/lib/vehicleCatalogOptions';

export type CatalogVehicleInput = {
  source_url?: string;
  title?: string;
  description?: string;
  brand?: string;
  model?: string;
  version?: string;
  year?: string;
  mileage?: string;
  color?: string;
  transmission?: string;
  fuel?: string;
  price?: number;
};

type CatalogEvidence = {
  field: 'fuel' | 'transmission';
  value: string;
  source: 'vehicle_catalog';
  confidence: 'high' | 'consensus';
  candidate_versions: string[];
};

type CatalogMetadata = {
  matched: boolean;
  brand?: string;
  model?: string;
  candidate_versions?: string[];
  fields?: CatalogEvidence[];
  reason?: string;
  error?: string;
};

export type CatalogEnrichmentResult = {
  vehicle: CatalogVehicleInput;
  evidence: CatalogEvidence[];
  warnings: string[];
  metadata: CatalogMetadata;
};

function cleanText(value: unknown, maxLength = 12000) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function fold(value: unknown) {
  return cleanText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9.,]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function canonicalVersionToken(token: string) {
  const value = fold(token);
  if (['adv', 'advent', 'adventure'].includes(value)) return 'adventure';
  if (['lock', 'locker'].includes(value)) return 'locker';
  if (['dual', 'dualogic', 'dualógic'].includes(value)) return 'dualogic';
  if (['auto', 'automatico', 'automatica'].includes(value)) return 'automatico';
  if (['automatizado', 'automatizada'].includes(value)) return 'automatizado';
  return value.replace(',', '.');
}

function versionTokens(value: unknown) {
  const ignored = new Set([
    'de', 'do', 'da', 'dos', 'das', 'e', 'com', 'sem', 'em',
    'mpi', 'fire', '8v', '16v', '20v', '5p', '4p', '3p',
    'flex', 'gasolina', 'diesel', 'etanol', 'alcool', 'gnv'
  ]);

  const matches = fold(value).match(/[a-z]+|\d+(?:[.,]\d+)?/g) || [];
  return Array.from(new Set(matches.map(canonicalVersionToken).filter((token) => token && !ignored.has(token))));
}

function extractYears(value: unknown) {
  return Array.from(new Set((cleanText(value).match(/\b(?:19|20)\d{2}\b/g) || []).map(Number)));
}

function explicitFuelFromVersion(value: unknown) {
  const text = fold(value);
  const matches = [
    ['flex', 'Flex'],
    ['diesel', 'Diesel'],
    ['gasolina', 'Gasolina'],
    ['etanol', 'Etanol'],
    ['alcool', 'Etanol'],
    ['eletrico', 'Elétrico'],
    ['hibrido', 'Híbrido'],
    ['gnv', 'GNV']
  ] as const;

  for (const [needle, canonical] of matches) {
    if (new RegExp(`\\b${needle}\\b`, 'i').test(text)) return canonical;
  }
  return '';
}

function explicitTransmissionFromVersion(value: unknown) {
  const text = fold(value);
  if (/\bdualogic\b|\bautomatizad[oa]\b/.test(text)) return 'Automatizado';
  if (/\bcvt\b/.test(text)) return 'CVT';
  if (/\bautomatic[oa]\b/.test(text)) return 'Automático';
  if (/\bmanual\b|\bmecanic[oa]\b/.test(text)) return 'Manual';
  return '';
}

function unanimous(values: unknown[]) {
  const normalized = values
    .map((value) => cleanText(value))
    .filter(Boolean);
  if (!normalized.length) return '';
  const unique = Array.from(new Set(normalized));
  return unique.length === 1 ? unique[0] : '';
}

function scoreVersion(inputVersion: string, candidateVersion: any) {
  const inputTokens = versionTokens(inputVersion);
  const candidateTokens = versionTokens(candidateVersion?.name || candidateVersion?.normalized_name);
  if (!inputTokens.length || !candidateTokens.length) return { score: 0, coverage: 0 };

  const candidateSet = new Set(candidateTokens);
  const matched = inputTokens.filter((token) => candidateSet.has(token)).length;
  const coverage = matched / inputTokens.length;
  let score = coverage;

  const inputEngine = inputTokens.find((token) => /^\d+[.]\d+$/.test(token));
  const candidateEngine = cleanText(candidateVersion?.engine_displacement).replace(',', '.');
  if (inputEngine && candidateEngine) {
    if (inputEngine === candidateEngine) score += 0.15;
    else score -= 0.35;
  }

  if (fold(inputVersion) === fold(candidateVersion?.name)) score += 0.4;
  return { score, coverage };
}

async function resolveDirectOrAlias(
  supabase: any,
  table: string,
  entityType: 'brand' | 'model' | 'version',
  normalizedValue: string,
  extraFilter?: { column: string; value: string }
) {
  let query = supabase
    .from(table)
    .select('*')
    .eq('is_active', true)
    .eq('normalized_name', normalizedValue)
    .limit(2);

  if (extraFilter) query = query.eq(extraFilter.column, extraFilter.value);
  const direct = await query;
  if (direct.error) throw direct.error;
  if ((direct.data || []).length === 1) return direct.data[0];

  const aliasResult = await supabase
    .from('vehicle_catalog_aliases')
    .select('entity_id')
    .eq('entity_type', entityType)
    .eq('normalized_alias', normalizedValue)
    .eq('is_active', true)
    .limit(3);
  if (aliasResult.error) throw aliasResult.error;

  const ids = Array.from(new Set((aliasResult.data || []).map((item: any) => item.entity_id).filter(Boolean)));
  if (ids.length !== 1) return null;

  let aliasQuery = supabase.from(table).select('*').eq('id', ids[0]).eq('is_active', true);
  if (extraFilter) aliasQuery = aliasQuery.eq(extraFilter.column, extraFilter.value);
  const aliasEntity = await aliasQuery.maybeSingle();
  if (aliasEntity.error) throw aliasEntity.error;
  return aliasEntity.data || null;
}

export async function enrichVehicleFromCatalog(
  supabase: any,
  input: CatalogVehicleInput
): Promise<CatalogEnrichmentResult> {
  const vehicle: CatalogVehicleInput = {
    ...input,
    brand: cleanText(input.brand, 100),
    model: cleanText(input.model, 140),
    version: cleanText(input.version, 220),
    year: cleanText(input.year, 40),
    fuel: normalizeVehicleOption('fuel', input.fuel),
    transmission: normalizeVehicleOption('transmission', input.transmission)
  };

  const evidence: CatalogEvidence[] = [];
  const warnings: string[] = [];

  if (!vehicle.brand || !vehicle.model || (vehicle.fuel && vehicle.transmission)) {
    return {
      vehicle,
      evidence,
      warnings,
      metadata: { matched: false, reason: 'Campos já preenchidos ou identificação insuficiente.' }
    };
  }

  try {
    const brand = await resolveDirectOrAlias(
      supabase,
      'vehicle_catalog_brands',
      'brand',
      fold(vehicle.brand)
    );
    if (!brand) {
      return { vehicle, evidence, warnings, metadata: { matched: false, reason: 'Marca não encontrada com correspondência única.' } };
    }

    const model = await resolveDirectOrAlias(
      supabase,
      'vehicle_catalog_models',
      'model',
      fold(vehicle.model),
      { column: 'brand_id', value: brand.id }
    );
    if (!model) {
      return { vehicle, evidence, warnings, metadata: { matched: false, brand: brand.name, reason: 'Modelo não encontrado com correspondência única.' } };
    }

    const versionsResult = await supabase
      .from('vehicle_catalog_versions')
      .select('id,name,normalized_name,engine_displacement,metadata')
      .eq('model_id', model.id)
      .eq('is_active', true)
      .limit(250);
    if (versionsResult.error) throw versionsResult.error;

    const scored = (versionsResult.data || [])
      .map((version: any) => ({ version, ...scoreVersion(vehicle.version || vehicle.title || '', version) }))
      .filter((item: any) => item.coverage >= 0.6 && item.score > 0)
      .sort((left: any, right: any) => right.score - left.score);

    if (!scored.length) {
      return {
        vehicle,
        evidence,
        warnings,
        metadata: { matched: true, brand: brand.name, model: model.name, reason: 'Versão sem correspondência segura.' }
      };
    }

    const topScore = scored[0].score;
    const plausible = scored
      .filter((item: any) => item.score >= topScore - 0.08)
      .slice(0, 12)
      .map((item: any) => item.version);

    const versionIds = plausible.map((version: any) => version.id);
    const configurationsResult = await supabase
      .from('vehicle_catalog_configurations')
      .select('version_id,manufacture_year,model_year,fuel_id,transmission_id,engine_displacement')
      .in('version_id', versionIds)
      .eq('is_active', true)
      .limit(1000);
    if (configurationsResult.error) throw configurationsResult.error;

    const years = extractYears(vehicle.year);
    const rawConfigurations = configurationsResult.data || [];
    const configurations = years.length
      ? rawConfigurations.filter((configuration: any) => years.includes(Number(configuration.model_year)) || years.includes(Number(configuration.manufacture_year)))
      : rawConfigurations;

    const fuelIds = Array.from(new Set(configurations.map((item: any) => item.fuel_id).filter(Boolean)));
    const transmissionIds = Array.from(new Set(configurations.map((item: any) => item.transmission_id).filter(Boolean)));

    const [fuelResult, transmissionResult] = await Promise.all([
      fuelIds.length
        ? supabase.from('vehicle_catalog_fuels').select('id,name').in('id', fuelIds).eq('is_active', true)
        : Promise.resolve({ data: [], error: null }),
      transmissionIds.length
        ? supabase.from('vehicle_catalog_transmissions').select('id,name').in('id', transmissionIds).eq('is_active', true)
        : Promise.resolve({ data: [], error: null })
    ]);
    if (fuelResult.error) throw fuelResult.error;
    if (transmissionResult.error) throw transmissionResult.error;

    const fuelMap = new Map((fuelResult.data || []).map((item: any) => [item.id, normalizeVehicleOption('fuel', item.name)]));
    const transmissionMap = new Map((transmissionResult.data || []).map((item: any) => [item.id, normalizeVehicleOption('transmission', item.name)]));

    const candidateValues = plausible.map((version: any) => {
      const candidateConfigurations = configurations.filter((configuration: any) => configuration.version_id === version.id);
      const fuelFromName = explicitFuelFromVersion(version.name);
      const transmissionFromName = explicitTransmissionFromVersion(version.name);
      const fuelFromConfigurations = unanimous(candidateConfigurations.map((configuration: any) => fuelMap.get(configuration.fuel_id)).filter(Boolean));
      const transmissionFromConfigurations = unanimous(candidateConfigurations.map((configuration: any) => transmissionMap.get(configuration.transmission_id)).filter(Boolean));

      return {
        version: version.name,
        fuel: fuelFromName || fuelFromConfigurations,
        transmission: transmissionFromName || transmissionFromConfigurations
      };
    });

    const candidateVersions = candidateValues.map((item: any) => item.version);
    const confidence: 'high' | 'consensus' = candidateValues.length === 1 ? 'high' : 'consensus';

    if (!vehicle.fuel) {
      const consensusFuel = unanimous(candidateValues.map((item: any) => item.fuel));
      if (consensusFuel && candidateValues.every((item: any) => item.fuel === consensusFuel)) {
        vehicle.fuel = consensusFuel;
        evidence.push({ field: 'fuel', value: consensusFuel, source: 'vehicle_catalog', confidence, candidate_versions: candidateVersions });
        warnings.push(`Combustível preenchido pelo catálogo interno (${confidence === 'high' ? 'correspondência única' : 'consenso entre versões compatíveis'}): ${consensusFuel}.`);
      }
    }

    if (!vehicle.transmission) {
      const consensusTransmission = unanimous(candidateValues.map((item: any) => item.transmission));
      if (consensusTransmission && candidateValues.every((item: any) => item.transmission === consensusTransmission)) {
        vehicle.transmission = consensusTransmission;
        evidence.push({ field: 'transmission', value: consensusTransmission, source: 'vehicle_catalog', confidence, candidate_versions: candidateVersions });
        warnings.push(`Câmbio preenchido pelo catálogo interno (${confidence === 'high' ? 'correspondência única' : 'consenso entre versões compatíveis'}): ${consensusTransmission}.`);
      }
    }

    return {
      vehicle,
      evidence,
      warnings,
      metadata: {
        matched: true,
        brand: brand.name,
        model: model.name,
        candidate_versions: candidateVersions,
        fields: evidence,
        reason: evidence.length ? 'Campos ausentes preenchidos com correspondência conservadora.' : 'Catálogo consultado, mas sem consenso suficiente para preencher campos ausentes.'
      }
    };
  } catch (error: any) {
    return {
      vehicle,
      evidence,
      warnings,
      metadata: {
        matched: false,
        error: cleanText(error?.message || 'Falha ao consultar o catálogo interno.', 500)
      }
    };
  }
}
