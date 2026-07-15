import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

function cleanText(value: unknown) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function normalizeUrl(value: string) {
  const text = cleanText(value);
  if (!text) return '';
  if (/^https?:\/\//i.test(text)) return text;
  return `https://${text}`;
}

function isValidVehicleUrl(value: string) {
  return /^https?:\/\/.+/i.test(value);
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

async function getAuthorizedStore(request: Request, expectedSlug?: string) {
  const supabase = getAdminClient();
  const authorization = request.headers.get('authorization') || '';
  const token = authorization.replace(/^Bearer\s+/i, '').trim();

  if (!token) {
    return { error: 'Sessão não encontrada.', status: 401, supabase, profile: null, store: null, authUser: null };
  }

  const { data: authData, error: authError } = await supabase.auth.getUser(token);

  if (authError || !authData.user) {
    return { error: 'Sessão inválida. Faça login novamente.', status: 401, supabase, profile: null, store: null, authUser: null };
  }

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

  if (!profile || profile.status !== 'active' || profile.role !== 'store' || !profile.store_id) {
    return { error: 'Usuário de loja não autorizado.', status: 403, supabase, profile: null, store: null, authUser: authData.user };
  }

  const { data: store } = await supabase
    .from('stores')
    .select('*')
    .eq('id', profile.store_id)
    .eq('status', 'active')
    .maybeSingle();

  if (!store) {
    return { error: 'Loja vinculada não encontrada.', status: 404, supabase, profile, store: null, authUser: authData.user };
  }

  if (expectedSlug && store.slug !== expectedSlug) {
    return { error: 'Este usuário não pertence a esta loja.', status: 403, supabase, profile, store: null, authUser: authData.user };
  }

  return { error: '', status: 200, supabase, profile, store, authUser: authData.user };
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const slug = cleanText(url.searchParams.get('slug'));

    const context = await getAuthorizedStore(request, slug);

    if (context.error) {
      return NextResponse.json({ error: context.error }, { status: context.status });
    }

    const [{ data: links }, { data: stockImports }] = await Promise.all([
      context.supabase
        .from('store_vehicle_link_submissions')
        .select('*')
        .eq('store_id', context.store.id)
        .order('created_at', { ascending: false }),
      context.supabase
        .from('store_stock_imports')
        .select('*')
        .eq('store_id', context.store.id)
        .order('created_at', { ascending: false })
    ]);

    return NextResponse.json({
      store: context.store,
      profile: {
        id: context.profile.id,
        full_name: context.profile.full_name,
        email: context.profile.email,
        phone: context.profile.phone,
        role: context.profile.role
      },
      links: links || [],
      stock_imports: stockImports || []
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Erro ao carregar Minha Loja.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const action = cleanText(body.action);
    const slug = cleanText(body.slug);

    const context = await getAuthorizedStore(request, slug);

    if (context.error) {
      return NextResponse.json({ error: context.error }, { status: context.status });
    }

    const { supabase, profile, store } = context;

    if (action === 'update-store') {
      const storeName = cleanText(body.store_name);
      const responsibleName = cleanText(body.responsible_name);
      const phone = cleanText(body.responsible_phone);
      const responsibleEmail = cleanText(body.responsible_email).toLowerCase();
      const websiteUrl = normalizeUrl(cleanText(body.website_url));

      if (!storeName || !responsibleName) {
        return NextResponse.json({ error: 'Informe nome da loja e responsável.' }, { status: 400 });
      }

      const { error: storeError } = await supabase
        .from('stores')
        .update({
          store_name: storeName,
          responsible_name: responsibleName,
          responsible_phone: phone || null,
          responsible_email: responsibleEmail || null,
          website_url: websiteUrl || null,
          updated_at: new Date().toISOString()
        })
        .eq('id', store.id);

      if (storeError) {
        return NextResponse.json({ error: storeError.message }, { status: 400 });
      }

      await supabase
        .from('users')
        .update({
          full_name: responsibleName,
          phone: phone || null,
          updated_at: new Date().toISOString()
        })
        .eq('id', profile.id);

      return NextResponse.json({ success: true });
    }

    if (action === 'add-vehicle-link') {
      const vehicleUrl = normalizeUrl(cleanText(body.vehicle_url));

      if (!vehicleUrl || !isValidVehicleUrl(vehicleUrl)) {
        return NextResponse.json({ error: 'Informe um link válido de veículo.' }, { status: 400 });
      }

      const { data: existing } = await supabase
        .from('store_vehicle_link_submissions')
        .select('id')
        .eq('store_id', store.id)
        .eq('vehicle_url', vehicleUrl)
        .maybeSingle();

      if (existing) {
        return NextResponse.json({ error: 'Este link já foi enviado.' }, { status: 409 });
      }

      const { count } = await supabase
        .from('store_vehicle_link_submissions')
        .select('id', { count: 'exact', head: true })
        .eq('store_id', store.id);

      const position = ((Number(count || 0) % 6) + 1);

      const { error } = await supabase
        .from('store_vehicle_link_submissions')
        .insert({
          event_id: store.event_id,
          store_id: store.id,
          submitted_by_user_id: profile.id,
          position,
          vehicle_url: vehicleUrl,
          status: 'pending',
          metadata: {
            source: 'store_portal_my_store'
          }
        });

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }

      return NextResponse.json({ success: true });
    }

    if (action === 'update-login') {
      const newEmail = cleanText(body.new_email).toLowerCase();
      const newPassword = String(body.new_password || '').trim();

      if (!newEmail && !newPassword) {
        return NextResponse.json({ error: 'Informe novo e-mail ou nova senha.' }, { status: 400 });
      }

      if (newPassword && newPassword.length < 6) {
        return NextResponse.json({ error: 'A nova senha precisa ter pelo menos 6 caracteres.' }, { status: 400 });
      }

      if (!profile.auth_user_id) {
        return NextResponse.json({ error: 'Este usuário não possui Auth ID vinculado.' }, { status: 400 });
      }

      if (newEmail && newEmail !== profile.email) {
        const { data: emailUsed } = await supabase
          .from('users')
          .select('id')
          .ilike('email', newEmail)
          .neq('id', profile.id)
          .maybeSingle();

        if (emailUsed) {
          return NextResponse.json({ error: 'Este e-mail já está em uso.' }, { status: 409 });
        }
      }

      const authPayload: any = {};

      if (newEmail) {
        authPayload.email = newEmail;
        authPayload.email_confirm = true;
      }

      if (newPassword) {
        authPayload.password = newPassword;
      }

      const { error: authError } = await supabase.auth.admin.updateUserById(profile.auth_user_id, authPayload);

      if (authError) {
        return NextResponse.json({ error: authError.message }, { status: 400 });
      }

      const userPayload: any = {
        updated_at: new Date().toISOString()
      };

      if (newEmail) {
        userPayload.email = newEmail;
      }

      const { error: userError } = await supabase
        .from('users')
        .update(userPayload)
        .eq('id', profile.id);

      if (userError) {
        return NextResponse.json({ error: userError.message }, { status: 400 });
      }

      if (newEmail) {
        await supabase
          .from('stores')
          .update({
            responsible_email: newEmail,
            updated_at: new Date().toISOString()
          })
          .eq('id', store.id);
      }

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Ação inválida.' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Erro ao salvar Minha Loja.' }, { status: 500 });
  }
}
