import { lookup } from 'node:dns/promises';
import { request as httpRequest, type IncomingHttpHeaders } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { isIP } from 'node:net';
import { RequestSecurityError } from './requestSecurity';

const DEFAULT_TIMEOUT_MS = 12_000;
const DEFAULT_REDIRECTS = 3;

export type SecureFetchOptions = {
  accept: string;
  allowedContentTypes: string[];
  maxBytes: number;
  timeoutMs?: number;
  maxRedirects?: number;
  userAgent?: string;
  allowedHostnames?: string[];
  requireHttps?: boolean;
};

function blockedIpv4(address: string) {
  const parts = address.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
  const [a, b] = parts;
  return a === 0 || a === 10 || a === 127 ||
    (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 0) ||
    (a === 192 && b === 168) || (a === 198 && (b === 18 || b === 19)) || a >= 224;
}

function blockedIpv6(address: string) {
  const normalized = address.toLowerCase().split('%')[0];
  if (normalized === '::' || normalized === '::1') return true;
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true;
  if (/^fe[89ab]/.test(normalized) || normalized.startsWith('ff')) return true;
  const mapped = normalized.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
  return mapped ? blockedIpv4(mapped) : false;
}

export function isBlockedNetworkAddress(address: string) {
  const family = isIP(address);
  if (family === 4) return blockedIpv4(address);
  if (family === 6) return blockedIpv6(address);
  return true;
}

function parseRemoteUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new RequestSecurityError('Link remoto inválido.', 400);
  }
  if (!['http:', 'https:'].includes(url.protocol)) throw new RequestSecurityError('Somente links HTTP ou HTTPS são permitidos.', 400);
  if (url.username || url.password) throw new RequestSecurityError('Links com credenciais não são permitidos.', 400);
  if (url.port && !['80', '443'].includes(url.port)) throw new RequestSecurityError('Porta remota não permitida.', 400);
  if (!url.hostname || url.hostname.endsWith('.local') || url.hostname === 'localhost') {
    throw new RequestSecurityError('Destino remoto não permitido.', 400);
  }
  url.hash = '';
  return url;
}

export function isAllowedRemoteHostname(hostname: string, allowedHostnames: string[]) {
  const normalized = hostname.trim().toLowerCase();
  return allowedHostnames.some((allowed) => normalized === allowed.trim().toLowerCase());
}

function assertOutboundScope(value: string, options: SecureFetchOptions) {
  const url = parseRemoteUrl(value);
  if (options.requireHttps && url.protocol !== 'https:') {
    throw new RequestSecurityError('Somente links HTTPS são permitidos para este destino.', 400);
  }
  if (options.allowedHostnames?.length && !isAllowedRemoteHostname(url.hostname, options.allowedHostnames)) {
    throw new RequestSecurityError('Destino remoto não permitido para esta operação.', 400);
  }
}

async function resolvePublicRemoteUrl(value: string) {
  const url = parseRemoteUrl(value);
  const directIpFamily = isIP(url.hostname);
  const addresses = directIpFamily
    ? [{ address: url.hostname, family: directIpFamily }]
    : await lookup(url.hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(({ address }) => isBlockedNetworkAddress(address))) {
    throw new RequestSecurityError('Destino remoto privado ou reservado não permitido.', 400);
  }
  return { url, address: addresses[0].address, family: addresses[0].family };
}

export async function assertPublicRemoteUrl(value: string) {
  return (await resolvePublicRemoteUrl(value)).url;
}

async function requestPinnedUrl(value: string, options: SecureFetchOptions) {
  assertOutboundScope(value, options);
  const { url, address, family } = await resolvePublicRemoteUrl(value);
  const requestFactory = url.protocol === 'https:' ? httpsRequest : httpRequest;

  return new Promise<{ status: number; headers: IncomingHttpHeaders; body: Buffer; url: URL }>((resolve, reject) => {
    const outbound = requestFactory({
      protocol: url.protocol,
      hostname: address,
      family,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: `${url.pathname}${url.search}`,
      method: 'GET',
      servername: url.hostname,
      rejectUnauthorized: true,
      headers: {
        accept: options.accept,
        'accept-language': 'pt-BR,pt;q=0.9,en;q=0.7',
        host: url.host,
        'user-agent': options.userAgent || 'AutoControleAutomotivo/1.0'
      }
    }, (response) => {
      const status = response.statusCode || 502;
      const declaredLength = Number(response.headers['content-length'] || 0);
      if (Number.isFinite(declaredLength) && declaredLength > options.maxBytes) {
        response.destroy();
        reject(new RequestSecurityError('Resposta remota acima do limite permitido.', 413));
        return;
      }

      const chunks: Buffer[] = [];
      let size = 0;
      response.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > options.maxBytes) {
          response.destroy(new RequestSecurityError('Resposta remota acima do limite permitido.', 413));
          return;
        }
        chunks.push(Buffer.from(chunk));
      });
      response.on('end', () => resolve({ status, headers: response.headers, body: Buffer.concat(chunks, size), url }));
      response.on('error', reject);
    });

    outbound.setTimeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS, () => {
      outbound.destroy(new RequestSecurityError('O destino remoto excedeu o tempo limite.', 504));
    });
    outbound.on('error', (error) => reject(error instanceof RequestSecurityError
      ? error
      : new RequestSecurityError('Não foi possível acessar o destino remoto.', 502)));
    outbound.end();
  });
}

export async function secureRemoteFetch(value: string, options: SecureFetchOptions) {
  const maxRedirects = options.maxRedirects ?? DEFAULT_REDIRECTS;
  let current = value;
  for (let redirect = 0; redirect <= maxRedirects; redirect += 1) {
    const response = await requestPinnedUrl(current, options);
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      if (redirect === maxRedirects) throw new RequestSecurityError('Limite de redirecionamentos excedido.', 400);
      const location = response.headers.location;
      if (!location) throw new RequestSecurityError('Redirecionamento remoto inválido.', 502);
      current = new URL(location, response.url).toString();
      continue;
    }
    if (response.status < 200 || response.status >= 300) {
      throw new RequestSecurityError(`Não foi possível acessar o link. Status ${response.status}.`, 502);
    }
    const contentType = String(response.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
    if (!options.allowedContentTypes.includes(contentType)) throw new RequestSecurityError('Tipo de conteúdo remoto não permitido.', 415);
    return { body: response.body, contentType, finalUrl: response.url.toString() };
  }
  throw new RequestSecurityError('Destino remoto inválido.', 400);
}

export async function secureFetchHtml(value: string) {
  const result = await secureRemoteFetch(value, {
    accept: 'text/html,application/xhtml+xml;q=0.9',
    allowedContentTypes: ['text/html', 'application/xhtml+xml'],
    maxBytes: 2 * 1024 * 1024,
    timeoutMs: 12_000,
    userAgent: 'Mozilla/5.0 AutoControleAutomotivo/1.0'
  });
  return result.body.toString('utf8');
}

export async function secureFetchImage(value: string) {
  return secureRemoteFetch(value, {
    accept: 'image/jpeg,image/png,image/webp',
    allowedContentTypes: ['image/jpeg', 'image/png', 'image/webp'],
    maxBytes: 10 * 1024 * 1024,
    timeoutMs: 12_000,
    userAgent: 'Mozilla/5.0 AutoControleAutomotivo/1.0'
  });
}
