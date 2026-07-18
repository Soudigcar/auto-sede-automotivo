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
    const storeId = cleanText(body.store_id);

    if (!leadId || !storeId) {
      return NextResponse.json({ error: 'Lead e loja são obrigatórios.' }, { status: 400 });
    }

    const { data: leadBase } = await supabase
      .from('leads_base')
      .select('*')
      .eq('id', leadId)
      .maybeSingle();

    if (!leadBase) {
      return NextResponse.json({ error: 'Lead da Base não encontrado.' }, { status: 404 });
    }

    const { data: store } = await supabase
      .from('stores')
      .select('id,store_name,event_id,status,portal_enabled')
      .eq('id', storeId)
      .maybeSingle();

    const storeStatus = String(store?.status || '').toLowerCase();

    if (!store || storeStatus === 'deleted' || storeStatus === 'excluido') {
      return NextResponse.json({ error: 'Loja válida não encontrada.' }, { status: 404 });
    }

    let routedLeadId = leadBase.routed_lead_id || null;

    if (routedLeadId) {
      const { data: updatedLead } = await supabase
        .from('leads')
        .update({
          assigned_store_id: store.id,
          updated_at: new Date().toISOString()
        })
        .eq('id', routedLeadId)
        .select('id')
        .maybeSingle();

      if (!updatedLead?.id) {
        routedLeadId = null;
      }
    }

    if (!routedLeadId) {
      const { data: createdLead, error: createdLeadError } = await supabase
        .from('leads')
        .insert({
          event_id: store.event_id || null,
          customer_name: leadBase.name,
          customer_phone: leadBase.phone,
          customer_bank: '',
          interested_vehicle: leadBase.vehicle_name || '',
          vehicle_category_interest: '',
          origin: 'manual',
          assigned_store_id: store.id,
          status: 'new_lead',
          notes: 'Lead redirecionado manualmente pela Base Master.'
        })
        .select('id')
        .single();

      if (createdLeadError || !createdLead?.id) {
        return NextResponse.json(
          { error: createdLeadError?.message || 'Erro ao criar lead no pipeline da loja.' },
          { status: 500 }
        );
      }

      routedLeadId = createdLead.id;
    }

    const metadata = {
      ...(leadBase.metadata || {}),
      routing: {
        ...(leadBase.metadata?.routing || {}),
        strategy: 'manual_override',
        previous_store_id: leadBase.assigned_store_id || null,
        previous_store_name: leadBase.assigned_store_name || null,
        assigned_store_id: store.id,
        assigned_store_name: store.store_name,
        assigned_at: new Date().toISOString(),
        routed_lead_id: routedLeadId
      }
    };

    const { error: updateError } = await supabase
      .from('leads_base')
      .update({
        assigned_store_id: store.id,
        assigned_store_name: store.store_name,
        assigned_at: new Date().toISOString(),
        routed_lead_id: routedLeadId,
        routing_strategy: 'manual_override',
        metadata,
        updated_at: new Date().toISOString()
      })
      .eq('id', leadBase.id);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      assigned_store_id: store.id,
      assigned_store_name: store.store_name,
      routed_lead_id: routedLeadId
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Erro ao redirecionar lead.' },
      { status: 500 }
    );
  }
}
