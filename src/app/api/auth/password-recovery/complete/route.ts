import { NextResponse } from 'next/server';
import { createAdminClient, getProfileFromToken, readBearerToken } from '@/lib/server/storeTeam';
import { enforceRateLimit } from '@/lib/server/rateLimit';
import { publicError, readJsonBody } from '@/lib/server/requestSecurity';
import { accountPasswordError } from '@/lib/storeTeamRegistration';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const origin = request.headers.get('origin');
    if (origin && origin !== new URL(request.url).origin) {
      return NextResponse.json({ error: 'Origem não autorizada.' }, { status: 403 });
    }

    const supabase: any = createAdminClient();
    const token = readBearerToken(request);
    if (!token) return NextResponse.json({ error: 'Sessão de recuperação não encontrada.' }, { status: 401 });

    const [{ data: authData, error: authError }, profile] = await Promise.all([
      supabase.auth.getUser(token),
      getProfileFromToken(supabase, token)
    ]);

    if (authError || !authData.user || !profile || profile.status !== 'active') {
      return NextResponse.json({ error: 'Sessão de recuperação inválida ou expirada.' }, { status: 403 });
    }

    if (process.env.VERCEL_ENV === 'preview') {
      return NextResponse.json({ error: 'O Preview valida o fluxo sem alterar senhas reais.' }, { status: 403 });
    }

    await enforceRateLimit(request, 'password-recovery-complete', 5, 60 * 60);
    const body = await readJsonBody<{ password?: unknown; password_confirmation?: unknown }>(request, 8 * 1024);
    const password = String(body.password || '');
    const confirmation = String(body.password_confirmation || '');

    const passwordError = accountPasswordError(password);
    if (passwordError) {
      return NextResponse.json({ error: passwordError }, { status: 400 });
    }
    if (password !== confirmation) {
      return NextResponse.json({ error: 'A confirmação da senha não confere.' }, { status: 400 });
    }

    const { error: updateAuthError } = await supabase.auth.admin.updateUserById(authData.user.id, { password });
    if (updateAuthError) throw updateAuthError;

    const { error: profileError } = await supabase
      .from('users')
      .update({ must_change_password: false, updated_at: new Date().toISOString() })
      .eq('id', profile.id);
    if (profileError) throw profileError;

    await Promise.allSettled([
      supabase.from('audit_logs').insert({
        event_id: null,
        action_type: 'password_recovery_completed',
        entity_type: 'users',
        entity_id: profile.id,
        new_value: {
          store_id: profile.store_id || null,
          changed_by_user_id: profile.id,
          source: 'email_recovery',
          credential_policy_version: 'strong-v1'
        }
      })
    ]);

    return NextResponse.json({ success: true, message: 'Senha redefinida com sucesso.' });
  } catch (error: unknown) {
    const failure = publicError(error, 'Não foi possível redefinir a senha.');
    return NextResponse.json({ error: failure.message }, { status: failure.status });
  }
}
