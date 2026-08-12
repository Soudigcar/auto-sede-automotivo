import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { cleanText, getAdminClient, requireMaster } from '@/lib/server/masterApi';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const taskLabels: Record<string, string> = {
  call_back: 'Ligar novamente',
  test_drive: 'Test-Drive',
  after_sales: 'Pós-venda',
  birthday: 'Feliz Aniversário',
  follow_up: 'Follow-up'
};

function overlaps(startA: Date, endA: Date, startB: Date, endB: Date) {
  return startA.getTime() < endB.getTime() && endA.getTime() > startB.getTime();
}

function formatConflictDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'horário já ocupado';
  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Sao_Paulo'
  });
}

export async function POST(request: Request) {
  try {
    const supabase: any = getAdminClient();
    const master = await requireMaster(request, supabase);
    if (!master) return NextResponse.json({ error: 'Acesso restrito ao perfil Master.' }, { status: 403 });

    const body = await request.json();
    const baseLeadId = cleanText(body.base_lead_id, 80);
    const taskType = cleanText(body.task_type, 50);
    const date = cleanText(body.date, 20);
    const time = cleanText(body.time, 20);
    const description = cleanText(body.description, 2000);

    if (!baseLeadId || !taskLabels[taskType]) {
      return NextResponse.json({ error: 'Informe o lead da Base Master e o tipo de tarefa.' }, { status: 400 });
    }
    if (!date || !time) {
      return NextResponse.json({ error: 'Informe a data e o horário da tarefa.' }, { status: 400 });
    }

    const startsAt = new Date(`${date}T${time}:00-03:00`);
    if (Number.isNaN(startsAt.getTime())) {
      return NextResponse.json({ error: 'Data ou horário inválido.' }, { status: 400 });
    }
    if (startsAt.getTime() < Date.now()) {
      return NextResponse.json({ error: 'A tarefa precisa ser agendada para um horário futuro.' }, { status: 400 });
    }

    const { data: baseLead, error: baseLeadError } = await supabase
      .from('leads_base')
      .select('id,name,phone,status,source,vehicle_name,assigned_store_id,assigned_store_name,routed_lead_id,event_id,metadata')
      .eq('id', baseLeadId)
      .maybeSingle();

    if (baseLeadError) throw baseLeadError;
    if (!baseLead) return NextResponse.json({ error: 'Lead não encontrado na Base Master.' }, { status: 404 });

    if (baseLead.routed_lead_id) {
      return NextResponse.json(
        { error: 'Este lead já foi direcionado para uma loja. Recarregue o Inbox para usar o calendário da loja.' },
        { status: 409 }
      );
    }

    const label = taskLabels[taskType];
    const title = `${label} — ${baseLead.name || 'Cliente'}`;
    const endsAt = new Date(startsAt.getTime() + 30 * 60 * 1000);
    const actorName = master.full_name || master.email || 'Master';
    const now = new Date().toISOString();
    let task: any = null;
    let scope: 'store_calendar' | 'master_base' = 'master_base';

    if (baseLead.assigned_store_id) {
      const searchStart = new Date(startsAt.getTime() - 60 * 60 * 1000);
      const { data: existingTasks, error: tasksError } = await supabase
        .from('store_calendar_tasks')
        .select('id,title,starts_at,ends_at,status')
        .eq('store_id', baseLead.assigned_store_id)
        .gte('starts_at', searchStart.toISOString())
        .lt('starts_at', endsAt.toISOString());

      if (tasksError) throw tasksError;

      const conflict = (existingTasks || []).find((item: any) => {
        if (['completed', 'cancelled', 'done'].includes(String(item.status || '').toLowerCase())) return false;
        const existingStart = new Date(item.starts_at);
        const existingEnd = item.ends_at
          ? new Date(item.ends_at)
          : new Date(existingStart.getTime() + 30 * 60 * 1000);
        return overlaps(startsAt, endsAt, existingStart, existingEnd);
      });

      if (conflict) {
        return NextResponse.json(
          { error: `Horário ocupado por “${conflict.title || 'Outro compromisso'}” em ${formatConflictDate(conflict.starts_at)}. Escolha outro horário.` },
          { status: 409 }
        );
      }

      const taskDescription = description || [
        'Agendamento criado pelo Inbox WhatsApp Master.',
        baseLead.phone ? `Telefone: ${baseLead.phone}` : null,
        baseLead.vehicle_name ? `Interesse: ${baseLead.vehicle_name}` : null,
        `Base Master: ${baseLead.id}`
      ].filter(Boolean).join('\n');

      const { data: createdTask, error: taskError } = await supabase
        .from('store_calendar_tasks')
        .insert({
          store_id: baseLead.assigned_store_id,
          lead_id: null,
          title,
          description: taskDescription,
          task_type: taskType,
          starts_at: startsAt.toISOString(),
          ends_at: endsAt.toISOString(),
          status: 'pending',
          created_by: master.id
        })
        .select('id,title,task_type,starts_at,status')
        .single();

      if (taskError) throw taskError;
      task = createdTask;
      scope = 'store_calendar';
    } else {
      const metadata = baseLead.metadata && typeof baseLead.metadata === 'object' ? baseLead.metadata : {};
      const previousTasks = Array.isArray(metadata.master_tasks) ? metadata.master_tasks : [];
      task = {
        id: randomUUID(),
        title,
        task_type: taskType,
        starts_at: startsAt.toISOString(),
        ends_at: endsAt.toISOString(),
        status: 'pending',
        description: description || null,
        created_at: now,
        created_by: master.id
      };

      const { error: metadataError } = await supabase
        .from('leads_base')
        .update({
          metadata: {
            ...metadata,
            master_tasks: [...previousTasks, task].slice(-50)
          },
          updated_at: now
        })
        .eq('id', baseLead.id);

      if (metadataError) throw metadataError;
    }

    const { error: activityError } = await supabase.from('lead_activity_logs').insert({
      lead_id: null,
      base_lead_id: baseLead.id,
      store_id: baseLead.assigned_store_id || null,
      store_name: baseLead.assigned_store_name || null,
      user_id: master.id,
      user_name: actorName,
      activity_type: 'task_created',
      activity_label: `Tarefa agendada: ${label}`,
      from_status: baseLead.status || null,
      to_status: baseLead.status || null,
      customer_name: baseLead.name || null,
      customer_phone: baseLead.phone || null,
      vehicle_name: baseLead.vehicle_name || null,
      notes: description || null,
      metadata: {
        task_id: task.id,
        task_type: taskType,
        starts_at: task.starts_at,
        actor_role: 'master',
        origin: baseLead.source || null,
        scope,
        registered_from: 'master_whatsapp_base_task'
      }
    });

    if (activityError) throw activityError;

    return NextResponse.json({ success: true, task, scope });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Erro ao criar agendamento da Base Master.' }, { status: 500 });
  }
}
