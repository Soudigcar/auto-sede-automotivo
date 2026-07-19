import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

function cleanText(value: unknown) {
  return String(value || '').replace(/\s+/g, ' ').trim();
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

function parsePrice(value: unknown) {
  const raw = String(value || '').trim();

  if (!raw) return 0;

  const normalized = raw
    .replace(/[^\d,.]/g, '')
    .replace(/\.(?=\d{3})/g, '')
    .replace(',', '.');

  const price = Number(normalized);

  if (!Number.isFinite(price)) return 0;

  return Math.round(price);
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

async function getAuthorizedStore(request: Request, expectedSlug?: string) {
  const supabase = getAdminClient();
  const authorization = request.headers.get('authorization') || '';
  const token = authorization.replace(/^Bearer\s+/i, '').trim();

  if (!token) {
    return { error: 'Sessão não encontrada.', status: 401, supabase, profile: null, store: null, authUser: null };
  }

  const { data: authData, error: authError } = await supabase.auth.getUser(token);

  if (authError || !authData.user) {
    return { error: 'Sessão inválida. Faça login novamente.', status: 401, supabase, profile: null, store: null, authUser: null };
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
    return { error: 'Usuário de loja não autorizado.', status: 403, supabase, profile: null, store: null, authUser: authData.user };
  }

  const { data: store } = await supabase
    .from('stores')
    .select('*')
    .eq('id', profile.store_id)
    .eq('status', 'active')
    .maybeSingle();

  if (!store) {
    return { error: 'Loja vinculada não encontrada.', status: 404, supabase, profile, store: null, authUser: authData.user };
  }

  if (expectedSlug && store.slug !== expectedSlug) {
    return { error: 'Este usuário não pertence a esta loja.', status: 403, supabase, profile, store: null, authUser: authData.user };
  }

  return { error: '', status: 200, supabase, profile, store, authUser: authData.user };
}

async function getStoreLink(supabase: any, storeId: string, linkId: string) {
  const { data: link, error } = await supabase
    .from('store_vehicle_link_submissions')
    .select('*')
    .eq('id', linkId)
    .eq('store_id', storeId)
    .maybeSingle();

  if (error || !link) return null;

  return link;
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const slug = cleanText(url.searchParams.get('slug'));

    const context = await getAuthorizedStore(request, slug);

    if (context.error) {
      return NextResponse.json({ error: context.error }, { status: context.status });
    }

    const { data: rawLinks, error: linksError } = await context.supabase
      .from('store_vehicle_link_submissions')
      .select('*')
      .eq('store_id', context.store.id)
      .order('created_at', { ascending: false });

    if (linksError) {
      return NextResponse.json({ error: linksError.message }, { status: 400 });
    }

    const links = (rawLinks || []).filter((item: any) => item?.metadata?.store_removed !== true);
    const vehicleIds = Array.from(new Set(
      links
        .map((item: any) => item.imported_vehicle_id)
        .filter(Boolean)
    ));

    let vehiclesById: Record<string, any> = {};

    if (vehicleIds.length) {
      const { data: vehicles, error: vehiclesError } = await context.supabase
        .from('site_vehicles')
        .select('*')
        .in('id', vehicleIds);

      if (vehiclesError) {
        return NextResponse.json({ error: vehiclesError.message }, { status: 400 });
      }

      vehiclesById = Object.fromEntries((vehicles || []).map((vehicle: any) => [vehicle.id, vehicle]));
    }

    const items = links.map((link: any) => ({
      ...link,
      vehicle: link.imported_vehicle_id ? vehiclesById[link.imported_vehicle_id] || null : null
    }));

    return NextResponse.json({
      store: context.store,
      items
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Erro ao carregar estoque da loja.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const action = cleanText(body.action);
    const slug = cleanText(body.slug);

    const context = await getAuthorizedStore(request, slug);

    if (context.error) {
      return NextResponse.json({ error: context.error }, { status: context.status });
    }

    const { supabase, profile, store } = context;

    if (action === 'add-link') {
      const vehicleUrl = normalizeUrl(cleanText(body.vehicle_url));

      if (!vehicleUrl || !isValidVehicleUrl(vehicleUrl)) {
        return NextResponse.json({ error: 'Informe um link válido de veículo.' }, { status: 400 });
      }

      const { data: existing } = await supabase
        .from('store_vehicle_link_submissions')
        .select('*')
        .eq('store_id', store.id)
        .eq('vehicle_url', vehicleUrl)
        .maybeSingle();

      if (existing && existing?.metadata?.store_removed !== true) {
        return NextResponse.json({ error: 'Este link já está no estoque da loja.' }, { status: 409 });
      }

      const { count } = await supabase
        .from('store_vehicle_link_submissions')
        .select('id', { count: 'exact', head: true })
        .eq('store_id', store.id);

      const position = ((Number(count || 0) % 6) + 1);

      if (existing?.metadata?.store_removed === true) {
        const { error } = await supabase
          .from('store_vehicle_link_submissions')
          .update({
            status: 'pending',
            imported_vehicle_id: null,
            position,
            metadata: {
              ...(existing.metadata || {}),
              store_removed: false,
              restored_by_store: true,
              restored_at: new Date().toISOString()
            },
            updated_at: new Date().toISOString()
          })
          .eq('id', existing.id)
          .eq('store_id', store.id);

        if (error) {
          return NextResponse.json({ error: error.message }, { status: 400 });
        }

        return NextResponse.json({ success: true });
      }

      const { error } = await supabase
        .from('store_vehicle_link_submissions')
        .insert({
          event_id: store.event_id,
          store_id: store.id,
          submitted_by_user_id: profile.id,
          position,
          vehicle_url: vehicleUrl,
          status: 'pending',
          metadata: {
            source: 'store_portal_stock'
          }
        });

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }

      return NextResponse.json({ success: true });
    }

    if (action === 'update-link') {
      const linkId = cleanText(body.link_id);
      const vehicleUrl = normalizeUrl(cleanText(body.vehicle_url));
      const link = await getStoreLink(supabase, store.id, linkId);

      if (!link) {
        return NextResponse.json({ error: 'Link não encontrado para esta loja.' }, { status: 404 });
      }

      if (!vehicleUrl || !isValidVehicleUrl(vehicleUrl)) {
        return NextResponse.json({ error: 'Informe um link válido de veículo.' }, { status: 400 });
      }

      const payload: any = {
        vehicle_url: vehicleUrl,
        updated_at: new Date().toISOString()
      };

      if (link.status !== 'published') {
        payload.status = 'pending';
        payload.metadata = {
          ...(link.metadata || {}),
          edited_by_store: true,
          edited_at: new Date().toISOString()
        };
      }

      const { error } = await supabase
        .from('store_vehicle_link_submissions')
        .update(payload)
        .eq('id', link.id)
        .eq('store_id', store.id);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }

      if (link.imported_vehicle_id) {
        await supabase
          .from('site_vehicles')
          .update({
            source_url: vehicleUrl,
            updated_at: new Date().toISOString()
          })
          .eq('id', link.imported_vehicle_id);
      }

      return NextResponse.json({ success: true });
    }

    if (action === 'update-vehicle') {
      const linkId = cleanText(body.link_id);
      const link = await getStoreLink(supabase, store.id, linkId);

      if (!link || !link.imported_vehicle_id) {
        return NextResponse.json({ error: 'Veículo publicado não encontrado para esta loja.' }, { status: 404 });
      }

      const sourceUrl = normalizeUrl(cleanText(body.source_url || link.vehicle_url));

      const payload = {
        brand: cleanText(body.brand).toUpperCase(),
        model: cleanText(body.model).toUpperCase(),
        version: cleanText(body.version),
        year: cleanText(body.year),
        mileage: cleanText(body.mileage),
        color: cleanText(body.color),
        transmission: cleanText(body.transmission),
        fuel: cleanText(body.fuel),
        price: parsePrice(body.price),
        source_url: sourceUrl || link.vehicle_url,
        show_on_landing: Boolean(body.show_on_landing),
        status: cleanText(body.status || 'disponivel'),
        updated_at: new Date().toISOString()
      };

      if (!payload.brand || !payload.model) {
        return NextResponse.json({ error: 'Marca e modelo são obrigatórios.' }, { status: 400 });
      }

      const { error } = await supabase
        .from('site_vehicles')
        .update(payload)
        .eq('id', link.imported_vehicle_id);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }

      await supabase
        .from('store_vehicle_link_submissions')
        .update({
          vehicle_url: sourceUrl || link.vehicle_url,
          status: 'published',
          metadata: {
            ...(link.metadata || {}),
            edited_by_store: true,
            edited_at: new Date().toISOString()
          },
          updated_at: new Date().toISOString()
        })
        .eq('id', link.id)
        .eq('store_id', store.id);

      return NextResponse.json({ success: true });
    }

    if (action === 'delete-item') {
      const linkId = cleanText(body.link_id);
      const link = await getStoreLink(supabase, store.id, linkId);

      if (!link) {
        return NextResponse.json({ error: 'Item não encontrado para esta loja.' }, { status: 404 });
      }

      if (link.imported_vehicle_id) {
        await supabase
          .from('site_vehicles')
          .update({
            show_on_landing: false,
            status: 'oculto',
            updated_at: new Date().toISOString()
          })
          .eq('id', link.imported_vehicle_id);
      }

      const { error } = await supabase
        .from('store_vehicle_link_submissions')
        .update({
          status: 'rejected',
          metadata: {
            ...(link.metadata || {}),
            store_removed: true,
            removed_by_store: true,
            removed_at: new Date().toISOString()
          },
          updated_at: new Date().toISOString()
        })
        .eq('id', link.id)
        .eq('store_id', store.id);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Ação inválida.' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Erro ao salvar estoque da loja.' }, { status: 500 });
  }
}
