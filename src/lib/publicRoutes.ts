import type { MarketplaceVehicle } from '@/components/marketplace/types';

export const OFFICIAL_PORTAL_URL = 'https://www.autosede.com.br';
export const INTERNAL_SYSTEM_ORIGIN = 'https://sistemaautomotivo.autosede.com.br';
export const INTERNAL_SYSTEM_URL = `${INTERNAL_SYSTEM_ORIGIN}/login`;

const UUID_AT_END = /([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i;

export function slugifyPublicText(value: unknown) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90);
}

export function publicVehicleSlug(vehicle: Pick<MarketplaceVehicle, 'id' | 'brand' | 'model' | 'year'>) {
  const label = slugifyPublicText([vehicle.brand, vehicle.model, vehicle.year].filter(Boolean).join(' ')) || 'veiculo';
  return `${label}-${vehicle.id}`;
}

export function publicVehiclePath(vehicle: Pick<MarketplaceVehicle, 'id' | 'brand' | 'model' | 'year'>) {
  return `/veiculos/${publicVehicleSlug(vehicle)}`;
}

export function extractVehicleIdFromSlug(slug: string) {
  return String(slug || '').match(UUID_AT_END)?.[1]?.toLowerCase() || '';
}

export function publicStorePath(slug: string) {
  return `/lojas/${encodeURIComponent(String(slug || '').trim())}`;
}

export function absolutePortalUrl(path: string) {
  return new URL(path, OFFICIAL_PORTAL_URL).toString();
}

function officialPath(path: unknown) {
  const value = String(path || '').trim().replace(/^\/+/, '');
  return value ? `/${value}` : '/';
}

export function absoluteInternalSystemUrl(path: string) {
  return new URL(officialPath(path), `${INTERNAL_SYSTEM_ORIGIN}/`).toString();
}

export function storeLoginPath(slug: string) {
  const normalizedSlug = String(slug || '').trim();
  if (!normalizedSlug) return '';
  return loginPath(`/loja/${encodeURIComponent(normalizedSlug)}`);
}

export function loginPath(redirectedFrom: string) {
  return `/login?redirectedFrom=${encodeURIComponent(officialPath(redirectedFrom))}`;
}

export function officialLoginUrl(redirectedFrom: string) {
  return absoluteInternalSystemUrl(loginPath(redirectedFrom));
}

export function officialStoreLoginUrl(slug: string) {
  const path = storeLoginPath(slug);
  return path ? absoluteInternalSystemUrl(path) : '';
}

export function officialStoreRegistrationUrl(token: string) {
  const normalizedToken = String(token || '').trim();
  return normalizedToken ? absolutePortalUrl(`/cadastro-loja/${encodeURIComponent(normalizedToken)}`) : '';
}

export function safeExternalHttpUrl(value: unknown) {
  const candidate = String(value || '').trim();
  if (!candidate) return null;

  try {
    const url = new URL(candidate);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    if (url.username || url.password) return null;
    return url.toString();
  } catch {
    return null;
  }
}
