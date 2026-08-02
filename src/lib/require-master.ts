import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

type MasterAuthorization =
  | { ok: true; userId: string }
  | { ok: false; response: NextResponse };

export async function requireMaster(): Promise<MasterAuthorization> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Autenticação do Supabase não configurada.' },
        { status: 500 }
      )
    };
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Route handlers may run in a context where response cookies cannot be changed.
        }
      }
    }
  });

  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
    };
  }

  const { data: profile, error: profileError } = await supabase
    .from('users')
    .select('role, status')
    .eq('auth_user_id', user.id)
    .maybeSingle();

  if (
    profileError ||
    !profile ||
    profile.role !== 'master' ||
    profile.status !== 'active'
  ) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Acesso restrito ao Master.' }, { status: 403 })
    };
  }

  return { ok: true, userId: user.id };
}
