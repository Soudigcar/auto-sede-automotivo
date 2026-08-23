import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { mergeImportedVehicle, reviewVehicleImportWithOpenAI } from '@/lib/server/vehicleImportAi';
import { normalizeVehicleYears, vehicleYearNumbers } from '@/lib/vehicleYears';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

function cleanText(value: unknown, maxLength = 12000) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function normalizeUrl(value: unknown) {
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

function isOlxUrl(value: string) {
  try {
    const host = new URL(value).hostname.toLowerCase();
    return host === 'olx.com.br' || host.endsWith('.olx.com.br');
  } catch {
    return false;
  }
}

function parsePrice(value: unknown) {
  if (typeof value === 'number') return Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
  const raw = String(value || '').trim();
  if (!raw) return 0;
  const normalized = raw.replace(/[^\d,.]/g, '').replace(/\.(?=\d{3})/g, '').replace(',', '.');
  const price = Number(normalized);
  return Number.isFinite(price) ? Math.max(0, Math.round(price)) : 0;
}

function cleanImages(value: unknown, cover?: unknown) {
  const images = Array.isArray(value) ? value.map((item) => cleanText(item, 2200)).filter(Boolean) : [];
  const coverUrl = cleanText(cover, 2200);
  return Array.from(new Set([coverUrl, ...images].filter(Boolean))).slice(0, 12);
}

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !serviceKey) throw new Error('Configuração do servidor incompleta.');
  return createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function resolveProfile(request: Request, supabase: any) {
  const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return { token: '', authUser: null, profile: null };

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return { token, authUser: null, profile: null };

  const { data: byAuth } = await supabase.from('users').select('*').eq('auth_user_id', data.user.id).maybeSingle();
  let profile = byAuth;
  if (!profile && data.user.email) {
    const { data: byEmail } = await supabase.from('users').select('*').ilike('email', data.user.email).limit(1).maybeSingle();
    profile = byEmail;
  }
  return { token, authUser: data.user, profile };
}

async function proxyStoreRoute(request: Request, bodyText?: string) {
  const url = new URL(request.url);
  url.pathname = '/api/store-stock';
  const headers = new Headers(request.headers);
  headers.set('x-store-stock-internal', '1');
  headers.delete('content-length');

  const response = await fetch(url, {
    method: request.method,
    headers,
    body: request.method === 'GET' || request.method === 'HEAD' ? undefined : bodyText,
    cache: 'no-store'
  });
  return new NextResponse(response.body, {
    status: response.status,
    headers: response.headers
  });
}

async function resolveMasterStore(supabase: any, slug: string) {
  if (!slug) return null;
  const { data } = await supabase.from('stores').select('*').eq('slug', slug).eq('status', 'active').maybeSingle();
  return data || null;
}

async function getStoreLink(supabase: any, storeId: string, linkId: string) {
  const { data } = await supabase
    .from('store_vehicle_link_submissions')
    .select('*')
    .eq('id', linkId)
    .eq('store_id', storeId)
    .maybeSingle();
  return data || null;
}

async function assertVehicleTenant(supabase: any, storeId: string, vehicleId: string | null | undefined) {
  if (!vehicleId) return null;
  const { data: vehicle, error } = await supabase
    .from('site_vehicles')
    .select('*')
    .eq('id', vehicleId)
    .maybeSingle();
  if (error || !vehicle) throw new Error('Veículo vinculado não encontrado.');
  if (String(vehicle.store_id || '') !== storeId) {
    const conflict = new Error('Conflito de isolamento detectado. O vínculo do veículo não pertence à loja selecionada.');
    (conflict as any).status = 409;
    throw conflict;
  }
  return vehicle;
}

async function auditMasterAction(supabase: any, request: Request, profile: any, store: any, action: string, entityId: string | null, detail: Record<string, any>) {
  const forwarded = cleanText(request.headers.get('x-forwarded-for'), 120);
  const ip = forwarded.split(',')[0]?.trim() || null;
  const { error } = await supabase.from('audit_logs').insert({
    event_id: store.event_id || null,
    user_id: profile.id,
    user_role: 'master',
    action_type: `master_stock_${action}`,
    entity_type: 'store_inventory',
    entity_id: entityId || null,
    old_value: null,
    new_value: { store_id: store.id, store_slug: store.slug, ...detail },
    ip_address: ip,
    user_agent: cleanText(request.headers.get('user-agent'), 1000) || null,
    integrity_level: 'trusted_server'
  });
  if (error) throw new Error(`Falha ao registrar auditoria Master: ${error.message}`);
}

function withNormalizedYears<T extends Record<string, any>>(payload: T) {
  return { ...payload, ...normalizeVehicleYears(payload) };
}

function requiredMissing(payload: any, imageCount: number) {
  const missing: string[] = [];
  if (!cleanText(payload.source_url || payload.vehicle_url, 2200)) missing.push('link original');
  if (!cleanText(payload.brand, 100)) missing.push('marca');
  if (!cleanText(payload.model, 140)) missing.push('modelo');
  if (!cleanText(payload.version, 220)) missing.push('versão');
  if (!cleanText(payload.manufacture_year, 10)) missing.push('ano de fabricação');
  if (!cleanText(payload.model_year, 10)) missing.push('ano do modelo');
  if (!cleanText(payload.mileage, 80)) missing.push('km');
  if (!cleanText(payload.fuel, 80)) missing.push('combustível');
  if (!cleanText(payload.transmission, 80)) missing.push('câmbio');
  if (!cleanText(payload.color, 80)) missing.push('cor');
  if (!parsePrice(payload.price)) missing.push('valor');
  if (imageCount < 1) missing.push('pelo menos 1 foto');
  return missing;
}

function draftFromBody(body: any, link: any) {
  const sourceUrl = normalizeUrl(body.source_url || body.vehicle_url || link.vehicle_url);
  const images = cleanImages(body.image_urls, body.image_url);
  return withNormalizedYears({
    source_url: sourceUrl,
    title: cleanText(body.title, 500),
    description: cleanText(body.description, 12000),
    brand: cleanText(body.brand, 100),
    model: cleanText(body.model, 140),
    version: cleanText(body.version, 220),
    manufacture_year: cleanText(body.manufacture_year, 10),
    model_year: cleanText(body.model_year, 10),
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
  });
}

async function callImporter(request: Request, sourceUrl: string) {
  const origin = new URL(request.url).origin;
  const headers = new Headers({ 'Content-Type': 'application/json' });
  for (const name of ['cookie', 'authorization', 'x-vercel-protection-bypass']) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  const response = await fetch(`${origin}/api/site-import`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ action: 'import', url: sourceUrl }),
    cache: 'no-store'
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(cleanText(result?.error || result?.message, 600) || 'Falha ao importar anúncio.');
  return result;
}

function buildImportedForm(importResult: any, sourceUrl: string) {
  const vehicle = importResult.vehicle || {};
  const uploaded = Array.isArray(importResult.uploadedImages) ? importResult.uploadedImages.filter(Boolean) : [];
  const fallback = Array.isArray(importResult.images) ? importResult.images.filter(Boolean) : [];
  const images = (uploaded.length ? uploaded : fallback).slice(0, 12);
  return withNormalizedYears({
    source_url: sourceUrl,
    title: cleanText(importResult.title || vehicle.title, 500),
    description: cleanText(importResult.description || vehicle.description, 12000),
    brand: cleanText(vehicle.brand, 100),
    model: cleanText(vehicle.model, 140),
    version: cleanText(vehicle.version, 220),
    manufacture_year: cleanText(vehicle.manufacture_year, 10),
    model_year: cleanText(vehicle.model_year, 10),
    year: cleanText(vehicle.year, 40),
    mileage: cleanText(vehicle.mileage, 80),
    color: cleanText(vehicle.color, 80),
    transmission: cleanText(vehicle.transmission, 80),
    fuel: cleanText(vehicle.fuel, 80),
    price: parsePrice(importResult.price || vehicle.price),
    image_url: images[0] || '',
    image_urls: images
  });
}

async function importMasterDraft(request: Request, supabase: any, store: any, profile: any, link: any, sourceUrl: string) {
  await assertVehicleTenant(supabase, store.id, link.imported_vehicle_id);
  const now = new Date().toISOString();
  const importResult = await callImporter(request, sourceUrl);
  const technical = buildImportedForm(importResult, sourceUrl);
  const aiReview = await reviewVehicleImportWithOpenAI(technical, 'estoque administrado pelo Master', { source_evidence: importResult.evidence || null });
  const merged = mergeImportedVehicle(technical, aiReview.vehicle);
  const imported = withNormalizedYears({
    ...technical,
    ...merged,
    description: aiReview.optimized_description || merged.description || technical.description || '',
    image_url: technical.image_url,
    image_urls: technical.image_urls
  });
  const missing = requiredMissing(imported, imported.image_urls.length);
  const metadata = {
    ...(link.metadata || {}),
    source: 'master_store_stock',
    publication_status: missing.length ? 'aguardando_preenchimento' : 'pronto_para_conferencia',
    imported_preview: imported,
    imported_at: now,
    missing_fields: missing,
    ai_review: {
      applied: aiReview.ok,
      model: aiReview.model,
      warnings: aiReview.warnings,
      conflicts: aiReview.conflicts,
      error: aiReview.error || null,
      reviewed_at: now
    },
    audit_history: [
      ...(Array.isArray(link?.metadata?.audit_history) ? link.metadata.audit_history : []),
      { action: 'master_import_with_ai', at: now, user_id: profile.id, user_name: profile.full_name || profile.email || 'Master' }
    ].slice(-100)
  };
  const { error } = await supabase
    .from('store_vehicle_link_submissions')
    .update({ vehicle_url: sourceUrl, status: 'reviewing', notes: imported.description || link.notes || null, metadata, updated_at: now })
    .eq('id', link.id)
    .eq('store_id', store.id);
  if (error) throw error;
  await auditMasterAction(supabase, request, profile, store, 'import_ai', link.id, { missing_fields: missing });
  return { success: true, imported, missing, ai: metadata.ai_review };
}

async function getMasterContext(request: Request, slug: string) {
  const supabase = getAdminClient();
  const resolved = await resolveProfile(request, supabase);
  if (!resolved.authUser || !resolved.profile || resolved.profile.status !== 'active') {
    return { kind: 'denied' as const, status: 401, error: 'Sessão inválida.', supabase, profile: null, store: null };
  }
  if (String(resolved.profile.role || '').toLowerCase() !== 'master') {
    return { kind: 'store' as const, status: 200, error: '', supabase, profile: resolved.profile, store: null };
  }
  const store = await resolveMasterStore(supabase, slug);
  if (!store) return { kind: 'denied' as const, status: 404, error: 'Loja selecionada não encontrada.', supabase, profile: resolved.profile, store: null };
  return { kind: 'master' as const, status: 200, error: '', supabase, profile: resolved.profile, store };
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const slug = cleanText(url.searchParams.get('slug'), 200);
    const context = await getMasterContext(request, slug);
    if (context.kind === 'store') return proxyStoreRoute(request);
    if (context.kind !== 'master') return NextResponse.json({ error: context.error }, { status: context.status });

    const { supabase, store } = context;
    const { data: rawLinks, error: linksError } = await supabase
      .from('store_vehicle_link_submissions')
      .select('*')
      .eq('store_id', store.id)
      .order('position', { ascending: true })
      .order('created_at', { ascending: false });
    if (linksError) return NextResponse.json({ error: linksError.message }, { status: 400 });

    const links = (rawLinks || []).filter((item: any) => item?.metadata?.store_removed !== true);
    const vehicleIds = Array.from(new Set(links.map((item: any) => item.imported_vehicle_id).filter(Boolean)));
    const vehiclesById: Record<string, any> = {};
    if (vehicleIds.length) {
      const { data: vehicles, error } = await supabase.from('site_vehicles').select('*').in('id', vehicleIds);
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      for (const vehicle of vehicles || []) {
        if (String(vehicle.store_id || '') !== store.id) {
          return NextResponse.json({ error: 'Conflito de isolamento detectado neste estoque. Operação Master bloqueada até a inconsistência ser revisada.' }, { status: 409 });
        }
        vehiclesById[vehicle.id] = withNormalizedYears(vehicle);
      }
      if (Object.keys(vehiclesById).length !== vehicleIds.length) {
        return NextResponse.json({ error: 'Há vínculo de veículo inválido neste estoque. Operação Master bloqueada.' }, { status: 409 });
      }
    }

    const items = links.map((link: any) => ({
      ...link,
      vehicle: link.imported_vehicle_id ? vehiclesById[link.imported_vehicle_id] || null : null,
      auto_import_eligible: link.status === 'pending' && !isOlxUrl(link.vehicle_url || '')
    }));
    return NextResponse.json({ store, items, access_mode: 'master', can_manage_stock: true, auto_import_pending: items.filter((item: any) => item.auto_import_eligible).length }, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Erro ao carregar estoque.' }, { status: Number(error?.status || 500) });
  }
}

export async function POST(request: Request) {
  const bodyText = await request.text();
  try {
    const body = JSON.parse(bodyText || '{}');
    const slug = cleanText(body.slug, 200);
    const action = cleanText(body.action, 80);
    const context = await getMasterContext(request, slug);
    if (context.kind === 'store') return proxyStoreRoute(request, bodyText);
    if (context.kind !== 'master') return NextResponse.json({ error: context.error }, { status: context.status });

    const { supabase, profile, store } = context;

    if (action === 'add-link') {
      const vehicleUrl = normalizeUrl(body.vehicle_url);
      if (!vehicleUrl) return NextResponse.json({ error: 'Informe um link válido.' }, { status: 400 });
      if (isOlxUrl(vehicleUrl)) return NextResponse.json({ error: 'Para OLX, use o fluxo específico de importação.' }, { status: 400 });
      const { data: existing } = await supabase.from('store_vehicle_link_submissions').select('*').eq('store_id', store.id).eq('vehicle_url', vehicleUrl).maybeSingle();
      if (existing && existing?.metadata?.store_removed !== true) return NextResponse.json({ error: 'Este link já está no estoque desta loja.' }, { status: 409 });
      const now = new Date().toISOString();
      let created: any = null;
      if (existing?.metadata?.store_removed === true) {
        const { data, error } = await supabase.from('store_vehicle_link_submissions').update({
          status: 'pending', imported_vehicle_id: null, vehicle_url: vehicleUrl,
          metadata: { ...(existing.metadata || {}), source: 'master_store_stock', store_removed: false, publication_status: 'aguardando_importacao', restored_by_master: true, restored_at: now }, updated_at: now
        }).eq('id', existing.id).eq('store_id', store.id).select('*').single();
        if (error) return NextResponse.json({ error: error.message }, { status: 400 });
        created = data;
      } else {
        const { count } = await supabase.from('store_vehicle_link_submissions').select('id', { count: 'exact', head: true }).eq('store_id', store.id);
        const { data, error } = await supabase.from('store_vehicle_link_submissions').insert({
          event_id: store.event_id, store_id: store.id, submitted_by_user_id: profile.id, position: (Number(count || 0) % 6) + 1,
          vehicle_url: vehicleUrl, status: 'pending', metadata: { source: 'master_store_stock', publication_status: 'aguardando_importacao', created_by_master: true }
        }).select('*').single();
        if (error) return NextResponse.json({ error: error.message }, { status: 400 });
        created = data;
      }
      await auditMasterAction(supabase, request, profile, store, 'add_link', created.id, { vehicle_url: vehicleUrl });
      return NextResponse.json({ success: true, link_id: created.id, auto_import: true });
    }

    const linkId = cleanText(body.link_id, 80);
    const link = linkId ? await getStoreLink(supabase, store.id, linkId) : null;
    if (!link) return NextResponse.json({ error: 'Item não encontrado para a loja selecionada.' }, { status: 404 });
    await assertVehicleTenant(supabase, store.id, link.imported_vehicle_id);

    if (action === 'import-data' || action === 'retry-import') {
      const sourceUrl = normalizeUrl(body.vehicle_url || link.vehicle_url);
      if (!sourceUrl) return NextResponse.json({ error: 'Link inválido para importação.' }, { status: 400 });
      if (isOlxUrl(sourceUrl)) return NextResponse.json({ error: 'A OLX deve usar o fluxo específico de importação.' }, { status: 400 });
      const result = await importMasterDraft(request, supabase, store, profile, link, sourceUrl);
      return NextResponse.json(result);
    }

    if (action === 'update-link') {
      const vehicleUrl = normalizeUrl(body.vehicle_url);
      if (!vehicleUrl) return NextResponse.json({ error: 'Informe um link válido.' }, { status: 400 });
      const now = new Date().toISOString();
      const { error } = await supabase.from('store_vehicle_link_submissions').update({ vehicle_url: vehicleUrl, status: link.status === 'published' ? link.status : 'pending', updated_at: now, metadata: { ...(link.metadata || {}), source: 'master_store_stock', edited_by_master: true, edited_at: now } }).eq('id', link.id).eq('store_id', store.id);
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      if (link.imported_vehicle_id) {
        const { error: vehicleError } = await supabase.from('site_vehicles').update({ source_url: vehicleUrl, updated_at: now }).eq('id', link.imported_vehicle_id).eq('store_id', store.id);
        if (vehicleError) return NextResponse.json({ error: vehicleError.message }, { status: 400 });
      }
      await auditMasterAction(supabase, request, profile, store, 'update_link', link.id, { vehicle_url: vehicleUrl });
      return NextResponse.json({ success: true, auto_import: link.status !== 'published' });
    }

    if (action === 'save-draft') {
      const draft = draftFromBody(body, link);
      if (!draft.source_url) return NextResponse.json({ error: 'Informe um link válido.' }, { status: 400 });
      const missing = requiredMissing(draft, draft.image_urls.length);
      const now = new Date().toISOString();
      const { error } = await supabase.from('store_vehicle_link_submissions').update({
        vehicle_url: draft.source_url, status: 'reviewing', notes: draft.description || link.notes || null,
        metadata: { ...(link.metadata || {}), source: 'master_store_stock', publication_status: missing.length ? 'aguardando_preenchimento' : 'pronto_para_conferencia', imported_preview: draft, missing_fields: missing, draft_saved_at: now, reviewed_by_master: true }, updated_at: now
      }).eq('id', link.id).eq('store_id', store.id);
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      await auditMasterAction(supabase, request, profile, store, 'save_draft', link.id, { missing_fields: missing });
      return NextResponse.json({ success: true, missing, draft });
    }

    if (action === 'publish-vehicle' || action === 'update-vehicle') {
      const draft = draftFromBody(body, link);
      const missing = requiredMissing(draft, draft.image_urls.length);
      if (missing.length) return NextResponse.json({ error: `Preencha todos os campos obrigatórios antes de publicar: ${missing.join(', ')}.`, missing }, { status: 400 });
      const years = vehicleYearNumbers(draft);
      const { data: campaign } = await supabase.from('site_campaigns').select('id').eq('is_active', true).order('created_at', { ascending: false }).limit(1).maybeSingle();
      const now = new Date().toISOString();
      const vehiclePayload = {
        campaign_id: campaign?.id || null, store_id: store.id, brand: draft.brand.toUpperCase(), model: draft.model.toUpperCase(), version: draft.version,
        manufacture_year: years.manufacture_year, model_year: years.model_year, year: years.year, mileage: draft.mileage, color: draft.color,
        transmission: draft.transmission, fuel: draft.fuel, price: draft.price, image_url: draft.image_urls[0], image_urls: draft.image_urls,
        store_name: store.store_name, source_url: draft.source_url, status: draft.status || 'disponivel', show_on_landing: draft.show_on_landing,
        is_featured: draft.is_featured, updated_at: now
      };
      let vehicleId = link.imported_vehicle_id;
      if (vehicleId) {
        const { data: updated, error } = await supabase.from('site_vehicles').update(vehiclePayload).eq('id', vehicleId).eq('store_id', store.id).select('id').maybeSingle();
        if (error) return NextResponse.json({ error: error.message }, { status: 400 });
        if (!updated) return NextResponse.json({ error: 'Atualização bloqueada por isolamento de loja.' }, { status: 409 });
      } else {
        const { data: created, error } = await supabase.from('site_vehicles').insert({ ...vehiclePayload, created_at: now }).select('id,store_id').single();
        if (error) return NextResponse.json({ error: error.message }, { status: 400 });
        if (created.store_id !== store.id) return NextResponse.json({ error: 'Criação bloqueada por isolamento de loja.' }, { status: 409 });
        vehicleId = created.id;
      }
      const { error: linkError } = await supabase.from('store_vehicle_link_submissions').update({
        imported_vehicle_id: vehicleId, vehicle_url: draft.source_url, status: 'published', notes: draft.description || link.notes || null,
        metadata: { ...(link.metadata || {}), source: 'master_store_stock', publication_status: draft.show_on_landing ? 'publicado' : 'oculto', final_preview: draft, final_description: draft.description || null, published_by_master: true, reviewed_by_master: true, published_at: now, missing_fields: [] }, updated_at: now
      }).eq('id', link.id).eq('store_id', store.id);
      if (linkError) return NextResponse.json({ error: linkError.message }, { status: 400 });
      await auditMasterAction(supabase, request, profile, store, 'publish_vehicle', link.id, { vehicle_id: vehicleId, show_on_landing: draft.show_on_landing });
      return NextResponse.json({ success: true, vehicle_id: vehicleId });
    }

    if (action === 'delete-item') {
      const now = new Date().toISOString();
      if (link.imported_vehicle_id) {
        const { data: updated, error } = await supabase.from('site_vehicles').update({ show_on_landing: false, status: 'oculto', updated_at: now }).eq('id', link.imported_vehicle_id).eq('store_id', store.id).select('id').maybeSingle();
        if (error) return NextResponse.json({ error: error.message }, { status: 400 });
        if (!updated) return NextResponse.json({ error: 'Remoção bloqueada por isolamento de loja.' }, { status: 409 });
      }
      const { error } = await supabase.from('store_vehicle_link_submissions').update({ status: 'rejected', metadata: { ...(link.metadata || {}), store_removed: true, removed_by_master: true, removed_at: now }, updated_at: now }).eq('id', link.id).eq('store_id', store.id);
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      await auditMasterAction(supabase, request, profile, store, 'remove_item', link.id, { vehicle_id: link.imported_vehicle_id || null });
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Ação inválida.' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Erro ao gerenciar estoque.' }, { status: Number(error?.status || 500) });
  }
}
