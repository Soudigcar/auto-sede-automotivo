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

    if (context.role !== 'master') {
      console.info('[billing.entitlement.observe]', {
        store_id: context.store.id,
        role: context.role,
        access_preserved: context.billing.allowed,
        observed_allowed: context.billing.observedAllowed,
        observed_reason: context.billing.observedReason,
        subscription_status: context.billing.subscriptionStatus
      });
    }

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
      scope_label: context.scopeLabel,
      billing: {
        access_preserved: context.billing.allowed,
        enforced: context.billing.enforced,
        mode: 'observe',
        reason: context.billing.reason,
        observed_allowed: context.billing.observedAllowed,
        observed_reason: context.billing.observedReason,
        subscription_status: context.billing.subscriptionStatus
      }
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Não foi possível validar o Portal da Loja.' }, { status: 500 });
  }
}
