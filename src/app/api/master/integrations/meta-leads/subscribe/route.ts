import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const maxDuration = 60;

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

async function getIntegration(supabase: any) {
  const { data } = await supabase
    .from('marketing_integrations')
    .select('*')
    .eq('integration_type', 'meta_leads')
    .maybeSingle();

  return {
    ...(data || {}),
    settings: {
      ...defaultSettings,
      ...(data?.settings || {})
    }
  };
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
      return NextResponse.json({ error: 'Apenas usuário Master pode inscrever a página.' }, { status: 403 });
    }

    const integration = await getIntegration(supabase);
    const settings = integration.settings || {};
    const pageId = cleanText(settings.page_id);
    const pageAccessToken = cleanText(settings.page_access_token);
    const graphVersion = cleanText(settings.graph_version) || defaultSettings.graph_version;

    if (!integration?.is_active) {
      return NextResponse.json(
        { error: 'Ative e salve a integração Facebook Lead Forms antes de inscrever a página.' },
        { status: 400 }
      );
    }

    if (!pageId) {
      return NextResponse.json({ error: 'Page ID não informado.' }, { status: 400 });
    }

    if (!pageAccessToken) {
      return NextResponse.json({ error: 'Page Access Token não informado.' }, { status: 400 });
    }

    const url = new URL(`https://graph.facebook.com/${graphVersion}/${pageId}/subscribed_apps`);
    url.searchParams.set('access_token', pageAccessToken);
    url.searchParams.set('subscribed_fields', 'leadgen');

    const response = await fetch(url.toString(), {
      method: 'POST',
      cache: 'no-store'
    });

    const data = await response.json();

    if (!response.ok || data?.success !== true) {
      return NextResponse.json(
        {
          success: false,
          error: data?.error?.message || 'A Meta não confirmou a inscrição da página.',
          meta_error: data?.error || data
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Página inscrita no webhook leadgen com sucesso.',
      meta: data
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Erro ao inscrever página no webhook leadgen.' },
      { status: 500 }
    );
  }
}
