type AvailabilityConflict = {
  source: 'lead' | 'task';
  id: string;
  title: string;
  starts_at: string;
  ends_at: string;
};

function validDate(value: Date) {
  return !Number.isNaN(value.getTime());
}

function overlaps(startA: Date, endA: Date, startB: Date, endB: Date) {
  return startA.getTime() < endB.getTime() && endA.getTime() > startB.getTime();
}

export async function checkStoreAvailability(input: {
  supabase: any;
  storeId: string;
  startsAt: Date;
  durationMinutes?: number;
  excludeLeadId?: string | null;
  excludeTaskId?: string | null;
}) {
  const duration = Math.max(15, Math.min(480, Number(input.durationMinutes || 60)));
  const startsAt = input.startsAt;
  const endsAt = new Date(startsAt.getTime() + duration * 60 * 1000);
  if (!validDate(startsAt) || !validDate(endsAt)) throw new Error('Data ou horário inválido para consulta de disponibilidade.');

  // When availability belongs to a lead, scope conflicts to that lead's responsible
  // user. Different sellers in the same store may therefore use the same time slot.
  // Leads without a responsible keep the previous store-wide lock as a safe fallback.
  let responsibleUserId: string | null = null;
  if (input.excludeLeadId) {
    const { data: targetLead, error: targetLeadError } = await input.supabase
      .from('leads')
      .select('assigned_user_id')
      .eq('id', input.excludeLeadId)
      .eq('assigned_store_id', input.storeId)
      .maybeSingle();
    if (targetLeadError) throw targetLeadError;
    responsibleUserId = targetLead?.assigned_user_id || null;
  }

  // Search backwards far enough to catch an event that began before the requested slot
  // but still overlaps it. Current lead appointments are treated as one-hour windows.
  const searchStart = new Date(startsAt.getTime() - 8 * 60 * 60 * 1000);

  let leadQuery = input.supabase
    .from('leads')
    .select('id,customer_name,scheduled_at,status')
    .eq('assigned_store_id', input.storeId)
    .not('scheduled_at', 'is', null)
    .gte('scheduled_at', searchStart.toISOString())
    .lt('scheduled_at', endsAt.toISOString());
  if (responsibleUserId) leadQuery = leadQuery.eq('assigned_user_id', responsibleUserId);
  if (input.excludeLeadId) leadQuery = leadQuery.neq('id', input.excludeLeadId);

  let taskQuery = input.supabase
    .from('store_calendar_tasks')
    .select('id,title,starts_at,ends_at,status')
    .eq('store_id', input.storeId)
    .gte('starts_at', searchStart.toISOString())
    .lt('starts_at', endsAt.toISOString());
  if (responsibleUserId) taskQuery = taskQuery.eq('created_by', responsibleUserId);
  if (input.excludeTaskId) taskQuery = taskQuery.neq('id', input.excludeTaskId);

  const [leadResult, taskResult] = await Promise.all([leadQuery, taskQuery]);
  if (leadResult.error) throw leadResult.error;
  if (taskResult.error) throw taskResult.error;

  const conflicts: AvailabilityConflict[] = [];

  for (const lead of leadResult.data || []) {
    const status = String(lead.status || '').toLowerCase();
    if (['appointment_cancelled', 'lost', 'deleted', 'no_show'].includes(status)) continue;
    const existingStart = new Date(lead.scheduled_at);
    const existingEnd = new Date(existingStart.getTime() + 60 * 60 * 1000);
    if (!validDate(existingStart) || !overlaps(startsAt, endsAt, existingStart, existingEnd)) continue;
    conflicts.push({
      source: 'lead',
      id: lead.id,
      title: lead.customer_name || 'Agendamento de lead',
      starts_at: existingStart.toISOString(),
      ends_at: existingEnd.toISOString()
    });
  }

  for (const task of taskResult.data || []) {
    const status = String(task.status || '').toLowerCase();
    if (['completed', 'cancelled', 'done'].includes(status)) continue;
    const existingStart = new Date(task.starts_at);
    const existingEnd = task.ends_at ? new Date(task.ends_at) : new Date(existingStart.getTime() + 60 * 60 * 1000);
    if (!validDate(existingStart) || !validDate(existingEnd) || !overlaps(startsAt, endsAt, existingStart, existingEnd)) continue;
    conflicts.push({
      source: 'task',
      id: task.id,
      title: task.title || 'Tarefa da loja',
      starts_at: existingStart.toISOString(),
      ends_at: existingEnd.toISOString()
    });
  }

  conflicts.sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());

  return {
    available: conflicts.length === 0,
    starts_at: startsAt.toISOString(),
    ends_at: endsAt.toISOString(),
    duration_minutes: duration,
    conflicts
  };
}
