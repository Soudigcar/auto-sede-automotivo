import { NextResponse } from 'next/server';
import { resolveGoogleMapsCoordinates } from '@/lib/server/googleMapsLocation';
import { publicError, readJsonBody } from '@/lib/server/requestSecurity';
import { authorizeStorePortal } from '@/lib/server/storePortal';
import { cleanText } from '@/lib/server/storeTeam';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await readJsonBody<Record<string, unknown>>(request, 8 * 1024);
    const slug = cleanText(body.slug, 120);
    const context = await authorizeStorePortal(request, slug);
    if ('error' in context) return context.error;
    if (!context.permissions.includes('manage_autocar') || !['store', 'master'].includes(context.role)) {
      return NextResponse.json(
        { error: 'Somente Gestor da loja ou Master pode alterar o Perfil Operacional.' },
        { status: 403 }
      );
    }

    const coordinates = await resolveGoogleMapsCoordinates(cleanText(body.maps_url, 2_048));
    return NextResponse.json({ success: true, ...coordinates });
  } catch (error) {
    const response = publicError(error, 'Não foi possível identificar a localização neste link.');
    return NextResponse.json({ error: response.message }, { status: response.status });
  }
}
