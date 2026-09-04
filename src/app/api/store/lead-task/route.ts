import { NextResponse } from 'next/server';
import { cleanText, createAdminClient, getProfileFromToken, readBearerToken } from '@/lib/server/storeTeam';
import { asStorePortalRole, canAccessStoreLead } from '@/lib/server/storePortal';
import { checkStoreAvailability } from '@/lib/server/storeAvailability';
import { POST as runSecurePipelineAction } from '@/app/api/store/portal/pipeline/actions/route';
import { isStoreLeadAppointmentType } from '@/lib/storeLeadAppointments';

export const runtime = 'nodejs';

const taskLabels: Record<string, string> = {
  call_back: 'Ligar novamente', send_simulation: 'Enviar simulação', request_documents: 'Solicitar documentos',
  confirm_visit: 'Confirmar visita', whatsapp_followup: 'Retornar pelo WhatsApp', test_drive: 'Test-Drive',
  after_sales: 'Pós-venda', birthday: 'Feliz Aniversário', follow_up: 'Follow-up', other: 'Outra tarefa'
};

function canAccessLead(profile: any, lead: any) {
  const role = asStorePortalRole(profile?.role);
  return Boolean(role && canAccessStoreLead(profile, role, lead));
}

function formatConflictDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'horário já ocupado';
  return date.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
}

export async function POST(request: Request) {
  try {
    const supabase: any = createAdminClient();
    const token = readBearerToken(request);
    if (!token) return NextResponse.json({ error: 'Sessão não encontrada.' }, { status: 401 });

    const profile = await getProfileFromToken(supabase, token);
    if (!profile || profile.status !== 'active') return NextResponse.json({ error: 'Usuário sem permissão para criar tarefas.' }, { status: 403 });

    const body = await request.json();
    const leadId = cleanText(body.lead_id, 80);
    const taskType = cleanText(body.task_type, 50);
    const date = cleanText(body.date, 20);
    const time = cleanText(body.time, 20);
    const description = cleanText(body.description, 2000);
    if (!leadId || !taskLabels[taskType]) return NextResponse.json({ error: 'Informe o lead e o tipo de tarefa.' }, { status: 400 });
    if (!date || !time) return NextResponse.json({ error: 'Informe a data e o horário da tarefa.' }, { status: 400 });

    const startsAt = new Date(`${date}T${time}:00-03:00`);
    if (Number.isNaN(startsAt.getTime())) return NextResponse.json({ error: 'Data ou horário inválido.' }, { status: 400 });
    if (startsAt.getTime() < Date.now()) return NextResponse.json({ error: 'A tarefa precisa ser agendada para um horário futuro.' }, { status: 400 });

    const { data: lead, error: leadError } = await supabase.from('leads')
      .select('id, assigned_store_id, captured_by_user_id, pre_sales_user_id, seller_user_id, assigned_user_id, customer_name, customer_phone, interested_vehicle, status, origin')
      .eq('id', leadId).maybeSingle();
    if (leadError) throw leadError;
    if (!lead || !canAccessLead(profile, lead)) return NextResponse.json({ error: 'Lead não encontrado na carteira deste usuário.' }, { status: 404 });

    const { data: store, error: storeError } = await supabase.from('stores').select('id, store_name, slug').eq('id', lead.assigned_store_id).maybeSingle();
    if (storeError) throw storeError;
    if (!store) return NextResponse.json({ error: 'Loja do lead não encontrada.' }, { status: 404 });

    if (isStoreLeadAppointmentType(taskType)) {
      if (!store.slug) return NextResponse.json({ error: 'Loja sem identificador para o fluxo seguro de agendamento.' }, { status: 409 });
      const label = taskLabels[taskType];
      const appointmentNotes = description ? `${label}: ${description}` : label;
      const secureRequest = new Request(new URL('/api/store/portal/pipeline/actions', request.url), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          command: 'schedule',
          slug: store.slug,
          lead_id: lead.id,
          date,
          time,
          notes: appointmentNotes
        })
      });
      return runSecurePipelineAction(secureRequest);
    }

    const availability = await checkStoreAvailability({
      supabase, storeId: store.id, startsAt, durationMinutes: 30, excludeLeadId: lead.id
    });
    if (!availability.available) {
      const conflict = availability.conflicts[0];
      return NextResponse.json({
        error: `Horário ocupado por “${conflict?.title || 'Outro compromisso'}” em ${formatConflictDate(conflict?.starts_at || availability.starts_at)}. Escolha outro horário.`
      }, { status: 409 });
    }

    const endsAt = new Date(startsAt.getTime() + 30 * 60 * 1000);
    const label = taskLabels[taskType];
    const title = `${label} — ${lead.customer_name || 'Cliente'}`;
    const taskDescription = description || [lead.customer_phone ? `Telefone: ${lead.customer_phone}` : null, lead.interested_vehicle ? `Interesse: ${lead.interested_vehicle}` : null].filter(Boolean).join('\n');

    const { data: task, error: taskError } = await supabase.from('store_calendar_tasks').insert({
      store_id: store.id, lead_id: lead.id, title, description: taskDescription || null, task_type: taskType,
      starts_at: startsAt.toISOString(), ends_at: endsAt.toISOString(), status: 'pending', created_by: profile.id
    }).select('id, title, task_type, starts_at, status').single();
    if (taskError) throw taskError;

    const actorName = profile.full_name || profile.email || 'Usuário da loja';
    const now = new Date().toISOString();
    const { error: activityError } = await supabase.from('lead_activity_logs').insert({
      lead_id: lead.id, store_id: store.id, store_name: store.store_name, user_id: profile.id, user_name: actorName,
      activity_type: 'task_created', activity_label: `Tarefa agendada: ${label}`, from_status: lead.status || null,
      to_status: lead.status || null, customer_name: lead.customer_name || null, customer_phone: lead.customer_phone || null,
      vehicle_name: lead.interested_vehicle || null, notes: description || null,
      metadata: { task_id: task.id, task_type: taskType, starts_at: task.starts_at, actor_role: profile.role, origin: lead.origin || null, registered_from: 'store_lead_task_api' }
    });
    if (activityError) throw activityError;

    const { error: trackingError } = await supabase.from('leads').update({
      last_activity_at: now, last_activity_type: 'task_created', last_activity_label: `Tarefa agendada: ${label}`, last_activity_by_name: actorName
    }).eq('id', lead.id);
    if (trackingError) throw trackingError;

    return NextResponse.json({ success: true, task });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Erro ao criar tarefa.' }, { status: 500 });
  }
}
