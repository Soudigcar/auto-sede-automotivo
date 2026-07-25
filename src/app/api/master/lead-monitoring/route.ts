import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

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

async function getProfile(supabase: any, token: string) {
  const { data: authData, error: authError } = await supabase.auth.getUser(token);

  if (authError || !authData.user) return null;

  const { data: byAuth } = await supabase
    .from('users')
    .select('id, auth_user_id, full_name, email, role, status, store_id')
    .eq('auth_user_id', authData.user.id)
    .maybeSingle();

  if (byAuth) return byAuth;
  if (!authData.user.email) return null;

  const { data: byEmail } = await supabase
    .from('users')
    .select('id, auth_user_id, full_name, email, role, status, store_id')
    .ilike('email', authData.user.email)
    .maybeSingle();

  return byEmail || null;
}

export async function GET(request: Request) {
  try {
    const supabase = getAdminClient();
    const authorization = request.headers.get('authorization') || '';
    const token = authorization.replace(/^Bearer\s+/i, '').trim();

    if (!token) {
      return NextResponse.json({ error: 'Sessão não encontrada.' }, { status: 401 });
    }

    const profile = await getProfile(supabase, token);

    if (!profile || profile.status !== 'active' || profile.role !== 'master') {
      return NextResponse.json({ error: 'Acesso restrito ao perfil Master.' }, { status: 403 });
    }

    const [leadResult, storeResult] = await Promise.all([
      supabase
        .from('leads')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(250),
      supabase
        .from('stores')
        .select('id, store_name, status, portal_enabled, slug')
        .order('store_name', { ascending: true })
    ]);

    if (leadResult.error) throw leadResult.error;
    if (storeResult.error) throw storeResult.error;

    const leads = leadResult.data || [];
    const stores = storeResult.data || [];
    const storeNames = new Map(stores.map((store: any) => [store.id, store.store_name]));
    const leadIds = leads.map((lead: any) => lead.id).filter(Boolean);

    let activities: any[] = [];

    if (leadIds.length) {
      const { data, error } = await supabase
        .from('lead_activity_logs')
        .select('*')
        .in('lead_id', leadIds)
        .order('created_at', { ascending: false })
        .limit(2000);

      if (error) throw error;
      activities = data || [];
    }

    return NextResponse.json({
      success: true,
      generated_at: new Date().toISOString(),
      leads: leads.map((lead: any) => ({
        ...lead,
        assigned_store_name: storeNames.get(lead.assigned_store_id) || 'Loja não identificada'
      })),
      activities,
      stores
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Erro ao carregar monitoramento de leads.' },
      { status: 500 }
    );
  }
}
