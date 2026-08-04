import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

const defaultSettings = {
  verify_token: '',
  source_name: 'Umbler Talk / WhatsApp',
  routing_mode: 'round_robin',
  last_webhook_at: '',
  last_error: '',
  last_lead_phone: '',
  last_lead_id: ''
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
  return {
    ...integration,
    settings: {
      ...defaultSettings,
      ...(integration?.settings || {})
    }
  };
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

    const integration = await getOrCreateIntegration(supabase);
    return NextResponse.json({ success: true, integration: normalizeIntegration(integration) });
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
    const currentSettings = { ...defaultSettings, ...(current?.settings || {}) };
    const body = await request.json();

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
    const verifyToken = cleanText(body.verify_token);
    const sourceName = cleanText(body.source_name) || defaultSettings.source_name;

    if (isActive && verifyToken.length < 16) {
      return NextResponse.json(
        { error: 'Crie um token de segurança com pelo menos 16 caracteres antes de ativar.' },
        { status: 400 }
      );
    }

    const payload = {
      integration_type: 'umbler_talk',
      name: 'Umbler Talk',
      pixel_id: '',
      is_active: isActive,
      settings: {
        ...currentSettings,
        verify_token: verifyToken,
        source_name: sourceName,
        routing_mode: 'round_robin'
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
