import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

function cleanText(value: unknown) {
  return String(value || '').replace(/\s+/g, ' ').trim();
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

function safeFileName(name: string) {
  return cleanText(name)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/(^-|-$)+/g, '') || `estoque-${Date.now()}.csv`;
}

async function getAuthorizedStore(request: Request, expectedSlug?: string) {
  const supabase = getAdminClient();
  const authorization = request.headers.get('authorization') || '';
  const token = authorization.replace(/^Bearer\s+/i, '').trim();

  if (!token) {
    return { error: 'Sessão não encontrada.', status: 401, supabase, profile: null, store: null };
  }

  const { data: authData, error: authError } = await supabase.auth.getUser(token);

  if (authError || !authData.user) {
    return { error: 'Sessão inválida. Faça login novamente.', status: 401, supabase, profile: null, store: null };
  }

  let profile: any = null;

  const { data: byAuth } = await supabase
    .from('users')
    .select('*')
    .eq('auth_user_id', authData.user.id)
    .maybeSingle();

  profile = byAuth;

  if (!profile && authData.user.email) {
    const { data: byEmail } = await supabase
      .from('users')
      .select('*')
      .ilike('email', authData.user.email)
      .maybeSingle();

    profile = byEmail;
  }

  if (!profile || profile.status !== 'active' || profile.role !== 'store' || !profile.store_id) {
    return { error: 'Usuário de loja não autorizado.', status: 403, supabase, profile: null, store: null };
  }

  const { data: store } = await supabase
    .from('stores')
    .select('*')
    .eq('id', profile.store_id)
    .eq('status', 'active')
    .maybeSingle();

  if (!store) {
    return { error: 'Loja vinculada não encontrada.', status: 404, supabase, profile, store: null };
  }

  if (expectedSlug && store.slug !== expectedSlug) {
    return { error: 'Este usuário não pertence a esta loja.', status: 403, supabase, profile, store: null };
  }

  return { error: '', status: 200, supabase, profile, store };
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();

    const slug = cleanText(formData.get('slug'));
    const file = formData.get('stock_file') as File | null;

    const context = await getAuthorizedStore(request, slug);

    if (context.error) {
      return NextResponse.json({ error: context.error }, { status: context.status });
    }

    if (!file || file.size <= 0) {
      return NextResponse.json({ error: 'Selecione um arquivo XML ou CSV.' }, { status: 400 });
    }

    const fileName = safeFileName(file.name);
    const extension = fileName.split('.').pop()?.toLowerCase();

    if (!['csv', 'xml', 'txt'].includes(extension || '')) {
      return NextResponse.json({ error: 'Formato inválido. Envie apenas .CSV ou .XML.' }, { status: 400 });
    }

    const maxSize = 20 * 1024 * 1024;

    if (file.size > maxSize) {
      return NextResponse.json({ error: 'Arquivo muito grande. Envie até 20MB.' }, { status: 400 });
    }

    const contentType = file.type || (extension === 'xml' ? 'application/xml' : 'text/csv');
    const arrayBuffer = await file.arrayBuffer();

    const filePath = `${context.store.id}/${Date.now()}-${fileName}`;

    const { error: uploadError } = await context.supabase.storage
      .from('stock-imports')
      .upload(filePath, arrayBuffer, {
        contentType,
        upsert: true
      });

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 400 });
    }

    const { data: record, error: recordError } = await context.supabase
      .from('store_stock_imports')
      .insert({
        event_id: context.store.event_id,
        store_id: context.store.id,
        submitted_by_user_id: context.profile.id,
        file_name: fileName,
        file_path: filePath,
        mime_type: contentType,
        file_size_bytes: file.size,
        status: 'pending',
        metadata: {
          source: 'store_portal_my_store_upload'
        }
      })
      .select('*')
      .single();

    if (recordError) {
      return NextResponse.json({ error: recordError.message }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      stock_import: record
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Erro ao enviar estoque.' }, { status: 500 });
  }
}
