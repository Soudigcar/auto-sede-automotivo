export type EvidenceSource = 'source' | 'version' | 'none' | 'reviewed';

export type ClassifiedValue = {
  value: string;
  ambiguous: boolean;
};

export type ResolvedEvidence = {
  value: string;
  source: EvidenceSource;
  invalidExplicit: boolean;
  ambiguous: boolean;
};

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

export function normalizeVehicleText(value: unknown) {
  return decodeHtml(value)
    .slice(0, 1000)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeEngineNotation(value: unknown) {
  return decodeHtml(value)
    .replace(/\b([1-8])0\s*[lL]\b/g, '$1.0 L')
    .replace(/\b([0-9])\s*[.,]\s*([0-9])\s*[lL]\b/g, '$1.$2 L')
    .replace(/\b([0-9])\s*[.,]\s*([0-9])\b/g, '$1.$2')
    .replace(/\s+/g, ' ')
    .trim();
}

export function semanticVersionKey(value: unknown) {
  return normalizeVehicleText(normalizeEngineNotation(value));
}

function extractYears(value: unknown) {
  return Array.from(String(value || '').matchAll(/\b(?:19|20)\d{2}\b/g))
    .map((match) => Number(match[0]));
}

export function parseVehicleYears(yearValue: unknown, versionValue: unknown) {
  const primary = extractYears(yearValue);
  const secondary = extractYears(versionValue);

  if (primary.length >= 2) {
    return { manufacture_year: primary[0], model_year: primary[1] };
  }

  if (primary.length === 1) {
    const modelYear = secondary.find((year) => year !== primary[0]) || primary[0];
    return { manufacture_year: primary[0], model_year: modelYear };
  }

  if (secondary.length >= 2) {
    return { manufacture_year: secondary[0], model_year: secondary[1] };
  }

  if (secondary.length === 1) {
    return { manufacture_year: secondary[0], model_year: secondary[0] };
  }

  return { manufacture_year: null, model_year: null };
}

function hasToken(key: string, token: string) {
  return new RegExp(`(?:^|\\s)${token}(?:\\s|$)`).test(key);
}

export function classifyFuel(raw: unknown): ClassifiedValue {
  const key = normalizeVehicleText(raw);
  if (!key) return { value: '', ambiguous: false };

  if (hasToken(key, 'flex') || (hasToken(key, 'gasolina') && (hasToken(key, 'etanol') || hasToken(key, 'alcool')))) {
    return { value: 'Flex', ambiguous: false };
  }

  const matches = new Set<string>();
  if (hasToken(key, 'diesel')) matches.add('Diesel');
  if (hasToken(key, 'gasolina')) matches.add('Gasolina');
  if (hasToken(key, 'etanol') || hasToken(key, 'alcool')) matches.add('Etanol');
  if (hasToken(key, 'eletrico') || hasToken(key, 'electric')) matches.add('Elétrico');
  if (hasToken(key, 'hibrido') || hasToken(key, 'hybrid')) matches.add('Híbrido');
  if (hasToken(key, 'gnv')) matches.add('GNV');

  return {
    value: matches.size === 1 ? Array.from(matches)[0] : '',
    ambiguous: matches.size > 1
  };
}

export function classifyTransmission(raw: unknown): ClassifiedValue {
  const key = normalizeVehicleText(raw);
  if (!key) return { value: '', ambiguous: false };

  if (key.includes('dupla embreagem') || hasToken(key, 'dsg') || hasToken(key, 'dct')) {
    return { value: 'Dupla embreagem', ambiguous: false };
  }
  if (hasToken(key, 'cvt')) return { value: 'CVT', ambiguous: false };

  const matches = new Set<string>();
  if (key.includes('automatizado') || key.includes('automatizada')) matches.add('Automatizado');
  if (key.includes('automatico') || key.includes('automatica') || hasToken(key, 'at') || hasToken(key, 'aut')) {
    matches.add('Automático');
  }
  if (key.includes('manual') || hasToken(key, 'mt')) matches.add('Manual');

  return {
    value: matches.size === 1 ? Array.from(matches)[0] : '',
    ambiguous: matches.size > 1
  };
}

export function resolveEvidence(
  explicitValue: unknown,
  versionValue: unknown,
  classifier: (value: unknown) => ClassifiedValue
): ResolvedEvidence {
  const explicitText = String(explicitValue || '').trim();
  const explicit = classifier(explicitText);
  if (explicit.value) {
    return {
      value: explicit.value,
      source: 'source',
      invalidExplicit: false,
      ambiguous: explicit.ambiguous
    };
  }

  const inferred = classifier(versionValue);
  return {
    value: inferred.value,
    source: inferred.value ? 'version' : 'none',
    invalidExplicit: Boolean(explicitText) && !explicit.value,
    ambiguous: explicit.ambiguous || inferred.ambiguous
  };
}

export function isValidYearPair(manufactureYear: number | null, modelYear: number | null) {
  if (!manufactureYear || !modelYear) return false;
  if (manufactureYear < 1886 || manufactureYear > 2200) return false;
  if (modelYear < 1886 || modelYear > 2200) return false;
  return modelYear >= manufactureYear - 1 && modelYear <= manufactureYear + 2;
}

export function configurationIdentityKey(input: {
  versionId: unknown;
  manufactureYear: unknown;
  modelYear: unknown;
  fuelId: unknown;
  transmissionId: unknown;
}) {
  return [
    String(input.versionId || ''),
    String(input.manufactureYear || ''),
    String(input.modelYear || ''),
    String(input.fuelId || ''),
    String(input.transmissionId || '')
  ].join(':');
}
