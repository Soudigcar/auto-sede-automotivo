import { NextResponse } from 'next/server';
import { authorizeStorePortal, storePortalRoleLabel } from '@/lib/server/storePortal';
import { cleanText } from '@/lib/server/storeTeam';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const slug = cleanText(new URL(request.url).searchParams.get('slug'), 120);
    const context = await authorizeStorePortal(request, slug);

    if ('error' in context) return context.error;

    return NextResponse.json({
      status: 'ok',
      profile: {
        id: context.profile.id,
        full_name: context.profile.full_name || context.profile.email || 'Usuário',
        email: context.profile.email || '',
        phone: context.profile.phone || null,
        role: context.role,
        role_label: storePortalRoleLabel(context.role),
        store_id: context.profile.store_id || null
      },
      store: context.store,
      permissions: context.permissions,
      menu: context.menu,
      scope_label: context.scopeLabel
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Não foi possível validar o Portal da Loja.' }, { status: 500 });
  }
}
