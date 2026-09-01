import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  hasMetaWhatsappAccessToken,
  isEvolutionWhatsappNumber,
  isMissingWhatsappVaultRpc
} from '@/lib/server/whatsappMetaCredentials';

export const runtime = 'nodejs';

const defaultGraphVersion = 'v20.0';
const safeNumberSelect = [
  'id',
  'store_id',
  'label',
  'phone_number',
  'phone_number_id',
  'waba_id',
  'graph_version',
  'routing_mode',
  'is_active',
  'status',
  'last_webhook_at',
  'last_error',
  'settings',
  'created_by',
  'created_at',
  'updated_at',
  'stores(id, store_name, slug)'
].join(', ');

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

function publicNumber(instance: any, hasAccessToken = Boolean(instance?.has_access_token)) {
  const {
    access_token: _accessToken,
    verify_token: _verifyToken,
    access_token_secret_id: _secretId,
    ...safe
  } = instance || {};
  return {
    ...safe,
    has_access_token: hasAccessToken
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
        .select(safeNumberSelect)
        .neq('status', 'archived')
        .order('created_at', { ascending: false })
    ]);

    if (storesResponse.error) {
      return NextResponse.json({ error: storesResponse.error.message }, { status: 400 });
    }

    if (numbersResponse.error) {
      return NextResponse.json({ error: numbersResponse.error.message }, { status: 400 });
    }

    const numberRows = (numbersResponse.data || []).filter(
      (number: any) => !isEvolutionWhatsappNumber(number)
    );
    const tokenStates = await Promise.all(
      numberRows.map((number: any) => hasMetaWhatsappAccessToken(supabase, number))
    );

    return NextResponse.json({
      success: true,
      stores: storesResponse.data || [],
      numbers: numberRows.map((number: any, index: number) => publicNumber(number, tokenStates[index])),
      defaults: {
        graph_version: defaultGraphVersion
      },
      webhook_security: {
        verify_token_configured: Boolean(cleanText(process.env.WHATSAPP_VERIFY_TOKEN)),
        app_secret_configured: Boolean(cleanText(process.env.WHATSAPP_APP_SECRET || process.env.META_APP_SECRET))
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

      const { data: currentNumber, error: currentNumberError } = await supabase
        .from('whatsapp_numbers')
        .select('id, phone_number_id, settings')
        .eq('id', id)
        .maybeSingle();

      if (currentNumberError) {
        return NextResponse.json({ error: currentNumberError.message }, { status: 400 });
      }

      if (!currentNumber) {
        return NextResponse.json({ error: 'Número WhatsApp não encontrado.' }, { status: 404 });
      }

      if (isEvolutionWhatsappNumber(currentNumber)) {
        return NextResponse.json({ error: 'Integrações Evolution não podem ser alteradas pela configuração Meta.' }, { status: 409 });
      }

      const { error } = await supabase
        .from('whatsapp_numbers')
        .update({
          is_active: false,
          status: 'archived',
          updated_at: new Date().toISOString()
        })
        .eq('id', id);

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

    const rpcPayload = {
      p_id: id || null,
      p_store_id: cleanText(body.store_id) || null,
      p_label: label,
      p_phone_number: cleanText(body.phone_number) || null,
      p_phone_number_id: phoneNumberId,
      p_waba_id: onlyDigits(body.waba_id) || null,
      p_graph_version: cleanText(body.graph_version) || defaultGraphVersion,
      p_routing_mode: cleanText(body.routing_mode) || 'store_pipeline',
      p_is_active: isActive,
      p_auto_create_lead: body.auto_create_lead !== false,
      p_auto_route_to_store: body.auto_route_to_store !== false,
      p_created_by: masterProfile.id,
      p_access_token: accessToken || null
    };

    const { data: secureData, error: secureError } = await supabase
      .rpc('save_whatsapp_meta_number', rpcPayload);

    if (!secureError) {
      return NextResponse.json({
        success: true,
        number: publicNumber(secureData, Boolean(secureData?.has_access_token))
      });
    }

    if (isMissingWhatsappVaultRpc(secureError)) {
      return NextResponse.json(
        { error: 'O armazenamento seguro do WhatsApp ainda não está disponível neste ambiente.' },
        { status: 503 }
      );
    }

    return NextResponse.json({ error: 'Não foi possível salvar a credencial segura do WhatsApp.' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Erro ao salvar WhatsApp Oficial.' },
      { status: 500 }
    );
  }
}
