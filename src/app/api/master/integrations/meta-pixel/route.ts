import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

const defaultEvents = {
  page_view: true,
  view_content: true,
  simulator_opened: true,
  simulation_started: true,
  lead: true,
  contact: true
};

function cleanText(value: unknown) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function cleanPixelId(value: unknown) {
  return cleanText(value).replace(/\D/g, '');
}

function parsePixelIds(value: unknown) {
  if (Array.isArray(value)) {
    return Array.from(new Set(value.map(cleanPixelId).filter((item) => item.length >= 8)));
  }

  return Array.from(
    new Set(
      cleanText(value)
        .split(/[\n,;| ]+/)
        .map(cleanPixelId)
        .filter((item) => item.length >= 8)
    )
  );
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
  const primaryPixelId = cleanPixelId(integration?.pixel_id);
  const additionalPixelIds = parsePixelIds(integration?.settings?.additional_pixel_ids || []);
  const pixelIds = Array.from(new Set([primaryPixelId, ...additionalPixelIds].filter(Boolean)));

  return {
    ...integration,
    pixel_id: primaryPixelId,
    pixel_ids: pixelIds,
    settings: {
      ...(integration?.settings || {}),
      additional_pixel_ids: additionalPixelIds,
      events: {
        ...defaultEvents,
        ...(integration?.settings?.events || {})
      }
    }
  };
}

async function getOrCreateIntegration(supabase: any) {
  const { data } = await supabase
    .from('marketing_integrations')
    .select('*')
    .eq('integration_type', 'meta_pixel')
    .maybeSingle();

  if (data) return data;

  const { data: created, error } = await supabase
    .from('marketing_integrations')
    .insert({
      integration_type: 'meta_pixel',
      name: 'Pixel do Facebook / Meta',
      pixel_id: '',
      is_active: false,
      settings: {
        additional_pixel_ids: [],
        events: defaultEvents
      }
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
      { error: error?.message || 'Erro ao carregar Pixel.' },
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

    const body = await request.json();
    const primaryPixelId = cleanPixelId(body.pixel_id);
    const additionalPixelIds = parsePixelIds(body.additional_pixel_ids);
    const pixelIds = Array.from(new Set([primaryPixelId, ...additionalPixelIds].filter(Boolean)));
    const isActive = Boolean(body.is_active);
    const name = cleanText(body.name) || 'Pixel do Facebook / Meta';
    const events = {
      ...defaultEvents,
      ...(body.events || {})
    };

    if (isActive && pixelIds.length < 1) {
      return NextResponse.json(
        { error: 'Informe pelo menos um ID de Pixel válido antes de ativar.' },
        { status: 400 }
      );
    }

    const payload = {
      integration_type: 'meta_pixel',
      name,
      pixel_id: primaryPixelId,
      is_active: isActive,
      settings: {
        additional_pixel_ids: additionalPixelIds,
        events
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
      { error: error?.message || 'Erro ao salvar Pixel.' },
      { status: 500 }
    );
  }
}
