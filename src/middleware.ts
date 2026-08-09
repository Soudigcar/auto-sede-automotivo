import { NextRequest, NextResponse } from 'next/server';

export function middleware(request: NextRequest) {
  if (request.nextUrl.pathname === '/api/webhooks/meta-leads') {
    const url = request.nextUrl.clone();
    url.pathname = '/api/webhooks/meta-leads-fixed';
    return NextResponse.rewrite(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/api/webhooks/meta-leads']
};
