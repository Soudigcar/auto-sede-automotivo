import { createHash, randomBytes } from 'crypto';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { authorizeStoreEntitlement } from '@/lib/server/storePortal';

export const runtime = 'nodejs';

const allowedRoles = ['pre_sales', 'seller', 'prospector'];

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) throw new Error('Supabase Service Role não configurada.');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
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
      .from('store_team_registration_links')
      .select('id,store_id,role,status,expires_at,max_uses,usage_count,last_used_at,created_at')
      .eq('store_id', storeId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return NextResponse.json({ links: data || [] });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Erro ao carregar links.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const supabase: any = adminClient();
    const profile = await managerProfile(supabase, request);
    if (!profile) return NextResponse.json({ error: 'Acesso não autorizado.' }, { status: 403 });

    const body = await request.json();
    const role = String(body.role || '');
    if (!allowedRoles.includes(role)) return NextResponse.json({ error: 'Cargo inválido.' }, { status: 400 });

    const storeId = profile.role === 'master' ? String(body.store_id || '') : profile.store_id;
    if (!storeId) return NextResponse.json({ error: 'Loja não identificada.' }, { status: 400 });

    const entitlement = await authorizeStoreEntitlement(supabase, {
      role: profile.role,
      storeId,
      profileStoreId: profile.store_id,
      allowMasterWhenStoreUnavailable: true
    });
    if ('error' in entitlement) return entitlement.error;

    await supabase
      .from('store_team_registration_links')
      .update({ status: 'revoked', revoked_at: new Date().toISOString() })
      .eq('store_id', storeId)
      .eq('role', role)
      .eq('status', 'active');

    const rawToken = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from('store_team_registration_links')
      .insert({
        store_id: storeId,
        role,
        token_hash: hashToken(rawToken),
        status: 'active',
        expires_at: expiresAt,
        max_uses: 50,
        token: null,
        created_by_user_id: profile.id
      })
      .select('id,role,status,expires_at,max_uses,usage_count,created_at')
      .single();
    if (error) throw error;

    return NextResponse.json({ link: data, token: rawToken });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Erro ao gerar link.' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const supabase: any = adminClient();
    const profile = await managerProfile(supabase, request);
    if (!profile) return NextResponse.json({ error: 'Acesso não autorizado.' }, { status: 403 });
    const body = await request.json();
    const id = String(body.id || '');
    const { data: link } = await supabase.from('store_team_registration_links').select('*').eq('id', id).maybeSingle();
    if (!link) return NextResponse.json({ error: 'Link não encontrado.' }, { status: 404 });
    if (profile.role !== 'master' && link.store_id !== profile.store_id) return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });

    const entitlement = await authorizeStoreEntitlement(supabase, {
      role: profile.role,
      storeId: link.store_id,
      profileStoreId: profile.store_id,
      allowMasterWhenStoreUnavailable: true
    });
    if ('error' in entitlement) return entitlement.error;

    const { error } = await supabase.from('store_team_registration_links').update({ status: 'revoked', revoked_at: new Date().toISOString() }).eq('id', id);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Erro ao revogar link.' }, { status: 500 });
  }
}
