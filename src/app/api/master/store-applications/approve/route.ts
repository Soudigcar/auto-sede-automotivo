import { randomInt } from 'crypto';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { officialStoreLoginUrl, storeLoginPath } from '@/lib/publicRoutes';

export const runtime = 'nodejs';

function clean(value: unknown, maxLength = 500) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function email(value: unknown) {
  return clean(value, 180).toLowerCase();
}

function digits(value: unknown) {
  return clean(value, 40).replace(/\D/g, '');
}

function slugify(value: string) {
  return clean(value, 160).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '') || 'loja';
}

function temporaryPassword() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  let suffix = '';
  for (let index = 0; index < 10; index += 1) suffix += alphabet[randomInt(0, alphabet.length)];
  return `Auto@${randomInt(1000, 9999)}${suffix}`;
}

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !serviceKey) throw new Error('Configuração do servidor incompleta.');
  return createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function masterProfile(supabase: any, token: string) {
  const { data } = await supabase.auth.getUser(token);
  if (!data.user) return null;
  const { data: profile } = await supabase.from('users').select('*').eq('auth_user_id', data.user.id).maybeSingle();
  if (!profile || profile.role !== 'master' || profile.status !== 'active') return null;
  return profile;
}

async function uniqueSlug(supabase: any, name: string) {
  const base = slugify(name);
  const { data } = await supabase.from('stores').select('slug').ilike('slug', `${base}%`);
  const used = new Set((data || []).map((item: any) => item.slug));
  if (!used.has(base)) return base;
  let count = 2;
  while (used.has(`${base}-${count}`)) count += 1;
  return `${base}-${count}`;
}

async function findAuthUser(supabase: any, targetEmail: string) {
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 100 });
    if (error) throw error;
    const found = (data.users || []).find((item: any) => email(item.email) === targetEmail);
    if (found) return found;
    if ((data.users || []).length < 100) break;
  }
  return null;
}

export async function POST(request: Request) {
  let createdStoreId = '';
  let createdAuthUserId = '';

  try {
    const supabase = getAdminClient();
    const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
    const master = await masterProfile(supabase, token);
    if (!master) return NextResponse.json({ error: 'Apenas o usuário master pode aprovar lojas.' }, { status: 403 });

    const body = await request.json();
    const applicationId = clean(body.application_id, 80);
    if (!applicationId) return NextResponse.json({ error: 'Solicitação obrigatória.' }, { status: 400 });

    const { data: application, error: applicationError } = await supabase
      .from('store_portal_applications')
      .select('*')
      .eq('id', applicationId)
      .maybeSingle();

    if (applicationError || !application) return NextResponse.json({ error: 'Solicitação não encontrada.' }, { status: 404 });
    if (!['pending', 'reviewing'].includes(application.status)) return NextResponse.json({ error: 'Esta solicitação já foi finalizada.' }, { status: 409 });

    const applicationEmail = email(application.responsible_email);
    const applicationCnpj = digits(application.cnpj);
    const { data: currentStores } = await supabase.from('stores').select('*').neq('status', 'deleted');
    const existingStore = (currentStores || []).find((store: any) => email(store.responsible_email) === applicationEmail || Boolean(applicationCnpj && digits(store.cnpj) === applicationCnpj));

    if (existingStore) {
      await supabase.from('stores').update({
        legal_name: application.legal_name || existingStore.legal_name,
        cnpj: applicationCnpj || existingStore.cnpj,
        responsible_name: application.responsible_name || existingStore.responsible_name,
        responsible_phone: application.responsible_phone || existingStore.responsible_phone,
        state: application.state || existingStore.state,
        city: application.city || existingStore.city,
        address_text: application.address_text || existingStore.address_text,
        website_url: application.website_url || existingStore.website_url,
        instagram_url: application.instagram_url || existingStore.instagram_url,
        portal_enabled: true,
        status: 'active',
        updated_at: new Date().toISOString()
      }).eq('id', existingStore.id);

      await supabase.from('store_portal_applications').update({
        status: 'approved',
        approved_store_id: existingStore.id,
        reviewed_by: master.id,
        reviewed_at: new Date().toISOString(),
        review_notes: 'Solicitação vinculada a uma loja permanente já existente.',
        updated_at: new Date().toISOString()
      }).eq('id', application.id);

      return NextResponse.json({ success: true, existing_store: true, store_id: existingStore.id, store_name: existingStore.store_name });
    }

    const slug = await uniqueSlug(supabase, application.store_name);
    const { data: store, error: storeError } = await supabase.from('stores').insert({
      event_id: null,
      store_name: application.store_name,
      legal_name: application.legal_name || null,
      cnpj: applicationCnpj || null,
      responsible_name: application.responsible_name,
      responsible_phone: application.responsible_phone,
      responsible_email: applicationEmail,
      state: application.state || null,
      city: application.city || null,
      address_text: application.address_text || null,
      website_url: application.website_url || null,
      instagram_url: application.instagram_url || null,
      slug,
      portal_enabled: true,
      registration_source: 'portal_application',
      status: 'active'
    }).select('*').single();

    if (storeError || !store) return NextResponse.json({ error: storeError?.message || 'Erro ao criar loja permanente.' }, { status: 400 });
    createdStoreId = store.id;

    const password = temporaryPassword();
    let authUser = await findAuthUser(supabase, applicationEmail);

    if (authUser) {
      const { data, error } = await supabase.auth.admin.updateUserById(authUser.id, {
        password,
        email_confirm: true,
        user_metadata: { role: 'store', store_id: store.id, store_name: store.store_name }
      });
      if (error) throw error;
      authUser = data.user;
    } else {
      const { data, error } = await supabase.auth.admin.createUser({
        email: applicationEmail,
        password,
        email_confirm: true,
        user_metadata: { role: 'store', store_id: store.id, store_name: store.store_name }
      });
      if (error || !data.user) throw error || new Error('Erro ao criar usuário da loja.');
      authUser = data.user;
      createdAuthUserId = authUser.id;
    }

    const { data: existingProfile } = await supabase.from('users').select('*').ilike('email', applicationEmail).maybeSingle();
    const profilePayload = {
      auth_user_id: authUser.id,
      full_name: application.responsible_name,
      email: applicationEmail,
      phone: application.responsible_phone || null,
      role: 'store',
      status: 'active',
      store_id: store.id,
      must_change_password: true,
      updated_at: new Date().toISOString()
    };

    const profileResult = existingProfile
      ? await supabase.from('users').update(profilePayload).eq('id', existingProfile.id)
      : await supabase.from('users').insert(profilePayload);

    if (profileResult.error) throw profileResult.error;

    await supabase.from('store_portal_applications').update({
      status: 'approved',
      approved_store_id: store.id,
      reviewed_by: master.id,
      reviewed_at: new Date().toISOString(),
      review_notes: clean(body.review_notes, 1000) || null,
      updated_at: new Date().toISOString()
    }).eq('id', application.id);

    const loginPath = storeLoginPath(store.slug);

    return NextResponse.json({
      success: true,
      existing_store: false,
      store_id: store.id,
      store_name: store.store_name,
      email: applicationEmail,
      password,
      login_path: loginPath,
      login_url: officialStoreLoginUrl(store.slug)
    });
  } catch (error: any) {
    const supabase = getAdminClient();
    if (createdStoreId) await supabase.from('stores').update({ status: 'deleted', portal_enabled: false }).eq('id', createdStoreId);
    if (createdAuthUserId) await supabase.auth.admin.deleteUser(createdAuthUserId);
    return NextResponse.json({ error: error?.message || 'Erro ao aprovar solicitação.' }, { status: 500 });
  }
}
