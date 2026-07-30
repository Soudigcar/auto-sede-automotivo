import { NextResponse } from 'next/server';
import { authorizeStorePortal, type StorePortalRole } from '@/lib/server/storePortal';
import { cleanText } from '@/lib/server/storeTeam';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function applyLeadScope(query: any, role: StorePortalRole, profileId: string, prospectorId: string | null) {
  if (role === 'master' || role === 'store') return query;
  if (role === 'pre_sales') return query.or(`assigned_user_id.eq.${profileId},pre_sales_user_id.eq.${profileId}`);
  if (role === 'seller') return query.or(`assigned_user_id.eq.${profileId},seller_user_id.eq.${profileId}`);

  const conditions = [
    `assigned_user_id.eq.${profileId}`,
    `captured_by_user_id.eq.${profileId}`
  ];

  if (prospectorId) conditions.push(`prospector_id.eq.${prospectorId}`);
  return query.or(conditions.join(','));
}

async function countScopedLeads(
  supabase: any,
  storeId: string,
  role: StorePortalRole,
  profileId: string,
  prospectorId: string | null,
  status?: string
) {
  let query = supabase
    .from('leads')
    .select('id', { count: 'exact', head: true })
    .eq('assigned_store_id', storeId);

  if (status) query = query.eq('status', status);
  query = applyLeadScope(query, role, profileId, prospectorId);

  const { count, error } = await query;
  if (error) throw error;
  return Number(count || 0);
}

export async function GET(request: Request) {
  try {
    const slug = cleanText(new URL(request.url).searchParams.get('slug'), 120);
    const context = await authorizeStorePortal(request, slug);
    if ('error' in context) return context.error;

    let prospectorId: string | null = null;
    if (context.role === 'prospector') {
      const { data: prospector, error } = await context.supabase
        .from('prospectors')
        .select('id')
        .eq('user_id', context.profile.id)
        .maybeSingle();

      if (error) throw error;
      prospectorId = prospector?.id || null;
    }

    let recentQuery = context.supabase
      .from('leads')
      .select('id, customer_name, customer_phone, customer_bank, interested_vehicle, origin, status, notes, scheduled_at, created_at, updated_at')
      .eq('assigned_store_id', context.store.id)
      .order('created_at', { ascending: false })
      .limit(12);

    recentQuery = applyLeadScope(recentQuery, context.role, context.profile.id, prospectorId);

    const [
      total,
      newLeads,
      inService,
      scheduled,
      cancelled,
      noShow,
      showedUp,
      sold,
      lost,
      recentResult
    ] = await Promise.all([
      countScopedLeads(context.supabase, context.store.id, context.role, context.profile.id, prospectorId),
      countScopedLeads(context.supabase, context.store.id, context.role, context.profile.id, prospectorId, 'new_lead'),
      countScopedLeads(context.supabase, context.store.id, context.role, context.profile.id, prospectorId, 'in_service'),
      countScopedLeads(context.supabase, context.store.id, context.role, context.profile.id, prospectorId, 'scheduled'),
      countScopedLeads(context.supabase, context.store.id, context.role, context.profile.id, prospectorId, 'appointment_cancelled'),
      countScopedLeads(context.supabase, context.store.id, context.role, context.profile.id, prospectorId, 'no_show'),
      countScopedLeads(context.supabase, context.store.id, context.role, context.profile.id, prospectorId, 'showed_up'),
      countScopedLeads(context.supabase, context.store.id, context.role, context.profile.id, prospectorId, 'sale_confirmed'),
      countScopedLeads(context.supabase, context.store.id, context.role, context.profile.id, prospectorId, 'lost'),
      recentQuery
    ]);

    if (recentResult.error) throw recentResult.error;

    return NextResponse.json({
      generated_at: new Date().toISOString(),
      store: context.store,
      profile: {
        id: context.profile.id,
        full_name: context.profile.full_name || context.profile.email || 'Usuário',
        role: context.role
      },
      scope_label: context.scopeLabel,
      metrics: {
        total,
        active: Math.max(0, total - sold - lost),
        new_leads: newLeads,
        in_service: inService,
        scheduled,
        appointment_cancelled: cancelled,
        no_show: noShow,
        showed_up: showedUp,
        sold,
        lost
      },
      recent_leads: recentResult.data || []
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Não foi possível carregar o Dashboard da Loja.' }, { status: 500 });
  }
}
