import { NextResponse } from 'next/server';
import { cleanText } from '@/lib/server/storeTeam';
import { authorizeStorePortal, canAccessStoreLead } from '@/lib/server/storePortal';
import { checkStoreAvailability } from '@/lib/server/storeAvailability';
import { getStoreScheduleConflictWarning } from '@/lib/storeScheduleWarnings';

export const runtime = 'nodejs';

const commands = [
  'reveal_phone', 'start_service', 'change_stage', 'schedule', 'cancel_schedule',
  'mark_no_show', 'mark_showed_up', 'register_loss', 'reopen_lead', 'edit_lead', 'delete_lead'
] as const;

type PipelineCommand = (typeof commands)[number];

const transitionMap: Record<string, string[]> = {
  new_lead: ['in_service', 'lost'],
  in_service: ['new_lead', 'scheduled', 'lost'],
  scheduled: ['in_service', 'appointment_cancelled', 'no_show', 'showed_up', 'lost'],
  appointment_cancelled: ['in_service', 'scheduled', 'lost'],
  no_show: ['in_service', 'scheduled', 'lost'],
  showed_up: ['in_service', 'lost'],
  lost: ['in_service'],
  sale_confirmed: []
};

const labels: Record<string, string> = {
  new_lead: 'Novo lead', in_service: 'Em atendimento', scheduled: 'Agendado',
  appointment_cancelled: 'Agendamento cancelado', no_show: 'Não compareceu',
  showed_up: 'Compareceu', lost: 'Perdido', sale_confirmed: 'Venda confirmada', deleted: 'Excluído'
};

function digits(value: unknown) {
  return String(value || '').replace(/\D/g, '');
}

function normalizePhone(value: unknown) {
  return cleanText(value, 40).replace(/[^\d+]/g, '');
}

function whatsappUrl(phoneValue: unknown, customerName: unknown, vehicleName: unknown) {
  let phone = digits(phoneValue);
  if (!phone) return '';
  if (!phone.startsWith('55') && (phone.length === 10 || phone.length === 11)) phone = `55${phone}`;
  const customer = cleanText(customerName, 180).split(/\s+/)[0] || 'tudo bem';
  const vehicle = cleanText(vehicleName, 300);
  const text = vehicle
    ? `Olá, ${customer}! Tudo bem? Recebemos sua simulação sobre o veículo ${vehicle} e estou entrando em contato para dar continuidade ao seu atendimento.`
    : `Olá, ${customer}! Tudo bem? Recebemos sua simulação e estou entrando em contato para dar continuidade ao seu atendimento.`;
  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
}

function actionType(command: PipelineCommand, targetStatus?: string) {
  if (command === 'start_service') return 'status_changed';
  if (command === 'schedule') return 'schedule_created';
  if (command === 'cancel_schedule') return 'schedule_cancelled';
  if (command === 'mark_no_show') return 'no_show_marked';
  if (command === 'mark_showed_up') return 'showed_up_marked';
  if (command === 'register_loss') return 'lost_registered';
  if (command === 'reopen_lead') return 'lead_reopened';
  if (command === 'edit_lead') return 'lead_edited';
  if (command === 'delete_lead') return 'lead_deleted';
  if (command === 'reveal_phone') return 'phone_viewed';
  if (command === 'change_stage' && targetStatus === 'lost') return 'lost_registered';
  return 'status_changed';
}

function actionLabel(command: PipelineCommand, fromStatus: string, toStatus: string) {
  if (command === 'reveal_phone') return 'Usuário visualizou o telefone';
  if (command === 'start_service') return 'Usuário iniciou o atendimento';
  if (command === 'schedule') return 'Usuário agendou atendimento';
  if (command === 'cancel_schedule') return 'Usuário cancelou o agendamento';
  if (command === 'mark_no_show') return 'Usuário marcou não compareceu';
  if (command === 'mark_showed_up') return 'Usuário marcou compareceu';
  if (command === 'register_loss') return 'Usuário registrou perda';
  if (command === 'reopen_lead') return 'Usuário reabriu o lead';
  if (command === 'edit_lead') return 'Usuário editou informações do lead';
  if (command === 'delete_lead') return 'Usuário excluiu logicamente o lead';
  return `Etapa alterada de ${labels[fromStatus] || fromStatus} para ${labels[toStatus] || toStatus}`;
}

async function loadLead(supabase: any, leadId: string) {
  const { data, error } = await supabase
    .from('leads')
    .select([
      'id', 'event_id', 'assigned_store_id', 'assigned_user_id', 'assigned_user_role',
      'pre_sales_user_id', 'seller_user_id', 'captured_by_user_id', 'prospector_id',
      'customer_name', 'customer_phone', 'customer_bank', 'interested_vehicle',
      'interested_vehicle_id', 'interested_vehicle_price', 'vehicle_category_interest',
      'origin', 'status', 'notes', 'scheduled_at', 'appointment_notes',
      'appointment_cancelled_at', 'appointment_cancelled_reason', 'lost_reason',
      'first_phone_viewed_at', 'first_phone_viewed_by_user_id', 'first_phone_viewed_by_name',
      'created_at', 'updated_at'
    ].join(','))
    .eq('id', leadId)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

function ensureTransition(current: string, target: string) {
  if (current === target) return;
  if (!(transitionMap[current] || []).includes(target)) {
    throw new Error(`Não é permitido mover o lead de ${labels[current] || current} para ${labels[target] || target}.`);
  }
}

function parseSchedule(dateValue: unknown, timeValue: unknown) {
  const date = cleanText(dateValue, 20);
  const time = cleanText(timeValue, 20);
  if (!date || !time) throw new Error('Informe data e hora do agendamento.');
  const parsed = new Date(`${date}T${time}:00-03:00`);
  if (Number.isNaN(parsed.getTime())) throw new Error('Data ou hora de agendamento inválida.');
  if (parsed.getTime() < Date.now()) throw new Error('Não é permitido agendar em horário passado.');
  return parsed;
}

async function readScheduleWarning(supabase: any, storeId: string, leadId: string, startsAt: Date) {
  try {
    const availability = await checkStoreAvailability({
      supabase,
      storeId,
      startsAt,
      durationMinutes: 60,
      excludeLeadId: leadId
    });
    return getStoreScheduleConflictWarning(!availability.available);
  } catch {
    return null;
  }
}

async function recordActivity(
  supabase: any,
  context: any,
  lead: any,
  command: PipelineCommand,
  fromStatus: string,
  toStatus: string,
  notes: string | null,
  metadata: Record<string, any> = {}
) {
  const actorName = context.profile.full_name || context.profile.email || 'Usuário da loja';
  const activityType = actionType(command, toStatus);
  const activityLabel = actionLabel(command, fromStatus, toStatus);
  const commonMetadata = {
    command,
    actor_role: context.role,
    store_slug: context.store.slug,
    registered_from: 'secure_store_pipeline',
    ...metadata
  };

  await Promise.allSettled([
    supabase.from('lead_activity_logs').insert({
      lead_id: lead.id, store_id: context.store.id, store_name: context.store.store_name,
      user_id: context.profile.id, user_name: actorName, activity_type: activityType,
      activity_label: activityLabel, from_status: fromStatus, to_status: toStatus,
      customer_name: lead.customer_name, customer_phone: lead.customer_phone,
      vehicle_name: lead.interested_vehicle, notes, metadata: commonMetadata
    }),
    supabase.from('lead_activities').insert({
      event_id: lead.event_id || context.store.event_id || null, lead_id: lead.id,
      user_id: context.profile.id, activity_type: activityType,
      description: notes ? `${activityLabel}. ${notes}` : activityLabel,
      metadata: commonMetadata
    }),
    supabase.from('audit_logs').insert({
      event_id: lead.event_id || context.store.event_id || null, user_id: context.profile.id,
      user_role: context.role, action_type: activityType, entity_type: 'leads', entity_id: lead.id,
      old_value: { status: fromStatus }, new_value: { status: toStatus, notes, ...metadata }
    })
  ]);
}

async function updateLead(
  supabase: any,
  context: any,
  lead: any,
  command: PipelineCommand,
  payload: Record<string, any>,
  notes: string | null,
  metadata: Record<string, any> = {}
) {
  const fromStatus = String(lead.status || 'new_lead');
  const toStatus = String(payload.status || fromStatus);
  const actorName = context.profile.full_name || context.profile.email || 'Usuário da loja';
  const now = new Date().toISOString();
  const activityLabel = actionLabel(command, fromStatus, toStatus);

  const { data, error } = await supabase
    .from('leads')
    .update({
      ...payload,
      updated_at: now,
      last_activity_at: now,
      last_activity_type: actionType(command, toStatus),
      last_activity_label: activityLabel,
      last_activity_by_name: actorName
    })
    .eq('id', lead.id)
    .eq('assigned_store_id', context.store.id)
    .select('*')
    .single();
  if (error) throw error;

  await recordActivity(supabase, context, lead, command, fromStatus, toStatus, notes, metadata);
  return data;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const command = cleanText(body.command, 80) as PipelineCommand;
    const slug = cleanText(body.slug, 120);
    const leadId = cleanText(body.lead_id, 80);

    if (!commands.includes(command)) return NextResponse.json({ error: 'Comando do pipeline inválido.' }, { status: 400 });
    if (!slug || !leadId) return NextResponse.json({ error: 'Informe a loja e o lead.' }, { status: 400 });

    const context = await authorizeStorePortal(request, slug);
    if ('error' in context) return context.error;

    const lead = await loadLead(context.supabase, leadId);
    if (!lead || lead.assigned_store_id !== context.store.id || !canAccessStoreLead(context.profile, context.role, lead)) {
      return NextResponse.json({ error: 'Lead não encontrado na carteira deste usuário.' }, { status: 404 });
    }

    const currentStatus = String(lead.status || 'new_lead');
    if (currentStatus === 'deleted') return NextResponse.json({ error: 'Este lead foi excluído.' }, { status: 410 });

    if (command === 'reveal_phone') {
      const phone = normalizePhone(lead.customer_phone);
      if (!phone) return NextResponse.json({ error: 'Este lead não possui telefone cadastrado.' }, { status: 404 });
      const now = new Date().toISOString();
      const actorName = context.profile.full_name || context.profile.email || 'Usuário da loja';
      await context.supabase.from('leads').update({
        first_phone_viewed_at: lead.first_phone_viewed_at || now,
        first_phone_viewed_by_user_id: lead.first_phone_viewed_by_user_id || context.profile.id,
        first_phone_viewed_by_name: lead.first_phone_viewed_by_name || actorName,
        last_phone_viewed_at: now,
        last_phone_viewed_by_user_id: context.profile.id,
        last_phone_viewed_by_name: actorName,
        last_activity_at: now,
        last_activity_type: 'phone_viewed',
        last_activity_label: 'Usuário visualizou o telefone',
        last_activity_by_name: actorName
      }).eq('id', lead.id).eq('assigned_store_id', context.store.id);
      await recordActivity(context.supabase, context, lead, command, currentStatus, currentStatus, null, { interaction_source: 'secure_pipeline_phone' });
      return NextResponse.json({ success: true, phone });
    }

    if (currentStatus === 'sale_confirmed') {
      return NextResponse.json({ error: 'Venda confirmada só pode ser alterada pelo fluxo seguro de cancelamento de venda.' }, { status: 409 });
    }

    if (command === 'start_service') {
      ensureTransition(currentStatus, 'in_service');
      const url = whatsappUrl(lead.customer_phone, lead.customer_name, lead.interested_vehicle);
      const updated = await updateLead(context.supabase, context, lead, command, {
        status: 'in_service', lost_reason: null,
        appointment_cancelled_at: null, appointment_cancelled_reason: null
      }, url ? 'Atendimento iniciado pelo WhatsApp.' : 'Atendimento iniciado sem telefone cadastrado.', { whatsapp_opened: Boolean(url) });
      return NextResponse.json({ success: true, message: 'Atendimento iniciado.', whatsapp_url: url || null, lead: updated });
    }

    if (command === 'schedule') {
      const startsAt = parseSchedule(body.date, body.time);
      const warning = await readScheduleWarning(context.supabase, context.store.id, lead.id, startsAt);
      if (currentStatus !== 'scheduled') ensureTransition(currentStatus, 'scheduled');
      const appointmentNotes = cleanText(body.notes, 3000) || null;
      const updated = await updateLead(context.supabase, context, lead, command, {
        status: 'scheduled', scheduled_at: startsAt.toISOString(), appointment_notes: appointmentNotes,
        appointment_cancelled_at: null, appointment_cancelled_reason: null, lost_reason: null
      }, appointmentNotes, { scheduled_at: startsAt.toISOString(), schedule_conflict_warning: Boolean(warning) });
      return NextResponse.json({
        success: true,
        message: warning ? `Agendamento salvo. ${warning}` : 'Agendamento salvo.',
        warning,
        lead: updated
      });
    }

    if (command === 'cancel_schedule') {
      if (currentStatus !== 'scheduled') throw new Error('Somente um lead agendado pode ter o agendamento cancelado.');
      const reason = cleanText(body.reason, 1000);
      if (reason.length < 3) throw new Error('Informe o motivo do cancelamento.');
      ensureTransition(currentStatus, 'appointment_cancelled');
      const updated = await updateLead(context.supabase, context, lead, command, {
        status: 'appointment_cancelled', appointment_cancelled_at: new Date().toISOString(), appointment_cancelled_reason: reason
      }, reason);
      return NextResponse.json({ success: true, message: 'Cancelamento registrado.', lead: updated });
    }

    if (command === 'mark_no_show' || command === 'mark_showed_up') {
      const target = command === 'mark_no_show' ? 'no_show' : 'showed_up';
      if (currentStatus !== 'scheduled') throw new Error('Esta ação só está disponível para leads agendados.');
      ensureTransition(currentStatus, target);
      const updated = await updateLead(context.supabase, context, lead, command, { status: target }, null);
      return NextResponse.json({ success: true, message: `Lead movido para ${labels[target]}.`, lead: updated });
    }

    if (command === 'register_loss') {
      const description = cleanText(body.reason, 1500);
      if (description.length < 3) throw new Error('Informe o motivo da perda.');
      ensureTransition(currentStatus, 'lost');
      const actorName = context.profile.full_name || context.profile.email || 'Usuário da loja';
      const { data: lossId, error: rpcError } = await context.supabase.rpc('store_register_loss_transaction', {
        p_lead_id: lead.id,
        p_store_id: context.store.id,
        p_reason: cleanText(body.reason_code, 120) || 'other',
        p_description: description,
        p_actor_user_id: context.profile.id,
        p_actor_name: actorName
      });
      if (rpcError) throw rpcError;
      const updated = await loadLead(context.supabase, lead.id);
      return NextResponse.json({ success: true, loss_id: lossId, message: 'Perda registrada.', lead: updated });
    }

    if (command === 'reopen_lead') {
      if (currentStatus !== 'lost') throw new Error('Somente um lead perdido pode ser reaberto por este comando.');
      ensureTransition(currentStatus, 'in_service');
      const updated = await updateLead(context.supabase, context, lead, command, { status: 'in_service', lost_reason: null }, cleanText(body.reason, 1000) || 'Lead reaberto para atendimento.');
      return NextResponse.json({ success: true, message: 'Lead reaberto.', lead: updated });
    }

    if (command === 'change_stage') {
      const target = cleanText(body.target_status, 50);
      if (!transitionMap[target] && target !== 'new_lead') throw new Error('Etapa de destino inválida.');
      if (['sale_confirmed', 'lost', 'scheduled', 'appointment_cancelled'].includes(target)) {
        throw new Error('Use o fluxo específico para venda, perda, agendamento ou cancelamento.');
      }
      ensureTransition(currentStatus, target);
      const clearing = ['new_lead', 'in_service'].includes(target) ? {
        scheduled_at: null, appointment_notes: null,
        appointment_cancelled_at: null, appointment_cancelled_reason: null, lost_reason: null
      } : {};
      const updated = await updateLead(context.supabase, context, lead, command, { status: target, ...clearing }, null);
      return NextResponse.json({ success: true, message: `Lead movido para ${labels[target]}.`, lead: updated });
    }

    if (command === 'edit_lead') {
      const customerName = cleanText(body.customer_name, 180);
      if (customerName.length < 3) throw new Error('Informe o nome do cliente com pelo menos 3 caracteres.');
      const phone = normalizePhone(body.customer_phone) || null;
      const interestedVehicle = cleanText(body.interested_vehicle, 300) || null;
      const origin = cleanText(body.origin, 180) || lead.origin || 'Manual';
      const notes = cleanText(body.notes, 5000) || null;
      const appointmentNotes = cleanText(body.appointment_notes, 5000) || lead.appointment_notes || null;
      const newObservation = cleanText(body.new_observation, 5000);
      const updated = await updateLead(context.supabase, context, lead, command, {
        customer_name: customerName, customer_phone: phone, interested_vehicle: interestedVehicle,
        origin, notes, appointment_notes: appointmentNotes
      }, newObservation || 'Informações cadastrais atualizadas.');

      if (newObservation) {
        await context.supabase.from('lead_notes').insert({
          lead_id: lead.id, store_id: context.store.id, author_user_id: context.profile.id,
          author_name: context.profile.full_name || context.profile.email || 'Usuário da loja',
          note_type: 'service', content: newObservation
        });
      }
      return NextResponse.json({ success: true, message: 'Informações cadastrais atualizadas.', lead: updated });
    }

    if (command === 'delete_lead') {
      if (!['master', 'store'].includes(context.role)) {
        return NextResponse.json({ error: 'Somente o Gestor da Loja ou Master pode excluir leads.' }, { status: 403 });
      }
      const confirmation = cleanText(body.confirmation, 100).toLocaleUpperCase('pt-BR');
      if (confirmation !== 'EXCLUIR') throw new Error('Digite EXCLUIR para confirmar a operação.');
      const { data: sale, error: saleError } = await context.supabase
        .from('sales').select('id,status').eq('lead_id', lead.id).limit(1).maybeSingle();
      if (saleError) throw saleError;
      if (sale) return NextResponse.json({ error: 'Leads com registro de venda não podem ser excluídos.' }, { status: 409 });

      const updated = await updateLead(context.supabase, context, lead, command, {
        status: 'deleted', scheduled_at: null, appointment_notes: null
      }, 'Exclusão lógica confirmada pelo gestor.', { deletion_mode: 'logical' });
      return NextResponse.json({ success: true, message: 'Lead excluído do Pipeline.', lead: updated });
    }

    return NextResponse.json({ error: 'Comando não implementado.' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Não foi possível concluir a ação no Pipeline.' }, { status: 400 });
  }
}
