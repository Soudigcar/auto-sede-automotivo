import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

  if (!supabaseUrl || !serviceKey) {
    throw new Error('Supabase Service Role não configurada.');
  }

  return createClient(supabaseUrl, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
}

async function assertMaster(request: Request, supabase: any) {
  const authorization = request.headers.get('authorization') || '';
  const token = authorization.replace(/^Bearer\s+/i, '').trim();

  if (!token) throw new Error('Sessão não encontrada.');

  const { data: authData, error: authError } = await supabase.auth.getUser(token);

  if (authError || !authData.user) throw new Error('Sessão inválida.');

  let profile: any = null;

  const { data: byAuth } = await supabase
    .from('users')
    .select('id,email,role,status')
    .eq('auth_user_id', authData.user.id)
    .maybeSingle();

  profile = byAuth;

  if (!profile && authData.user.email) {
    const { data: byEmail } = await supabase
      .from('users')
      .select('id,email,role,status')
      .ilike('email', authData.user.email)
      .maybeSingle();

    profile = byEmail;
  }

  if (!profile || profile.role !== 'master' || profile.status !== 'active') {
    throw new Error('Acesso restrito ao Master.');
  }

  return profile;
}

export async function GET(request: Request) {
  try {
    const supabase = getAdminClient();
    await assertMaster(request, supabase);

    const { data, error } = await supabase
      .from('stores')
      .select('id,store_name,status,portal_enabled,event_id,slug')
      .order('store_name', { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const stores = (data || []).filter((store: any) => {
      const status = String(store.status || '').toLowerCase();
      return status !== 'deleted' && status !== 'excluido';
    });

    return NextResponse.json({
      success: true,
      stores
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Erro ao carregar lojas.' },
      { status: 500 }
    );
  }
}
