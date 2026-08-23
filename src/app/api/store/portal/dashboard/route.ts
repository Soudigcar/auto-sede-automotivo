import { NextResponse } from 'next/server';
import { calculateConversion, calculateResponseTimes } from '@/lib/commercialMetrics';
import { authorizeStorePortal, applyStoreLeadScope } from '@/lib/server/storePortal';
import { cleanText } from '@/lib/server/storeTeam';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const FINAL_STATUSES = new Set(['sale_confirmed', 'lost', 'deleted']);

function responsibleId(lead: any) {
  return String(lead.assigned_user_id || '');
}

function roleLabel(role: string) {
  return ({ store: 'Gestor da loja', pre_sales: 'Pré-vendas', seller: 'Vendedor', prospector: 'Prospectador' } as Record<string, string>)[role] || 'Responsável';
}

export async function GET(request: Request) {
  try {
    const slug = cleanText(new URL(request.url).searchParams.get('slug'), 120);
    const context = await authorizeStorePortal(request, slug);
    if ('error' in context) return context.error;

    let leadsQuery = context.supabase
      .from('leads')
      .select([
        'id', 'customer_name', 'customer_phone', 'customer_bank', 'interested_vehicle', 'origin', 'status',
        'notes', 'scheduled_at', 'created_at', 'updated_at', 'assigned_user_id', 'pre_sales_user_id',
        'seller_user_id', 'captured_by_user_id', 'prospector_id'
      ].join(','))
      .eq('assigned_store_id', context.store.id)
      .neq('status', 'deleted')
      .order('created_at', { ascending: false });
    leadsQuery = applyStoreLeadScope(leadsQuery, context.profile, context.role);

    const { data: leadsData, error: leadsError } = await leadsQuery;
    if (leadsError) throw leadsError;
    const leads = leadsData || [];
    const leadIds = leads.map((lead: any) => lead.id).filter(Boolean);

    const [salesResult, conversationsResult, teamResult] = await Promise.all([
      leadIds.length
        ? context.supabase.from('sales').select('id,lead_id,status,confirmed_at,created_at').eq('store_id', context.store.id).in('lead_id', leadIds)
        : Promise.resolve({ data: [], error: null }),
      leadIds.length
        ? context.supabase.from('whatsapp_conversations').select('id,lead_id,store_id').eq('store_id', context.store.id).in('lead_id', leadIds)
        : Promise.resolve({ data: [], error: null }),
      (context.role === 'master' || context.role === 'store')
        ? context.supabase.from('users').select('id,full_name,email,role').eq('store_id', context.store.id).eq('status', 'active').in('role', ['pre_sales', 'seller', 'prospector']).order('full_name')
        : Promise.resolve({ data: [{ id: context.profile.id, full_name: context.profile.full_name, email: context.profile.email, role: context.role }], error: null })
    ]);
    const relationError = salesResult.error || conversationsResult.error || teamResult.error;
    if (relationError) throw relationError;

    const conversations = conversationsResult.data || [];
    const conversationIds = conversations.map((conversation: any) => conversation.id).filter(Boolean);
    const { data: messages, error: messagesError } = conversationIds.length
      ? await context.supabase
          .from('whatsapp_messages')
          .select('conversation_id,lead_id,direction,raw_payload,sent_at,created_at')
          .in('conversation_id', conversationIds)
          .order('sent_at', { ascending: true })
      : { data: [], error: null };
    if (messagesError) throw messagesError;

    const sales = salesResult.data || [];
    const conversion = calculateConversion(leads, sales);
    const response = calculateResponseTimes(conversations, messages || []);
    const team = (teamResult.data || []).map((member: any) => {
      const memberLeads = leads.filter((lead: any) => responsibleId(lead) === String(member.id));
      const memberIds = new Set<string>(memberLeads.map((lead: any) => String(lead.id)));
      const memberConversion = calculateConversion(memberLeads, sales);
      return {
        id: member.id,
        full_name: member.full_name || member.email || 'Usuário',
        role: member.role,
        role_label: roleLabel(member.role),
        leads: memberLeads.length,
        active_leads: memberLeads.filter((lead: any) => !FINAL_STATUSES.has(String(lead.status))).length,
        converted_leads: memberConversion.converted_leads,
        conversion_rate: memberConversion.conversion_rate,
        response: calculateResponseTimes(conversations, messages || [], memberIds).summary
      };
    });

    const statusCount = (status: string) => leads.filter((lead: any) => lead.status === status).length;
    const upcomingAppointments = leads
      .filter((lead: any) => lead.scheduled_at && new Date(lead.scheduled_at).getTime() >= Date.now() - 3_600_000)
      .sort((left: any, right: any) => new Date(left.scheduled_at).getTime() - new Date(right.scheduled_at).getTime())
      .slice(0, 5);

    return NextResponse.json({
      generated_at: new Date().toISOString(),
      store: context.store,
      profile: { id: context.profile.id, full_name: context.profile.full_name || context.profile.email || 'Usuário', role: context.role },
      scope_label: context.scopeLabel,
      metrics: {
        total: leads.length,
        active: leads.filter((lead: any) => !FINAL_STATUSES.has(String(lead.status))).length,
        new_leads: statusCount('new_lead'),
        in_service: statusCount('in_service'),
        scheduled: statusCount('scheduled'),
        appointment_cancelled: statusCount('appointment_cancelled'),
        no_show: statusCount('no_show'),
        showed_up: statusCount('showed_up'),
        sold: conversion.converted_leads,
        lost: statusCount('lost'),
        conversion_rate: conversion.conversion_rate,
        assignment_coverage_percent: leads.length ? Math.round((leads.filter((lead: any) => responsibleId(lead)).length / leads.length) * 1000) / 10 : 0,
        response: response.summary
      },
      team,
      recent_leads: leads.slice(0, 12),
      upcoming_appointments: upcomingAppointments
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Não foi possível carregar o Dashboard da Loja.' }, { status: 500 });
  }
}
