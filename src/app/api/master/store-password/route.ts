import { NextResponse } from 'next/server';
import { randomInt } from 'crypto';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

function cleanText(value: unknown) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function normalizeEmail(value: unknown) {
  return cleanText(value).toLowerCase();
}

function generatePassword() {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnopqrstuvwxyz';
  const digits = '23456789';
  const all = `${upper}${lower}${digits}`;

  let suffix = '';

  for (let index = 0; index < 8; index += 1) {
    suffix += all[randomInt(0, all.length)];
  }

  return `Auto@${randomInt(1000, 9999)}${suffix}`;
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

  if (authError || !authData.user) {
    return null;
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

  if (!profile || profile.status !== 'active' || profile.role !== 'master') {
    return null;
  }

  return profile;
}

async function findAuthUserByEmail(supabase: any, email: string, knownAuthUserId?: string) {
  if (knownAuthUserId) {
    const { data } = await supabase.auth.admin.getUserById(knownAuthUserId);

    if (data?.user) {
      return data.user;
    }
  }

  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage: 100
    });

    if (error) {
      throw error;
    }

    const user = (data?.users || []).find((item: any) => normalizeEmail(item.email) === email);

    if (user) {
      return user;
    }

    if (!data?.users?.length || data.users.length < 100) {
      break;
    }
  }

  return null;
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
      return NextResponse.json({ error: 'Apenas usuário Master pode gerar senha de loja.' }, { status: 403 });
    }

    const body = await request.json();
    const storeId = cleanText(body.store_id);

    if (!storeId) {
      return NextResponse.json({ error: 'Loja obrigatória.' }, { status: 400 });
    }

    const { data: store, error: storeError } = await supabase
      .from('stores')
      .select('*')
      .eq('id', storeId)
      .maybeSingle();

    if (storeError || !store) {
      return NextResponse.json({ error: 'Loja não encontrada.' }, { status: 404 });
    }

    if (String(store.status || '').toLowerCase() === 'deleted') {
      return NextResponse.json({ error: 'Esta loja está excluída/inativa.' }, { status: 400 });
    }

    const email = normalizeEmail(store.responsible_email);

    if (!email || !email.includes('@')) {
      return NextResponse.json({ error: 'A loja precisa ter um e-mail válido cadastrado.' }, { status: 400 });
    }

    const password = generatePassword();

    const { data: existingProfile } = await supabase
      .from('users')
      .select('*')
      .or(`store_id.eq.${store.id},email.ilike.${email}`)
      .limit(1)
      .maybeSingle();

    let authUser = await findAuthUserByEmail(supabase, email, existingProfile?.auth_user_id || undefined);

    if (authUser) {
      const { data: updatedAuth, error: updateAuthError } = await supabase.auth.admin.updateUserById(authUser.id, {
        password,
        email_confirm: true,
        user_metadata: {
          role: 'store',
          store_id: store.id,
          store_name: store.store_name
        }
      });

      if (updateAuthError) {
        return NextResponse.json({ error: updateAuthError.message }, { status: 400 });
      }

      authUser = updatedAuth.user;
    } else {
      const { data: createdAuth, error: createAuthError } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          role: 'store',
          store_id: store.id,
          store_name: store.store_name
        }
      });

      if (createAuthError) {
        return NextResponse.json({ error: createAuthError.message }, { status: 400 });
      }

      authUser = createdAuth.user;
    }

    const userPayload = {
      auth_user_id: authUser.id,
      full_name: store.responsible_name || store.store_name,
      email,
      role: 'store',
      status: 'active',
      store_id: store.id,
      updated_at: new Date().toISOString()
    };

    if (existingProfile?.id) {
      const { error: updateProfileError } = await supabase
        .from('users')
        .update(userPayload)
        .eq('id', existingProfile.id);

      if (updateProfileError) {
        return NextResponse.json({ error: updateProfileError.message }, { status: 400 });
      }
    } else {
      const { error: insertProfileError } = await supabase
        .from('users')
        .insert({
          ...userPayload,
          created_at: new Date().toISOString()
        });

      if (insertProfileError) {
        return NextResponse.json({ error: insertProfileError.message }, { status: 400 });
      }
    }

    return NextResponse.json({
      success: true,
      store_name: store.store_name,
      email,
      password,
      portal_path: `/loja/${store.slug || ''}`
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Erro ao gerar senha da loja.' },
      { status: 500 }
    );
  }
}
