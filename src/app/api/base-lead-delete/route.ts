import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

function cleanText(value: unknown) {
  return String(value || '').trim();
}

function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

  if (!supabaseUrl || !serviceKey) {
    throw new Error('Supabase Service Role não configurada.');
  }

  return createClient(supabaseUrl, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
}

async function assertMaster(request: Request, supabase: any) {
  const authorization = request.headers.get('authorization') || '';
  const token = authorization.replace(/^Bearer\s+/i, '').trim();

  if (!token) throw new Error('Sessão não encontrada.');

  const { data: authData, error: authError } = await supabase.auth.getUser(token);

  if (authError || !authData.user) throw new Error('Sessão inválida.');

  let profile: any = null;

  const { data: byAuth } = await supabase
    .from('users')
    .select('id,email,role,status')
    .eq('auth_user_id', authData.user.id)
    .maybeSingle();

  profile = byAuth;

  if (!profile && authData.user.email) {
    const { data: byEmail } = await supabase
      .from('users')
      .select('id,email,role,status')
      .ilike('email', authData.user.email)
      .maybeSingle();

    profile = byEmail;
  }

  if (!profile || profile.role !== 'master' || profile.status !== 'active') {
    throw new Error('Acesso restrito ao Master.');
  }

  return profile;
}

export async function POST(request: Request) {
  try {
    const supabase = getAdminClient();
    await assertMaster(request, supabase);

    const body = await request.json();
    const leadId = cleanText(body.lead_id);

    if (!leadId) {
      return NextResponse.json({ error: 'Lead obrigatório.' }, { status: 400 });
    }

    const { data: leadBase } = await supabase
      .from('leads_base')
      .select('*')
      .eq('id', leadId)
      .maybeSingle();

    if (!leadBase) {
      return NextResponse.json({ error: 'Lead da Base não encontrado.' }, { status: 404 });
    }

    if (leadBase.routed_lead_id) {
      await supabase
        .from('leads')
        .delete()
        .eq('id', leadBase.routed_lead_id);
    }

    const { error: deleteBaseError } = await supabase
      .from('leads_base')
      .delete()
      .eq('id', leadBase.id);

    if (deleteBaseError) {
      return NextResponse.json({ error: deleteBaseError.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Erro ao excluir lead.' },
      { status: 500 }
    );
  }
}
