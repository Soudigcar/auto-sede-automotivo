import { NextResponse } from 'next/server';
import { cleanText } from '@/lib/server/storeTeam';
import { authorizeStorePortal, canAccessStoreLead } from '@/lib/server/storePortal';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const directStages = ['new_lead', 'in_service', 'no_show', 'showed_up'] as const;
const appointmentTypes = ['appointment', 'visit'] as const;

const stageLabels: Record<string, string> = {
  new_lead: 'Novo Lead',
  in_service: 'Em Atendimento',
  scheduled: 'Agendado',
  no_show: 'Não Compareceu',
  showed_up: 'Compareceu'
};

function parseSchedule(dateValue: unknown, timeValue: unknown) {
  const date = cleanText(dateValue, 20);
  const time = cleanText(timeValue, 20);
  if (!date || !time) throw new Error('Informe data e hora.');
  const parsed = new Date(`${date}T${time}:00-03:00`);
  if (Number.isNaN(parsed.getTime())) throw new Error('Data ou hora inválida.');
  if (parsed.getTime() < Date.now()) throw new Error('Não é permitido agendar em horário passado.');
  return parsed;
}

async function loadLead(context: any, leadId: string) {
  const { data, error } = await context.supabase
    .from('leads')
    .select('id,event_id,assigned_store_id,assigned_user_id,assigned_user_role,pre_sales_user_id,seller_user_id,captured_by_user_id,prospector_id,customer_name,customer_phone,interested_vehicle,status,scheduled_at,appointment_type,appointment_notes,lost_reason')
    .eq('id', leadId)
    .maybeSingle();
  if (error) throw error;
  if (!data || data.assigned_store_id !== context.store.id || !canAccessStoreLead(context.profile, context.role, data)) {
    throw new Error('Lead não encontrado na carteira deste usuário.');
  }
  return data;
}

async function assertScheduleAvailable(context: any, leadId: string, startsAt: Date) {
  const endsAt = new Date(startsAt.getTime() + 60 * 60 * 1000);
  const [leadConflict, taskConflict] = await Promise.all([
    context.supabase.from('leads').select('id').eq('assigned_store_id', context.store.id).neq('id', leadId)
      .not('scheduled_at', 'is', null).gte('scheduled_at', startsAt.toISOString()).lt('scheduled_at', endsAt.toISOString()).limit(1),
    context.supabase.from('store_calendar_tasks').select('id,status').eq('store_id', context.store.id)
      .gte('starts_at', startsAt.toISOString()).lt('starts_at', endsAt.toISOString()).limit(20)
  ]);
  if (leadConflict.error) throw leadConflict.error;
  if (taskConflict.error) throw taskConflict.error;
  const activeTaskConflict = (taskConflict.data || []).some((item: any) => !['completed', 'cancelled', 'done'].includes(String(item.status || '').toLowerCase()));
  if ((leadConflict.data || []).length || activeTaskConflict) throw new Error('Horário ocupado no calendário. Escolha outro horário.');
}

async function recordMovement(context: any, lead: any, fromStatus: string, toStatus: string, label: string, metadata: Record<string, any> = {}) {
  const actorName = context.profile.full_name || context.profile.email || 'Usuário da loja';
  const common = {
    actor_role: context.role,
    store_slug: context.store.slug,
    registered_from: 'store_pipeline_ux',
    ...metadata
  };
  await Promise.allSettled([
    context.supabase.from('lead_activity_logs').insert({
      lead_id: lead.id,
      store_id: context.store.id,
      store_name: context.store.store_name,
      user_id: context.profile.id,
      user_name: actorName,
      activity_type: toStatus === 'scheduled' ? 'schedule_created' : 'status_changed',
      activity_label: label,
      from_status: fromStatus,
      to_status: toStatus,
      customer_name: lead.customer_name,
      customer_phone: lead.customer_phone,
      vehicle_name: lead.interested_vehicle,
      metadata: common
    }),
    context.supabase.from('lead_activities').insert({
      event_id: lead.event_id || context.store.event_id || null,
      lead_id: lead.id,
      user_id: context.profile.id,
      activity_type: toStatus === 'scheduled' ? 'schedule_created' : 'status_changed',
      description: label,
      metadata: common
    }),
    context.supabase.from('audit_logs').insert({
      event_id: lead.event_id || context.store.event_id || null,
      user_id: context.profile.id,
      user_role: context.role,
      action_type: toStatus === 'scheduled' ? 'schedule_created' : 'status_changed',
      entity_type: 'leads',
      entity_id: lead.id,
      old_value: { status: fromStatus },
      new_value: { status: toStatus, ...metadata }
    })
  ]);
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const slug = cleanText(url.searchParams.get('slug'), 120);
    const leadId = cleanText(url.searchParams.get('lead_id'), 80);
    const context = await authorizeStorePortal(request, slug);
    if ('error' in context) return context.error;
    const lead = await loadLead(context, leadId);
    return NextResponse.json({
      lead: {
        id: lead.id,
        status: lead.status,
        scheduled_at: lead.scheduled_at,
        appointment_type: lead.appointment_type || 'appointment',
        appointment_notes: lead.appointment_notes || ''
      }
    }, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Não foi possível carregar o agendamento.' }, { status: 400 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const slug = cleanText(body.slug, 120);
    const leadId = cleanText(body.lead_id, 80);
    const action = cleanText(body.action, 30);
    const context = await authorizeStorePortal(request, slug);
    if ('error' in context) return context.error;
    const lead = await loadLead(context, leadId);
    const fromStatus = String(lead.status || 'new_lead');

    if (fromStatus === 'sale_confirmed') throw new Error('Venda confirmada deve ser alterada somente pelo fluxo seguro de cancelamento de venda.');

    if (action === 'schedule') {
      const appointmentType = cleanText(body.appointment_type, 30) as (typeof appointmentTypes)[number];
      if (!appointmentTypes.includes(appointmentType)) throw new Error('Selecione Agendamento ou Visita.');
      const startsAt = parseSchedule(body.date, body.time);
      await assertScheduleAvailable(context, lead.id, startsAt);
      const notes = cleanText(body.notes, 3000) || null;
      const actorName = context.profile.full_name || context.profile.email || 'Usuário da loja';
      const label = appointmentType === 'visit' ? 'Visita agendada' : 'Agendamento criado';
      const now = new Date().toISOString();
      const { data, error } = await context.supabase.from('leads').update({
        status: 'scheduled',
        scheduled_at: startsAt.toISOString(),
        appointment_type: appointmentType,
        appointment_notes: notes,
        appointment_cancelled_at: null,
        appointment_cancelled_reason: null,
        lost_reason: null,
        updated_at: now,
        last_activity_at: now,
        last_activity_type: 'schedule_created',
        last_activity_label: label,
        last_activity_by_name: actorName
      }).eq('id', lead.id).eq('assigned_store_id', context.store.id).select('*').single();
      if (error) throw error;
      await recordMovement(context, lead, fromStatus, 'scheduled', label, {
        scheduled_at: startsAt.toISOString(),
        appointment_type: appointmentType
      });
      return NextResponse.json({ success: true, message: `${label}. Lead movido para Agendado.`, lead: data });
    }

    if (action === 'move') {
      const target = cleanText(body.target_status, 50) as (typeof directStages)[number];
      if (!directStages.includes(target)) throw new Error('Use o fluxo específico para esta etapa.');
      if (fromStatus === 'lost' && target !== 'in_service') throw new Error('Lead perdido deve ser reaberto primeiro em Em Atendimento.');
      const actorName = context.profile.full_name || context.profile.email || 'Usuário da loja';
      const now = new Date().toISOString();
      const clearing = ['new_lead', 'in_service'].includes(target) ? {
        scheduled_at: null,
        appointment_type: null,
        appointment_notes: null,
        appointment_cancelled_at: null,
        appointment_cancelled_reason: null,
        lost_reason: null
      } : {};
      const label = `Etapa alterada de ${stageLabels[fromStatus] || fromStatus} para ${stageLabels[target] || target}`;
      const { data, error } = await context.supabase.from('leads').update({
        status: target,
        ...clearing,
        updated_at: now,
        last_activity_at: now,
        last_activity_type: 'status_changed',
        last_activity_label: label,
        last_activity_by_name: actorName
      }).eq('id', lead.id).eq('assigned_store_id', context.store.id).select('*').single();
      if (error) throw error;
      await recordMovement(context, lead, fromStatus, target, label);
      return NextResponse.json({ success: true, message: `Lead movido para ${stageLabels[target] || target}.`, lead: data });
    }

    throw new Error('Ação inválida.');
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Não foi possível concluir a ação no Pipeline.' }, { status: 400 });
  }
}
