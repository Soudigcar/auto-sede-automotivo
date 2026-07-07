import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '').trim();
    const fullName = String(body.fullName || '').trim();
    const phone = String(body.phone || '').trim();

    if (!email || !password || !fullName) {
      return NextResponse.json({ ok: false, message: 'Dados insuficientes para criar acesso.' }, { status: 400 });
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !serviceRoleKey) {
      return NextResponse.json({
        ok: false,
        requiresServiceRole: true,
        message: 'SUPABASE_SERVICE_ROLE_KEY nao configurada. Crie o usuario manualmente no Supabase Auth usando a senha provisoria.'
      });
    }

    const supabaseAdmin = createClient(url, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    const { data: createdUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        role: 'store',
        full_name: fullName
      }
    });

    if (authError && !authError.message.toLowerCase().includes('already')) {
      return NextResponse.json({ ok: false, message: authError.message }, { status: 400 });
    }

    const authUserId = createdUser?.user?.id || null;

    const { error: profileError } = await supabaseAdmin.from('users').upsert({
      auth_user_id: authUserId,
      full_name: fullName,
      email,
      phone: phone || null,
      role: 'store',
      status: 'active',
      must_change_password: true
    }, { onConflict: 'email' });

    if (profileError) {
      return NextResponse.json({ ok: false, message: profileError.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true, message: 'Acesso da loja criado com sucesso.' });
  } catch {
    return NextResponse.json({ ok: false, message: 'Erro inesperado ao criar acesso da loja.' }, { status: 500 });
  }
}
