import { createClient } from '@supabase/supabase-js';
import { normalizeVehicleOption } from '@/lib/vehicleCatalogOptions';

export type VehicleImportFieldEvidence = {
  field: 'transmission' | 'fuel' | 'color';
  value: string;
  confidence: number;
  source: 'technical_page' | 'description' | 'version_code' | 'vehicle_catalog';
  detail: string;
};

type AutoFillInput = {
  title?: string;
  description?: string;
  vehicle: Record<string, any>;
  evidence?: Record<string, any> | null;
};

function clean(value: unknown) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function fold(value: unknown) {
  return clean(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function compact(value: unknown) {
  return fold(value).replace(/\s+/g, '');
}

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function directEvidence(input: AutoFillInput): VehicleImportFieldEvidence[] {
  const evidence: VehicleImportFieldEvidence[] = [];
  const vehicle = input.vehicle || {};
  const description = fold(input.description || vehicle.description);
  const version = compact(vehicle.version || input.title);

  if (vehicle.transmission) {
    evidence.push({
      field: 'transmission',
      value: normalizeVehicleOption('transmission', vehicle.transmission),
      confidence: 100,
      source: 'technical_page',
      detail: 'Campo técnico extraído da página.'
    });
  } else {
    const match = description.match(/\b(?:cambio|transmissao)\s*(?:de\s*)?(manual|mecanico|mecanica|automatico|automatica|automatizado|automatizada|cvt|dualogic)\b/);
    if (match?.[1]) {
      evidence.push({
        field: 'transmission',
        value: /dualogic|automatizad/.test(match[1]) ? 'Automatizado' : normalizeVehicleOption('transmission', match[1]),
        confidence: 98,
        source: 'description',
        detail: `Descrição original informa “${match[0]}”.`
      });
    }
  }

  if (!evidence.some((item) => item.field === 'transmission')) {
    const code = version.match(/(\d{2})(mt|at|cvt)/i);
    if (code?.[2]) {
      const value = code[2].toLowerCase() === 'mt'
        ? 'Manual'
        : code[2].toLowerCase() === 'cvt'
          ? 'CVT'
          : 'Automático';
      evidence.push({
        field: 'transmission',
        value,
        confidence: 95,
        source: 'version_code',
        detail: `Código de versão “${clean(vehicle.version)}” contém ${code[2].toUpperCase()}.`
      });
    }
  }

  if (vehicle.fuel) {
    evidence.push({ field: 'fuel', value: normalizeVehicleOption('fuel', vehicle.fuel), confidence: 100, source: 'technical_page', detail: 'Campo técnico extraído da página.' });
  }
  if (vehicle.color) {
    evidence.push({ field: 'color', value: normalizeVehicleOption('color', vehicle.color), confidence: 100, source: 'technical_page', detail: 'Campo técnico extraído da página.' });
  }

  return evidence.filter((item) => item.value);
}

function versionSignals(value: unknown) {
  const normalized = compact(value);
  const engineCode = normalized.match(/(10|12|13|14|15|16|18|20)(?:mt|at|cvt|$)/)?.[1]
    || normalized.match(/(10|12|13|14|15|16|18|20)/)?.[1]
    || '';
  const engine = engineCode ? `${engineCode[0]}.${engineCode[1]}` : '';
  const transmission = /mt$/.test(normalized)
    ? 'Manual'
    : /cvt/.test(normalized)
      ? 'CVT'
      : /at$/.test(normalized)
        ? 'Automático'
        : '';
  const base = normalized
    .replace(/(10|12|13|14|15|16|18|20)(mt|at|cvt)?/g, '')
    .replace(/flex|gasolina|diesel|mec|manual|aut|automatico|automatica|cvt/g, '');
  return { engine, transmission, base };
}

function scoreCatalogVersion(inputVersion: unknown, candidate: any) {
  const input = versionSignals(inputVersion);
  const candidateText = `${candidate?.name || ''} ${candidate?.engine_displacement || ''}`;
  const candidateFold = fold(candidateText);
  const candidateCompact = compact(candidateText);
  let score = 0;

  if (input.base && candidateCompact.includes(input.base)) score += 45;
  else {
    const words = fold(inputVersion).split(' ').filter((word) => word.length >= 3);
    const matched = words.filter((word) => candidateFold.includes(word)).length;
    score += Math.min(40, matched * 20);
  }

  if (input.engine) {
    const candidateEngine = clean(candidate?.engine_displacement).replace(',', '.');
    if (candidateEngine === input.engine || candidateFold.includes(input.engine)) score += 35;
    else score -= 25;
  }

  if (input.transmission) {
    const candidateTransmission = /\bmec\b|\bmanual\b/.test(candidateFold)
      ? 'Manual'
      : /\bcvt\b/.test(candidateFold)
        ? 'CVT'
        : /\baut\b|\bautomatic/.test(candidateFold)
          ? 'Automático'
          : '';
    if (candidateTransmission === input.transmission) score += 25;
    else if (candidateTransmission) score -= 30;
  }

  if (compact(inputVersion) === compact(candidate?.name)) score += 30;
  return score;
}

async function catalogEvidence(input: AutoFillInput): Promise<VehicleImportFieldEvidence[]> {
  const supabase = getAdminClient();
  const vehicle = input.vehicle || {};
  if (!supabase || !vehicle.brand || !vehicle.model) return [];

  const brandName = fold(vehicle.brand);
  const modelName = fold(vehicle.model);
  const { data: brands } = await supabase
    .from('vehicle_catalog_brands')
    .select('id,name,normalized_name')
    .eq('is_active', true)
    .limit(500);
  const brand = (brands || []).find((item: any) => fold(item.normalized_name || item.name) === brandName);
  if (!brand) return [];

  const { data: models } = await supabase
    .from('vehicle_catalog_models')
    .select('id,name,normalized_name')
    .eq('brand_id', brand.id)
    .eq('is_active', true)
    .limit(500);
  const model = (models || []).find((item: any) => fold(item.normalized_name || item.name) === modelName);
  if (!model) return [];

  const { data: versions } = await supabase
    .from('vehicle_catalog_versions')
    .select('id,name,normalized_name,engine_displacement')
    .eq('model_id', model.id)
    .eq('is_active', true)
    .limit(500);

  const ranked = (versions || [])
    .map((candidate: any) => ({ candidate, score: scoreCatalogVersion(vehicle.version || input.title, candidate) }))
    .filter((item: any) => item.score >= 65)
    .sort((a: any, b: any) => b.score - a.score);
  if (!ranked.length) return [];

  const topScore = ranked[0].score;
  const plausible = ranked.filter((item: any) => item.score >= topScore - 5).slice(0, 8);
  const ids = plausible.map((item: any) => item.candidate.id);
  const { data: configurations } = await supabase
    .from('vehicle_catalog_configurations')
    .select('version_id,manufacture_year,model_year,fuel_id,transmission_id')
    .in('version_id', ids)
    .eq('is_active', true)
    .limit(1500);

  const transmissionIds = Array.from(new Set((configurations || []).map((item: any) => item.transmission_id).filter(Boolean)));
  const fuelIds = Array.from(new Set((configurations || []).map((item: any) => item.fuel_id).filter(Boolean)));
  const [{ data: transmissions }, { data: fuels }] = await Promise.all([
    transmissionIds.length
      ? supabase.from('vehicle_catalog_transmissions').select('id,name').in('id', transmissionIds).eq('is_active', true)
      : Promise.resolve({ data: [] } as any),
    fuelIds.length
      ? supabase.from('vehicle_catalog_fuels').select('id,name').in('id', fuelIds).eq('is_active', true)
      : Promise.resolve({ data: [] } as any)
  ]);

  const transmissionMap = new Map((transmissions || []).map((item: any) => [item.id, normalizeVehicleOption('transmission', item.name)]));
  const fuelMap = new Map((fuels || []).map((item: any) => [item.id, normalizeVehicleOption('fuel', item.name)]));
  const transmissionValues = Array.from(new Set((configurations || []).map((item: any) => transmissionMap.get(item.transmission_id)).filter(Boolean)));
  const fuelValues = Array.from(new Set((configurations || []).map((item: any) => fuelMap.get(item.fuel_id)).filter(Boolean)));
  const candidates = plausible.map((item: any) => item.candidate.name);
  const confidence = plausible.length === 1 ? 94 : 88;
  const result: VehicleImportFieldEvidence[] = [];

  if (transmissionValues.length === 1) {
    result.push({
      field: 'transmission',
      value: String(transmissionValues[0]),
      confidence,
      source: 'vehicle_catalog',
      detail: `Catálogo interno: ${candidates.join(' | ')}.`
    });
  }
  if (fuelValues.length === 1) {
    result.push({
      field: 'fuel',
      value: String(fuelValues[0]),
      confidence,
      source: 'vehicle_catalog',
      detail: `Catálogo interno: ${candidates.join(' | ')}.`
    });
  }

  return result;
}

export async function autoFillVehicleImport(input: AutoFillInput) {
  const direct = directEvidence(input);
  const catalog = await catalogEvidence(input);
  const allEvidence = [...direct, ...catalog];
  const vehicle = { ...(input.vehicle || {}) };
  const fieldConfidence: Record<string, any> = {};

  for (const field of ['transmission', 'fuel', 'color'] as const) {
    const candidates = allEvidence
      .filter((item) => item.field === field && item.value)
      .sort((left, right) => right.confidence - left.confidence);
    const best = candidates[0];
    if (!best) continue;

    const conflict = candidates.some((item) => item.value !== best.value && item.confidence >= 85);
    fieldConfidence[field] = {
      value: best.value,
      confidence: conflict ? 0 : best.confidence,
      source: best.source,
      detail: best.detail,
      evidence: candidates,
      conflict
    };

    if (!conflict && best.confidence >= 85 && !clean(vehicle[field])) {
      vehicle[field] = best.value;
    }
  }

  return {
    vehicle,
    evidence: {
      ...(input.evidence || {}),
      field_confidence: fieldConfidence,
      catalog_evidence: catalog,
      direct_evidence: direct
    }
  };
}
