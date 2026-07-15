import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

function cleanText(value: unknown) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function slugify(value: string) {
  return cleanText(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '') || 'loja';
}

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

function normalizeUrl(value: string) {
  const text = cleanText(value);
  if (!text) return '';
  if (/^https?:\/\//i.test(text)) return text;
  return `https://${text}`;
}

function isValidVehicleUrl(value: string) {
  return /^https?:\/\/.+/i.test(value);
}

async function getRegistrationContext(supabase: any, token: string) {
  const { data: link, error: linkError } = await supabase
    .from('store_registration_links')
    .select('*')
    .eq('public_token', token)
    .eq('is_active', true)
    .maybeSingle();

  if (linkError || !link) {
    return { error: 'Link de cadastro inválido ou desativado.', link: null, event: null };
  }

  if (link.expires_at && new Date(link.expires_at).getTime() < Date.now()) {
    return { error: 'Link de cadastro expirado.', link: null, event: null };
  }

  const { data: event, error: eventError } = await supabase
    .from('events')
    .select('id,event_name,slug,status,start_date,end_date,store_registration_enabled')
    .eq('id', link.event_id)
    .maybeSingle();

  if (eventError || !event || event.status === 'deleted' || !event.store_registration_enabled) {
    return { error: 'Evento indisponível para cadastro de lojas.', link: null, event: null };
  }

  return { error: '', link, event };
}

async function buildUniqueStoreSlug(supabase: any, storeName: string) {
  const base = slugify(storeName);
  const { data } = await supabase
    .from('stores')
    .select('slug')
    .ilike('slug', `${base}%`);

  const used = new Set((data || []).map((item: any) => item.slug));

  if (!used.has(base)) return base;

  let count = 2;
  while (used.has(`${base}-${count}`)) count += 1;

  return `${base}-${count}`;
}

function safeFileName(name: string) {
  return cleanText(name)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/(^-|-$)+/g, '') || `estoque-${Date.now()}.csv`;
}

async function uploadStockFile(supabase: any, storeId: string, file: File) {
  const name = safeFileName(file.name);
  const extension = name.split('.').pop()?.toLowerCase();

  if (!['csv', 'xml', 'txt'].includes(extension || '')) {
    throw new Error('Arquivo inválido. Envie apenas CSV ou XML.');
  }

  const arrayBuffer = await file.arrayBuffer();
  const filePath = `${storeId}/${Date.now()}-${name}`;
  const contentType = file.type || (extension === 'xml' ? 'application/xml' : 'text/csv');

  const { error } = await supabase.storage
    .from('stock-imports')
    .upload(filePath, arrayBuffer, {
      contentType,
      upsert: true
    });

  if (error) {
    throw new Error(`Erro ao enviar arquivo de estoque: ${error.message}`);
  }

  return {
    fileName: name,
    filePath,
    mimeType: contentType,
    fileSize: file.size || 0
  };
}

export async function GET(request: Request) {
  try {
    const supabase = getAdminClient();
    const token = cleanText(new URL(request.url).searchParams.get('token'));

    if (!token) {
      return NextResponse.json({ error: 'Token não informado.' }, { status: 400 });
    }

    const context = await getRegistrationContext(supabase, token);

    if (context.error) {
      return NextResponse.json({ error: context.error }, { status: 404 });
    }

    return NextResponse.json({
      event: context.event,
      link: {
        title: context.link.title,
        public_token: context.link.public_token
      }
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Erro ao carregar cadastro.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  let createdAuthUserId = '';
  let createdStoreId = '';

  try {
    const supabase = getAdminClient();
    const formData = await request.formData();

    const token = cleanText(formData.get('token'));
    const storeName = cleanText(formData.get('store_name'));
    const responsibleName = cleanText(formData.get('responsible_name'));
    const phone = cleanText(formData.get('phone'));
    const email = cleanText(formData.get('email')).toLowerCase();
    const password = String(formData.get('password') || '');
    const websiteUrl = normalizeUrl(cleanText(formData.get('website_url')));
    const stockFile = formData.get('stock_file') as File | null;

    const vehicleLinks = Array.from({ length: 6 })
      .map((_, index) => normalizeUrl(cleanText(formData.get(`vehicle_url_${index + 1}`))))
      .filter((url) => url && isValidVehicleUrl(url));

    if (!token) {
      return NextResponse.json({ error: 'Link de cadastro inválido.' }, { status: 400 });
    }

    if (!storeName || !responsibleName || !email || !password) {
      return NextResponse.json({ error: 'Preencha nome da loja, responsável, e-mail e senha.' }, { status: 400 });
    }

    if (password.length < 6) {
      return NextResponse.json({ error: 'A senha precisa ter pelo menos 6 caracteres.' }, { status: 400 });
    }

    const context = await getRegistrationContext(supabase, token);

    if (context.error || !context.event || !context.link) {
      return NextResponse.json({ error: context.error || 'Link inválido.' }, { status: 400 });
    }

    const { data: existingUser } = await supabase
      .from('users')
      .select('id,email')
      .ilike('email', email)
      .maybeSingle();

    if (existingUser) {
      return NextResponse.json({ error: 'Este e-mail já possui cadastro no sistema.' }, { status: 409 });
    }

    const slug = await buildUniqueStoreSlug(supabase, storeName);

    const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: responsibleName,
        role: 'store',
        store_name: storeName
      }
    });

    if (authError || !authUser?.user?.id) {
      return NextResponse.json({ error: authError?.message || 'Erro ao criar login da loja.' }, { status: 400 });
    }

    createdAuthUserId = authUser.user.id;

    const { data: store, error: storeError } = await supabase
      .from('stores')
      .insert({
        event_id: context.event.id,
        store_name: storeName,
        slug,
        portal_enabled: true,
        responsible_name: responsibleName,
        responsible_phone: phone || null,
        responsible_email: email,
        website_url: websiteUrl || null,
        registration_source: 'self_registration',
        self_registration_completed_at: new Date().toISOString(),
        event_name_snapshot: context.event.event_name || null,
        event_start_date_snapshot: context.event.start_date || null,
        event_end_date_snapshot: context.event.end_date || null,
        status: 'active'
      })
      .select('*')
      .single();

    if (storeError || !store) {
      await supabase.auth.admin.deleteUser(createdAuthUserId);
      return NextResponse.json({ error: storeError?.message || 'Erro ao cadastrar loja.' }, { status: 400 });
    }

    createdStoreId = store.id;

    const { data: profile, error: profileError } = await supabase
      .from('users')
      .insert({
        auth_user_id: createdAuthUserId,
        full_name: responsibleName,
        email,
        phone: phone || null,
        role: 'store',
        status: 'active',
        store_id: store.id,
        must_change_password: false
      })
      .select('*')
      .single();

    if (profileError || !profile) {
      await supabase.from('stores').update({ status: 'deleted' }).eq('id', createdStoreId);
      await supabase.auth.admin.deleteUser(createdAuthUserId);
      return NextResponse.json({ error: profileError?.message || 'Erro ao vincular usuário à loja.' }, { status: 400 });
    }

    if (vehicleLinks.length) {
      await supabase.from('store_vehicle_link_submissions').insert(
        vehicleLinks.map((url, index) => ({
          event_id: context.event.id,
          store_id: store.id,
          submitted_by_user_id: profile.id,
          position: index + 1,
          vehicle_url: url,
          status: 'pending',
          metadata: {
            source: 'store_self_registration'
          }
        }))
      );
    }

    if (stockFile && stockFile.size > 0) {
      const uploaded = await uploadStockFile(supabase, store.id, stockFile);

      await supabase.from('store_stock_imports').insert({
        event_id: context.event.id,
        store_id: store.id,
        submitted_by_user_id: profile.id,
        file_name: uploaded.fileName,
        file_path: uploaded.filePath,
        mime_type: uploaded.mimeType,
        file_size_bytes: uploaded.fileSize,
        status: 'pending',
        metadata: {
          source: 'store_self_registration'
        }
      });
    }

    await supabase
      .from('store_registration_links')
      .update({
        usage_count: Number(context.link.usage_count || 0) + 1,
        updated_at: new Date().toISOString()
      })
      .eq('id', context.link.id);

    const loginUrl = `/login?redirectedFrom=${encodeURIComponent(`/loja/${store.slug}`)}`;

    return NextResponse.json({
      success: true,
      store_slug: store.slug,
      login_url: loginUrl
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Erro ao finalizar cadastro da loja.' }, { status: 500 });
  }
}
