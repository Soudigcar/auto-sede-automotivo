import { NextResponse } from 'next/server';
import { asStorePortalRole, type StorePortalRole } from '@/lib/server/storePortal';
import { cleanText, createAdminClient, getProfileFromToken, readBearerToken } from '@/lib/server/storeTeam';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type ImportAction = 'preview' | 'save_draft' | 'submit_approval' | 'publish';

type ImportContext = {
  supabase: any;
  profile: any;
  role: StorePortalRole;
  store: any;
  canPublish: boolean;
};

class ImportHttpError extends Error {
  status: number;
  details?: Record<string, unknown>;

  constructor(message: string, status = 400, details?: Record<string, unknown>) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

function normalizeOlxUrl(value: unknown) {
  const raw = cleanText(value, 1600);
  if (!raw) return '';

  try {
    const parsed = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    const hostname = parsed.hostname.toLowerCase().replace(/^www\./, '');
    if (hostname !== 'olx.com.br' && !hostname.endsWith('.olx.com.br')) return '';
    parsed.protocol = 'https:';
    parsed.hostname = hostname;
    parsed.username = '';
    parsed.password = '';
    parsed.search = '';
    parsed.hash = '';
    parsed.pathname = parsed.pathname.replace(/\/{2,}/g, '/').replace(/\/$/, '');
    return parsed.toString();
  } catch {
    return '';
  }
}

function extractAdId(url: string) {
  try {
    const matches = Array.from(new URL(url).pathname.matchAll(/(?:^|[-/])(\d{7,})(?=$|[-/])/g));
    return matches.length ? matches[matches.length - 1][1] : '';
  } catch {
    return '';
  }
}

function parsePrice(value: unknown) {
  if (typeof value === 'number') return Number.isFinite(value) ? Math.max(0, value) : 0;
  const raw = String(value || '').replace(/[^\d,.]/g, '');
  if (!raw) return 0;
  if (raw.includes(',')) return Number(raw.replace(/\./g, '').replace(',', '.')) || 0;
  return Number(raw.replace(/\D/g, '')) || 0;
}

function cleanImageUrl(value: unknown) {
  const raw = cleanText(value, 2200).replace(/\\u002F/gi, '/').replace(/\\\//g, '/');
  if (!raw) return '';
  try {
    const url = new URL(raw);
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : '';
  } catch {
    return '';
  }
}

function cleanImages(value: unknown) {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map(cleanImageUrl).filter(Boolean))).slice(0, 20);
}

function decodeEscaped(value: string) {
  return String(value || '')
    .replace(/\\u([0-9a-f]{4})/gi, (_, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/\\\//g, '/')
    .replace(/\\n/g, '\n')
    .replace(/\\"/g, '"');
}

function embeddedValue(html: string, key: string, max = 12000) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const direct = html.match(new RegExp(`"${escaped}"\\s*:\\s*"((?:\\\\.|[^"])*)"`, 'i'))?.[1];
  const nested = html.match(new RegExp(`\\\\"${escaped}\\\\"\\s*:\\s*\\\\"((?:\\\\.|[^"])*)\\\\"`, 'i'))?.[1];
  return cleanText(decodeEscaped(direct || nested || ''), max);
}

function detailLabel(html: string, key: string) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const direct = html.match(new RegExp(`"${escaped}"\\s*:\\s*\\{\\s*"single"\\s*:\\s*\\{[^{}]*?"label"\\s*:\\s*"((?:\\\\.|[^"])*)"`, 'i'))?.[1];
  const nested = html.match(new RegExp(`\\\\"${escaped}\\\\"[\\s\\S]{0,180}?\\\\"label\\\\"\\s*:\\s*\\\\"((?:\\\\.|[^"])*)\\\\"`, 'i'))?.[1];
  return cleanText(decodeEscaped(direct || nested || ''), 500);
}

function olxImages(html: string) {
  const normalized = html.replace(/\\u002F/gi, '/').replace(/\\\//g, '/');
  const images: string[] = [];

  for (const match of normalized.matchAll(/https?:\/\/img\.olx\.com\.br\/[^"'\s<>]+/gi)) {
    const image = cleanImageUrl(match[0]);
    if (image && /\.(?:jpg|jpeg|png|webp)(?:\?|$)/i.test(image)) images.push(image);
  }

  for (const match of normalized.matchAll(/"base_url"\s*:\s*"(https?:\/\/img\.olx\.com\.br)"[\s\S]{0,260}?"path"\s*:\s*"([^"]+)"/gi)) {
    const image = cleanImageUrl(`${match[1]}/${match[2]}`);
    if (image) images.push(image);
  }

  return Array.from(new Set(images)).slice(0, 20);
}

async function fetchOlxSupplement(url: string) {
  const response = await fetch(url, {
    headers: {
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36 AutoControleAutomotivo/2.0',
      accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
      'accept-language': 'pt-BR,pt;q=0.9,en;q=0.7'
    },
    cache: 'no-store'
  });

  if (!response.ok) return null;
  const html = await response.text();
  const metaDescription = html.match(/<meta[^>]+(?:property|name)=["'](?:og:description|description)["'][^>]+content=["']([^"']+)["']/i)?.[1]
    || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["'](?:og:description|description)["']/i)?.[1]
    || '';

  return {
    title: embeddedValue(html, 'subject', 500),
    description: embeddedValue(html, 'body', 12000) || cleanText(metaDescription, 12000),
    price: Number(html.match(/"price_value"\s*:\s*(\d{4,9})/i)?.[1] || 0),
    images: olxImages(html),
    vehicle: {
      brand: detailLabel(html, 'vehicle_brand'),
      model: detailLabel(html, 'vehicle_model'),
      version: detailLabel(html, 'vehicle_model'),
      year: detailLabel(html, 'regdate'),
      mileage: detailLabel(html, 'mileage'),
      color: detailLabel(html, 'carcolor'),
      transmission: detailLabel(html, 'gearbox'),
      fuel: detailLabel(html, 'fuel')
    }
  };
}

async function importerRequest(request: Request, action: 'preview' | 'import', url: string, images?: string[]) {
  const response = await fetch(`${new URL(request.url).origin}/api/site-import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, url, images })
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new ImportHttpError(result.error || 'Não foi possível importar o anúncio da OLX.', 502);
  return result;
}

function mergePreview(generic: any, supplement: any, sourceUrl: string) {
  const base = generic?.vehicle || {};
  const extra = supplement?.vehicle || {};
  const images = Array.from(new Set([
    ...(supplement?.images || []),
    ...(generic?.images || [])
  ].map(cleanImageUrl).filter(Boolean))).slice(0, 20);

  return {
    source_url: sourceUrl,
    title: cleanText(supplement?.title || generic?.title, 500),
    description: cleanText(supplement?.description || generic?.description, 12000),
    brand: cleanText(extra.brand || base.brand, 100),
    model: cleanText(base.model || extra.model, 140),
    version: cleanText(base.version || extra.version, 220),
    year: cleanText(extra.year || base.year, 40),
    mileage: cleanText(extra.mileage || base.mileage, 80),
    color: cleanText(extra.color || base.color, 80),
    transmission: cleanText(extra.transmission || base.transmission, 80),
    fuel: cleanText(extra.fuel || base.fuel, 80),
    price: parsePrice(supplement?.price || generic?.price || base.price),
    image_url: images[0] || cleanImageUrl(base.image_url),
    image_urls: images,
    show_on_landing: true,
    is_featured: false
  };
}

function normalizeDraft(value: any, sourceUrl: string) {
  const images = cleanImages(value?.image_urls);
  const cover = cleanImageUrl(value?.image_url) || images[0] || '';
  return {
    source_url: normalizeOlxUrl(value?.source_url || sourceUrl),
    title: cleanText(value?.title, 500),
    description: cleanText(value?.description, 12000),
    brand: cleanText(value?.brand, 100),
    model: cleanText(value?.model, 140),
    version: cleanText(value?.version, 220),
    year: cleanText(value?.year, 40),
    mileage: cleanText(value?.mileage, 80),
    color: cleanText(value?.color, 80),
    transmission: cleanText(value?.transmission, 80),
    fuel: cleanText(value?.fuel, 80),
    price: parsePrice(value?.price),
    image_url: cover,
    image_urls: Array.from(new Set([cover, ...images].filter(Boolean))),
    show_on_landing: value?.show_on_landing !== false,
    is_featured: value?.is_featured === true
  };
}

function missingFields(value: any) {
  const missing: string[] = [];
  if (!value.source_url) missing.push('link original');
  if (!value.brand) missing.push('marca');
  if (!value.model) missing.push('modelo');
  if (!value.year) missing.push('ano');
  if (!(value.price > 0)) missing.push('valor');
  if (!value.image_urls?.length) missing.push('pelo menos 1 foto');
  return missing;
}

function audit(profile: any, role: StorePortalRole, action: string) {
  return {
    action,
    at: new Date().toISOString(),
    user_id: profile.id,
    user_name: profile.full_name || profile.email || 'Usuário',
    role
  };
}

function withAudit(metadata: any, entry: any) {
  const history = Array.isArray(metadata?.audit_history) ? metadata.audit_history : [];
  return [...history, entry].slice(-100);
}

async function resolveContext(request: Request, requestedStoreId: string): Promise<ImportContext> {
  const supabase: any = createAdminClient();
  const profile = await getProfileFromToken(supabase, readBearerToken(request));
  const role = asStorePortalRole(profile?.role);

  if (!profile || profile.status !== 'active' || !role) {
    throw new ImportHttpError('Usuário sem perfil ativo para importar veículos.', 403);
  }

  const storeId = role === 'master' ? cleanText(requestedStoreId, 80) : cleanText(profile.store_id, 80);
  if (!storeId) throw new ImportHttpError('Selecione a loja proprietária.', 400);

  const { data: store, error } = await supabase
    .from('stores')
    .select('id,store_name,slug,event_id,status,portal_enabled')
    .eq('id', storeId)
    .maybeSingle();

  if (error) throw error;
  if (!store || store.status !== 'active' || !store.portal_enabled) {
    throw new ImportHttpError('A loja está inativa ou indisponível no portal.', 409);
  }
  if (role !== 'master' && profile.store_id !== store.id) {
    throw new ImportHttpError('Você não pode importar veículos para outra loja.', 403);
  }

  return { supabase, profile, role, store, canPublish: role === 'master' || role === 'store' };
}

async function loadSubmission(supabase: any, id: string, storeId: string) {
  if (!id) return null;
  const { data } = await supabase
    .from('store_vehicle_link_submissions')
    .select('*')
    .eq('id', id)
    .eq('store_id', storeId)
    .maybeSingle();
  return data || null;
}

async function ensureNoDuplicate(supabase: any, sourceUrl: string, ignoredSubmissionId: string) {
  const adId = extractAdId(sourceUrl);
  let submissionQuery = supabase
    .from('store_vehicle_link_submissions')
    .select('id,store_id,status,vehicle_url,imported_vehicle_id')
    .not('status', 'in', '(rejected,duplicate)')
    .limit(5);
  submissionQuery = adId ? submissionQuery.ilike('vehicle_url', `%${adId}%`) : submissionQuery.eq('vehicle_url', sourceUrl);
  const submissionResult = await submissionQuery;
  const duplicateSubmission = (submissionResult.data || []).find((item: any) => item.id !== ignoredSubmissionId);

  let vehicleQuery = supabase
    .from('site_vehicles')
    .select('id,store_id,status,source_url,brand,model')
    .neq('status', 'excluido')
    .limit(5);
  vehicleQuery = adId ? vehicleQuery.ilike('source_url', `%${adId}%`) : vehicleQuery.eq('source_url', sourceUrl);
  const vehicleResult = await vehicleQuery;
  const duplicateVehicle = vehicleResult.data?.[0] || null;

  if (duplicateSubmission || duplicateVehicle) {
    throw new ImportHttpError('Este anúncio da OLX já foi importado ou está em revisão.', 409, {
      duplicate: {
        submission_id: duplicateSubmission?.id || null,
        vehicle_id: duplicateVehicle?.id || null,
        store_id: duplicateSubmission?.store_id || duplicateVehicle?.store_id || null,
        status: duplicateSubmission?.status || duplicateVehicle?.status || null
      }
    });
  }
}

async function savePreview(context: ImportContext, existing: any, sourceUrl: string, preview: any) {
  const now = new Date().toISOString();
  const metadata = {
    ...(existing?.metadata || {}),
    source: 'olx_link_import',
    provider: 'olx',
    olx_ad_id: extractAdId(sourceUrl) || null,
    publication_status: 'em_revisao',
    imported_preview: preview,
    missing_fields: missingFields(preview),
    imported_at: now,
    audit_history: withAudit(existing?.metadata, audit(context.profile, context.role, 'preview_imported'))
  };

  if (existing) {
    const { data, error } = await context.supabase
      .from('store_vehicle_link_submissions')
      .update({ vehicle_url: sourceUrl, status: 'reviewing', notes: preview.description || null, metadata, updated_at: now })
      .eq('id', existing.id)
      .select('*')
      .single();
    if (error) throw error;
    return data;
  }

  const { count } = await context.supabase
    .from('store_vehicle_link_submissions')
    .select('id', { count: 'exact', head: true })
    .eq('store_id', context.store.id);

  const { data, error } = await context.supabase
    .from('store_vehicle_link_submissions')
    .insert({
      event_id: context.store.event_id || null,
      store_id: context.store.id,
      submitted_by_user_id: context.profile.id,
      position: (Number(count || 0) % 6) + 1,
      vehicle_url: sourceUrl,
      status: 'reviewing',
      notes: preview.description || null,
      metadata
    })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

function isStoredVehicleImage(url: string) {
  return url.includes('/storage/v1/object/public/vehicle-images/');
}

async function persistImages(request: Request, draft: any) {
  const selected = cleanImages(draft.image_urls);
  if (!selected.length || selected.every(isStoredVehicleImage)) return draft;

  const imported = await importerRequest(request, 'import', draft.source_url, selected);
  const uploaded = cleanImages(imported.uploadedImages);
  if (!uploaded.length) return draft;
  return { ...draft, image_url: uploaded[0], image_urls: uploaded };
}

async function saveDraft(context: ImportContext, submission: any, draft: any, action: ImportAction) {
  const now = new Date().toISOString();
  const metadata = {
    ...(submission.metadata || {}),
    source: 'olx_link_import',
    provider: 'olx',
    olx_ad_id: extractAdId(draft.source_url) || null,
    publication_status: action === 'submit_approval' ? 'aguardando_aprovacao' : 'rascunho_salvo',
    imported_preview: draft,
    missing_fields: missingFields(draft),
    submitted_for_approval_at: action === 'submit_approval' ? now : submission.metadata?.submitted_for_approval_at || null,
    audit_history: withAudit(submission.metadata, audit(context.profile, context.role, action))
  };

  const { data, error } = await context.supabase
    .from('store_vehicle_link_submissions')
    .update({ vehicle_url: draft.source_url, status: 'reviewing', notes: draft.description || null, metadata, updated_at: now })
    .eq('id', submission.id)
    .eq('store_id', context.store.id)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

async function publish(context: ImportContext, submission: any, draft: any) {
  const missing = missingFields(draft);
  if (missing.length) throw new ImportHttpError(`Preencha antes de publicar: ${missing.join(', ')}.`, 400, { missing });

  const now = new Date().toISOString();
  const payload = {
    campaign_id: null,
    store_id: context.store.id,
    store_name: context.store.store_name,
    brand: draft.brand.toUpperCase(),
    model: draft.model.toUpperCase(),
    version: draft.version || null,
    year: draft.year || null,
    mileage: draft.mileage || null,
    color: draft.color || null,
    transmission: draft.transmission || null,
    fuel: draft.fuel || null,
    price: draft.price,
    image_url: draft.image_url || null,
    image_urls: draft.image_urls,
    source_url: draft.source_url,
    status: 'disponivel',
    show_on_landing: draft.show_on_landing,
    is_featured: draft.is_featured,
    updated_at: now
  };

  const result = submission.imported_vehicle_id
    ? await context.supabase.from('site_vehicles').update(payload).eq('id', submission.imported_vehicle_id).neq('status', 'vendido').select('*').single()
    : await context.supabase.from('site_vehicles').insert({ ...payload, created_at: now }).select('*').single();
  if (result.error || !result.data) throw result.error || new Error('Não foi possível publicar o veículo.');

  const metadata = {
    ...(submission.metadata || {}),
    publication_status: 'publicado',
    imported_preview: draft,
    missing_fields: [],
    published_at: now,
    published_by_user_id: context.profile.id,
    audit_history: withAudit(submission.metadata, audit(context.profile, context.role, 'publish'))
  };

  const { error } = await context.supabase
    .from('store_vehicle_link_submissions')
    .update({
      vehicle_url: draft.source_url,
      status: 'published',
      imported_vehicle_id: result.data.id,
      notes: draft.description || null,
      metadata,
      updated_at: now
    })
    .eq('id', submission.id)
    .eq('store_id', context.store.id);
  if (error) throw error;

  return result.data;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const action = cleanText(body.action, 40) as ImportAction;
    if (!['preview', 'save_draft', 'submit_approval', 'publish'].includes(action)) {
      throw new ImportHttpError('Ação de importação inválida.', 400);
    }

    const context = await resolveContext(request, cleanText(body.store_id, 80));
    const submissionId = cleanText(body.submission_id, 80);
    const existing = await loadSubmission(context.supabase, submissionId, context.store.id);
    const sourceUrl = normalizeOlxUrl(body.source_url || body.url || existing?.vehicle_url);
    if (!sourceUrl) throw new ImportHttpError('Informe um link válido de anúncio da OLX.', 400);

    await ensureNoDuplicate(context.supabase, sourceUrl, existing?.id || '');

    if (action === 'preview') {
      const [generic, supplement] = await Promise.all([
        importerRequest(request, 'preview', sourceUrl),
        fetchOlxSupplement(sourceUrl).catch(() => null)
      ]);
      const preview = mergePreview(generic, supplement, sourceUrl);
      const submission = await savePreview(context, existing, sourceUrl, preview);
      return NextResponse.json({
        success: true,
        submission_id: submission.id,
        imported: preview,
        missing: missingFields(preview),
        role: context.role,
        can_publish: context.canPublish,
        store: context.store
      });
    }

    if (!existing) throw new ImportHttpError('Importe os dados antes de salvar ou publicar.', 404);
    let draft = normalizeDraft(body.vehicle || body, sourceUrl);

    if (action === 'save_draft' || action === 'submit_approval' || action === 'publish') {
      draft = await persistImages(request, draft);
    }

    if (action === 'publish') {
      if (!context.canPublish) {
        throw new ImportHttpError('Seu perfil pode revisar e enviar para aprovação, mas não publicar diretamente.', 403);
      }
      const vehicle = await publish(context, existing, draft);
      return NextResponse.json({ success: true, submission_id: existing.id, vehicle, message: 'Veículo publicado no portal.' });
    }

    await saveDraft(context, existing, draft, action);
    return NextResponse.json({
      success: true,
      submission_id: existing.id,
      imported: draft,
      missing: missingFields(draft),
      status: action === 'submit_approval' ? 'aguardando_aprovacao' : 'rascunho_salvo',
      message: action === 'submit_approval' ? 'Veículo enviado para aprovação.' : 'Rascunho salvo.'
    });
  } catch (error: any) {
    const status = error instanceof ImportHttpError ? error.status : 500;
    return NextResponse.json({
      error: error?.message || 'Erro ao importar anúncio da OLX.',
      ...(error instanceof ImportHttpError && error.details ? error.details : {})
    }, { status });
  }
}
