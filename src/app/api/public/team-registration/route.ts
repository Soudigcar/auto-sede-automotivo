import { NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import {
  cleanText,
  createAdminClient,
  isStoreTeamRole,
  normalizeEmail,
  storeTeamRoleLabels
} from '@/lib/server/storeTeam';
import { enforceRateLimit } from '@/lib/server/rateLimit';
import { publicError, readJsonBody } from '@/lib/server/requestSecurity';
import { teamRegistrationPasswordError } from '@/lib/storeTeamRegistration';

export const runtime = 'nodejs';

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

function createVerificationClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  if (!url || !anonKey) throw new Error('Supabase público não configurado.');
  return createSupabaseClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  });
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

  if ((expiresAt !== null && expiresAt <= now) || reachedLimit) return null;

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
    if (!token) return NextResponse.json({ error: 'Link de cadastro inválido.' }, { status: 400 });

    const supabase: any = createAdminClient();
    const context = await loadValidLink(supabase, token);
    if (!context) return NextResponse.json({ error: 'Este link expirou, foi desativado ou não existe.' }, { status: 404 });

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

    await enforceRateLimit(request, 'team-registration', 15, 60 * 60);
    const body = await readJsonBody<any>(request, 16 * 1024);
    const action = cleanText(body.action || 'register', 40);
    const token = cleanText(body.token, 220);
    const email = normalizeEmail(body.email);

    if (!token || !email || !email.includes('@')) {
      return NextResponse.json({ error: 'Informe um e-mail válido.' }, { status: 400 });
    }

    const supabase: any = createAdminClient();
    const context = await loadValidLink(supabase, token);
    if (!context) return NextResponse.json({ error: 'Este link expirou, foi desativado ou não existe.' }, { status: 404 });

    const { link, store } = context;
    const { data: existingProfile, error: existingProfileError } = await supabase
      .from('users')
      .select('id, auth_user_id, full_name, email, phone, role, status, store_id')
      .ilike('email', email)
      .maybeSingle();

    if (existingProfileError) throw existingProfileError;

    if (action === 'check_email') {
      if (!existingProfile) {
        return NextResponse.json({
          account_state: 'new_account',
          store_name: store.store_name,
          role: link.role,
          role_label: storeTeamRoleLabels[link.role as keyof typeof storeTeamRoleLabels]
        });
      }

      if (existingProfile.store_id === store.id) {
        return NextResponse.json({
          account_state: 'already_member',
          store_name: store.store_name,
          role_label: storeTeamRoleLabels[link.role as keyof typeof storeTeamRoleLabels],
          message: 'Sua conta já pertence a esta loja. Entre no sistema com seu acesso atual.'
        });
      }

      if (!['pre_sales', 'seller', 'prospector'].includes(String(existingProfile.role || ''))) {
        return NextResponse.json({
          account_state: 'not_transferable',
          message: 'Esta conta possui um tipo de acesso que não pode ser transferido por este convite. Fale com o administrador.'
        }, { status: 409 });
      }

      return NextResponse.json({
        account_state: 'transfer_required',
        store_name: store.store_name,
        role: link.role,
        role_label: storeTeamRoleLabels[link.role as keyof typeof storeTeamRoleLabels]
      });
    }

    if (action === 'confirm_transfer') {
      if (!existingProfile) return NextResponse.json({ error: 'Conta existente não encontrada.' }, { status: 404 });
      if (existingProfile.store_id === store.id) {
        return NextResponse.json({ success: true, already_member: true, login_path: '/login', store_slug: store.slug });
      }
      if (!['pre_sales', 'seller', 'prospector'].includes(String(existingProfile.role || ''))) {
        return NextResponse.json({ error: 'Esta conta não pode ser transferida por este convite.' }, { status: 409 });
      }

      const password = String(body.password || '');
      const confirmed = body.confirm_transfer === true;
      if (!password || !confirmed) {
        return NextResponse.json({ error: 'Confirme a mudança e informe sua senha atual.' }, { status: 400 });
      }

      if (process.env.VERCEL_ENV === 'preview') {
        return NextResponse.json({
          success: true,
          preview_mode: true,
          message: `Preview de segurança validado: a conta seria transferida para ${store.store_name}. Nenhum vínculo, senha ou dado foi alterado.`,
          store_slug: store.slug,
          login_path: '/login'
        });
      }

      const verifier = createVerificationClient();
      const { data: authData, error: authError } = await verifier.auth.signInWithPassword({ email, password });
      if (authError || !authData.user) {
        return NextResponse.json({ error: 'Senha atual incorreta. A transferência não foi realizada.' }, { status: 401 });
      }

      const sameIdentity = existingProfile.auth_user_id
        ? existingProfile.auth_user_id === authData.user.id
        : normalizeEmail(authData.user.email) === normalizeEmail(existingProfile.email);

      if (!sameIdentity) {
        await verifier.auth.signOut().catch(() => undefined);
        return NextResponse.json({ error: 'Não foi possível confirmar a identidade desta conta.' }, { status: 403 });
      }

      const { data: transferResult, error: transferError } = await supabase.rpc('transfer_store_team_member', {
        p_user_id: existingProfile.id,
        p_target_store_id: store.id,
        p_target_role: link.role,
        p_invitation_link_id: link.id
      });

      await verifier.auth.signOut().catch(() => undefined);
      if (transferError) throw transferError;

      if (existingProfile.auth_user_id) {
        await supabase.auth.admin.updateUserById(existingProfile.auth_user_id, {
          user_metadata: {
            ...(authData.user.user_metadata || {}),
            full_name: existingProfile.full_name,
            role: link.role,
            store_id: store.id,
            store_slug: store.slug
          }
        }).catch(() => undefined);
      }

      return NextResponse.json({
        success: true,
        transfer: transferResult,
        login_path: '/login',
        store_slug: store.slug,
        message: `Transferência concluída. Seu acesso agora pertence à equipe da ${store.store_name}.`
      });
    }

    if (existingProfile) {
      return NextResponse.json({
        error: 'Esta conta já existe. Verifique o e-mail para continuar com o fluxo correto.',
        account_state: existingProfile.store_id === store.id ? 'already_member' : 'transfer_required'
      }, { status: 409 });
    }

    const fullName = cleanText(body.full_name, 180);
    const phone = cleanText(body.phone, 40);
    const password = String(body.password || '');
    const passwordConfirmation = String(body.password_confirmation || '');

    if (fullName.length < 3) return NextResponse.json({ error: 'Informe seu nome completo.' }, { status: 400 });
    const passwordError = teamRegistrationPasswordError(password);
    if (passwordError) return NextResponse.json({ error: passwordError }, { status: 400 });
    if (password !== passwordConfirmation) {
      return NextResponse.json({ error: 'A confirmação da senha não confere.' }, { status: 400 });
    }

    if (process.env.VERCEL_ENV === 'preview') {
      return NextResponse.json({
        success: true,
        preview_mode: true,
        message: `Preview de segurança validado para ${fullName}. Nenhuma conta foi criada, o convite não foi consumido e nenhum dado foi alterado.`,
        role_label: storeTeamRoleLabels[link.role as keyof typeof storeTeamRoleLabels],
        store_name: store.store_name
      });
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
    const { data: createdAuth, error: authCreateError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName, phone, role: link.role, store_id: store.id, store_slug: store.slug }
    });

    if (authCreateError || !createdAuth.user) {
      const duplicate = String(authCreateError?.message || '').toLowerCase().includes('already');
      return NextResponse.json({
        error: duplicate ? 'Este e-mail já possui uma conta de acesso.' : authCreateError?.message || 'Não foi possível criar o acesso.'
      }, { status: duplicate ? 409 : 400 });
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
      await supabase.auth.admin.deleteUser(createdAuth.user.id).catch(() => undefined);
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
