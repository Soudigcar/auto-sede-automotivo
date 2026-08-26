import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getMetaServerConfig, publicMetaSettings, stripStoredMetaSecrets } from '@/lib/server/metaServerConfig';
import { effectiveMetaGraphVersion, FALLBACK_META_GRAPH_VERSION } from '@/lib/server/metaGraphVersion';

export const runtime = 'nodejs';

const defaultSettings = {
  app_id: '',
  page_id: '',
  form_id: '',
  form_mappings: [],
  graph_version: FALLBACK_META_GRAPH_VERSION,
  routing_mode: 'base_only'
};

function cleanText(value: unknown) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!supabaseUrl || !serviceKey) throw new Error('Supabase Service Role não configurada no servidor.');

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

function normalizeIntegration(integration: any) {
  const settings = stripStoredMetaSecrets(integration?.settings);

  return {
    ...integration,
    settings: {
      ...defaultSettings,
      ...publicMetaSettings(settings),
      graph_version: effectiveMetaGraphVersion(settings.graph_version),
      form_mappings: Array.isArray(integration?.settings?.form_mappings)
        ? integration.settings.form_mappings
        : []
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
    const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
    if (!token) return NextResponse.json({ error: 'Sessão não encontrada.' }, { status: 401 });

    const masterProfile = await getMasterProfile(supabase, token);
    if (!masterProfile) return NextResponse.json({ error: 'Apenas usuário Master pode acessar esta integração.' }, { status: 403 });

    const integration = await getOrCreateIntegration(supabase);
    return NextResponse.json({ success: true, integration: normalizeIntegration(integration) });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Erro ao carregar integração de leads da Meta.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const supabase = getAdminClient();
    const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
    if (!token) return NextResponse.json({ error: 'Sessão não encontrada.' }, { status: 401 });

    const masterProfile = await getMasterProfile(supabase, token);
    if (!masterProfile) return NextResponse.json({ error: 'Apenas usuário Master pode salvar esta integração.' }, { status: 403 });

    if (process.env.VERCEL_ENV === 'preview') {
      return NextResponse.json({
        error: 'O Preview está em modo somente leitura. A configuração real da Meta não foi alterada.',
        preview_read_only: true
      }, { status: 409 });
    }

    const body = await request.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: 'Payload de configuração inválido.' }, { status: 400 });
    }

    if ('page_access_token' in body || 'verify_token' in body) {
      return NextResponse.json(
        { error: 'Tokens da Meta são aceitos somente como variáveis server-side na Vercel.' },
        { status: 400 }
      );
    }

    const current = await getOrCreateIntegration(supabase);
    const currentSettings = stripStoredMetaSecrets(current?.settings);
    const serverConfig = getMetaServerConfig();

    const settings = {
      app_id: cleanText(body.app_id),
      page_id: cleanText(body.page_id),
      // form_mappings is the only routing source of truth. The legacy single
      // Form ID must stay empty so it cannot disagree with event mappings.
      form_id: '',
      form_mappings: Array.isArray(currentSettings.form_mappings) ? currentSettings.form_mappings : [],
      graph_version: effectiveMetaGraphVersion(body.graph_version),
      routing_mode: 'base_only'
    };

    const isActive = Boolean(body.is_active);
    if (isActive && !serverConfig.hasPageAccessToken) {
      return NextResponse.json({ error: 'Configure META_PAGE_ACCESS_TOKEN na Vercel antes de ativar a integração.' }, { status: 400 });
    }
    if (isActive && !serverConfig.hasVerifyToken) {
      return NextResponse.json({ error: 'Configure META_LEADS_VERIFY_TOKEN na Vercel antes de ativar a integração.' }, { status: 400 });
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

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ success: true, integration: normalizeIntegration(data) });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Erro ao salvar integração de leads da Meta.' }, { status: 500 });
  }
}
