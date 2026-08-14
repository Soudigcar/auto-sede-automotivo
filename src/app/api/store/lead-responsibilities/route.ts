import { NextResponse } from 'next/server';
import { cleanText, createAdminClient, getProfileFromToken, readBearerToken } from '@/lib/server/storeTeam';
import { asStorePortalRole, canAccessStoreLead } from '@/lib/server/storePortal';

export const runtime = 'nodejs';

const allowedRoles = ['master', 'store', 'pre_sales', 'seller', 'prospector'];

const roleLabels: Record<string, string> = {
  pre_sales: 'SDR / Pré-vendas',
  seller: 'Vendedor',
  prospector: 'Prospectador'
};

type Member = {
  id: string;
  full_name: string;
  email: string | null;
  role: string;
  role_label: string;
};

async function getContext(request: Request) {
  const supabase: any = createAdminClient();
  const token = readBearerToken(request);

  if (!token) {
    return { error: NextResponse.json({ error: 'Sessão não encontrada.' }, { status: 401 }) } as const;
  }

  const profile = await getProfileFromToken(supabase, token);
  if (!profile || profile.status !== 'active' || !allowedRoles.includes(profile.role)) {
    return { error: NextResponse.json({ error: 'Usuário sem permissão para visualizar os responsáveis.' }, { status: 403 }) } as const;
  }

  return { supabase, profile } as const;
}

function canAccessLead(profile: any, lead: any) {
  const role = asStorePortalRole(profile?.role);
  return Boolean(role && canAccessStoreLead(profile, role, lead));
}

async function loadUsers(supabase: any, ids: Array<string | null | undefined>) {
  const uniqueIds = Array.from(new Set(ids.filter(Boolean))) as string[];
  if (!uniqueIds.length) return new Map<string, Member>();

  const { data, error } = await supabase
    .from('users')
    .select('id,full_name,email,role,status,store_id')
    .in('id', uniqueIds);

  if (error) throw error;

  return new Map<string, Member>((data || []).map((user: any) => [
    String(user.id),
    {
      id: String(user.id),
      full_name: String(user.full_name || user.email || 'Colaborador sem nome'),
      email: user.email || null,
      role: String(user.role || ''),
      role_label: roleLabels[String(user.role || '')] || String(user.role || 'Colaborador')
    }
  ]));
}

function member(users: Map<string, Member>, id: string | null | undefined) {
  return id ? users.get(id) || null : null;
}

export async function GET(request: Request) {
  try {
    const context = await getContext(request);
    if ('error' in context) return context.error;

    const leadId = cleanText(new URL(request.url).searchParams.get('lead_id'), 80);
    if (!leadId) return NextResponse.json({ error: 'Informe o lead.' }, { status: 400 });

    const { supabase, profile } = context;
    const { data: lead, error: leadError } = await supabase
      .from('leads')
      .select('id,assigned_store_id,assigned_user_id,assigned_user_role,pre_sales_user_id,seller_user_id,captured_by_user_id,prospector_id')
      .eq('id', leadId)
      .maybeSingle();

    if (leadError) throw leadError;
    if (!lead) return NextResponse.json({ error: 'Lead não encontrado.' }, { status: 404 });
    if (!canAccessLead(profile, lead)) {
      return NextResponse.json({ error: 'Você não tem permissão para visualizar este lead.' }, { status: 403 });
    }

    const { data: sale, error: saleError } = await supabase
      .from('sales')
      .select('seller_name,seller_user_id,pre_sales_user_id,captured_by_user_id')
      .eq('lead_id', lead.id)
      .maybeSingle();

    if (saleError) throw saleError;

    let prospectorUserId = lead.captured_by_user_id || sale?.captured_by_user_id || null;
    let prospectorSnapshot: Member | null = null;

    if (!prospectorUserId && lead.prospector_id) {
      const { data: prospector, error: prospectorError } = await supabase
        .from('prospectors')
        .select('id,user_id,full_name,status')
        .eq('id', lead.prospector_id)
        .maybeSingle();

      if (prospectorError) throw prospectorError;
      prospectorUserId = prospector?.user_id || null;

      if (!prospectorUserId && prospector) {
        prospectorSnapshot = {
          id: `prospector-${prospector.id}`,
          full_name: String(prospector.full_name || 'Prospectador'),
          email: null,
          role: 'prospector',
          role_label: 'Prospectador'
        };
      }
    }

    const preSalesUserId = lead.pre_sales_user_id || sale?.pre_sales_user_id || null;
    const sellerUserId = lead.seller_user_id || null;
    const closerUserId = sale?.seller_user_id || null;

    const users = await loadUsers(supabase, [
      lead.assigned_user_id,
      preSalesUserId,
      sellerUserId,
      prospectorUserId,
      closerUserId
    ]);

    const closer = member(users, closerUserId) || (sale?.seller_name ? {
      id: closerUserId || 'sale-snapshot',
      full_name: String(sale.seller_name),
      email: null,
      role: 'seller',
      role_label: 'Vendedor'
    } : null);

    return NextResponse.json({
      current: member(users, lead.assigned_user_id),
      pre_sales: member(users, preSalesUserId),
      seller: member(users, sellerUserId),
      prospector: member(users, prospectorUserId) || prospectorSnapshot,
      sale_closer: closer
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Não foi possível carregar os responsáveis.' }, { status: 500 });
  }
}
