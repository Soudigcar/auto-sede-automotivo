import { NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { enforceRateLimit } from '@/lib/server/rateLimit';
import { contentLengthExceeds, publicError } from '@/lib/server/requestSecurity';

export const runtime = 'nodejs';

function cleanText(value: unknown, maxLength = 500) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function normalizeEmail(value: unknown) {
  return cleanText(value).toLowerCase();
}

function slugify(value: string) {
  return cleanText(value).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '') || 'loja';
}

function serverConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  if (!url || !serviceKey || !anonKey) throw new Error('Supabase não configurado no servidor.');
  return { url, serviceKey, anonKey };
}

function getAdminClient() {
  const config = serverConfig();
  return createClient(config.url, config.serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

function getPasswordClient() {
  const config = serverConfig();
  return createClient(config.url, config.anonKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
}

function normalizeUrl(value: string) {
  const text = cleanText(value, 500);
  if (!text) return '';
  try {
    const url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return '';
    return url.toString();
  } catch {
    return '';
  }
}

function isValidVehicleUrl(value: string) {
  return /^https?:\/\/.+/i.test(value);
}

async function getRegistrationContext(supabase: any, token: string) {
  const tokenHash = createHash('sha256').update(token).digest('hex');
  const { data: link, error: linkError } = await supabase.from('store_registration_links').select('*').eq('public_token_hash', tokenHash).eq('is_active', true).maybeSingle();
  if (linkError || !link) return { error: 'Link de cadastro inválido ou desativado.', link: null, event: null };
  if (link.expires_at && new Date(link.expires_at).getTime() < Date.now()) return { error: 'Link de cadastro expirado.', link: null, event: null };

  const { data: event, error: eventError } = await supabase.from('events').select('id,event_name,slug,status,start_date,end_date,state,city,store_registration_enabled').eq('id', link.event_id).maybeSingle();
  if (eventError || !event || event.status === 'deleted' || !event.store_registration_enabled) return { error: 'Evento indisponível para cadastro de lojas.', link: null, event: null };
  return { error: '', link, event };
}

async function buildUniqueStoreSlug(supabase: any, storeName: string) {
  const base = slugify(storeName);
  const { data } = await supabase.from('stores').select('slug').ilike('slug', `${base}%`);
  const used = new Set((data || []).map((item: any) => item.slug));
  if (!used.has(base)) return base;
  let count = 2;
  while (used.has(`${base}-${count}`)) count += 1;
  return `${base}-${count}`;
}

function safeFileName(name: string) {
  return cleanText(name).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9._-]+/g, '-').replace(/(^-|-$)+/g, '') || `estoque-${Date.now()}.csv`;
}

async function uploadStockFile(supabase: any, storeId: string, file: File) {
  const name = safeFileName(file.name);
  const extension = name.split('.').pop()?.toLowerCase();
  if (!['csv', 'xml', 'txt'].includes(extension || '')) throw new Error('Arquivo inválido. Envie apenas CSV ou XML.');
  if (file.size <= 0 || file.size > 10 * 1024 * 1024) throw new Error('O arquivo deve ter no máximo 10 MB.');
  const arrayBuffer = await file.arrayBuffer();
  if (new Uint8Array(arrayBuffer.slice(0, 4096)).includes(0)) throw new Error('O arquivo contém conteúdo binário não permitido.');
  const filePath = `${storeId}/${Date.now()}-${name}`;
  const contentType = file.type || (extension === 'xml' ? 'application/xml' : 'text/csv');
  const { error } = await supabase.storage.from('stock-imports').upload(filePath, arrayBuffer, { contentType, upsert: true });
  if (error) throw new Error(`Erro ao enviar arquivo de estoque: ${error.message}`);
  return { fileName: name, filePath, mimeType: contentType, fileSize: file.size || 0 };
}

async function upsertParticipation(supabase: any, storeId: string, event: any) {
  const { error } = await supabase.from('store_event_participations').upsert({
    store_id: storeId,
    event_id: event.id,
    status: 'active',
    source: 'event_link',
    joined_at: new Date().toISOString(),
    ended_at: null,
    event_name_snapshot: event.event_name || null,
    event_start_date_snapshot: event.start_date || null,
    event_end_date_snapshot: event.end_date || null,
    event_state_snapshot: event.state || null,
    event_city_snapshot: event.city || null,
    updated_at: new Date().toISOString()
  }, { onConflict: 'store_id,event_id' });
  if (error) throw error;
}

async function saveEventMaterials(supabase: any, context: any, store: any, profile: any, vehicleLinks: string[], stockFile: File | null) {
  if (vehicleLinks.length) {
    const rows = vehicleLinks.map((url, index) => ({ event_id: context.event.id, store_id: store.id, submitted_by_user_id: profile.id, position: index + 1, vehicle_url: url, status: 'pending', metadata: { source: 'store_event_registration' } }));
    const { error } = await supabase.from('store_vehicle_link_submissions').insert(rows);
    if (error) throw error;
  }

  if (stockFile && stockFile.size > 0) {
    const uploaded = await uploadStockFile(supabase, store.id, stockFile);
    const { error } = await supabase.from('store_stock_imports').insert({ event_id: context.event.id, store_id: store.id, submitted_by_user_id: profile.id, file_name: uploaded.fileName, file_path: uploaded.filePath, mime_type: uploaded.mimeType, file_size_bytes: uploaded.fileSize, status: 'pending', metadata: { source: 'store_event_registration' } });
    if (error) throw error;
  }
}

async function incrementUsage(supabase: any, link: any) {
  await supabase.from('store_registration_links').update({ usage_count: Number(link.usage_count || 0) + 1, updated_at: new Date().toISOString() }).eq('id', link.id);
}

export async function GET(request: Request) {
  try {
    const supabase = getAdminClient();
    const token = cleanText(new URL(request.url).searchParams.get('token'));
    if (!token) return NextResponse.json({ error: 'Token não informado.' }, { status: 400 });
    const context = await getRegistrationContext(supabase, token);
    if (context.error) return NextResponse.json({ error: context.error }, { status: 404 });
    return NextResponse.json({ event: context.event, link: { title: context.link.title } });
  } catch (error: unknown) {
    const failure = publicError(error, 'Erro ao carregar cadastro.');
    return NextResponse.json({ error: failure.message }, { status: failure.status });
  }
}

export async function POST(request: Request) {
  let createdAuthUserId = '';
  let createdStoreId = '';

  try {
    const origin = request.headers.get('origin');
    if (origin && origin !== new URL(request.url).origin) {
      return NextResponse.json({ error: 'Origem não autorizada.' }, { status: 403 });
    }
    if (contentLengthExceeds(request, 12 * 1024 * 1024)) {
      return NextResponse.json({ error: 'Solicitação acima do limite permitido.' }, { status: 413 });
    }
    await enforceRateLimit(request, 'store-self-registration', 10, 60 * 60);
    const supabase = getAdminClient();
    const formData = await request.formData();
    const token = cleanText(formData.get('token'), 220);
    const storeName = cleanText(formData.get('store_name'), 160);
    const responsibleName = cleanText(formData.get('responsible_name'), 160);
    const phone = cleanText(formData.get('phone'), 40);
    const email = normalizeEmail(formData.get('email'));
    const password = String(formData.get('password') || '');
    const websiteUrl = normalizeUrl(cleanText(formData.get('website_url')));
    const stockFile = formData.get('stock_file') as File | null;
    const vehicleLinks = Array.from({ length: 6 }).map((_, index) => normalizeUrl(cleanText(formData.get(`vehicle_url_${index + 1}`)))).filter((url) => url && isValidVehicleUrl(url));

    if (!token) return NextResponse.json({ error: 'Link de cadastro inválido.' }, { status: 400 });
    if (!storeName || !responsibleName || !email || !password) return NextResponse.json({ error: 'Preencha nome da loja, responsável, e-mail e senha.' }, { status: 400 });
    if (password.length < 12 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
      return NextResponse.json({ error: 'Use ao menos 12 caracteres, com maiúscula, minúscula, número e símbolo.' }, { status: 400 });
    }

    const context = await getRegistrationContext(supabase, token);
    if (context.error || !context.event || !context.link) return NextResponse.json({ error: context.error || 'Link inválido.' }, { status: 400 });

    const { data: existingProfile } = await supabase.from('users').select('*').ilike('email', email).maybeSingle();
    const { data: existingStoreByEmail } = await supabase.from('stores').select('*').ilike('responsible_email', email).neq('status', 'deleted').maybeSingle();

    if (existingProfile || existingStoreByEmail) {
      if (!existingProfile?.auth_user_id || !existingProfile?.store_id || !existingStoreByEmail || existingProfile.store_id !== existingStoreByEmail.id) {
        return NextResponse.json({ error: 'A loja já existe, mas o acesso precisa ser revisado pelo master.' }, { status: 409 });
      }

      const passwordClient = getPasswordClient();
      const { data: signIn, error: signInError } = await passwordClient.auth.signInWithPassword({ email, password });
      await passwordClient.auth.signOut();

      if (signInError || !signIn.user || signIn.user.id !== existingProfile.auth_user_id) {
        return NextResponse.json({ error: 'Esta loja já possui cadastro. Informe a senha atual para confirmar a participação.' }, { status: 401 });
      }

      const { data: store, error: storeError } = await supabase.from('stores').update({
        store_name: storeName,
        responsible_name: responsibleName,
        responsible_phone: phone || null,
        website_url: websiteUrl || existingStoreByEmail.website_url || null,
        portal_enabled: true,
        status: 'active',
        updated_at: new Date().toISOString()
      }).eq('id', existingStoreByEmail.id).select('*').single();
      if (storeError || !store) throw storeError || new Error('Erro ao atualizar loja permanente.');

      await upsertParticipation(supabase, store.id, context.event);
      await saveEventMaterials(supabase, context, store, existingProfile, vehicleLinks, stockFile);
      await incrementUsage(supabase, context.link);

      const loginUrl = `/login?redirectedFrom=${encodeURIComponent(`/loja/${store.slug}`)}`;
      return NextResponse.json({ success: true, existing_store: true, event_name: context.event.event_name, store_slug: store.slug, login_url: loginUrl });
    }

    const slug = await buildUniqueStoreSlug(supabase, storeName);
    const { data: authUser, error: authError } = await supabase.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: responsibleName, role: 'store', store_name: storeName } });
    if (authError || !authUser?.user?.id) return NextResponse.json({ error: authError?.message || 'Erro ao criar login da loja.' }, { status: 400 });
    createdAuthUserId = authUser.user.id;

    const { data: store, error: storeError } = await supabase.from('stores').insert({
      event_id: null,
      store_name: storeName,
      slug,
      portal_enabled: true,
      responsible_name: responsibleName,
      responsible_phone: phone || null,
      responsible_email: email,
      website_url: websiteUrl || null,
      registration_source: 'self_registration',
      self_registration_completed_at: new Date().toISOString(),
      status: 'active'
    }).select('*').single();

    if (storeError || !store) {
      await supabase.auth.admin.deleteUser(createdAuthUserId);
      return NextResponse.json({ error: storeError?.message || 'Erro ao cadastrar loja.' }, { status: 400 });
    }
    createdStoreId = store.id;

    const { data: profile, error: profileError } = await supabase.from('users').insert({ auth_user_id: createdAuthUserId, full_name: responsibleName, email, phone: phone || null, role: 'store', status: 'active', store_id: store.id, must_change_password: false }).select('*').single();
    if (profileError || !profile) {
      await supabase.from('stores').update({ status: 'deleted', portal_enabled: false }).eq('id', createdStoreId);
      await supabase.auth.admin.deleteUser(createdAuthUserId);
      return NextResponse.json({ error: profileError?.message || 'Erro ao vincular usuário à loja.' }, { status: 400 });
    }

    await upsertParticipation(supabase, store.id, context.event);
    await saveEventMaterials(supabase, context, store, profile, vehicleLinks, stockFile);
    await incrementUsage(supabase, context.link);

    const loginUrl = `/login?redirectedFrom=${encodeURIComponent(`/loja/${store.slug}`)}`;
    return NextResponse.json({ success: true, existing_store: false, event_name: context.event.event_name, store_slug: store.slug, login_url: loginUrl });
  } catch (error: unknown) {
    const supabase = getAdminClient();
    if (createdStoreId) await supabase.from('stores').update({ status: 'deleted', portal_enabled: false }).eq('id', createdStoreId);
    if (createdAuthUserId) await supabase.auth.admin.deleteUser(createdAuthUserId);
    const failure = publicError(error, 'Erro ao finalizar cadastro da loja.');
    return NextResponse.json({ error: failure.message }, { status: failure.status });
  }
}
