import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

const defaultSettings = {
  verify_token: 'auto-controle-wati-leads-2026',
  source_name: 'WATI / Click-to-WhatsApp',
  routing_mode: 'round_robin',
  last_webhook_at: '',
  last_error: ''
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
    .eq('integration_type', 'wati_leads')
    .maybeSingle();

  if (data) return data;

  const { data: created, error } = await supabase
    .from('marketing_integrations')
    .insert({
      integration_type: 'wati_leads',
      name: 'WATI Leads',
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
      return NextResponse.json({ error: 'Apenas usuário Master pode acessar integrações.' }, { status: 403 });
    }

    const integration = await getOrCreateIntegration(supabase);

    return NextResponse.json({
      success: true,
      integration: normalizeIntegration(integration)
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Erro ao carregar integração WATI.' },
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
      return NextResponse.json({ error: 'Apenas usuário Master pode salvar integrações.' }, { status: 403 });
    }

    const current = await getOrCreateIntegration(supabase);
    const body = await request.json();
    const isActive = Boolean(body.is_active);
    const verifyToken = cleanText(body.verify_token) || defaultSettings.verify_token;
    const sourceName = cleanText(body.source_name) || defaultSettings.source_name;
    const routingMode = cleanText(body.routing_mode) || defaultSettings.routing_mode;

    if (isActive && verifyToken.length < 10) {
      return NextResponse.json(
        { error: 'Informe um token de segurança com pelo menos 10 caracteres antes de ativar.' },
        { status: 400 }
      );
    }

    const payload = {
      integration_type: 'wati_leads',
      name: 'WATI Leads',
      pixel_id: '',
      is_active: isActive,
      settings: {
        ...(current?.settings || {}),
        verify_token: verifyToken,
        source_name: sourceName,
        routing_mode: routingMode,
        last_webhook_at: current?.settings?.last_webhook_at || '',
        last_error: current?.settings?.last_error || ''
      },
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
      { error: error?.message || 'Erro ao salvar integração WATI.' },
      { status: 500 }
    );
  }
}
