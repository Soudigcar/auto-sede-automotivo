import { RequestSecurityError } from './requestSecurity';
import { secureRemoteFetch, type SecureFetchOptions } from './secureRemoteFetch';

const GOOGLE_MAPS_HOSTNAMES = [
  'maps.app.goo.gl',
  'goo.gl',
  'google.com',
  'www.google.com',
  'maps.google.com',
  'google.com.br',
  'www.google.com.br',
  'maps.google.com.br'
];

const MAPS_FETCH_OPTIONS: SecureFetchOptions = {
  accept: 'text/html,application/xhtml+xml;q=0.9',
  allowedContentTypes: ['text/html', 'application/xhtml+xml'],
  allowedHostnames: GOOGLE_MAPS_HOSTNAMES,
  requireHttps: true,
  maxBytes: 2 * 1024 * 1024,
  maxRedirects: 5,
  timeoutMs: 10_000,
  userAgent: 'Mozilla/5.0 AutoControleAutomotivo/1.0'
};

export type GoogleMapsCoordinates = {
  latitude: number;
  longitude: number;
};

type MapsFetcher = typeof secureRemoteFetch;

export function isGoogleMapsHostname(hostname: string) {
  const normalized = hostname.trim().toLowerCase();
  return GOOGLE_MAPS_HOSTNAMES.includes(normalized);
}

function parseMapsUrl(value: string) {
  if (!value || value.length > 2_048) {
    throw new RequestSecurityError('Informe um link válido do Google Maps.', 400);
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new RequestSecurityError('Informe um link válido do Google Maps.', 400);
  }

  if (url.protocol !== 'https:' || url.username || url.password || url.port || !isGoogleMapsHostname(url.hostname)) {
    throw new RequestSecurityError('Use um link HTTPS oficial do Google Maps.', 400);
  }
  return url;
}

function normalizedCoordinates(latitudeValue: string | number, longitudeValue: string | number): GoogleMapsCoordinates | null {
  const latitude = Number(latitudeValue);
  const longitude = Number(longitudeValue);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;
  if (latitude === 0 && longitude === 0) return null;
  return {
    latitude: Number(latitude.toFixed(6)),
    longitude: Number(longitude.toFixed(6))
  };
}

function pairFromText(value: string) {
  const pair = value.match(/(?:loc:)?\s*(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)/i);
  return pair ? normalizedCoordinates(pair[1], pair[2]) : null;
}

export function parseGoogleMapsCoordinates(value: string): GoogleMapsCoordinates | null {
  let url: URL;
  try {
    url = parseMapsUrl(value.trim());
  } catch {
    return null;
  }

  let decoded = url.toString();
  try {
    decoded = decodeURIComponent(decoded);
  } catch {
    // A URL ainda pode conter um ponto válido fora do trecho malformado.
  }
  const pathPair = decoded.match(/@(-?\d{1,2}(?:\.\d+)?),(-?\d{1,3}(?:\.\d+)?)(?:,|\/|$)/);
  if (pathPair) {
    const coordinates = normalizedCoordinates(pathPair[1], pathPair[2]);
    if (coordinates) return coordinates;
  }

  const directDataPair = decoded.match(/!3d(-?\d{1,2}(?:\.\d+)?)!4d(-?\d{1,3}(?:\.\d+)?)/);
  if (directDataPair) {
    const coordinates = normalizedCoordinates(directDataPair[1], directDataPair[2]);
    if (coordinates) return coordinates;
  }

  const reverseDataPair = decoded.match(/!2d(-?\d{1,3}(?:\.\d+)?)!3d(-?\d{1,2}(?:\.\d+)?)/);
  if (reverseDataPair) {
    const coordinates = normalizedCoordinates(reverseDataPair[2], reverseDataPair[1]);
    if (coordinates) return coordinates;
  }

  for (const parameter of ['query', 'q', 'll', 'destination']) {
    const coordinates = pairFromText(url.searchParams.get(parameter) || '');
    if (coordinates) return coordinates;
  }

  return null;
}

export async function resolveGoogleMapsCoordinates(value: string, fetcher: MapsFetcher = secureRemoteFetch) {
  const url = parseMapsUrl(value.trim());
  const directCoordinates = parseGoogleMapsCoordinates(url.toString());
  if (directCoordinates) return directCoordinates;

  let finalUrl: string;
  try {
    const result = await fetcher(url.toString(), MAPS_FETCH_OPTIONS);
    finalUrl = result.finalUrl;
  } catch (error) {
    if (error instanceof RequestSecurityError) throw error;
    throw new RequestSecurityError('Não foi possível consultar o link do Google Maps agora.', 502);
  }

  const resolvedCoordinates = parseGoogleMapsCoordinates(finalUrl);
  if (!resolvedCoordinates) {
    throw new RequestSecurityError(
      'Não foi possível identificar um pin neste link. Abra o local exato no Google Maps e use Compartilhar → Copiar link.',
      400
    );
  }
  return resolvedCoordinates;
}
