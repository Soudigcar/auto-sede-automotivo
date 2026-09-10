import { readAutocarMetrics } from '@/lib/server/autocarMetrics';
import { NextResponse } from 'next/server';
import { readCanonicalCommercialMetrics } from '@/lib/server/canonicalCommercialMetrics';
import { authorizeStorePortal } from '@/lib/server/storePortal';
import { cleanText } from '@/lib/server/storeTeam';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function historicalParticipantField(role: string) {
  if (role === 'pre_sales') return 'pre_sales_user_id';
  if (role === 'seller') return 'seller_user_id';
  if (role === 'prospector') return 'captured_by_user_id';
  return null;
}

function applyDashboardLeadScope(query: any, profile: any, role: string) {
  if (role === 'master' || role === 'store') return query;
  const userId = cleanText(profile?.id, 80);
  if (!userId) return query.eq('id', '__unauthorized__');
  const participantField = historicalParticipantField(role);
  if (!participantField) return query.eq('assigned_user_id', userId);
  return query.or(`assigned_user_id.eq.${userId},and(status.eq.sale_confirmed,${participantField}.eq.${userId})`);
}

export async function GET(request: Request) {
  try {
    const slug = cleanText(new URL(request.url).searchParams.get('slug'), 120);
    const context = await authorizeStorePortal(request, slug);
    if ('error' in context) return context.error;

    const canonical = await readCanonicalCommercialMetrics(context);
    const readLeads = () => applyDashboardLeadScope(context.supabase.from('leads')
      .select('id,customer_name,customer_phone,interested_vehicle,origin,status,scheduled_at,created_at,assigned_user_id')
      .eq('assigned_store_id', context.store.id).neq('status', 'deleted'), context.profile, context.role);
    const [recent, upcoming] = await Promise.all([
      readLeads().order('created_at', { ascending: false }).order('id', { ascending: false }).limit(12),
      readLeads().gte('scheduled_at', new Date(Date.now() - 3_600_000).toISOString())
        .order('scheduled_at', { ascending: true }).order('id', { ascending: true }).limit(5)
    ]);
    if (recent.error || upcoming.error) throw new Error('Não foi possível carregar os detalhes do Dashboard.');

    const scopeLabel = context.role === 'master' || context.role === 'store'
      ? context.scopeLabel
      : 'Leads sob sua responsabilidade atual e vendas confirmadas com sua participação';

    return NextResponse.json({
      generated_at: new Date().toISOString(),
      store: context.store,
      profile: { id: context.profile.id, full_name: context.profile.full_name || context.profile.email || 'Usuário', role: context.role },
      scope_label: scopeLabel,
      metrics: canonical.metrics,
      team: canonical.team,
      autocar: await readAutocarMetrics(context, canonical.as_of),
      recent_leads: recent.data || [],
      upcoming_appointments: upcoming.data || []
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Não foi possível carregar o Dashboard da Loja.' }, { status: 500 });
  }
}
