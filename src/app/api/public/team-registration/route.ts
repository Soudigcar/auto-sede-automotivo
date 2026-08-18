import { NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import {
  cleanText,
  createAdminClient,
  isStoreTeamRole,
  normalizeEmail,
  storeTeamRoleLabels
} from '@/lib/server/storeTeam';
import { enforceRateLimit } from '@/lib/server/rateLimit';
import { publicError, readJsonBody } from '@/lib/server/requestSecurity';

export const runtime = 'nodejs';

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

async function loadValidLink(supabase: any, token: string) {
  const { data: link, error } = await supabase
    .from('store_team_registration_links')
    .select('id, store_id, role, status, expires_at, max_uses, usage_count, last_used_at, created_at')
    .eq('token_hash', hashToken(token))
    .maybeSingle();

  if (error) throw error;
  if (!link || link.status !== 'active' || !isStoreTeamRole(link.role)) return null;

  const now = Date.now();
  const expiresAt = link.expires_at ? new Date(link.expires_at).getTime() : null;
  const reachedLimit = link.max_uses !== null && link.max_uses !== undefined && link.usage_count >= link.max_uses;

  if ((expiresAt !== null && expiresAt <= now) || reachedLimit) {
    await supabase
      .from('store_team_registration_links')
      .update({ status: 'expired', updated_at: new Date().toISOString() })
      .eq('id', link.id);
    return null;
  }

  const { data: store, error: storeError } = await supabase
    .from('stores')
    .select('id, store_name, slug, event_id, status, portal_enabled')
    .eq('id', link.store_id)
    .maybeSingle();

  if (storeError) throw storeError;
  if (!store || store.status !== 'active' || !store.portal_enabled) return null;

  return { link, store };
}

export async function GET(request: Request) {
  try {
    const token = cleanText(new URL(request.url).searchParams.get('token'), 220);

    if (!token) {
      return NextResponse.json({ error: 'Link de cadastro inválido.' }, { status: 400 });
    }

    const supabase: any = createAdminClient();
    const context = await loadValidLink(supabase, token);

    if (!context) {
      return NextResponse.json({ error: 'Este link expirou, foi desativado ou não existe.' }, { status: 404 });
    }

    return NextResponse.json({
      store_name: context.store.store_name,
      store_slug: context.store.slug,
      role: context.link.role,
      role_label: storeTeamRoleLabels[context.link.role as keyof typeof storeTeamRoleLabels],
      expires_at: context.link.expires_at
    });
  } catch (error: unknown) {
    const failure = publicError(error, 'Erro ao validar cadastro.');
    return NextResponse.json({ error: failure.message }, { status: failure.status });
  }
}

export async function POST(request: Request) {
  try {
    const origin = request.headers.get('origin');
    if (origin && origin !== new URL(request.url).origin) {
      return NextResponse.json({ error: 'Origem não autorizada.' }, { status: 403 });
    }
    await enforceRateLimit(request, 'team-registration', 10, 60 * 60);
    const body = await readJsonBody<any>(request, 16 * 1024);
    const token = cleanText(body.token, 220);
    const fullName = cleanText(body.full_name, 180);
    const email = normalizeEmail(body.email);
    const phone = cleanText(body.phone, 40);
    const password = String(body.password || '');
    const passwordConfirmation = String(body.password_confirmation || '');

    if (!token || fullName.length < 3 || !email || !email.includes('@')) {
      return NextResponse.json({ error: 'Preencha nome e e-mail corretamente.' }, { status: 400 });
    }

    if (password.length < 12 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
      return NextResponse.json({ error: 'Use ao menos 12 caracteres, com maiúscula, minúscula, número e símbolo.' }, { status: 400 });
    }

    if (password !== passwordConfirmation) {
      return NextResponse.json({ error: 'A confirmação da senha não confere.' }, { status: 400 });
    }

    const supabase: any = createAdminClient();
    const context = await loadValidLink(supabase, token);

    if (!context) {
      return NextResponse.json({ error: 'Este link expirou, foi desativado ou não existe.' }, { status: 404 });
    }

    const { link, store } = context;

    const { data: existingProfile, error: existingProfileError } = await supabase
      .from('users')
      .select('id')
      .ilike('email', email)
      .maybeSingle();

    if (existingProfileError) throw existingProfileError;

    if (existingProfile) {
      return NextResponse.json({ error: 'Já existe um usuário cadastrado com este e-mail.' }, { status: 409 });
    }

    const currentUsage = Number(link.usage_count || 0);
    const nextUsage = currentUsage + 1;
    const reachedLimit = link.max_uses !== null && link.max_uses !== undefined && nextUsage >= link.max_uses;
    const { data: reservedLink, error: reserveError } = await supabase
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
    if (reserveError || !reservedLink) {
      return NextResponse.json({ error: 'O link foi utilizado simultaneamente. Tente novamente.' }, { status: 409 });
    }

    const { data: lastMember, error: orderError } = await supabase
      .from('users')
      .select('routing_order')
      .eq('store_id', store.id)
      .eq('role', link.role)
      .order('routing_order', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (orderError) throw orderError;

    const nextRoutingOrder = Math.max(0, Number(lastMember?.routing_order || -1) + 1);

    const { data: createdAuth, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
        phone,
        role: link.role,
        store_id: store.id,
        store_slug: store.slug
      }
    });

    if (authError || !createdAuth.user) {
      const duplicate = String(authError?.message || '').toLowerCase().includes('already');
      return NextResponse.json(
        { error: duplicate ? 'Este e-mail já possui uma conta de acesso.' : authError?.message || 'Não foi possível criar o acesso.' },
        { status: duplicate ? 409 : 400 }
      );
    }

    const { data: profile, error: profileError } = await supabase
      .from('users')
      .insert({
        auth_user_id: createdAuth.user.id,
        full_name: fullName,
        email,
        phone: phone || null,
        role: link.role,
        store_id: store.id,
        status: 'pending',
        receives_leads: false,
        routing_order: nextRoutingOrder,
        max_open_leads: null,
        must_change_password: false
      })
      .select('id, full_name, email, role, status')
      .single();

    if (profileError) {
      try {
        await supabase.auth.admin.deleteUser(createdAuth.user.id);
      } catch {
        // A conta órfã pode ser removida posteriormente pelo administrador.
      }
      throw profileError;
    }

    return NextResponse.json({
      success: true,
      message: 'Cadastro enviado. O Gestor da loja precisa ativar seu acesso.',
      profile: {
        id: profile.id,
        full_name: profile.full_name,
        role: profile.role,
        role_label: storeTeamRoleLabels[link.role as keyof typeof storeTeamRoleLabels],
        status: profile.status,
        store_name: store.store_name
      }
    });
  } catch (error: unknown) {
    const failure = publicError(error, 'Erro ao concluir cadastro.');
    return NextResponse.json({ error: failure.message }, { status: failure.status });
  }
}
