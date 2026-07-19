import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const maxDuration = 60;

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

function requiredMissing(payload: any, imageCount: number) {
  const missing: string[] = [];

  if (!cleanText(payload.source_url || payload.vehicle_url)) missing.push('link original');
  if (!cleanText(payload.brand)) missing.push('marca');
  if (!cleanText(payload.model)) missing.push('modelo');
  if (!cleanText(payload.version)) missing.push('versão');
  if (!cleanText(payload.year)) missing.push('ano');
  if (!cleanText(payload.mileage)) missing.push('km');
  if (!cleanText(payload.fuel)) missing.push('combustível');
  if (!cleanText(payload.transmission)) missing.push('câmbio');
  if (!cleanText(payload.color)) missing.push('cor');
  if (!parsePrice(payload.price)) missing.push('valor');
  if (imageCount < 1) missing.push('pelo menos 1 foto');

  return missing;
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

async function getActiveCampaign(supabase: any) {
  const { data: campaign } = await supabase
    .from('site_campaigns')
    .select('*')
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return campaign;
}

async function callImporter(request: Request, vehicleUrl: string) {
  const origin = new URL(request.url).origin;

  const response = await fetch(`${origin}/api/site-import`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      action: 'import',
      url: vehicleUrl
    })
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.error || 'Não foi possível importar fotos e dados do anúncio.');
  }

  return result;
}

function buildImportedForm(importResult: any, sourceUrl: string) {
  const vehicle = importResult.vehicle || {};
  const uploadedImages = Array.isArray(importResult.uploadedImages) ? importResult.uploadedImages.filter(Boolean) : [];
  const fallbackImages = Array.isArray(importResult.images) ? importResult.images.filter(Boolean) : [];
  const images = uploadedImages.length ? uploadedImages : fallbackImages;

  return {
    source_url: sourceUrl,
    brand: cleanText(vehicle.brand),
    model: cleanText(vehicle.model),
    version: cleanText(vehicle.version),
    year: cleanText(vehicle.year),
    mileage: cleanText(vehicle.mileage),
    color: cleanText(vehicle.color),
    transmission: cleanText(vehicle.transmission),
    fuel: cleanText(vehicle.fuel),
    price: parsePrice(importResult.price || vehicle.price),
    image_url: images[0] || '',
    image_urls: images.slice(0, 12)
  };
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
            source: 'store_portal_stock',
            publication_status: 'link_enviado'
          }
        });

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }

      return NextResponse.json({ success: true });
    }

    if (action === 'import-data') {
      const linkId = cleanText(body.link_id);
      const link = await getStoreLink(supabase, store.id, linkId);

      if (!link) {
        return NextResponse.json({ error: 'Link não encontrado para esta loja.' }, { status: 404 });
      }

      const sourceUrl = normalizeUrl(cleanText(body.vehicle_url || link.vehicle_url));

      if (!sourceUrl || !isValidVehicleUrl(sourceUrl)) {
        return NextResponse.json({ error: 'Link inválido para importação.' }, { status: 400 });
      }

      const importResult = await callImporter(request, sourceUrl);
      const importedForm = buildImportedForm(importResult, sourceUrl);
      const missing = requiredMissing(importedForm, importedForm.image_urls.length);

      const { error } = await supabase
        .from('store_vehicle_link_submissions')
        .update({
          vehicle_url: sourceUrl,
          status: 'reviewing',
          metadata: {
            ...(link.metadata || {}),
            source: 'store_portal_stock',
            publication_status: missing.length ? 'aguardando_preenchimento' : 'pronto_para_publicar',
            imported_preview: importedForm,
            imported_at: new Date().toISOString(),
            missing_fields: missing
          },
          updated_at: new Date().toISOString()
        })
        .eq('id', link.id)
        .eq('store_id', store.id);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }

      return NextResponse.json({
        success: true,
        imported: importedForm,
        missing
      });
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
          edited_at: new Date().toISOString(),
          publication_status: 'link_editado'
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

    if (action === 'publish-vehicle' || action === 'update-vehicle') {
      const linkId = cleanText(body.link_id);
      const link = await getStoreLink(supabase, store.id, linkId);

      if (!link) {
        return NextResponse.json({ error: 'Item não encontrado para esta loja.' }, { status: 404 });
      }

      const sourceUrl = normalizeUrl(cleanText(body.source_url || body.vehicle_url || link.vehicle_url));
      const imageUrls = Array.isArray(body.image_urls)
        ? body.image_urls.map((item: any) => cleanText(item)).filter(Boolean)
        : [];

      if (body.image_url && !imageUrls.includes(cleanText(body.image_url))) {
        imageUrls.unshift(cleanText(body.image_url));
      }

      const missing = requiredMissing(
        {
          ...body,
          source_url: sourceUrl,
          price: parsePrice(body.price)
        },
        imageUrls.length
      );

      if (missing.length) {
        return NextResponse.json({
          error: `Preencha todos os campos obrigatórios antes de publicar: ${missing.join(', ')}.`,
          missing
        }, { status: 400 });
      }

      const campaign = await getActiveCampaign(supabase);

      if (!campaign) {
        return NextResponse.json({ error: 'Nenhuma campanha ativa encontrada para publicar o veículo.' }, { status: 400 });
      }

      const vehiclePayload: any = {
        campaign_id: campaign.id,
        brand: cleanText(body.brand).toUpperCase(),
        model: cleanText(body.model).toUpperCase(),
        version: cleanText(body.version),
        year: cleanText(body.year),
        mileage: cleanText(body.mileage),
        color: cleanText(body.color),
        transmission: cleanText(body.transmission),
        fuel: cleanText(body.fuel),
        price: parsePrice(body.price),
        image_url: imageUrls[0],
        image_urls: imageUrls,
        store_name: store.store_name,
        source_url: sourceUrl,
        status: 'disponivel',
        show_on_landing: true,
        is_featured: Boolean(body.is_featured),
        updated_at: new Date().toISOString()
      };

      let vehicleId = link.imported_vehicle_id;

      if (vehicleId) {
        const { error } = await supabase
          .from('site_vehicles')
          .update(vehiclePayload)
          .eq('id', vehicleId);

        if (error) {
          return NextResponse.json({ error: error.message }, { status: 400 });
        }
      } else {
        const { data: created, error } = await supabase
          .from('site_vehicles')
          .insert({
            ...vehiclePayload,
            created_at: new Date().toISOString()
          })
          .select('id')
          .single();

        if (error) {
          return NextResponse.json({ error: error.message }, { status: 400 });
        }

        vehicleId = created.id;
      }

      const { error: linkError } = await supabase
        .from('store_vehicle_link_submissions')
        .update({
          imported_vehicle_id: vehicleId,
          vehicle_url: sourceUrl,
          status: 'published',
          metadata: {
            ...(link.metadata || {}),
            source: 'store_portal_stock',
            publication_status: 'publicado',
            published_by_store: true,
            published_at: new Date().toISOString(),
            missing_fields: []
          },
          updated_at: new Date().toISOString()
        })
        .eq('id', link.id)
        .eq('store_id', store.id);

      if (linkError) {
        return NextResponse.json({ error: linkError.message }, { status: 400 });
      }

      return NextResponse.json({ success: true, vehicle_id: vehicleId });
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
