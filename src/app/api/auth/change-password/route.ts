import { NextResponse } from 'next/server';
import { createAdminClient, getProfileFromToken, readBearerToken } from '@/lib/server/storeTeam';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const supabase: any = createAdminClient();
    const token = readBearerToken(request);

    if (!token) {
      return NextResponse.json({ error: 'Sessão não encontrada.' }, { status: 401 });
    }

    const [{ data: authData, error: authLookupError }, profile] = await Promise.all([
      supabase.auth.getUser(token),
      getProfileFromToken(supabase, token)
    ]);

    if (authLookupError || !authData.user || !profile || profile.status !== 'active') {
      return NextResponse.json({ error: 'Usuário ativo não encontrado.' }, { status: 403 });
    }

    const body = await request.json();
    const password = String(body.password || '');
    const confirmation = String(body.password_confirmation || '');

    if (password.length < 8) {
      return NextResponse.json({ error: 'A nova senha deve ter pelo menos 8 caracteres.' }, { status: 400 });
    }

    if (password !== confirmation) {
      return NextResponse.json({ error: 'A confirmação da senha não confere.' }, { status: 400 });
    }

    if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
      return NextResponse.json({ error: 'Use pelo menos uma letra e um número na nova senha.' }, { status: 400 });
    }

    const { error: authError } = await supabase.auth.admin.updateUserById(authData.user.id, {
      password
    });

    if (authError) throw authError;

    const { error: profileError } = await supabase
      .from('users')
      .update({ must_change_password: false, updated_at: new Date().toISOString() })
      .eq('id', profile.id);

    if (profileError) throw profileError;

    await Promise.allSettled([
      supabase.from('audit_logs').insert({
        event_id: null,
        action_type: 'password_changed',
        entity_type: 'users',
        entity_id: profile.id,
        new_value: {
          changed_by_user_id: profile.id,
          temporary_password_replaced: true,
          legacy_profile_without_auth_user_id: !profile.auth_user_id
        }
      })
    ]);

    return NextResponse.json({ success: true, message: 'Senha alterada com sucesso.' });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Não foi possível alterar a senha.' }, { status: 500 });
  }
}
