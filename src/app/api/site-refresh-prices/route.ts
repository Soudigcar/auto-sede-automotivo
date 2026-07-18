import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const maxDuration = 60;

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

  if (!token) {
    throw new Error('Sessão não encontrada.');
  }

  const { data: authData, error: authError } = await supabase.auth.getUser(token);

  if (authError || !authData.user) {
    throw new Error('Sessão inválida.');
  }

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

function normalizePrice(value: any) {
  const number = Number(value || 0);

  if (!Number.isFinite(number)) return 0;

  return Math.round(number);
}

async function readPriceFromSource(request: Request, sourceUrl: string) {
  const origin = new URL(request.url).origin;

  const response = await fetch(`${origin}/api/site-import`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      action: 'preview',
      url: sourceUrl
    })
  });

  if (!response.ok) {
    return {
      price: 0,
      error: 'Não foi possível ler o link.'
    };
  }

  const result = await response.json();
  return {
    price: normalizePrice(result.price),
    error: ''
  };
}

export async function POST(request: Request) {
  try {
    const supabase = getAdminClient();
    await assertMaster(request, supabase);

    const { data: vehicles, error } = await supabase
      .from('site_vehicles')
      .select('id,brand,model,version,price,source_url,status')
      .neq('status', 'excluido')
      .not('source_url', 'is', null)
      .order('updated_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const rows = (vehicles || []).filter((vehicle: any) => String(vehicle.source_url || '').trim());

    let updated = 0;
    let unchanged = 0;
    let withoutLink = 0;
    let withoutPrice = 0;
    let failed = 0;

    const details: any[] = [];

    for (const vehicle of rows) {
      const sourceUrl = String(vehicle.source_url || '').trim();

      if (!sourceUrl) {
        withoutLink++;
        continue;
      }

      try {
        const result = await readPriceFromSource(request, sourceUrl);
        const newPrice = normalizePrice(result.price);
        const oldPrice = normalizePrice(vehicle.price);

        if (!newPrice) {
          withoutPrice++;
          details.push({
            id: vehicle.id,
            vehicle: `${vehicle.brand || ''} ${vehicle.model || ''}`.trim(),
            status: 'sem_preco',
            old_price: oldPrice,
            new_price: 0
          });
          continue;
        }

        if (newPrice === oldPrice) {
          unchanged++;
          details.push({
            id: vehicle.id,
            vehicle: `${vehicle.brand || ''} ${vehicle.model || ''}`.trim(),
            status: 'sem_alteracao',
            old_price: oldPrice,
            new_price: newPrice
          });
          continue;
        }

        const { error: updateError } = await supabase
          .from('site_vehicles')
          .update({
            price: newPrice,
            updated_at: new Date().toISOString()
          })
          .eq('id', vehicle.id);

        if (updateError) {
          failed++;
          details.push({
            id: vehicle.id,
            vehicle: `${vehicle.brand || ''} ${vehicle.model || ''}`.trim(),
            status: 'erro_ao_salvar',
            old_price: oldPrice,
            new_price: newPrice
          });
          continue;
        }

        updated++;
        details.push({
          id: vehicle.id,
          vehicle: `${vehicle.brand || ''} ${vehicle.model || ''}`.trim(),
          status: 'atualizado',
          old_price: oldPrice,
          new_price: newPrice
        });
      } catch {
        failed++;
        details.push({
          id: vehicle.id,
          vehicle: `${vehicle.brand || ''} ${vehicle.model || ''}`.trim(),
          status: 'erro_ao_ler',
          old_price: normalizePrice(vehicle.price),
          new_price: 0
        });
      }
    }

    const totalWithLink = rows.length;

    return NextResponse.json({
      success: true,
      total_with_link: totalWithLink,
      updated,
      unchanged,
      without_link: withoutLink,
      without_price: withoutPrice,
      failed,
      details: details.slice(0, 50)
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Erro ao atualizar valores.' },
      { status: 500 }
    );
  }
}
