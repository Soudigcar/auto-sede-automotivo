import { NextResponse } from 'next/server';
import { cleanText } from '@/lib/server/storeTeam';
import { applyStoreLeadScope, authorizeStorePortal } from '@/lib/server/storePortal';

export const runtime = 'nodejs';

function maskPhone(value: unknown) {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) return null;
  const local = digits.startsWith('55') && digits.length >= 12 ? digits.slice(2) : digits;
  if (local.length < 8) return '••••••••';
  const ddd = local.length >= 10 ? local.slice(0, 2) : '';
  const tail = local.slice(-4);
  return ddd ? `(${ddd}) •••••-${tail}` : `••••-${tail}`;
}

function saoPauloDayRange() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date());
  const read = (type: string) => parts.find((part) => part.type === type)?.value || '';
  const date = `${read('year')}-${read('month')}-${read('day')}`;
  return {
    start: new Date(`${date}T00:00:00-03:00`).toISOString(),
    end: new Date(`${date}T23:59:59.999-03:00`).toISOString()
  };
}

export async function GET(request: Request) {
  try {
    const slug = cleanText(new URL(request.url).searchParams.get('slug'), 120);
    const context = await authorizeStorePortal(request, slug);
    if ('error' in context) return context.error;

    let query = context.supabase
      .from('leads')
      .select([
        'id', 'event_id', 'assigned_store_id', 'assigned_user_id', 'assigned_user_role',
        'pre_sales_user_id', 'seller_user_id', 'captured_by_user_id', 'prospector_id',
        'customer_name', 'customer_phone', 'customer_bank', 'interested_vehicle',
        'interested_vehicle_id', 'interested_vehicle_price', 'vehicle_category_interest',
        'origin', 'status', 'notes', 'scheduled_at', 'appointment_notes',
        'appointment_cancelled_at', 'appointment_cancelled_reason', 'lost_reason',
        'created_at', 'updated_at', 'last_activity_at', 'last_activity_label', 'last_activity_by_name'
      ].join(','))
      .eq('assigned_store_id', context.store.id)
      .neq('status', 'deleted')
      .order('created_at', { ascending: false })
      .limit(1000);

    query = applyStoreLeadScope(query, context.profile, context.role);
    const { data, error } = await query;
    if (error) throw error;

    const leads = (data || []).map((lead: any) => ({
      ...lead,
      customer_phone: null,
      customer_phone_masked: maskPhone(lead.customer_phone),
      has_phone: Boolean(String(lead.customer_phone || '').replace(/\D/g, ''))
    }));

    const metrics = {
      total: leads.length,
      scheduled: leads.filter((lead: any) => lead.status === 'scheduled').length,
      cancelled: leads.filter((lead: any) => lead.status === 'appointment_cancelled').length,
      sold: leads.filter((lead: any) => lead.status === 'sale_confirmed').length,
      lost: leads.filter((lead: any) => lead.status === 'lost').length
    };

    const day = saoPauloDayRange();
    let tasksQuery = context.supabase
      .from('store_calendar_tasks')
      .select('id,lead_id,title,starts_at,ends_at,status,created_by')
      .eq('store_id', context.store.id)
      .gte('starts_at', day.start)
      .lte('starts_at', day.end)
      .order('starts_at', { ascending: true })
      .limit(100);

    if (context.role !== 'master' && context.role !== 'store') {
      tasksQuery = tasksQuery.eq('created_by', context.profile.id);
    }

    const { data: tasks, error: tasksError } = await tasksQuery;
    if (tasksError) throw tasksError;

    const activeTasks = (tasks || []).filter((task: any) => !['completed', 'cancelled', 'done'].includes(String(task.status || '').toLowerCase()));
    const nextTask = activeTasks.find((task: any) => new Date(task.starts_at).getTime() >= Date.now()) || activeTasks[0] || null;

    return NextResponse.json({
      store: context.store,
      profile: {
        id: context.profile.id,
        full_name: context.profile.full_name || context.profile.email || 'Usuário',
        role: context.role
      },
      scope_label: context.scopeLabel,
      capabilities: {
        can_delete: context.role === 'master' || context.role === 'store',
        can_transfer: true,
        can_confirm_sale: context.role !== 'prospector'
      },
      metrics,
      calendar_summary: {
        today_tasks: activeTasks.length,
        next_task: nextTask ? {
          id: nextTask.id,
          lead_id: nextTask.lead_id,
          title: nextTask.title,
          starts_at: nextTask.starts_at,
          status: nextTask.status
        } : null
      },
      leads
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Não foi possível carregar o pipeline.' }, { status: 500 });
  }
}
