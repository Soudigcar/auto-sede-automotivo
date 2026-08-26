import { NextResponse } from 'next/server';
import { authorizeStorePortal } from '@/lib/server/storePortal';
import { cleanText } from '@/lib/server/storeTeam';
import {
  getAutocarOperationalProfile,
  saveAutocarOperationalProfile
} from '@/lib/server/autocar/operationalProfile';
import { getAutocarRuntimePublicStatus } from '@/lib/server/autocar/runtimeEnvironment';
import { resolveGoogleMapsCoordinates } from '@/lib/server/googleMapsLocation';
import { publicError } from '@/lib/server/requestSecurity';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function contextFor(request: Request, slug: string) {
  const context = await authorizeStorePortal(request, slug);
  if ('error' in context) return context;
  if (!context.permissions.includes('view_autocar')) {
    return {
      error: NextResponse.json(
        { error: 'Usuário sem permissão para visualizar a AUTOCAR.' },
        { status: 403 }
      )
    } as const;
  }
  return context;
}

function sourceFromSchema(schema: string) {
  return schema === 'production_v2' ? 'crm-production' : 'autocar-dev';
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const slug = cleanText(url.searchParams.get('slug'), 120);
    const context = await contextFor(request, slug);
    if ('error' in context) return context.error;

    const [profile, runtimeStatus] = await Promise.all([
      getAutocarOperationalProfile(context.store.id),
      getAutocarRuntimePublicStatus()
    ]);

    return NextResponse.json({
      success: true,
      environment: runtimeStatus.runtime_environment,
      profile_source: sourceFromSchema(runtimeStatus.schema),
      runtime: runtimeStatus,
      profile,
      defaults: {
        timezone: 'America/Sao_Paulo',
        default_visit_duration_minutes: 60,
        weekly_hours: {
          monday: [],
          tuesday: [],
          wednesday: [],
          thursday: [],
          friday: [],
          saturday: [],
          sunday: []
        },
        special_hours: []
      }
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Não foi possível carregar o Perfil Operacional.' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const slug = cleanText(body?.slug, 120);
    const context = await contextFor(request, slug);
    if ('error' in context) return context.error;
    if (!context.permissions.includes('manage_autocar') || !['store', 'master'].includes(context.role)) {
      return NextResponse.json(
        { error: 'Somente Gestor da loja ou Master pode alterar o Perfil Operacional.' },
        { status: 403 }
      );
    }

    const payload = body?.profile && typeof body.profile === 'object' ? { ...body.profile } : {};
    const mapsUrl = cleanText(payload.maps_url, 2_048);
    if (mapsUrl) {
      const coordinates = await resolveGoogleMapsCoordinates(mapsUrl);
      payload.maps_url = mapsUrl;
      payload.latitude = coordinates.latitude;
      payload.longitude = coordinates.longitude;
    }

    const profile = await saveAutocarOperationalProfile({
      store: context.store,
      profileId: context.profile.id,
      payload
    });
    const runtimeStatus = await getAutocarRuntimePublicStatus();

    return NextResponse.json({
      success: true,
      environment: runtimeStatus.runtime_environment,
      profile_source: sourceFromSchema(runtimeStatus.schema),
      runtime: runtimeStatus,
      profile
    });
  } catch (error: unknown) {
    const response = publicError(error, 'Não foi possível salvar o Perfil Operacional.');
    return NextResponse.json(
      { error: response.message },
      { status: response.status }
    );
  }
}
