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

async function getProfile(supabase: any, token: string): Promise<any | null> {
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
    const supabase: any = getAdminClient();
    const authorization = request.headers.get('authorization') || '';
    const token = authorization.replace(/^Bearer\s+/i, '').trim();

    if (!token) {
      return NextResponse.json({ error: 'Sessão não encontrada.' }, { status: 401 });
    }

    const profile: any = await getProfile(supabase, token);

    if (!profile || profile.status !== 'active') {
      return NextResponse.json({ error: 'Usuário sem permissão para registrar atividade.' }, { status: 403 });
    }

    const body = await request.json();
    const leadId = cleanText(body.lead_id);
    const activityType = cleanText(body.activity_type) as ActivityType;

    if (!leadId || !activityType || !labels[activityType]) {
      return NextResponse.json({ error: 'Informe lead_id e activity_type válidos.' }, { status: 400 });
    }

    const { data: leadData, error: leadError } = await supabase
      .from('leads')
      .select('id, assigned_store_id, customer_name, customer_phone, interested_vehicle, status, origin, notes, first_viewed_at, first_viewed_by_user_id, first_viewed_by_name, first_whatsapp_clicked_at')
      .eq('id', leadId)
      .maybeSingle();

    if (leadError) throw leadError;

    const lead: any = leadData;

    if (!lead) {
      return NextResponse.json({ error: 'Lead não encontrado.' }, { status: 404 });
    }

    const isMaster = profile.role === 'master';
    const canAccessStore = profile.store_id && profile.store_id === lead.assigned_store_id;

    if (!isMaster && !canAccessStore) {
      return NextResponse.json({ error: 'Lead não pertence à loja deste usuário.' }, { status: 403 });
    }

    const actorName = profile.full_name || profile.email || 'Usuário da loja';
    const now = new Date();
    const dedupeWindowSeconds = activityType === 'lead_viewed' ? 60 : activityType === 'whatsapp_clicked' ? 10 : 0;

    if (dedupeWindowSeconds > 0) {
      const since = new Date(now.getTime() - dedupeWindowSeconds * 1000).toISOString();
      const { data: recentData } = await supabase
        .from('lead_activity_logs')
        .select('id, created_at')
        .eq('lead_id', lead.id)
        .eq('user_id', profile.id)
        .eq('activity_type', activityType)
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      const recent: any = recentData;

      if (recent) {
        return NextResponse.json({
          success: true,
          deduplicated: true,
          activity: recent
        });
      }
    }

    let store: any = null;

    if (lead.assigned_store_id) {
      const { data: storeData } = await supabase
        .from('stores')
        .select('id, store_name')
        .eq('id', lead.assigned_store_id)
        .maybeSingle();

      store = storeData;
    }

    const { data: insertedData, error } = await supabase
      .from('lead_activity_logs')
      .insert({
        lead_id: lead.id,
        store_id: lead.assigned_store_id || null,
        store_name: store?.store_name || null,
        user_id: profile.id,
        user_name: actorName,
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

    const inserted: any = insertedData;
    const timestamp = inserted?.created_at || now.toISOString();
    const trackingUpdate: Record<string, any> = {
      last_activity_at: timestamp,
      last_activity_type: activityType,
      last_activity_label: labels[activityType],
      last_activity_by_name: actorName
    };

    if (activityType === 'lead_viewed') {
      trackingUpdate.first_viewed_at = lead.first_viewed_at || timestamp;
      trackingUpdate.first_viewed_by_user_id = lead.first_viewed_by_user_id || profile.id;
      trackingUpdate.first_viewed_by_name = lead.first_viewed_by_name || actorName;
      trackingUpdate.last_viewed_at = timestamp;
      trackingUpdate.last_viewed_by_user_id = profile.id;
      trackingUpdate.last_viewed_by_name = actorName;
    }

    if (activityType === 'whatsapp_clicked') {
      trackingUpdate.first_whatsapp_clicked_at = lead.first_whatsapp_clicked_at || timestamp;
      trackingUpdate.last_whatsapp_clicked_at = timestamp;
    }

    const { error: trackingError } = await supabase
      .from('leads')
      .update(trackingUpdate)
      .eq('id', lead.id);

    if (trackingError) throw trackingError;

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
