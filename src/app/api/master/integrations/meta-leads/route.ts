import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

const defaultSettings = {
  app_id: '',
  page_id: '',
  form_id: '',
  page_access_token: '',
  verify_token: 'auto-controle-meta-leads-2026',
  graph_version: 'v20.0',
  routing_mode: 'base_only'
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

function normalizeIntegration(integration: any) {
  return {
    ...integration,
    settings: {
      ...defaultSettings,
      ...(integration?.settings || {})
    }
  };
}

async function getOrCreateIntegration(supabase: any) {
  const { data } = await supabase
    .from('marketing_integrations')
    .select('*')
    .eq('integration_type', 'meta_leads')
    .maybeSingle();

  if (data) return data;

  const { data: created, error } = await supabase
    .from('marketing_integrations')
    .insert({
      integration_type: 'meta_leads',
      name: 'Facebook Lead Forms',
      pixel_id: '',
      is_active: false,
      settings: defaultSettings
    })
    .select('*')
    .single();

  if (error) throw error;

  return created;
}

export async function GET(request: Request) {
  try {
    const supabase = getAdminClient();
    const authorization = request.headers.get('authorization') || '';
    const token = authorization.replace(/^Bearer\s+/i, '').trim();

    if (!token) {
      return NextResponse.json({ error: 'Sessão não encontrada.' }, { status: 401 });
    }

    const masterProfile = await getMasterProfile(supabase, token);

    if (!masterProfile) {
      return NextResponse.json({ error: 'Apenas usuário Master pode acessar esta integração.' }, { status: 403 });
    }

    const integration = await getOrCreateIntegration(supabase);

    return NextResponse.json({
      success: true,
      integration: normalizeIntegration(integration)
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Erro ao carregar integração de leads da Meta.' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const supabase = getAdminClient();
    const authorization = request.headers.get('authorization') || '';
    const token = authorization.replace(/^Bearer\s+/i, '').trim();

    if (!token) {
      return NextResponse.json({ error: 'Sessão não encontrada.' }, { status: 401 });
    }

    const masterProfile = await getMasterProfile(supabase, token);

    if (!masterProfile) {
      return NextResponse.json({ error: 'Apenas usuário Master pode salvar esta integração.' }, { status: 403 });
    }

    const body = await request.json();

    const settings = {
      app_id: cleanText(body.app_id),
      page_id: cleanText(body.page_id),
      form_id: cleanText(body.form_id),
      page_access_token: cleanText(body.page_access_token),
      verify_token: cleanText(body.verify_token) || defaultSettings.verify_token,
      graph_version: cleanText(body.graph_version) || defaultSettings.graph_version,
      routing_mode: 'base_only'
    };

    const isActive = Boolean(body.is_active);

    if (isActive && !settings.page_access_token) {
      return NextResponse.json(
        { error: 'Informe o Page Access Token antes de ativar a integração.' },
        { status: 400 }
      );
    }

    if (isActive && !settings.verify_token) {
      return NextResponse.json(
        { error: 'Informe o Verify Token antes de ativar a integração.' },
        { status: 400 }
      );
    }

    const payload = {
      integration_type: 'meta_leads',
      name: 'Facebook Lead Forms',
      pixel_id: '',
      is_active: isActive,
      settings,
      updated_by: masterProfile.id,
      updated_at: new Date().toISOString()
    };

    const { data, error } = await supabase
      .from('marketing_integrations')
      .upsert(payload, { onConflict: 'integration_type' })
      .select('*')
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      integration: normalizeIntegration(data)
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Erro ao salvar integração de leads da Meta.' },
      { status: 500 }
    );
  }
}
