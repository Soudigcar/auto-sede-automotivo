import { NextResponse } from 'next/server';
import { asStorePortalRole, authorizeStoreEntitlement, storePortalRoleLabel } from '@/lib/server/storePortal';
import { cleanText, createAdminClient, getProfileFromToken, readBearerToken } from '@/lib/server/storeTeam';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const supabase: any = createAdminClient();
    const profile = await getProfileFromToken(supabase, readBearerToken(request));
    const role = asStorePortalRole(profile?.role);

    if (!profile || profile.status !== 'active' || !role) {
      return NextResponse.json({ error: 'Usuário sem perfil ativo para importar veículos.' }, { status: 403 });
    }

    let query = supabase
      .from('stores')
      .select('id,store_name,slug,status,portal_enabled')
      .eq('status', 'active')
      .eq('portal_enabled', true)
      .order('store_name');

    if (role !== 'master') {
      const storeId = cleanText(profile.store_id, 80);
      if (!storeId) return NextResponse.json({ error: 'Usuário sem loja vinculada.' }, { status: 403 });
      query = query.eq('id', storeId);
    }

    const { data: stores, error } = await query;
    if (error) throw error;
    if (!stores?.length) return NextResponse.json({ error: 'Nenhuma loja ativa disponível para importação.' }, { status: 404 });
    if (role !== 'master') {
      const entitlement = await authorizeStoreEntitlement(supabase, {
        role,
        storeId: stores[0].id,
        profileStoreId: profile.store_id,
        store: stores[0]
      });
      if ('error' in entitlement) return entitlement.error;
    }

    return NextResponse.json({
      profile: {
        id: profile.id,
        full_name: profile.full_name || profile.email || 'Usuário',
        role,
        role_label: storePortalRoleLabel(role),
        store_id: profile.store_id || null
      },
      stores,
      can_publish: role === 'master' || role === 'store'
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Erro ao validar acesso à importação OLX.' }, { status: 500 });
  }
}
