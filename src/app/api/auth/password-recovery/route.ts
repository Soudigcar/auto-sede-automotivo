import { NextResponse } from 'next/server';
import { createAdminClient, normalizeEmail, publicAppUrl } from '@/lib/server/storeTeam';
import { enforceRateLimit } from '@/lib/server/rateLimit';
import { publicError, readJsonBody } from '@/lib/server/requestSecurity';

export const runtime = 'nodejs';

const NEUTRAL_MESSAGE = 'Se esse e-mail estiver cadastrado, enviaremos as instruções de recuperação.';

function recoveryRedirectUrl(request: Request) {
  const base = publicAppUrl(request).replace(/\/$/, '');
  return `${base}/redefinir-senha`;
}

export async function POST(request: Request) {
  try {
    const origin = request.headers.get('origin');
    if (origin && origin !== new URL(request.url).origin) {
      return NextResponse.json({ error: 'Origem não autorizada.' }, { status: 403 });
    }

    const body = await readJsonBody<{ email?: unknown }>(request, 8 * 1024);
    const email = normalizeEmail(body.email);

    if (process.env.VERCEL_ENV === 'preview') {
      return NextResponse.json({ success: true, message: NEUTRAL_MESSAGE, preview_mode: true });
    }

    await enforceRateLimit(request, 'password-recovery-public', 5, 60 * 60);

    if (email && email.includes('@')) {
      const supabase: any = createAdminClient();
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: recoveryRedirectUrl(request)
      });

      if (!error) {
        const { data: profile } = await supabase
          .from('users')
          .select('id,store_id,role,status')
          .ilike('email', email)
          .maybeSingle();

        if (profile?.id) {
          await Promise.allSettled([
            supabase.from('audit_logs').insert({
              event_id: null,
              action_type: 'password_recovery_requested',
              entity_type: 'users',
              entity_id: profile.id,
              new_value: {
                store_id: profile.store_id || null,
                role: profile.role || null,
                source: 'self_service',
                channel: 'email'
              }
            })
          ]);
        }
      }
    }

    return NextResponse.json({ success: true, message: NEUTRAL_MESSAGE });
  } catch (error: unknown) {
    const failure = publicError(error, 'Não foi possível processar a solicitação.');
    if (failure.status >= 500) {
      return NextResponse.json({ success: true, message: NEUTRAL_MESSAGE });
    }
    return NextResponse.json({ error: failure.message }, { status: failure.status });
  }
}
