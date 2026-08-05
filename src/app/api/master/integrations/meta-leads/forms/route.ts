import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

type FormMapping = {
  name: string;
  form_id: string;
  event_id: string;
  event_name: string;
  is_active: boolean;
};

function cleanText(value: unknown) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function digits(value: unknown) {
  return cleanText(value).replace(/\D/g, '');
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

  let profile: any = null;
  const { data: byAuth } = await supabase
    .from('users')
    .select('*')
    .eq('auth_user_id', authData.user.id)
    .maybeSingle();
  profile = byAuth;

  if (!profile && authData.user.email) {
    const { data: byEmail } = await supabase
      .from('users')
      .select('*')
      .ilike('email', authData.user.email)
      .maybeSingle();
    profile = byEmail;
  }

  if (!profile || profile.status !== 'active' || profile.role !== 'master') return null;
  return profile;
}

async function listEvents(supabase: any) {
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from('events')
    .select('id, name, status, start_date, end_date')
    .eq('status', 'active')
    .or(`end_date.is.null,end_date.gte.${today}`)
    .order('start_date', { ascending: false });

  if (error) throw error;
  return data || [];
}

async function getIntegration(supabase: any) {
  const { data, error } = await supabase
    .from('marketing_integrations')
    .select('*')
    .eq('integration_type', 'meta_leads')
    .maybeSingle();
  if (error) throw error;
  return data;
}

function normalizeMappings(value: unknown): FormMapping[] {
  if (!Array.isArray(value)) return [];
  return value.map((item: any) => ({
    name: cleanText(item?.name),
    form_id: digits(item?.form_id),
    event_id: cleanText(item?.event_id),
    event_name: cleanText(item?.event_name),
    is_active: Boolean(item?.is_active)
  })).filter((item) => item.form_id);
}

export async function GET(request: Request) {
  try {
    const supabase = getAdminClient();
    const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
    if (!token) return NextResponse.json({ error: 'Sessão não encontrada.' }, { status: 401 });

    const master = await getMasterProfile(supabase, token);
    if (!master) return NextResponse.json({ error: 'Apenas usuário Master pode acessar esta configuração.' }, { status: 403 });

    const [integration, events] = await Promise.all([getIntegration(supabase), listEvents(supabase)]);
    const settings = integration?.settings || {};

    let mappings = normalizeMappings(settings.form_mappings);
    if (!mappings.length && settings.form_id) {
      mappings = [{ name: 'Formulário atual', form_id: digits(settings.form_id), event_id: '', event_name: '', is_active: false }];
    }

    return NextResponse.json({ success: true, mappings, events });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Erro ao carregar formulários vinculados.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const supabase = getAdminClient();
    const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
    if (!token) return NextResponse.json({ error: 'Sessão não encontrada.' }, { status: 401 });

    const master = await getMasterProfile(supabase, token);
    if (!master) return NextResponse.json({ error: 'Apenas usuário Master pode salvar esta configuração.' }, { status: 403 });

    const body = await request.json();
    const mappings = normalizeMappings(body?.mappings);
    const duplicated = mappings.find((item, index) => mappings.findIndex((other) => other.form_id === item.form_id) !== index);
    if (duplicated) return NextResponse.json({ error: `O Form ID ${duplicated.form_id} está duplicado.` }, { status: 400 });

    const activeMappings = mappings.filter((item) => item.is_active);
    if (activeMappings.some((item) => !item.event_id)) {
      return NextResponse.json({ error: 'Todo formulário ativo precisa ter um evento de destino.' }, { status: 400 });
    }

    const eventIds = Array.from(new Set(activeMappings.map((item) => item.event_id)));
    const today = new Date().toISOString().slice(0, 10);
    let validEvents: any[] = [];

    if (eventIds.length) {
      const { data, error } = await supabase
        .from('events')
        .select('id, name, status, end_date')
        .in('id', eventIds);
      if (error) throw error;
      validEvents = data || [];
    }

    const validById = new Map(validEvents.map((event) => [event.id, event]));
    for (const mapping of activeMappings) {
      const event = validById.get(mapping.event_id);
      if (!event || event.status !== 'active' || (event.end_date && event.end_date < today)) {
        return NextResponse.json({ error: `O evento selecionado para o formulário ${mapping.form_id} não está ativo.` }, { status: 400 });
      }
      mapping.event_name = event.name;
    }

    const integration = await getIntegration(supabase);
    if (!integration) return NextResponse.json({ error: 'Configure primeiro a integração Facebook Lead Forms.' }, { status: 400 });

    const settings = { ...(integration.settings || {}), form_mappings: mappings };
    const { data, error } = await supabase
      .from('marketing_integrations')
      .update({ settings, updated_by: master.id, updated_at: new Date().toISOString() })
      .eq('id', integration.id)
      .select('*')
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ success: true, mappings: normalizeMappings(data?.settings?.form_mappings) });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Erro ao salvar formulários vinculados.' }, { status: 500 });
  }
}
