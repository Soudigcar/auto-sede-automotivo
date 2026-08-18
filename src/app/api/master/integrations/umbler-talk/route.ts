import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  getUmblerServerConfig,
  publicUmblerSettings,
  stripStoredUmblerSecrets
} from '@/lib/server/umblerServerConfig';

export const runtime = 'nodejs';

const defaultSettings = {
  source_name: 'Umbler Talk / WhatsApp',
  routing_mode: 'round_robin',
  event_id: '',
  event_name: '',
  last_webhook_at: '',
  last_error: '',
  last_lead_phone: '',
  last_lead_id: ''
};

function cleanText(value: unknown) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

  if (!supabaseUrl || !serviceKey) {
    throw new Error('Supabase Service Role não configurada no servidor.');
  }

  return createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

async function getMasterProfile(supabase: any, token: string) {
  const { data: authData, error: authError } = await supabase.auth.getUser(token);
  if (authError || !authData.user) return null;

  const { data: byAuth } = await supabase
    .from('users')
    .select('*')
    .eq('auth_user_id', authData.user.id)
    .maybeSingle();

  if (byAuth?.status === 'active' && byAuth?.role === 'master') return byAuth;

  if (authData.user.email) {
    const { data: byEmail } = await supabase
      .from('users')
      .select('*')
      .ilike('email', authData.user.email)
      .maybeSingle();

    if (byEmail?.status === 'active' && byEmail?.role === 'master') return byEmail;
  }

  return null;
}

async function getOrCreateIntegration(supabase: any) {
  const { data } = await supabase
    .from('marketing_integrations')
    .select('*')
    .eq('integration_type', 'umbler_talk')
    .maybeSingle();

  if (data) return data;

  const { data: created, error } = await supabase
    .from('marketing_integrations')
    .insert({
      integration_type: 'umbler_talk',
      name: 'Umbler Talk',
      pixel_id: '',
      is_active: false,
      settings: defaultSettings
    })
    .select('*')
    .single();

  if (error) throw error;
  return created;
}

function normalizeIntegration(integration: any) {
  const settings = stripStoredUmblerSecrets(integration?.settings);

  return {
    ...integration,
    settings: {
      ...defaultSettings,
      ...publicUmblerSettings(settings)
    }
  };
}

async function listActiveEvents(supabase: any) {
  const today = todayIsoDate();
  const { data: events, error } = await supabase
    .from('events')
    .select('id, event_name, start_date, end_date, status')
    .eq('status', 'active')
    .or(`end_date.is.null,end_date.gte.${today}`)
    .order('start_date', { ascending: true });

  if (error) throw error;

  const eventIds = (events || []).map((event: any) => event.id);
  if (!eventIds.length) return [];

  const { data: stores } = await supabase
    .from('stores')
    .select('event_id')
    .in('event_id', eventIds)
    .eq('status', 'active')
    .eq('portal_enabled', true);

  const counts = new Map<string, number>();
  for (const store of stores || []) {
    if (!store.event_id) continue;
    counts.set(store.event_id, (counts.get(store.event_id) || 0) + 1);
  }

  return (events || []).map((event: any) => ({
    ...event,
    active_store_count: counts.get(event.id) || 0
  }));
}

export async function GET(request: Request) {
  try {
    const supabase = getAdminClient();
    const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();

    if (!token) return NextResponse.json({ error: 'Sessão não encontrada.' }, { status: 401 });

    const masterProfile = await getMasterProfile(supabase, token);
    if (!masterProfile) {
      return NextResponse.json({ error: 'Apenas usuário Master pode acessar integrações.' }, { status: 403 });
    }

    const [integration, events] = await Promise.all([
      getOrCreateIntegration(supabase),
      listActiveEvents(supabase)
    ]);

    return NextResponse.json({
      success: true,
      integration: normalizeIntegration(integration),
      events
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Erro ao carregar Umbler Talk.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const supabase = getAdminClient();
    const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();

    if (!token) return NextResponse.json({ error: 'Sessão não encontrada.' }, { status: 401 });

    const masterProfile = await getMasterProfile(supabase, token);
    if (!masterProfile) {
      return NextResponse.json({ error: 'Apenas usuário Master pode salvar integrações.' }, { status: 403 });
    }

    const current = await getOrCreateIntegration(supabase);
    const currentSettings = { ...defaultSettings, ...stripStoredUmblerSecrets(current?.settings) };
    const body = await request.json();

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: 'Payload de configuração inválido.' }, { status: 400 });
    }

    if ('verify_token' in body) {
      return NextResponse.json(
        { error: 'O token Umbler é aceito somente como variável server-side na Vercel.' },
        { status: 400 }
      );
    }

    if (cleanText(body.action) === 'clear_error') {
      const { data, error } = await supabase
        .from('marketing_integrations')
        .update({
          settings: { ...currentSettings, last_error: '' },
          updated_by: masterProfile.id,
          updated_at: new Date().toISOString()
        })
        .eq('integration_type', 'umbler_talk')
        .select('*')
        .single();

      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ success: true, integration: normalizeIntegration(data) });
    }

    const isActive = Boolean(body.is_active);
    const serverConfig = getUmblerServerConfig();
    const sourceName = cleanText(body.source_name) || defaultSettings.source_name;
    const eventId = cleanText(body.event_id);

    if (isActive && !serverConfig.hasVerifyToken) {
      return NextResponse.json(
        { error: 'Configure UMBLER_WEBHOOK_TOKEN na Vercel antes de ativar.' },
        { status: 400 }
      );
    }

    if (isActive && !eventId) {
      return NextResponse.json(
        { error: 'Selecione um evento ativo antes de ativar a integração.' },
        { status: 400 }
      );
    }

    let selectedEvent: any = null;
    if (eventId) {
      const { data: event, error: eventError } = await supabase
        .from('events')
        .select('id, event_name, status, start_date, end_date')
        .eq('id', eventId)
        .maybeSingle();

      if (eventError || !event || event.status !== 'active') {
        return NextResponse.json({ error: 'O evento selecionado não está ativo.' }, { status: 400 });
      }

      if (event.end_date && event.end_date < todayIsoDate()) {
        return NextResponse.json({ error: 'O evento selecionado já foi encerrado.' }, { status: 400 });
      }

      const { count } = await supabase
        .from('stores')
        .select('id', { count: 'exact', head: true })
        .eq('event_id', eventId)
        .eq('status', 'active')
        .eq('portal_enabled', true);

      if (isActive && !count) {
        return NextResponse.json(
          { error: 'O evento selecionado não possui lojas ativas habilitadas para receber leads.' },
          { status: 400 }
        );
      }

      selectedEvent = event;
    }

    const payload = {
      integration_type: 'umbler_talk',
      name: 'Umbler Talk',
      pixel_id: '',
      is_active: isActive,
      settings: {
        ...currentSettings,
        source_name: sourceName,
        routing_mode: 'round_robin_event',
        event_id: selectedEvent?.id || '',
        event_name: selectedEvent?.event_name || ''
      },
      updated_by: masterProfile.id,
      updated_at: new Date().toISOString()
    };

    const { data, error } = await supabase
      .from('marketing_integrations')
      .upsert(payload, { onConflict: 'integration_type' })
      .select('*')
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ success: true, integration: normalizeIntegration(data) });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Erro ao salvar Umbler Talk.' }, { status: 500 });
  }
}
