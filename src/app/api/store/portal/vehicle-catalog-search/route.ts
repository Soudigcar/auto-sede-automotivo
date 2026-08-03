import { NextResponse } from 'next/server';
import { cleanText } from '@/lib/server/storeTeam';
import { authorizeStorePortal } from '@/lib/server/storePortal';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const slug = cleanText(url.searchParams.get('slug'), 120);
    const query = cleanText(url.searchParams.get('q'), 120);
    if (!slug) return NextResponse.json({ error: 'Informe a loja.' }, { status: 400 });
    if (query.length < 2) return NextResponse.json({ vehicles: [] });

    const context = await authorizeStorePortal(request, slug);
    if ('error' in context) return context.error;

    const pattern = `%${query.replace(/[%_]/g, '')}%`;
    const { data, error } = await context.supabase
      .from('vehicle_catalog_configurations')
      .select('id,manufacture_year,model_year,version:vehicle_catalog_versions!inner(id,name,model:vehicle_catalog_models!inner(id,name,brand:vehicle_catalog_brands!inner(id,name)))')
      .eq('is_active', true)
      .or(`name.ilike.${pattern},model.name.ilike.${pattern},model.brand.name.ilike.${pattern}`, { referencedTable: 'vehicle_catalog_versions' })
      .limit(20);

    if (error) {
      const { data: fallback, error: fallbackError } = await context.supabase
        .from('vehicle_catalog_configurations')
        .select('id,manufacture_year,model_year,version:vehicle_catalog_versions!inner(id,name,model:vehicle_catalog_models!inner(id,name,brand:vehicle_catalog_brands!inner(id,name)))')
        .eq('is_active', true)
        .limit(100);
      if (fallbackError) throw fallbackError;
      const normalized = query.toLowerCase();
      const filtered = (fallback || []).filter((item: any) => {
        const text = `${item.version?.model?.brand?.name || ''} ${item.version?.model?.name || ''} ${item.version?.name || ''}`.toLowerCase();
        return text.includes(normalized);
      }).slice(0, 20);
      return NextResponse.json({ vehicles: filtered.map(formatVehicle) });
    }

    return NextResponse.json({ vehicles: (data || []).map(formatVehicle) });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Não foi possível pesquisar o catálogo de veículos.' }, { status: 500 });
  }
}

function formatVehicle(item: any) {
  const brand = item.version?.model?.brand?.name || '';
  const model = item.version?.model?.name || '';
  const version = item.version?.name || '';
  return {
    id: item.id,
    name: [brand, model, version].filter(Boolean).join(' '),
    brand,
    model,
    version,
    manufacture_year: item.manufacture_year,
    model_year: item.model_year
  };
}
