import { NextResponse } from 'next/server';
import { authorizeStorePortal } from '@/lib/server/storePortal';
import { cleanText } from '@/lib/server/storeTeam';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const READ_ONLY_ROLES = new Set(['pre_sales', 'seller', 'prospector']);

function safeVehicle(vehicle: any) {
  return {
    id: vehicle.id,
    store_id: vehicle.store_id,
    brand: vehicle.brand || '',
    model: vehicle.model || '',
    version: vehicle.version || '',
    manufacture_year: vehicle.manufacture_year || '',
    model_year: vehicle.model_year || '',
    year: vehicle.year || '',
    mileage: vehicle.mileage || '',
    fuel: vehicle.fuel || '',
    transmission: vehicle.transmission || '',
    color: vehicle.color || '',
    price: Number(vehicle.price || 0),
    image_url: vehicle.image_url || '',
    image_urls: Array.isArray(vehicle.image_urls) ? vehicle.image_urls : [],
    status: vehicle.status || '',
    show_on_landing: vehicle.show_on_landing === true,
    source_url: vehicle.source_url || '',
    is_featured: vehicle.is_featured === true
  };
}

export async function GET(request: Request) {
  try {
    const slug = cleanText(new URL(request.url).searchParams.get('slug'), 120);
    const context = await authorizeStorePortal(request, slug);

    if ('error' in context) return context.error;

    if (!READ_ONLY_ROLES.has(context.role) || !context.permissions.includes('view_stock')) {
      return NextResponse.json({ error: 'Perfil sem permissão de consulta ao estoque.' }, { status: 403 });
    }

    const { data: vehicles, error } = await context.supabase
      .from('site_vehicles')
      .select('id,store_id,brand,model,version,manufacture_year,model_year,year,mileage,fuel,transmission,color,price,image_url,image_urls,status,show_on_landing,source_url,is_featured')
      .eq('store_id', context.store.id)
      .neq('status', 'excluido');

    if (error) {
      return NextResponse.json({ error: error.message || 'Não foi possível carregar o estoque.' }, { status: 400 });
    }

    const rows = vehicles || [];
    const tenantConflict = rows.some((vehicle: any) => vehicle.store_id !== context.store.id);
    if (tenantConflict) {
      return NextResponse.json({ error: 'Conflito de isolamento detectado no estoque.' }, { status: 409 });
    }

    return NextResponse.json({
      status: 'ok',
      readonly: true,
      store: {
        id: context.store.id,
        store_name: context.store.store_name,
        slug: context.store.slug
      },
      vehicles: rows.map(safeVehicle)
    }, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Erro ao consultar estoque.' }, { status: 500 });
  }
}
