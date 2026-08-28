import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { authorizeStoreEntitlement } from '@/lib/server/storePortal';

export const runtime = 'nodejs';

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) throw new Error('Supabase Service Role não configurada.');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function managerProfile(supabase: any, request: Request) {
  const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;
  const { data } = await supabase.auth.getUser(token);
  if (!data.user) return null;
  const { data: profile } = await supabase.from('users').select('*').eq('auth_user_id', data.user.id).maybeSingle();
  if (!profile || profile.status !== 'active' || !['master', 'store'].includes(profile.role)) return null;
  return profile;
}

export async function GET(request: Request) {
  try {
    const supabase: any = adminClient();
    const profile = await managerProfile(supabase, request);
    if (!profile) return NextResponse.json({ error: 'Acesso não autorizado.' }, { status: 403 });
    const url = new URL(request.url);
    const storeId = profile.role === 'master' ? url.searchParams.get('store_id') : profile.store_id;
    if (!storeId) return NextResponse.json({ error: 'Loja não identificada.' }, { status: 400 });

    const entitlement = await authorizeStoreEntitlement(supabase, {
      role: profile.role,
      storeId,
      profileStoreId: profile.store_id,
      allowMasterWhenStoreUnavailable: true
    });
    if ('error' in entitlement) return entitlement.error;

    const { data, error } = await supabase
      .from('users')
      .select('id,full_name,email,phone,role,status,receives_leads,routing_order,max_open_leads,created_at')
      .eq('store_id', storeId)
      .in('role', ['pre_sales', 'seller', 'prospector'])
      .order('role')
      .order('full_name');
    if (error) throw error;
    return NextResponse.json({ members: data || [] });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Erro ao carregar equipe.' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const supabase: any = adminClient();
    const profile = await managerProfile(supabase, request);
    if (!profile) return NextResponse.json({ error: 'Acesso não autorizado.' }, { status: 403 });
    const body = await request.json();
    const id = String(body.id || '');
    const { data: member } = await supabase.from('users').select('*').eq('id', id).maybeSingle();
    if (!member || !['pre_sales', 'seller', 'prospector'].includes(member.role)) return NextResponse.json({ error: 'Colaborador não encontrado.' }, { status: 404 });
    if (profile.role !== 'master' && member.store_id !== profile.store_id) return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });

    const entitlement = await authorizeStoreEntitlement(supabase, {
      role: profile.role,
      storeId: member.store_id,
      profileStoreId: profile.store_id,
      allowMasterWhenStoreUnavailable: true
    });
    if ('error' in entitlement) return entitlement.error;

    const update: Record<string, any> = {};
    if (['active', 'paused', 'inactive'].includes(String(body.status))) update.status = String(body.status);
    if (typeof body.receives_leads === 'boolean') update.receives_leads = body.receives_leads;
    if (Number.isInteger(body.routing_order) && body.routing_order >= 0) update.routing_order = body.routing_order;
    if (body.max_open_leads === null || (Number.isInteger(body.max_open_leads) && body.max_open_leads > 0)) update.max_open_leads = body.max_open_leads;

    const { error } = await supabase.from('users').update(update).eq('id', id);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Erro ao atualizar colaborador.' }, { status: 500 });
  }
}
