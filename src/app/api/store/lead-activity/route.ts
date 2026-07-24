import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

type ActivityType =
  | 'lead_viewed'
  | 'whatsapp_clicked'
  | 'status_changed'
  | 'schedule_created'
  | 'schedule_cancelled'
  | 'no_show_marked'
  | 'showed_up_marked'
  | 'sale_confirmed'
  | 'sale_cancelled'
  | 'lost_registered'
  | 'lead_reopened'
  | 'lead_edited'
  | 'lead_deleted';

const labels: Record<ActivityType, string> = {
  lead_viewed: 'Loja abriu o lead',
  whatsapp_clicked: 'Loja clicou no WhatsApp',
  status_changed: 'Loja alterou etapa do lead',
  schedule_created: 'Loja agendou atendimento',
  schedule_cancelled: 'Loja cancelou agendamento',
  no_show_marked: 'Loja marcou não compareceu',
  showed_up_marked: 'Loja marcou compareceu',
  sale_confirmed: 'Loja confirmou venda',
  sale_cancelled: 'Loja cancelou/reabriu venda',
  lost_registered: 'Loja registrou perda',
  lead_reopened: 'Loja reabriu lead',
  lead_edited: 'Loja editou informações do lead',
  lead_deleted: 'Loja excluiu o lead'
};

function cleanText(value: unknown) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

  if (!supabaseUrl || !serviceKey) {
    throw new Error('Supabase Service Role não configurada no servidor.');
  }

  return createClient(supabaseUrl, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
}

async function getProfile(supabase: any, token: string) {
  const { data: authData, error: authError } = await supabase.auth.getUser(token);

  if (authError || !authData.user) return null;

  const { data: byAuth } = await supabase
    .from('users')
    .select('*')
    .eq('auth_user_id', authData.user.id)
    .maybeSingle();

  if (byAuth) return byAuth;

  if (!authData.user.email) return null;

  const { data: byEmail } = await supabase
    .from('users')
    .select('*')
    .ilike('email', authData.user.email)
    .maybeSingle();

  return byEmail || null;
}

export async function POST(request: Request) {
  try {
    const supabase = getAdminClient();
    const authorization = request.headers.get('authorization') || '';
    const token = authorization.replace(/^Bearer\s+/i, '').trim();

    if (!token) {
      return NextResponse.json({ error: 'Sessão não encontrada.' }, { status: 401 });
    }

    const profile = await getProfile(supabase, token);

    if (!profile || profile.status !== 'active') {
      return NextResponse.json({ error: 'Usuário sem permissão para registrar atividade.' }, { status: 403 });
    }

    const body = await request.json();
    const leadId = cleanText(body.lead_id);
    const activityType = cleanText(body.activity_type) as ActivityType;

    if (!leadId || !activityType || !labels[activityType]) {
      return NextResponse.json({ error: 'Informe lead_id e activity_type válidos.' }, { status: 400 });
    }

    const { data: lead, error: leadError } = await supabase
      .from('leads')
      .select('id, assigned_store_id, customer_name, customer_phone, interested_vehicle, status, origin, notes')
      .eq('id', leadId)
      .maybeSingle();

    if (leadError) throw leadError;

    if (!lead) {
      return NextResponse.json({ error: 'Lead não encontrado.' }, { status: 404 });
    }

    const isMaster = profile.role === 'master';
    const canAccessStore = profile.store_id && profile.store_id === lead.assigned_store_id;

    if (!isMaster && !canAccessStore) {
      return NextResponse.json({ error: 'Lead não pertence à loja deste usuário.' }, { status: 403 });
    }

    const { data: store } = lead.assigned_store_id
      ? await supabase
          .from('stores')
          .select('id, store_name')
          .eq('id', lead.assigned_store_id)
          .maybeSingle()
      : { data: null };

    const { data: inserted, error } = await supabase
      .from('lead_activity_logs')
      .insert({
        lead_id: lead.id,
        store_id: lead.assigned_store_id || null,
        store_name: store?.store_name || null,
        user_id: profile.id,
        user_name: profile.name || profile.email || null,
        activity_type: activityType,
        activity_label: labels[activityType],
        from_status: cleanText(body.from_status) || null,
        to_status: cleanText(body.to_status) || lead.status || null,
        customer_name: lead.customer_name || null,
        customer_phone: lead.customer_phone || null,
        vehicle_name: lead.interested_vehicle || null,
        notes: cleanText(body.notes) || null,
        metadata: {
          ...(body.metadata || {}),
          origin: lead.origin || null,
          lead_status: lead.status || null,
          registered_from: 'store_lead_activity_api'
        }
      })
      .select('id, created_at')
      .single();

    if (error) throw error;

    return NextResponse.json({
      success: true,
      activity: inserted
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Erro ao registrar atividade do lead.' },
      { status: 500 }
    );
  }
}
