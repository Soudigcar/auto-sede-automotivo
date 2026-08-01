import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { mergeImportedVehicle, reviewVehicleImportWithOpenAI } from '@/lib/server/vehicleImportAi';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

function cleanText(value: unknown, maxLength = 12000) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function normalizeUrl(value: string) {
  const text = cleanText(value, 2200);
  if (!text) return '';

  try {
    const url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return '';
    url.hash = '';
    return url.toString();
  } catch {
    return '';
  }
}

function isValidVehicleUrl(value: string) {
  return /^https?:\/\/.+/i.test(value);
}

function isOlxUrl(value: string) {
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    return hostname === 'olx.com.br' || hostname.endsWith('.olx.com.br');
  } catch {
    return false;
  }
}

function parsePrice(value: unknown) {
  if (typeof value === 'number') return Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
  const raw = String(value || '').trim();
  if (!raw) return 0;

  const normalized = raw
    .replace(/[^\d,.]/g, '')
    .replace(/\.(?=\d{3})/g, '')
    .replace(',', '.');

  const price = Number(normalized);
  return Number.isFinite(price) ? Math.max(0, Math.round(price)) : 0;
}

function cleanImages(value: unknown, cover?: unknown) {
  const images = Array.isArray(value) ? value.map((item) => cleanText(item, 2200)).filter(Boolean) : [];
  const coverUrl = cleanText(cover, 2200);
  return Array.from(new Set([coverUrl, ...images].filter(Boolean))).slice(0, 12);
}

function requiredMissing(payload: any, imageCount: number) {
  const missing: string[] = [];

  if (!cleanText(payload.source_url || payload.vehicle_url, 2200)) missing.push('link original');
  if (!cleanText(payload.brand, 100)) missing.push('marca');
  if (!cleanText(payload.model, 140)) missing.push('modelo');
  if (!cleanText(payload.version, 220)) missing.push('versão');
  if (!cleanText(payload.year, 40)) missing.push('ano');
  if (!cleanText(payload.mileage, 80)) missing.push('km');
  if (!cleanText(payload.fuel, 80)) missing.push('combustível');
  if (!cleanText(payload.transmission, 80)) missing.push('câmbio');
  if (!cleanText(payload.color, 80)) missing.push('cor');
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
    auth: { persistSession: false, autoRefreshToken: false }
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
  const headers = new Headers({ 'Content-Type': 'application/json' });

  for (const name of ['cookie', 'authorization', 'x-vercel-protection-bypass']) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }

  const response = await fetch(`${origin}/api/site-import`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ action: 'import', url: vehicleUrl }),
    cache: 'no-store'
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = cleanText(result?.error || result?.message, 500);
    throw new Error(detail || `Não foi possível importar o anúncio. Status ${response.status}.`);
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
    title: cleanText(importResult.title || vehicle.title, 500),
    description: cleanText(importResult.description || vehicle.description, 12000),
    brand: cleanText(vehicle.brand, 100),
    model: cleanText(vehicle.model, 140),
    version: cleanText(vehicle.version, 220),
    year: cleanText(vehicle.year, 40),
    mileage: cleanText(vehicle.mileage, 80),
    color: cleanText(vehicle.color, 80),
    transmission: cleanText(vehicle.transmission, 80),
    fuel: cleanText(vehicle.fuel, 80),
    price: parsePrice(importResult.price || vehicle.price),
    image_url: images[0] || '',
    image_urls: images.slice(0, 12)
  };
}

function draftFromBody(body: any, link: any) {
  const sourceUrl = normalizeUrl(cleanText(body.source_url || body.vehicle_url || link.vehicle_url, 2200));
  const images = cleanImages(body.image_urls, body.image_url);

  return {
    source_url: sourceUrl,
    title: cleanText(body.title, 500),
    description: cleanText(body.description, 12000),
    brand: cleanText(body.brand, 100),
    model: cleanText(body.model, 140),
    version: cleanText(body.version, 220),
    year: cleanText(body.year, 40),
    mileage: cleanText(body.mileage, 80),
    color: cleanText(body.color, 80),
    transmission: cleanText(body.transmission, 80),
    fuel: cleanText(body.fuel, 80),
    price: parsePrice(body.price),
    image_url: images[0] || '',
    image_urls: images,
    status: cleanText(body.status, 40) || 'disponivel',
    show_on_landing: body.show_on_landing !== false,
    is_featured: body.is_featured === true
  };
}

async function importLinkDraft(request: Request, supabase: any, store: any, profile: any, link: any, sourceUrl: string) {
  const now = new Date().toISOString();
  const attempt = Number(link?.metadata?.import_attempts || 0) + 1;

  await supabase
    .from('store_vehicle_link_submissions')
    .update({
      status: 'reviewing',
      metadata: {
        ...(link.metadata || {}),
        source: 'store_portal_stock',
        auto_import: true,
        publication_status: 'importando_automaticamente',
        import_started_at: now,
        import_attempts: attempt,
        import_error: null
      },
      updated_at: now
    })
    .eq('id', link.id)
    .eq('store_id', store.id);

  try {
    const importResult = await callImporter(request, sourceUrl);
    const technicalDraft = buildImportedForm(importResult, sourceUrl);
    const aiReview = await reviewVehicleImportWithOpenAI(technicalDraft, 'site público da loja');
    const merged = mergeImportedVehicle(technicalDraft, aiReview.vehicle);
    const importedForm = {
      ...technicalDraft,
      ...merged,
      description: aiReview.optimized_description || merged.description || technicalDraft.description || '',
      image_url: technicalDraft.image_url,
      image_urls: technicalDraft.image_urls
    };
    const missing = requiredMissing(importedForm, importedForm.image_urls.length);
    const finishedAt = new Date().toISOString();

    const { error } = await supabase
      .from('store_vehicle_link_submissions')
      .update({
        vehicle_url: sourceUrl,
        status: 'reviewing',
        notes: importedForm.description || link.notes || null,
        metadata: {
          ...(link.metadata || {}),
          source: 'store_portal_stock',
          auto_import: true,
          publication_status: missing.length ? 'aguardando_preenchimento' : 'pronto_para_conferencia',
          imported_preview: importedForm,
          imported_at: finishedAt,
          import_started_at: now,
          import_finished_at: finishedAt,
          import_attempts: attempt,
          import_error: null,
          missing_fields: missing,
          ai_review: {
            applied: aiReview.ok,
            model: aiReview.model,
            error: aiReview.error || null,
            warnings: aiReview.warnings,
            conflicts: aiReview.conflicts,
            reviewed_at: finishedAt
          },
          audit_history: [
            ...(Array.isArray(link?.metadata?.audit_history) ? link.metadata.audit_history : []),
            {
              action: 'automatic_site_import',
              at: finishedAt,
              user_id: profile.id,
              user_name: profile.full_name || profile.email || 'Loja',
              result: missing.length ? 'incomplete' : 'ready_for_review'
            }
          ].slice(-100)
        },
        updated_at: finishedAt
      })
      .eq('id', link.id)
      .eq('store_id', store.id);

    if (error) throw error;

    return {
      success: true,
      imported: importedForm,
      missing,
      ai: {
        applied: aiReview.ok,
        model: aiReview.model,
        warnings: aiReview.warnings,
        conflicts: aiReview.conflicts,
        error: aiReview.error || null
      }
    };
  } catch (error: any) {
    const failedAt = new Date().toISOString();
    const message = cleanText(error?.message || 'Não foi possível importar fotos e dados.', 600);

    await supabase
      .from('store_vehicle_link_submissions')
      .update({
        status: 'error',
        metadata: {
          ...(link.metadata || {}),
          source: 'store_portal_stock',
          auto_import: true,
          publication_status: 'falha_importacao',
          import_started_at: now,
          import_failed_at: failedAt,
          import_attempts: attempt,
          import_error: message,
          retry_allowed: true
        },
        updated_at: failedAt
      })
      .eq('id', link.id)
      .eq('store_id', store.id);

    throw new Error(message);
  }
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const slug = cleanText(url.searchParams.get('slug'), 200);
    const context = await getAuthorizedStore(request, slug);

    if (context.error) {
      return NextResponse.json({ error: context.error }, { status: context.status });
    }

    const { data: rawLinks, error: linksError } = await context.supabase
      .from('store_vehicle_link_submissions')
      .select('*')
      .eq('store_id', context.store.id)
      .order('position', { ascending: true })
      .order('created_at', { ascending: false });

    if (linksError) return NextResponse.json({ error: linksError.message }, { status: 400 });

    const links = (rawLinks || []).filter((item: any) => item?.metadata?.store_removed !== true);
    const vehicleIds = Array.from(new Set(links.map((item: any) => item.imported_vehicle_id).filter(Boolean)));
    let vehiclesById: Record<string, any> = {};

    if (vehicleIds.length) {
      const { data: vehicles, error: vehiclesError } = await context.supabase
        .from('site_vehicles')
        .select('*')
        .in('id', vehicleIds);

      if (vehiclesError) return NextResponse.json({ error: vehiclesError.message }, { status: 400 });
      vehiclesById = Object.fromEntries((vehicles || []).map((vehicle: any) => [vehicle.id, vehicle]));
    }

    const items = links.map((link: any) => ({
      ...link,
      vehicle: link.imported_vehicle_id ? vehiclesById[link.imported_vehicle_id] || null : null,
      auto_import_eligible: link.status === 'pending' && !isOlxUrl(link.vehicle_url || '')
    }));

    return NextResponse.json({
      store: context.store,
      items,
      auto_import_pending: items.filter((item: any) => item.auto_import_eligible).length
    }, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Erro ao carregar estoque da loja.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const action = cleanText(body.action, 80);
    const slug = cleanText(body.slug, 200);
    const context = await getAuthorizedStore(request, slug);

    if (context.error) {
      return NextResponse.json({ error: context.error }, { status: context.status });
    }

    const { supabase, profile, store } = context;

    if (action === 'add-link') {
      const vehicleUrl = normalizeUrl(cleanText(body.vehicle_url, 2200));
      if (!vehicleUrl || !isValidVehicleUrl(vehicleUrl)) {
        return NextResponse.json({ error: 'Informe um link válido de veículo.' }, { status: 400 });
      }
      if (isOlxUrl(vehicleUrl)) {
        return NextResponse.json({ error: 'Para anúncios da OLX, use o menu “Importar OLX” e a extensão do navegador.' }, { status: 400 });
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
      const position = (Number(count || 0) % 6) + 1;
      const now = new Date().toISOString();

      if (existing?.metadata?.store_removed === true) {
        const { data: restored, error } = await supabase
          .from('store_vehicle_link_submissions')
          .update({
            status: 'pending',
            imported_vehicle_id: null,
            position,
            metadata: {
              ...(existing.metadata || {}),
              source: 'store_portal_stock',
              auto_import: true,
              publication_status: 'aguardando_importacao',
              store_removed: false,
              restored_by_store: true,
              restored_at: now,
              import_error: null
            },
            updated_at: now
          })
          .eq('id', existing.id)
          .eq('store_id', store.id)
          .select('*')
          .single();

        if (error) return NextResponse.json({ error: error.message }, { status: 400 });
        return NextResponse.json({ success: true, link_id: restored.id, auto_import: true });
      }

      const { data: created, error } = await supabase
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
            auto_import: true,
            publication_status: 'aguardando_importacao',
            created_for_review: true
          }
        })
        .select('*')
        .single();

      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ success: true, link_id: created.id, auto_import: true });
    }

    if (action === 'import-data' || action === 'retry-import') {
      const linkId = cleanText(body.link_id, 80);
      const link = await getStoreLink(supabase, store.id, linkId);
      if (!link) return NextResponse.json({ error: 'Link não encontrado para esta loja.' }, { status: 404 });

      const sourceUrl = normalizeUrl(cleanText(body.vehicle_url || link.vehicle_url, 2200));
      if (!sourceUrl || !isValidVehicleUrl(sourceUrl)) {
        return NextResponse.json({ error: 'Link inválido para importação.' }, { status: 400 });
      }
      if (isOlxUrl(sourceUrl)) {
        return NextResponse.json({ error: 'A OLX deve ser importada pelo navegador usando a extensão.' }, { status: 400 });
      }

      try {
        const result = await importLinkDraft(request, supabase, store, profile, link, sourceUrl);
        return NextResponse.json(result);
      } catch (error: any) {
        return NextResponse.json({ error: error?.message || 'Falha na importação.', retry_allowed: true }, { status: 422 });
      }
    }

    if (action === 'save-draft') {
      const linkId = cleanText(body.link_id, 80);
      const link = await getStoreLink(supabase, store.id, linkId);
      if (!link) return NextResponse.json({ error: 'Item não encontrado para esta loja.' }, { status: 404 });

      const draft = draftFromBody(body, link);
      if (!draft.source_url) return NextResponse.json({ error: 'Informe um link válido.' }, { status: 400 });
      const missing = requiredMissing(draft, draft.image_urls.length);
      const now = new Date().toISOString();

      const { error } = await supabase
        .from('store_vehicle_link_submissions')
        .update({
          vehicle_url: draft.source_url,
          status: 'reviewing',
          notes: draft.description || link.notes || null,
          metadata: {
            ...(link.metadata || {}),
            source: 'store_portal_stock',
            publication_status: missing.length ? 'aguardando_preenchimento' : 'pronto_para_conferencia',
            imported_preview: draft,
            missing_fields: missing,
            draft_saved_at: now,
            reviewed_by_store: true,
            audit_history: [
              ...(Array.isArray(link?.metadata?.audit_history) ? link.metadata.audit_history : []),
              {
                action: 'draft_saved_by_store',
                at: now,
                user_id: profile.id,
                user_name: profile.full_name || profile.email || 'Loja'
              }
            ].slice(-100)
          },
          updated_at: now
        })
        .eq('id', link.id)
        .eq('store_id', store.id);

      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ success: true, missing, draft });
    }

    if (action === 'update-link') {
      const linkId = cleanText(body.link_id, 80);
      const vehicleUrl = normalizeUrl(cleanText(body.vehicle_url, 2200));
      const link = await getStoreLink(supabase, store.id, linkId);
      if (!link) return NextResponse.json({ error: 'Link não encontrado para esta loja.' }, { status: 404 });
      if (!vehicleUrl || !isValidVehicleUrl(vehicleUrl)) {
        return NextResponse.json({ error: 'Informe um link válido de veículo.' }, { status: 400 });
      }
      if (isOlxUrl(vehicleUrl)) {
        return NextResponse.json({ error: 'Para OLX, use o importador pelo navegador.' }, { status: 400 });
      }

      const currentMetadata = link.metadata && typeof link.metadata === 'object' ? link.metadata : {};
      const { imported_preview: _preview, missing_fields: _missing, ai_review: _ai, ...metadataRest } = currentMetadata;
      const payload: any = { vehicle_url: vehicleUrl, updated_at: new Date().toISOString() };

      if (link.status !== 'published') {
        payload.status = 'pending';
        payload.metadata = {
          ...metadataRest,
          source: 'store_portal_stock',
          auto_import: true,
          edited_by_store: true,
          edited_at: new Date().toISOString(),
          publication_status: 'aguardando_importacao',
          import_error: null
        };
      }

      const { error } = await supabase
        .from('store_vehicle_link_submissions')
        .update(payload)
        .eq('id', link.id)
        .eq('store_id', store.id);

      if (error) return NextResponse.json({ error: error.message }, { status: 400 });

      if (link.imported_vehicle_id) {
        await supabase
          .from('site_vehicles')
          .update({ source_url: vehicleUrl, updated_at: new Date().toISOString() })
          .eq('id', link.imported_vehicle_id);
      }

      return NextResponse.json({ success: true, auto_import: link.status !== 'published' });
    }

    if (action === 'publish-vehicle' || action === 'update-vehicle') {
      const linkId = cleanText(body.link_id, 80);
      const link = await getStoreLink(supabase, store.id, linkId);
      if (!link) return NextResponse.json({ error: 'Item não encontrado para esta loja.' }, { status: 404 });

      const draft = draftFromBody(body, link);
      const missing = requiredMissing(draft, draft.image_urls.length);
      if (missing.length) {
        return NextResponse.json({
          error: `Preencha todos os campos obrigatórios antes de publicar: ${missing.join(', ')}.`,
          missing
        }, { status: 400 });
      }

      const campaign = await getActiveCampaign(supabase);
      const vehiclePayload: any = {
        campaign_id: campaign?.id || null,
        store_id: store.id,
        brand: draft.brand.toUpperCase(),
        model: draft.model.toUpperCase(),
        version: draft.version,
        year: draft.year,
        mileage: draft.mileage,
        color: draft.color,
        transmission: draft.transmission,
        fuel: draft.fuel,
        price: draft.price,
        image_url: draft.image_urls[0],
        image_urls: draft.image_urls,
        store_name: store.store_name,
        source_url: draft.source_url,
        status: 'disponivel',
        show_on_landing: true,
        is_featured: draft.is_featured,
        updated_at: new Date().toISOString()
      };

      let vehicleId = link.imported_vehicle_id;
      if (vehicleId) {
        const { error } = await supabase.from('site_vehicles').update(vehiclePayload).eq('id', vehicleId);
        if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      } else {
        const { data: created, error } = await supabase
          .from('site_vehicles')
          .insert({ ...vehiclePayload, created_at: new Date().toISOString() })
          .select('id')
          .single();
        if (error) return NextResponse.json({ error: error.message }, { status: 400 });
        vehicleId = created.id;
      }

      const now = new Date().toISOString();
      const { error: linkError } = await supabase
        .from('store_vehicle_link_submissions')
        .update({
          imported_vehicle_id: vehicleId,
          vehicle_url: draft.source_url,
          status: 'published',
          notes: draft.description || link.notes || null,
          metadata: {
            ...(link.metadata || {}),
            source: 'store_portal_stock',
            publication_status: 'publicado',
            final_preview: draft,
            final_description: draft.description || null,
            published_by_store: true,
            reviewed_by_store: true,
            published_at: now,
            missing_fields: [],
            audit_history: [
              ...(Array.isArray(link?.metadata?.audit_history) ? link.metadata.audit_history : []),
              {
                action: 'vehicle_published_by_store',
                at: now,
                user_id: profile.id,
                user_name: profile.full_name || profile.email || 'Loja'
              }
            ].slice(-100)
          },
          updated_at: now
        })
        .eq('id', link.id)
        .eq('store_id', store.id);

      if (linkError) return NextResponse.json({ error: linkError.message }, { status: 400 });
      return NextResponse.json({ success: true, vehicle_id: vehicleId });
    }

    if (action === 'delete-item') {
      const linkId = cleanText(body.link_id, 80);
      const link = await getStoreLink(supabase, store.id, linkId);
      if (!link) return NextResponse.json({ error: 'Item não encontrado para esta loja.' }, { status: 404 });

      if (link.imported_vehicle_id) {
        await supabase
          .from('site_vehicles')
          .update({ show_on_landing: false, status: 'oculto', updated_at: new Date().toISOString() })
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

      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Ação inválida.' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Erro ao salvar estoque da loja.' }, { status: 500 });
  }
}
