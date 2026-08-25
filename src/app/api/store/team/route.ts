import { createHash, randomBytes } from 'crypto';
import { NextResponse } from 'next/server';
import {
  cleanText,
  createAdminClient,
  getProfileFromToken,
  isStoreTeamRole,
  normalizeEmail,
  publicAppUrl,
  readBearerToken,
  resolveManagedStore,
  storeTeamRoleLabels
} from '@/lib/server/storeTeam';
import { enforceRateLimit } from '@/lib/server/rateLimit';

export const runtime = 'nodejs';

const memberStatuses = ['pending', 'active', 'paused', 'inactive'] as const;

type MemberStatus = (typeof memberStatuses)[number];

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

function parseNullablePositiveInteger(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

function parseRoutingOrder(value: unknown) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) return 0;
  return Math.min(parsed, 9999);
}

function createBootstrapSecret() {
  return `Bootstrap#${randomBytes(24).toString('base64url')}aA1!`;
}

function recoveryRedirectUrl(request: Request) {
  return `${publicAppUrl(request).replace(/\/$/, '')}/redefinir-senha`;
}

async function loadTeam(supabase: any, store: any, request: Request) {
  const [{ data: members, error: membersError }, { data: links, error: linksError }] = await Promise.all([
    supabase
      .from('users')
      .select('id, auth_user_id, full_name, email, phone, role, status, receives_leads, routing_order, max_open_leads, must_change_password, created_at, updated_at')
      .eq('store_id', store.id)
      .in('role', ['pre_sales', 'seller', 'prospector'])
      .order('role', { ascending: true })
      .order('routing_order', { ascending: true })
      .order('full_name', { ascending: true }),
    supabase
      .from('store_team_registration_links')
      .select('id, role, status, expires_at, usage_count, max_uses, last_used_at, created_at')
      .eq('store_id', store.id)
      .order('created_at', { ascending: false })
  ]);

  if (membersError) throw membersError;
  if (linksError) throw linksError;

  return {
    store: {
      id: store.id,
      store_name: store.store_name,
      slug: store.slug
    },
    members: members || [],
    links: (links || []).map((link: any) => ({
      ...link,
      role_label: storeTeamRoleLabels[link.role as keyof typeof storeTeamRoleLabels] || link.role,
      registration_url: null
    }))
  };
}

async function getManagerContext(request: Request, slug: string) {
  const supabase: any = createAdminClient();
  const token = readBearerToken(request);

  if (!token) {
    return { error: NextResponse.json({ error: 'Sessão não encontrada.' }, { status: 401 }) } as const;
  }

  const profile = await getProfileFromToken(supabase, token);

  if (!profile || profile.status !== 'active' || !['master', 'store'].includes(profile.role)) {
    return { error: NextResponse.json({ error: 'Somente o Gestor da loja ou Master pode administrar a equipe.' }, { status: 403 }) } as const;
  }

  const store = await resolveManagedStore(supabase, profile, slug);

  if (!store) {
    return { error: NextResponse.json({ error: 'Loja não encontrada ou sem permissão.' }, { status: 403 }) } as const;
  }

  return { supabase, profile, store } as const;
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const slug = cleanText(url.searchParams.get('slug'), 160);

    if (!slug) {
      return NextResponse.json({ error: 'Informe a loja.' }, { status: 400 });
    }

    const context = await getManagerContext(request, slug);
    if ('error' in context) return context.error;

    return NextResponse.json(await loadTeam(context.supabase, context.store, request));
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Erro ao carregar equipe.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const slug = cleanText(body.slug, 160);
    const action = cleanText(body.action, 80);

    if (!slug || !action) {
      return NextResponse.json({ error: 'Informe loja e ação.' }, { status: 400 });
    }

    const context = await getManagerContext(request, slug);
    if ('error' in context) return context.error;

    const { supabase, profile, store } = context;

    if (action === 'create_member') {
      const fullName = cleanText(body.full_name, 180);
      const email = normalizeEmail(body.email);
      const phone = cleanText(body.phone, 40);
      const role = cleanText(body.role, 40);
      const receivesLeads = Boolean(body.receives_leads);
      const routingOrder = parseRoutingOrder(body.routing_order);
      const maxOpenLeads = parseNullablePositiveInteger(body.max_open_leads);

      if (fullName.length < 3) {
        return NextResponse.json({ error: 'Informe o nome completo do colaborador.' }, { status: 400 });
      }

      if (!email || !email.includes('@')) {
        return NextResponse.json({ error: 'Informe um e-mail válido.' }, { status: 400 });
      }

      if (!isStoreTeamRole(role)) {
        return NextResponse.json({ error: 'Selecione Pré-vendas, Vendedor ou Prospectador.' }, { status: 400 });
      }

      if (process.env.VERCEL_ENV === 'preview') {
        return NextResponse.json({
          success: true,
          preview_mode: true,
          message: `Preview validado para ${fullName}. Nenhum usuário foi criado e nenhum e-mail real foi enviado.`,
          role_label: storeTeamRoleLabels[role],
          credential_delivery: 'email'
        });
      }

      const { data: existingProfile, error: profileLookupError } = await supabase
        .from('users')
        .select('id')
        .ilike('email', email)
        .maybeSingle();

      if (profileLookupError) throw profileLookupError;
      if (existingProfile) {
        return NextResponse.json({ error: 'Já existe um usuário cadastrado com este e-mail.' }, { status: 409 });
      }

      const bootstrapSecret = createBootstrapSecret();
      const { data: createdAuth, error: authError } = await supabase.auth.admin.createUser({
        email,
        password: bootstrapSecret,
        email_confirm: true,
        user_metadata: {
          full_name: fullName,
          phone,
          role,
          store_id: store.id,
          store_slug: store.slug,
          created_manually: true
        }
      });

      if (authError || !createdAuth.user) {
        const duplicate = String(authError?.message || '').toLowerCase().includes('already');
        return NextResponse.json(
          { error: duplicate ? 'Este e-mail já possui uma conta de acesso.' : authError?.message || 'Não foi possível criar o acesso.' },
          { status: duplicate ? 409 : 400 }
        );
      }

      const { data: member, error: memberError } = await supabase
        .from('users')
        .insert({
          auth_user_id: createdAuth.user.id,
          full_name: fullName,
          email,
          phone: phone || null,
          role,
          store_id: store.id,
          status: 'active',
          receives_leads: receivesLeads,
          routing_order: routingOrder,
          max_open_leads: maxOpenLeads,
          must_change_password: true
        })
        .select('id, auth_user_id, full_name, email, phone, role, status, receives_leads, routing_order, max_open_leads, must_change_password, created_at')
        .single();

      if (memberError || !member) {
        await supabase.auth.admin.deleteUser(createdAuth.user.id).catch(() => undefined);
        throw memberError || new Error('Não foi possível criar o perfil do colaborador.');
      }

      if (role === 'prospector') {
        const { error: prospectorError } = await supabase.from('prospectors').insert({
          user_id: member.id,
          store_id: store.id,
          event_id: store.event_id,
          full_name: fullName,
          email,
          phone: phone || null,
          status: 'active'
        });

        if (prospectorError) {
          await supabase.from('users').delete().eq('id', member.id);
          await supabase.auth.admin.deleteUser(createdAuth.user.id).catch(() => undefined);
          throw prospectorError;
        }
      }

      const { error: recoveryError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: recoveryRedirectUrl(request)
      });

      if (recoveryError) {
        if (role === 'prospector') {
          await supabase.from('prospectors').delete().eq('user_id', member.id).eq('store_id', store.id).catch(() => undefined);
        }
        await supabase.from('users').delete().eq('id', member.id).eq('store_id', store.id).catch(() => undefined);
        await supabase.auth.admin.deleteUser(createdAuth.user.id).catch(() => undefined);
        return NextResponse.json({ error: 'Não foi possível enviar o acesso confidencial. Nenhuma conta foi mantida.' }, { status: 502 });
      }

      await Promise.allSettled([
        supabase.from('audit_logs').insert({
          event_id: store.event_id || null,
          action_type: 'team_member_created',
          entity_type: 'users',
          entity_id: member.id,
          new_value: {
            store_id: store.id,
            role,
            status: 'active',
            receives_leads: receivesLeads,
            created_by_user_id: profile.id,
            created_manually: true,
            credential_delivery: 'email'
          }
        }),
        supabase.from('audit_logs').insert({
          event_id: store.event_id || null,
          action_type: 'password_recovery_requested',
          entity_type: 'users',
          entity_id: member.id,
          new_value: {
            store_id: store.id,
            role,
            requested_by_user_id: profile.id,
            source: 'manager_invite',
            channel: 'email'
          }
        })
      ]);

      return NextResponse.json({
        success: true,
        message: `${fullName} foi adicionado à equipe. O próprio colaborador recebeu no e-mail o link confidencial para definir a senha.`,
        member,
        role_label: storeTeamRoleLabels[role],
        credential_delivery: 'email'
      });
    }

    if (action === 'generate_link') {
      const role = cleanText(body.role, 40);

      if (!isStoreTeamRole(role)) {
        return NextResponse.json({ error: 'Cargo inválido.' }, { status: 400 });
      }

      const expiresDaysRaw = Number(body.expires_days || 30);
      const expiresDays = Number.isFinite(expiresDaysRaw)
        ? Math.max(1, Math.min(365, Math.trunc(expiresDaysRaw)))
        : 30;
      const expiresAt = new Date(Date.now() + expiresDays * 24 * 60 * 60 * 1000).toISOString();
      const token = randomBytes(32).toString('base64url');

      const { error: revokeError } = await supabase
        .from('store_team_registration_links')
        .update({ status: 'revoked', updated_at: new Date().toISOString() })
        .eq('store_id', store.id)
        .eq('role', role)
        .eq('status', 'active');

      if (revokeError) throw revokeError;

      const { data: inserted, error: insertError } = await supabase
        .from('store_team_registration_links')
        .insert({
          store_id: store.id,
          role,
          token: null,
          token_hash: hashToken(token),
          status: 'active',
          expires_at: expiresAt,
          created_by_user_id: profile.id
        })
        .select('id, role, status, expires_at, usage_count, max_uses, last_used_at, created_at')
        .single();

      if (insertError) throw insertError;

      return NextResponse.json({
        success: true,
        link: {
          ...inserted,
          role_label: storeTeamRoleLabels[role],
          registration_url: `${publicAppUrl(request)}/equipe/cadastro/${token}`
        }
      });
    }

    if (action === 'revoke_link') {
      const linkId = cleanText(body.link_id, 80);

      if (!linkId) {
        return NextResponse.json({ error: 'Informe o link.' }, { status: 400 });
      }

      const { error } = await supabase
        .from('store_team_registration_links')
        .update({ status: 'revoked', updated_at: new Date().toISOString() })
        .eq('id', linkId)
        .eq('store_id', store.id);

      if (error) throw error;

      return NextResponse.json({ success: true });
    }

    if (action === 'send_password_recovery') {
      const memberId = cleanText(body.member_id, 80);
      if (!memberId) return NextResponse.json({ error: 'Informe o colaborador.' }, { status: 400 });

      const { data: member, error: memberError } = await supabase
        .from('users')
        .select('id,auth_user_id,full_name,email,role,store_id,status')
        .eq('id', memberId)
        .eq('store_id', store.id)
        .in('role', ['pre_sales', 'seller', 'prospector'])
        .maybeSingle();

      if (memberError) throw memberError;
      if (!member) return NextResponse.json({ error: 'Colaborador não pertence a esta loja.' }, { status: 404 });
      if (!member.auth_user_id || !member.email) {
        return NextResponse.json({ error: 'Este colaborador ainda não possui uma conta de acesso válida.' }, { status: 409 });
      }

      if (process.env.VERCEL_ENV === 'preview') {
        return NextResponse.json({
          success: true,
          preview_mode: true,
          message: `Preview validado para ${member.full_name}. Nenhum e-mail real foi enviado.`
        });
      }

      await enforceRateLimit(request, `password-recovery-manager:${profile.id}`, 10, 60 * 60);
      const { error: recoveryError } = await supabase.auth.resetPasswordForEmail(member.email, {
        redirectTo: recoveryRedirectUrl(request)
      });
      if (recoveryError) {
        return NextResponse.json({ error: 'Não foi possível enviar a recuperação agora. Tente novamente.' }, { status: 502 });
      }

      await Promise.allSettled([
        supabase.from('audit_logs').insert({
          event_id: store.event_id || null,
          action_type: 'password_recovery_requested',
          entity_type: 'users',
          entity_id: member.id,
          new_value: {
            store_id: store.id,
            role: member.role,
            requested_by_user_id: profile.id,
            source: 'manager',
            channel: 'email'
          }
        })
      ]);

      return NextResponse.json({
        success: true,
        message: `Instruções de recuperação enviadas para o e-mail cadastrado de ${member.full_name}.`
      });
    }

    if (action === 'update_member') {
      const memberId = cleanText(body.member_id, 80);
      const status = cleanText(body.status, 30) as MemberStatus;

      if (!memberId || !memberStatuses.includes(status)) {
        return NextResponse.json({ error: 'Colaborador ou status inválido.' }, { status: 400 });
      }

      const { data: member, error: memberError } = await supabase
        .from('users')
        .select('id, full_name, email, phone, role, store_id, status')
        .eq('id', memberId)
        .eq('store_id', store.id)
        .in('role', ['pre_sales', 'seller', 'prospector'])
        .maybeSingle();

      if (memberError) throw memberError;
      if (!member) {
        return NextResponse.json({ error: 'Colaborador não pertence a esta loja.' }, { status: 404 });
      }

      const receivesLeads = status === 'active' && Boolean(body.receives_leads);
      const routingOrder = parseRoutingOrder(body.routing_order);
      const maxOpenLeads = parseNullablePositiveInteger(body.max_open_leads);

      const { error: updateError } = await supabase
        .from('users')
        .update({
          status,
          receives_leads: receivesLeads,
          routing_order: routingOrder,
          max_open_leads: maxOpenLeads,
          updated_at: new Date().toISOString()
        })
        .eq('id', member.id)
        .eq('store_id', store.id);

      if (updateError) throw updateError;

      if (member.role === 'prospector') {
        const { data: prospector } = await supabase
          .from('prospectors')
          .select('id')
          .eq('user_id', member.id)
          .maybeSingle();

        const prospectorStatus = status === 'active' ? 'active' : 'inactive';

        if (prospector) {
          const { error } = await supabase
            .from('prospectors')
            .update({
              store_id: store.id,
              event_id: store.event_id,
              full_name: member.full_name,
              email: member.email,
              phone: member.phone,
              status: prospectorStatus,
              updated_at: new Date().toISOString()
            })
            .eq('id', prospector.id);

          if (error) throw error;
        } else if (status === 'active') {
          const { error } = await supabase.from('prospectors').insert({
            user_id: member.id,
            store_id: store.id,
            event_id: store.event_id,
            full_name: member.full_name,
            email: member.email,
            phone: member.phone,
            status: 'active'
          });

          if (error) throw error;
        }
      }

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Ação não reconhecida.' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Erro ao administrar equipe.' }, { status: 500 });
  }
}
