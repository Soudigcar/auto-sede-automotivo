import { NextResponse } from 'next/server';
import { getPublicVehicles, marketplaceFilters } from '@/lib/server/marketplace';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const vehicles = await getPublicVehicles({ limit: 300 });
    return NextResponse.json({
      vehicles,
      total: vehicles.length,
      filters: marketplaceFilters(vehicles)
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Não foi possível carregar os veículos.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
