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

async function graphGet(path: string, settings: any, params: Record<string, string> = {}) {
  const graphVersion = cleanText(settings.graph_version) || defaultSettings.graph_version;
  const token = cleanText(settings.page_access_token);

  const url = new URL(`https://graph.facebook.com/${graphVersion}/${path.replace(/^\//, '')}`);
  url.searchParams.set('access_token', token);

  Object.entries(params).forEach(([key, value]) => {
    if (value) url.searchParams.set(key, value);
  });

  const response = await fetch(url.toString(), { cache: 'no-store' });
  const data = await response.json();

  return {
    ok: response.ok,
    status: response.status,
    data
  };
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
      return NextResponse.json({ error: 'Apenas usuário Master pode testar esta integração.' }, { status: 403 });
    }

    const integration = await getIntegration(supabase);
    const settings = integration.settings || {};
    const pageId = cleanText(settings.page_id);
    const formId = cleanText(settings.form_id);
    const pageAccessToken = cleanText(settings.page_access_token);

    const checks: any[] = [];

    if (!integration?.is_active) {
      checks.push({
        name: 'Integração ativa',
        ok: false,
        message: 'A integração Facebook Lead Forms está inativa no AUTO CONTROLE.'
      });
    } else {
      checks.push({
        name: 'Integração ativa',
        ok: true,
        message: 'A integração está ativa.'
      });
    }

    if (!pageId) {
      checks.push({
        name: 'Page ID',
        ok: false,
        message: 'Page ID não foi informado.'
      });
    } else {
      checks.push({
        name: 'Page ID',
        ok: true,
        message: pageId
      });
    }

    if (!pageAccessToken) {
      checks.push({
        name: 'Page Access Token',
        ok: false,
        message: 'Token não foi informado.'
      });
    } else {
      checks.push({
        name: 'Page Access Token',
        ok: true,
        message: 'Token salvo. O token não será exibido por segurança.'
      });
    }

    if (!pageId || !pageAccessToken) {
      return NextResponse.json({
        success: false,
        checks,
        summary: 'Informe Page ID e Page Access Token antes de testar.'
      });
    }

    const pageCheck = await graphGet(`/${pageId}`, settings, {
      fields: 'id,name'
    });

    checks.push({
      name: 'Consultar página na Meta',
      ok: pageCheck.ok,
      message: pageCheck.ok
        ? `Página encontrada: ${pageCheck.data?.name || pageCheck.data?.id}`
        : pageCheck.data?.error?.message || 'Não foi possível consultar a página.',
      details: pageCheck.ok ? pageCheck.data : pageCheck.data?.error
    });

    const subscriptionCheck = await graphGet(`/${pageId}/subscribed_apps`, settings);

    const subscribedApps = Array.isArray(subscriptionCheck.data?.data)
      ? subscriptionCheck.data.data
      : [];

    const currentAppId = cleanText(settings.app_id);
    const matchingApp = subscribedApps.find((app: any) => {
      const sameApp = currentAppId ? String(app.id) === currentAppId : true;
      const fields = Array.isArray(app.subscribed_fields) ? app.subscribed_fields : [];
      return sameApp && fields.includes('leadgen');
    });

    checks.push({
      name: 'Página inscrita no leadgen',
      ok: Boolean(matchingApp),
      message: matchingApp
        ? `Página inscrita no app ${matchingApp.name || matchingApp.id} com o campo leadgen.`
        : subscriptionCheck.ok
          ? 'A página ainda não aparece inscrita no campo leadgen para este app.'
          : subscriptionCheck.data?.error?.message || 'Não foi possível consultar subscribed_apps.',
      details: subscriptionCheck.ok ? subscribedApps : subscriptionCheck.data?.error
    });

    if (formId) {
      const formCheck = await graphGet(`/${formId}`, settings, {
        fields: 'id,name,status'
      });

      checks.push({
        name: 'Consultar formulário',
        ok: formCheck.ok,
        message: formCheck.ok
          ? `Formulário encontrado: ${formCheck.data?.name || formCheck.data?.id}`
          : formCheck.data?.error?.message || 'Não foi possível consultar o formulário.',
        details: formCheck.ok ? formCheck.data : formCheck.data?.error
      });

      const leadsCheck = await graphGet(`/${formId}/leads`, settings, {
        limit: '1'
      });

      checks.push({
        name: 'Permissão leads_retrieval',
        ok: leadsCheck.ok,
        message: leadsCheck.ok
          ? 'Token conseguiu consultar leads do formulário.'
          : leadsCheck.data?.error?.message || 'Token não conseguiu consultar leads do formulário.',
        details: leadsCheck.ok
          ? {
              total_retornado_no_teste: Array.isArray(leadsCheck.data?.data) ? leadsCheck.data.data.length : 0
            }
          : leadsCheck.data?.error
      });
    } else {
      checks.push({
        name: 'Form ID',
        ok: true,
        message: 'Form ID está vazio. O webhook aceitará qualquer formulário desta página.'
      });
    }

    const allOk = checks.every((check) => check.ok);

    return NextResponse.json({
      success: allOk,
      checks,
      summary: allOk
        ? 'Conexão com a Meta aparenta estar correta.'
        : 'Existem pendências na integração. Veja os itens marcados como erro.'
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Erro ao testar integração da Meta.' },
      { status: 500 }
    );
  }
}
