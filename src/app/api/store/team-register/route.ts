import { createHash } from 'crypto';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { enforceRateLimit } from '@/lib/server/rateLimit';
import { publicError, readJsonBody } from '@/lib/server/requestSecurity';
import { accountPasswordError } from '@/lib/storeTeamRegistration';
import { authorizeStoreEntitlement, isOperationalStoreSaas } from '@/lib/server/storePortal';

export const runtime = 'nodejs';

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) throw new Error('Supabase Service Role não configurada.');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

async function getValidLink(supabase: any, token: string) {
  const { data: link } = await supabase
    .from('store_team_registration_links')
    .select('*,stores(id,store_name,slug,status,portal_enabled)')
    .eq('token_hash', hashToken(token))
    .eq('status', 'active')
    .maybeSingle();

  if (!link) return null;
  if (link.expires_at && new Date(link.expires_at).getTime() < Date.now()) return null;
  if (link.max_uses !== null && link.usage_count >= link.max_uses) return null;
  if (!isOperationalStoreSaas(link.stores)) return null;
  return link;
}

async function authorizeRegistrationLink(supabase: any, link: any) {
  return authorizeStoreEntitlement(supabase, {
    role: 'store',
    storeId: link.store_id,
    profileStoreId: link.store_id,
    store: link.stores
  });
}

export async function GET(request: Request) {
  try {
    const token = new URL(request.url).searchParams.get('token') || '';
    if (!token) return NextResponse.json({ error: 'Link inválido.' }, { status: 400 });
    const supabase: any = adminClient();
    const link = await getValidLink(supabase, token);
    if (!link) return NextResponse.json({ error: 'Link inválido, vencido ou desativado.' }, { status: 404 });
    const entitlement = await authorizeRegistrationLink(supabase, link);
    if ('error' in entitlement) return entitlement.error;
    return NextResponse.json({
      store: { id: link.stores.id, name: link.stores.store_name, slug: link.stores.slug },
      role: link.role,
      expires_at: link.expires_at
    });
  } catch (error: unknown) {
    const failure = publicError(error, 'Erro ao validar link.');
    return NextResponse.json({ error: failure.message }, { status: failure.status });
  }
}

export async function POST(request: Request) {
  try {
    const origin = request.headers.get('origin');
    if (origin && origin !== new URL(request.url).origin) {
      return NextResponse.json({ error: 'Origem não autorizada.' }, { status: 403 });
    }
    await enforceRateLimit(request, 'team-register-legacy', 10, 60 * 60);
    const body = await readJsonBody<any>(request, 16 * 1024);
    const token = String(body.token || '');
    const fullName = String(body.full_name || '').replace(/\s+/g, ' ').trim();
    const email = String(body.email || '').trim().toLowerCase();
    const phone = String(body.phone || '').trim();
    const password = String(body.password || '');
    const passwordError = accountPasswordError(password);

    if (!token || fullName.length < 3 || !email.includes('@') || passwordError) {
      return NextResponse.json({ error: passwordError || 'Preencha nome e e-mail corretamente.' }, { status: 400 });
    }

    const supabase: any = adminClient();
    const link = await getValidLink(supabase, token);
    if (!link) return NextResponse.json({ error: 'Link inválido, vencido ou desativado.' }, { status: 404 });

    const entitlement = await authorizeRegistrationLink(supabase, link);
    if ('error' in entitlement) return entitlement.error;

    const { data: existing } = await supabase.from('users').select('id').ilike('email', email).maybeSingle();
    if (existing) return NextResponse.json({ error: 'Este e-mail já está cadastrado.' }, { status: 409 });

    const currentUsage = Number(link.usage_count || 0);
    const nextUsage = currentUsage + 1;
    const reachedLimit = link.max_uses !== null && link.max_uses !== undefined && nextUsage >= link.max_uses;
    const { data: reserved } = await supabase
      .from('store_team_registration_links')
      .update({
        usage_count: nextUsage,
        last_used_at: new Date().toISOString(),
        status: reachedLimit ? 'expired' : 'active',
        updated_at: new Date().toISOString()
      })
      .eq('id', link.id)
      .eq('status', 'active')
      .eq('usage_count', currentUsage)
      .select('id')
      .maybeSingle();
    if (!reserved) return NextResponse.json({ error: 'O link foi utilizado simultaneamente. Tente novamente.' }, { status: 409 });

    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName, store_id: link.store_id, role: link.role }
    });
    if (authError || !authData.user) throw authError || new Error('Não foi possível criar o acesso.');

    const { error: profileError } = await supabase.from('users').insert({
      auth_user_id: authData.user.id,
      full_name: fullName,
      email,
      phone: phone || null,
      role: link.role,
      status: 'active',
      store_id: link.store_id,
      receives_leads: false,
      routing_order: 0,
      must_change_password: false
    });

    if (profileError) {
      await supabase.auth.admin.deleteUser(authData.user.id);
      throw profileError;
    }

    return NextResponse.json({
      success: true,
      login_path: '/login',
      store_slug: link.stores.slug,
      message: 'Cadastro concluído. Seu acesso foi criado, mas a participação no rodízio depende da ativação do gestor.'
    });
  } catch (error: unknown) {
    const failure = publicError(error, 'Erro ao concluir cadastro.');
    return NextResponse.json({ error: failure.message }, { status: failure.status });
  }
}
