import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

const defaultVerifyToken = 'auto-controle-whatsapp-2026';
const defaultGraphVersion = 'v20.0';

function cleanText(value: unknown) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function onlyDigits(value: unknown) {
  return String(value || '').replace(/\D/g, '').trim();
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

function publicNumber(instance: any) {
  const { access_token: _accessToken, ...safe } = instance || {};
  return {
    ...safe,
    has_access_token: Boolean(instance?.access_token)
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
      return NextResponse.json({ error: 'Apenas usuário Master pode acessar WhatsApp Oficial.' }, { status: 403 });
    }

    const [storesResponse, numbersResponse] = await Promise.all([
      supabase
        .from('stores')
        .select('id, store_name, slug, status, event_id')
        .order('store_name', { ascending: true }),
      supabase
        .from('whatsapp_numbers')
        .select('*, stores(id, store_name, slug)')
        .order('created_at', { ascending: false })
    ]);

    if (storesResponse.error) {
      return NextResponse.json({ error: storesResponse.error.message }, { status: 400 });
    }

    if (numbersResponse.error) {
      return NextResponse.json({ error: numbersResponse.error.message }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      stores: storesResponse.data || [],
      numbers: (numbersResponse.data || []).map(publicNumber),
      defaults: {
        verify_token: defaultVerifyToken,
        graph_version: defaultGraphVersion
      }
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Erro ao carregar integração WhatsApp.' },
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
      return NextResponse.json({ error: 'Apenas usuário Master pode salvar WhatsApp Oficial.' }, { status: 403 });
    }

    const body = await request.json();
    const action = cleanText(body.action) || 'save';

    if (action === 'delete') {
      const id = cleanText(body.id);

      if (!id) {
        return NextResponse.json({ error: 'Informe o ID do número.' }, { status: 400 });
      }

      const { error } = await supabase.from('whatsapp_numbers').delete().eq('id', id);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }

      return NextResponse.json({ success: true });
    }

    const id = cleanText(body.id);
    const phoneNumberId = onlyDigits(body.phone_number_id);
    const accessToken = cleanText(body.access_token);
    const label = cleanText(body.label) || 'WhatsApp Oficial';
    const isActive = Boolean(body.is_active);

    if (!phoneNumberId) {
      return NextResponse.json({ error: 'Informe o Phone Number ID.' }, { status: 400 });
    }

    if (isActive && !accessToken && !id) {
      return NextResponse.json({ error: 'Informe o Access Token para ativar o número.' }, { status: 400 });
    }

    const payload: any = {
      label,
      store_id: cleanText(body.store_id) || null,
      phone_number: cleanText(body.phone_number) || null,
      phone_number_id: phoneNumberId,
      waba_id: onlyDigits(body.waba_id) || null,
      verify_token: cleanText(body.verify_token) || defaultVerifyToken,
      graph_version: cleanText(body.graph_version) || defaultGraphVersion,
      routing_mode: cleanText(body.routing_mode) || 'store_pipeline',
      is_active: isActive,
      status: isActive ? 'connected' : 'pending',
      settings: {
        auto_create_lead: body.auto_create_lead !== false,
        auto_route_to_store: body.auto_route_to_store !== false
      },
      created_by: masterProfile.id,
      updated_at: new Date().toISOString()
    };

    if (accessToken) {
      payload.access_token = accessToken;
    }

    let query;

    if (id) {
      query = supabase.from('whatsapp_numbers').update(payload).eq('id', id).select('*').single();
    } else {
      query = supabase.from('whatsapp_numbers').insert(payload).select('*').single();
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      number: publicNumber(data)
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Erro ao salvar WhatsApp Oficial.' },
      { status: 500 }
    );
  }
}
