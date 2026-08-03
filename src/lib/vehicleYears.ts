export type VehicleYearInput = {
  manufacture_year?: unknown;
  model_year?: unknown;
  year?: unknown;
};

export type NormalizedVehicleYears = {
  manufacture_year: string;
  model_year: string;
  year: string;
};

const MIN_VEHICLE_YEAR = 1886;
const MAX_VEHICLE_YEAR = 2200;

function clean(value: unknown) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

export function normalizeVehicleYear(value: unknown) {
  const text = clean(value);
  if (!text) return '';

  const match = text.match(/\b(18\d{2}|19\d{2}|20\d{2}|21\d{2}|2200)\b/);
  if (!match?.[1]) return '';

  const year = Number(match[1]);
  return year >= MIN_VEHICLE_YEAR && year <= MAX_VEHICLE_YEAR ? String(year) : '';
}

export function parseLegacyVehicleYear(value: unknown): Omit<NormalizedVehicleYears, 'year'> {
  const text = clean(value);
  if (!text) return { manufacture_year: '', model_year: '' };

  const pair = text.match(/\b(18\d{2}|19\d{2}|20\d{2}|21\d{2}|2200)\s*[\/\\|_-]\s*(18\d{2}|19\d{2}|20\d{2}|21\d{2}|2200)\b/);
  if (pair?.[1] && pair?.[2]) {
    return {
      manufacture_year: normalizeVehicleYear(pair[1]),
      model_year: normalizeVehicleYear(pair[2])
    };
  }

  // Um único ano é tratado como ano-modelo. Não inventamos o ano de fabricação.
  return {
    manufacture_year: '',
    model_year: normalizeVehicleYear(text)
  };
}

export function combineVehicleYears(
  manufactureYear: unknown,
  modelYear: unknown,
  fallbackYear: unknown = ''
) {
  const manufacture = normalizeVehicleYear(manufactureYear);
  const model = normalizeVehicleYear(modelYear);

  if (manufacture && model) return manufacture === model ? model : `${manufacture}/${model}`;
  if (model) return model;
  if (manufacture) return manufacture;

  const fallback = parseLegacyVehicleYear(fallbackYear);
  if (fallback.manufacture_year && fallback.model_year) {
    return fallback.manufacture_year === fallback.model_year
      ? fallback.model_year
      : `${fallback.manufacture_year}/${fallback.model_year}`;
  }
  return fallback.model_year || fallback.manufacture_year;
}

export function normalizeVehicleYears(input: VehicleYearInput): NormalizedVehicleYears {
  let manufactureYear = normalizeVehicleYear(input.manufacture_year);
  let modelYear = normalizeVehicleYear(input.model_year);
  const legacy = parseLegacyVehicleYear(input.year);

  // Valores separados e explícitos sempre têm prioridade. O campo legado serve apenas
  // para completar o lado ausente, sem substituir o que já foi confirmado.
  if (!manufactureYear) manufactureYear = legacy.manufacture_year;
  if (!modelYear) modelYear = legacy.model_year;

  return {
    manufacture_year: manufactureYear,
    model_year: modelYear,
    year: combineVehicleYears(manufactureYear, modelYear, input.year)
  };
}

export function vehicleYearNumbers(input: VehicleYearInput) {
  const years = normalizeVehicleYears(input);
  return {
    manufacture_year: years.manufacture_year ? Number(years.manufacture_year) : null,
    model_year: years.model_year ? Number(years.model_year) : null,
    year: years.year || null
  };
}
