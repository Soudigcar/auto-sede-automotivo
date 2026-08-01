// Compatibilidade para links diretos, mensagens compartilhadas e URLs antigas da OLX sem rastreadores.
import { NextResponse } from 'next/server';
import { extractCanonicalOlxUrl } from '@/lib/olxSharedUrl';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const originalSource = body?.source_url || body?.url || body?.vehicle?.source_url || '';
    const sourceUrl = extractCanonicalOlxUrl(originalSource);

    if (!sourceUrl) {
      return NextResponse.json(
        { error: 'Não foi encontrado um link válido de anúncio da OLX no texto informado.' },
        { status: 400 }
      );
    }

    const normalizedBody = {
      ...body,
      source_url: sourceUrl,
      url: sourceUrl,
      vehicle: body?.vehicle && typeof body.vehicle === 'object'
        ? { ...body.vehicle, source_url: sourceUrl }
        : body?.vehicle
    };

    const headers = new Headers({ 'content-type': 'application/json' });
    const authorization = request.headers.get('authorization');
    const cookie = request.headers.get('cookie');
    if (authorization) headers.set('authorization', authorization);
    if (cookie) headers.set('cookie', cookie);

    const upstream = await fetch(new URL('/api/vehicle-link-import', request.url), {
      method: 'POST',
      headers,
      body: JSON.stringify(normalizedBody),
      cache: 'no-store'
    });

    const responseBody = await upstream.text();

    return new NextResponse(responseBody, {
      status: upstream.status,
      headers: {
        'content-type': upstream.headers.get('content-type') || 'application/json; charset=utf-8',
        'cache-control': 'no-store, max-age=0'
      }
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Erro ao interpretar o link compartilhado da OLX.' },
      { status: 500 }
    );
  }
}
