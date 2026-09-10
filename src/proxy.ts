import { NextResponse, type NextRequest } from 'next/server';

import { homologationRequested, homologationRouteAllowed, validateMetricsHomologation } from './lib/commercialMetricsHomologation';

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
  '/trocar-senha',
  '/recuperar-senha',
  '/redefinir-senha'
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

function requestHost(request: NextRequest) {
  const forwarded = request.headers.get('x-forwarded-host') || request.headers.get('host') || '';
  return forwarded.split(',')[0].trim().split(':')[0].toLowerCase();
}

function matchesPrefix(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

function redirectToHost(request: NextRequest, hostname: string, pathname?: string) {
  const url = request.nextUrl.clone();
  url.protocol = 'https:';
  url.hostname = hostname;
  url.port = '';
  if (pathname) url.pathname = pathname;
  return NextResponse.redirect(url, 308);
}

function internalResponse() {
  const response = NextResponse.next();
  response.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}

export function proxy(request: NextRequest) {
  if (homologationRequested()) {
    try { validateMetricsHomologation(); } catch {
      return NextResponse.json({ error: 'Homologação não configurada.' }, { status: 503 });
    }
    if (request.nextUrl.pathname === '/master/dashboard/live' && ['GET','HEAD'].includes(request.method)) return NextResponse.redirect(new URL('/loja/store-alpha', request.url));
    if (!homologationRouteAllowed(request.nextUrl.pathname, request.method)) return NextResponse.json({ error: 'Rota bloqueada na homologação.' }, { status: 403 });
    const response = NextResponse.next();
    const crm = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname;
    response.headers.set('Content-Security-Policy', `default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' https://${crm} wss://${crm}; frame-src 'none'; object-src 'none'; base-uri 'self'; form-action 'self'`);
    response.headers.set('Cache-Control', 'private, no-store');
    return response;
  }
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
    return NextResponse.next();
  }

  if (host === INTERNAL_HOST) {
    if (pathname === '/') {
      return redirectToHost(request, INTERNAL_HOST, '/login');
    }

    if (PUBLIC_PREFIXES.some((prefix) => matchesPrefix(pathname, prefix))) {
      return redirectToHost(request, OFFICIAL_HOST);
    }

    return internalResponse();
  }

  // Preview deployments and local development remain accessible for validation.
  return NextResponse.next();
}

export const config = {
  matcher: ['/:path*']
};
