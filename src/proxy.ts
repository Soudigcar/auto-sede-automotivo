import { NextResponse, type NextRequest } from 'next/server';

const OFFICIAL_HOST = 'www.autosede.com.br';
const APEX_HOST = 'autosede.com.br';
const INTERNAL_HOST = 'sistemaautomotivo.autosede.com.br';

const INTERNAL_PREFIXES = [
  '/login',
  '/logout',
  '/master',
  '/pre-sales',
  '/prospector',
  '/routes',
  '/store',
  '/loja',
  '/trocar-senha'
];

const PUBLIC_PREFIXES = [
  '/veiculos',
  '/lojas',
  '/cadastre-sua-loja',
  '/campanha',
  '/sobre',
  '/contato',
  '/privacidade',
  '/termos',
  '/sitemap.xml',
  '/robots.txt'
];

const DEFAULT_PERMISSIONS_POLICY = 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()';

function requestHost(request: NextRequest) {
  const forwarded = request.headers.get('x-forwarded-host') || request.headers.get('host') || '';
  return forwarded.split(',')[0].trim().split(':')[0].toLowerCase();
}

function matchesPrefix(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

function isWhatsappInboxPath(pathname: string) {
  return pathname === '/master/whatsapp/inbox' || /^\/loja\/[^/]+\/whatsapp\/?$/.test(pathname);
}

function applyPermissionsPolicy(response: NextResponse, pathname: string) {
  // Microphone defaults to `self` when no Permissions-Policy header is present.
  // Do not emit a competing policy on WhatsApp inbox routes; all other routes
  // remain explicitly locked down.
  if (!isWhatsappInboxPath(pathname)) {
    response.headers.set('Permissions-Policy', DEFAULT_PERMISSIONS_POLICY);
  }
  return response;
}

function redirectToHost(request: NextRequest, hostname: string, pathname?: string) {
  const url = request.nextUrl.clone();
  url.protocol = 'https:';
  url.hostname = hostname;
  url.port = '';
  if (pathname) url.pathname = pathname;
  return NextResponse.redirect(url, 308);
}

function internalResponse(pathname: string) {
  const response = NextResponse.next();
  response.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
  response.headers.set('Cache-Control', 'private, no-store');
  return applyPermissionsPolicy(response, pathname);
}

export function proxy(request: NextRequest) {
  const host = requestHost(request);
  const pathname = request.nextUrl.pathname;

  if (pathname.startsWith('/api/')) {
    const contentLength = Number(request.headers.get('content-length') || 0);
    if (Number.isFinite(contentLength) && contentLength > 16 * 1024 * 1024) {
      return NextResponse.json(
        { error: 'Payload acima do limite permitido.' },
        { status: 413, headers: { 'Cache-Control': 'private, no-store' } }
      );
    }
  }

  // Both public hosts serve the portal. Canonical metadata remains on www,
  // but the application does not redirect between apex and www because the
  // domain provider may already apply its own preferred-domain redirect.
  if (host === OFFICIAL_HOST || host === APEX_HOST) {
    if (INTERNAL_PREFIXES.some((prefix) => matchesPrefix(pathname, prefix))) {
      return redirectToHost(request, INTERNAL_HOST);
    }
    return applyPermissionsPolicy(NextResponse.next(), pathname);
  }

  if (host === INTERNAL_HOST) {
    if (pathname === '/') {
      return redirectToHost(request, INTERNAL_HOST, '/login');
    }

    if (PUBLIC_PREFIXES.some((prefix) => matchesPrefix(pathname, prefix))) {
      return redirectToHost(request, OFFICIAL_HOST);
    }

    return internalResponse(pathname);
  }

  // Preview deployments and local development remain accessible for validation.
  return applyPermissionsPolicy(NextResponse.next(), pathname);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)']
};
