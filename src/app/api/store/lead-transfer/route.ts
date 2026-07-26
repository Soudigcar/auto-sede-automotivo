import { NextResponse } from 'next/server';
import {
  cleanText,
  createAdminClient,
  getProfileFromToken,
  readBearerToken
} from '@/lib/server/storeTeam';

export const runtime = 'nodejs';

const assignableRoles = ['store', 'pre_sales', 'seller', 'prospector'] as const;

const roleLabels: Record<string, string> = {
  store: 'Gestor',
  pre_sales: 'SDR / Pré-vendas',
  seller: 'Vendedor',
  prospector: 'Prospectador'
};

async function getContext(request: Request) {
  const supabase: any = createAdminClient();
  const token = readBearerToken(request);

  if (!token) {
    return { error: NextResponse.json({ error: 'Sessão não encontrada.' }, { status: 401 }) } as const;
  }

  const profile = await getProfileFromToken(supabase, token);

  if (!profile || profile.status !== 'active' || !['master', ...assignableRoles].includes(profile.role)) {
    return { error: NextResponse.json({ error: 'Usuário sem permissão para transferir leads.' }, { status: 403 }) } as const;
  }

  return { supabase, profile } as const;
}

async function loadLead(supabase: any, leadId: string) {
  const { data, error } = await supabase
    .from('leads')
    .select('id, event_id, assigned_store_id, assigned_user_id, pre_sales_user_id, seller_user_id, captured_by_user_id, prospector_id, customer_name, customer_phone, interested_vehicle, status')
    .eq('id', leadId)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

function canAccessLead(profile: any, lead: any) {
  if (profile.role === 'master') return true;
  if (!profile.store_id || profile.store_id !== lead.assigned_store_id) return false;
  if (profile.role === 'store') return true;

  if (profile.role === 'pre_sales') {
    return lead.pre_sales_user_id === profile.id || lead.assigned_user_id === profile.id;
  }

  if (profile.role === 'seller') {
    return lead.seller_user_id === profile.id || lead.assigned_user_id === profile.id;
  }

  if (profile.role === 'prospector') {
    return lead.captured_by_user_id === profile.id || lead.assigned_user_id === profile.id;
  }

  return false;
}

async function loadTeam(supabase: any, storeId: string) {
  const { data, error } = await supabase
    .from('users')
    .select('id, full_name, email, role, status, store_id')
    .eq('store_id', storeId)
    .eq('status', 'active')
    .in('role', [...assignableRoles])
    .order('role', { ascending: true })
    .order('full_name', { ascending: true });

  if (error) throw error;

  return (data || []).map((member: any) => ({
    id: member.id,
    full_name: member.full_name || member.email || 'Colaborador sem nome',
    email: member.email || null,
    role: member.role,
    role_label: roleLabels[member.role] || member.role
  }));
}

function currentResponsibleId(lead: any) {
  return lead.assigned_user_id || lead.seller_user_id || lead.pre_sales_user_id || null;
}

export async function GET(request: Request) {
  try {
    const context = await getContext(request);
    if ('error' in context) return context.error;

    const leadId = cleanText(new URL(request.url).searchParams.get('lead_id'), 80);
    if (!leadId) return NextResponse.json({ error: 'Informe o lead.' }, { status: 400 });

    const { supabase, profile } = context;
    const lead = await loadLead(supabase, leadId);

    if (!lead) return NextResponse.json({ error: 'Lead não encontrado.' }, { status: 404 });
    if (!lead.assigned_store_id || !canAccessLead(profile, lead)) {
      return NextResponse.json({ error: 'Você não tem permissão para transferir este lead.' }, { status: 403 });
    }

    const team = await loadTeam(supabase, lead.assigned_store_id);
    const responsibleId = currentResponsibleId(lead);
    const currentResponsible = team.find((member: any) => member.id === responsibleId) || null;

    return NextResponse.json({
      lead: {
        id: lead.id,
        customer_name: lead.customer_name,
        status: lead.status,
        assigned_store_id: lead.assigned_store_id
      },
      current_responsible: currentResponsible,
      current_responsible_id: responsibleId,
      team
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Erro ao carregar a equipe da loja.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const context = await getContext(request);
    if ('error' in context) return context.error;

    const { supabase, profile } = context;
    const body = await request.json();
    const leadId = cleanText(body.lead_id, 80);
    const targetUserId = cleanText(body.target_user_id, 80) || null;

    if (!leadId) return NextResponse.json({ error: 'Informe o lead.' }, { status: 400 });

    const lead = await loadLead(supabase, leadId);
    if (!lead) return NextResponse.json({ error: 'Lead não encontrado.' }, { status: 404 });
    if (!lead.assigned_store_id || !canAccessLead(profile, lead)) {
      return NextResponse.json({ error: 'Você não tem permissão para transferir este lead.' }, { status: 403 });
    }

    const team = await loadTeam(supabase, lead.assigned_store_id);
    const previousResponsibleId = currentResponsibleId(lead);
    const previousResponsible = team.find((member: any) => member.id === previousResponsibleId) || null;
    const target = targetUserId ? team.find((member: any) => member.id === targetUserId) || null : null;

    if (targetUserId && !target) {
      return NextResponse.json({ error: 'O colaborador selecionado não está ativo nesta loja.' }, { status: 400 });
    }

    if (previousResponsibleId === targetUserId) {
      return NextResponse.json({ error: 'Este colaborador já é o responsável atual pelo lead.' }, { status: 409 });
    }

    const actorName = profile.full_name || profile.email || 'Usuário';
    const previousName = previousResponsible?.full_name || 'Carteira geral da loja';
    const targetName = target?.full_name || 'Carteira geral da loja';
    const now = new Date().toISOString();
    const activityLabel = target
      ? `Lead transferido para ${targetName}`
      : 'Lead devolvido para a carteira geral da loja';

    const updatePayload: Record<string, any> = {
      assigned_user_id: target?.id || null,
      pre_sales_user_id: target?.role === 'pre_sales' ? target.id : null,
      seller_user_id: target?.role === 'seller' ? target.id : null,
      updated_at: now,
      last_activity_at: now,
      last_activity_type: 'lead_transferred',
      last_activity_label: activityLabel,
      last_activity_by_name: actorName
    };

    const { data: updatedLead, error: updateError } = await supabase
      .from('leads')
      .update(updatePayload)
      .eq('id', lead.id)
      .eq('assigned_store_id', lead.assigned_store_id)
      .select('id, assigned_store_id, assigned_user_id, pre_sales_user_id, seller_user_id, captured_by_user_id, status, updated_at')
      .single();

    if (updateError) throw updateError;

    const { data: store } = await supabase
      .from('stores')
      .select('id, store_name')
      .eq('id', lead.assigned_store_id)
      .maybeSingle();

    const metadata = {
      actor_role: profile.role,
      previous_responsible_id: previousResponsibleId,
      previous_responsible_name: previousName,
      previous_responsible_role: previousResponsible?.role || null,
      target_responsible_id: target?.id || null,
      target_responsible_name: targetName,
      target_responsible_role: target?.role || null,
      captured_by_user_id_preserved: lead.captured_by_user_id || null,
      registered_from: 'pipeline_lead_transfer'
    };

    await Promise.allSettled([
      supabase.from('lead_activity_logs').insert({
        lead_id: lead.id,
        store_id: lead.assigned_store_id,
        store_name: store?.store_name || null,
        user_id: profile.id,
        user_name: actorName,
        activity_type: 'lead_transferred',
        activity_label: activityLabel,
        from_status: lead.status,
        to_status: lead.status,
        customer_name: lead.customer_name,
        customer_phone: lead.customer_phone,
        vehicle_name: lead.interested_vehicle,
        notes: `Responsável anterior: ${previousName}. Novo responsável: ${targetName}.`,
        metadata
      }),
      supabase.from('lead_activities').insert({
        event_id: lead.event_id || null,
        lead_id: lead.id,
        activity_type: 'lead_transferred',
        description: `${actorName} transferiu o lead de ${previousName} para ${targetName}.`
      }),
      supabase.from('audit_logs').insert({
        event_id: lead.event_id || null,
        action_type: 'lead_transferred',
        entity_type: 'leads',
        entity_id: lead.id,
        old_value: {
          assigned_user_id: previousResponsibleId,
          responsible_name: previousName
        },
        new_value: {
          assigned_user_id: target?.id || null,
          responsible_name: targetName,
          responsible_role: target?.role || null
        }
      })
    ]);

    return NextResponse.json({
      success: true,
      message: target
        ? `Lead transferido para ${targetName}.`
        : 'Lead devolvido para a carteira geral da loja.',
      lead: updatedLead,
      previous_responsible: previousResponsible,
      current_responsible: target
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Erro ao transferir lead.' }, { status: 500 });
  }
}
