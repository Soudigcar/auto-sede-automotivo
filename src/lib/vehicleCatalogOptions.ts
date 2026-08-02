export const VEHICLE_COLORS = [
  'Amarelo', 'Azul', 'Bege', 'Branco', 'Bronze', 'Cinza', 'Dourado',
  'Laranja', 'Marrom', 'Prata', 'Preto', 'Roxo', 'Verde', 'Vermelho', 'Vinho', 'Outra'
] as const;

export const VEHICLE_TRANSMISSIONS = [
  'Manual', 'Automático', 'Automatizado', 'CVT', 'Semi-automático', 'Outra'
] as const;

export const VEHICLE_FUELS = [
  'Gasolina', 'Etanol', 'Flex', 'Diesel', 'Elétrico', 'Híbrido', 'GNV', 'Outro'
] as const;

function clean(value: unknown) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function fold(value: unknown) {
  return clean(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

const aliases: Record<string, Record<string, string>> = {
  color: {
    branco: 'Branco', branca: 'Branco', preto: 'Preto', preta: 'Preto',
    prata: 'Prata', cinza: 'Cinza', vermelho: 'Vermelho', vermelha: 'Vermelho',
    vinho: 'Vinho', azul: 'Azul', verde: 'Verde', amarelo: 'Amarelo', amarela: 'Amarelo',
    bege: 'Bege', marrom: 'Marrom', laranja: 'Laranja', dourado: 'Dourado',
    dourada: 'Dourado', bronze: 'Bronze', roxo: 'Roxo', roxa: 'Roxo'
  },
  transmission: {
    manual: 'Manual', mecanico: 'Manual', mecanica: 'Manual',
    automatico: 'Automático', automatica: 'Automático',
    automatizado: 'Automatizado', automatizada: 'Automatizado',
    cvt: 'CVT', 'semi-automatico': 'Semi-automático', 'semi automatizado': 'Semi-automático'
  },
  fuel: {
    gasolina: 'Gasolina', alcool: 'Etanol', etanol: 'Etanol', flex: 'Flex',
    diesel: 'Diesel', eletrico: 'Elétrico', eletrica: 'Elétrico',
    hibrido: 'Híbrido', hibrida: 'Híbrido', gnv: 'GNV'
  }
};

export function normalizeVehicleOption(
  type: 'color' | 'transmission' | 'fuel',
  value: unknown
) {
  const raw = clean(value);
  if (!raw) return '';
  const normalized = aliases[type][fold(raw)];
  if (normalized) return normalized;

  const allowed = type === 'color'
    ? VEHICLE_COLORS
    : type === 'transmission'
      ? VEHICLE_TRANSMISSIONS
      : VEHICLE_FUELS;

  return allowed.find((option) => fold(option) === fold(raw)) || '';
}

export function canonicalImageKey(value: unknown) {
  const raw = clean(value);
  if (!raw) return '';
  try {
    const url = new URL(raw);
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) {
      if (/^(w|h|width|height|size|quality|q|fit|crop|format|fm|auto|dpr|t|v)$/i.test(key)) {
        url.searchParams.delete(key);
      }
    }
    url.pathname = url.pathname
      .replace(/[-_](thumb|thumbnail|small|medium|large|original)(?=\.[a-z0-9]+$)/i, '')
      .replace(/[-_]\d{2,4}x\d{2,4}(?=\.[a-z0-9]+$)/i, '');
    url.searchParams.sort();
    return url.toString().toLowerCase();
  } catch {
    return raw.split('?')[0].split('#')[0].toLowerCase();
  }
}

export function uniqueVehicleImages(values: unknown[], limit = 12) {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const url = clean(value);
    const key = canonicalImageKey(url);
    if (!url || !key || seen.has(key)) continue;
    seen.add(key);
    result.push(url);
    if (result.length >= limit) break;
  }
  return result;
}

export function ensureMileageInDescription(description: unknown, mileage: unknown) {
  const text = clean(description);
  const km = clean(mileage);
  if (!km) return text;

  const digits = km.replace(/\D/g, '');
  const normalizedText = fold(text);
  const alreadyMentionsMileage = /\b(km|quilometragem|quilometros)\b/.test(normalizedText)
    && (!digits || normalizedText.replace(/\D/g, '').includes(digits));

  if (alreadyMentionsMileage) return text;
  const sentence = `Quilometragem informada no anúncio: ${km}.`;
  return text ? `${text} ${sentence}` : sentence;
}
