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

function decodeJsonString(value: string) {
  try {
    return JSON.parse(`"${String(value || '').replace(/"/g, '\\"')}"`);
  } catch {
    return String(value || '')
      .replace(/\\u([0-9a-f]{4})/gi, (_, code) => String.fromCharCode(parseInt(code, 16)))
      .replace(/\\\//g, '/')
      .replace(/\\n/g, '\n')
      .replace(/\\"/g, '"');
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
    parsed.hash = '';
    parsed.search = '';
    parsed.pathname = parsed.pathname.replace(/\/{2,}/g, '/').replace(/\/$/, '');
    return parsed.toString();
  } catch {
    return '';
  }
}

function olxAdId(url: string) {
  const pathname = (() => {
    try { return new URL(url).pathname; } catch { return url; }
  })();
  const candidates = Array.from(pathname.matchAll(/(?:^|[-/])(\d{7,})(?=$|[-/])/g));
  return candidates.at(-1)?.[1] || pathname.match(/(\d{7,})/)?.[1] || '';
}

function cleanImageUrl(value: unknown) {
  const raw = cleanText(value, 2200).replace(/\\u002F/gi, '/').replace(/\\\//g, '/');
  if (!raw) return '';
  try {
    const parsed = new URL(raw);
    if (!['http:', 'https:'].includes(parsed.protocol)) return '';
    return parsed.toString();
  } catch {
    return '';
  }
}

function cleanImages(value: unknown) {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map(cleanImageUrl).filter(Boolean))).slice(0, 20);
}

function parsePrice(value: unknown) {
  if (typeof value === 'number') return Number.isFinite(value) ? Math.max(0, value) : 0;
  const raw = String(value || '').replace(/[^\d,.]/g, '');
  if (!raw) return 0;
  if (raw.includes(',')) return Number(raw.replace(/\./g, '').replace(',', '.')) || 0;
  return Number(raw.replace(/\D/g, '')) || 0;
}

function extractJsonLabel(html: string, key: string) {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [
    new RegExp(`"${escapedKey}"\\s*:\\s*\\{\\s*"single"\\s*:\\s*\\{[^{}]*?"label"\\s*:\\s*"((?:\\\\.|[^"])*)"`, 'i'),
    new RegExp(`\\\\"${escapedKey}\\\\"\\s*:\\s*\\{\\s*\\\\"single\\\\"\\s*:\\s*\\{[^{}]*?\\\\"label\\\\"\\s*:\\s*\\\\"((?:\\\\.|[^"])*)\\\\"`, 'i')
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return cleanText(decodeJsonString(match[1]), 500);
  }
  return '';
}

function extractJsonValue(html: string, key: string) {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [
    new RegExp(`"${escapedKey}"\\s*:\\s*"((?:\\\\.|[^"])*)"`, 'i'),
    new RegExp(`\\\\"${escapedKey}\\\\"\\s*:\\s*\\\\"((?:\\\\.|[^"])*)\\\\"`, 'i')
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return cleanText(decodeJsonString(match[1]), 12000);
  }
  return '';
}

function extractOlxImages(html: string) {
  const normalized = html.replace(/\\u002F/gi, '/').replace(/\\\//g, '/');
  const images: string[] = [];

  for (const match of normalized.matchAll(/https?:\/\/img\.olx\.com\.br\/[^"])'\s<>]+/gi)) {
    const url = cleanImageUrl(match[0]);
    if (url && /\.(?:jpg|jpeg|png|webp)(?:\?|$)/i.test(url)) images.push(url);
  }

  const pairPattern = /"base_url"\s*:\s*"(https?:\/\/img\.olx\.com\.br)"[\s\S]{0,260}?"path"\s*:\s*"([^"]+)"/gi;
  for (const match of normalized.matchAll(pairPattern)) {
    const url = cleanImageUrl(`${match[1]}/${match[2]}`);
    if (url) images.push(url);
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

  const priceValue = Number(html.match(/"price_value"\s*:\s*(\d{4,9})/i)?.[1] || 0);
  const subject = extractJsonValue(html, 'subject');
  const body = extractJsonValue(html, 'body') || cleanText(metaDescription, 12000);

  return {
    title: subject,
    description: body,
    price: priceValue,
    images: extractOlxImages(html),
    vehicle: {
      brand: extractJsonLabel(html, 'vehicle_brand'),
      model: extractJsonLabel(html, 'vehicle_model'),
      version: extractJsonLabel(html, 'vehicle_model'),
      year: extractJsonLabel(html, 'regdate'),
      mileage: extractJsonLabel(html, 'mileage'),
      fuel: extractJsonLabel(html, 'fuel'),
      transmission: extractJsonLabel(html, 'gearbox'),
      color: extractJsonLabel(html, 'carcolor')
    }
  };
}

function mergePreview(generic: any, supplement: any, sourceUrl: string) {
  const baseVehicle = generic?.vehicle || {};
  const extraVehicle = supplement?.vehicle || {};
  const images = Array.from(new Set([
    ...(Array.isArray(supplement?.images) ? supplement.images : []),
    ...(Array.isArray(generic?.images) ? generic.images : [])
  ].map(cleanImageUrl).filter(Boolean))).slice(0, 20);

  return {
    source_url: sourceUrl,
    title: cleanText(supplement?.title || generic?.title, 500),
    description: cleanText(supplement?.description || generic?.description, 12000),
    brand: cleanText(extraVehicle.brand || baseVehicle.brand, 100),
    model: cleanText(baseVehicle.model || extraVehicle.model, 140),
    version: cleanText(baseVehicle.version || extraVehicle.version, 220),
    year: cleanText(extraVehicle.year || baseVehicle.year, 40),
    mileage: cleanText(extraVehicle.mileage || baseVehicle.mileage, 80),
    color: cleanText(extraVehicle.color || baseVehicle.color, 80),
    transmission: cleanText(extraVehicle.transmission || baseVehicle.transmission, 80),
    fuel: cleanText(extraVehicle.fuel || baseVehicle.fuel, 80),
    price: parsePrice(supplement?.price || generic?.price || baseVehicle.price),
    image_url: images[0] || cleanImageUrl(baseVehicle.image_url),
    image_urls: images
  };
}

function requiredMissing(payload: any) {
  const missing: string[] = [];
  if (!payload.source_url) missing.push('link original');
  if (!cleanText(payload.brand, 100)) missing.push('marca');
  if (!cleanText(payload.model, 140)) missing.push('modelo');
  if (!cleanText(payload.year, 40)) missing.push('ano');
  if (!(parsePrice(payload.price) > 0)) missing.push('valor');
  if (!cleanImages(payload.image_urls).length) missing.push('pelo menos 1 foto');
  return missing;
}

function auditEntry(profile: any, role: StorePortalRole, action: string) {
  return {
    action,
    at: new Date().toISOString(),
    user_id: profile.id,
    user_name: profile.full_name || profile.email || 'Usuário',
    role
  };
}

function appendAudit(metadata: any, entry: any) {
  const history = Array.isArray(metadata?.audit_history) ? metadata.audit_history : [];
  return [...history, entry].slice(-100);
}

async function resolveContext(request: Request, requestedStoreId: string): Promise<ImportContext | NextResponse> {
  const supabase: any = createAdminClient();
  const profile = await getProfileFromToken(supabase, readBearerToken(request));
  const role = asStorePortalRole(profile?.role);

  if (!profile || profile.status !== 'active' || !role) {
    return NextResponse.json({ error: 'Usuário sem perfil ativo para importar veículos.' }, { status: 403 });
  }

  const storeId = role === 'master' ? cleanText(requestedStoreId, 80) : cleanText(profile.store_id, 80);
  if (!storeId) return NextResponse.json({ error: 'Selecione a loja proprietária.' }, { status: 400 });

  const { data: store, error } = await supabase
    .from('stores')
    .select('id,store_name,slug,event_id,status,portal_enabled')
    .eq('id', storeId)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!store || store.status !== 'active' || !store.portal_enabled) {
    return NextResponse.json({ error: 'A loja está inativa ou indisponível no portal.' }, { status: 409 });
  }
  if (role !== 'master' && profile.store_id !== store.id) {
    return NextResponse.json({ error: 'Você não pode importar veículos para outra loja.' }, { status: 403 });
  }

  return { supabase, profile, role, store, canPublish: role === 'master' || role === 'store' };
}

async function importerRequest(request: Request, action: 'preview' | 'import', url: string, images?: string[]) {
  const origin = new URL(request.url).origin;
  const response = await fetch(`${origin}/api/site-import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, url, images })
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'Não foi possível importar o anúncio da OLX.');
  return result;
}

async function findDuplicate(supabase: any, sourceUrl: string, adId: string, ignoredSubmissionId = '') {
  const submissionQuery = supabase
    .from('store_vehicle_link_submissions')
    .select('id,store_id,status,vehicle_url,imported_vehicle_id,metadata')
    .neq('status', 'rejected')
    .neq('status', 'duplicate')
    .limit(5);
  const submissionResult = adId
    ? await submissionQuery.ilike('vehicle_url', `%${adId}%`)
    : await submissionQuery.eq('vehicle_url', sourceUrl);
  const submission = (submissionResult.data || []).find((item: any) => item.id !== ignoredSubmissionId) || null;

  const vehicleQuery = supabase
    .from('site_vehicles')
    .select('id,store_id,status,source_url,brand,model')
    .neq('status', 'excluido')
    .limit(5);
  const vehicleResult = adId
    ? await vehicleQuery.ilike('source_url', `%${adId}%`)
    : await vehicleQuery.eq('source_url', sourceUrl);

  return { submission, vehicle: vehicleResult.data?.[0] || null };
}

async function loadSubmission(supabase: any, submissionId: string, storeId: string) {
  if (!submissionId) return null;
  const { data } = await supabase
    .from('store_vehicle_link_submissions')
    .select('*')
    .eq('id', submissionId)
    .eq('store_id', storeId)
    .maybeSingle();
  return data || null;
}

async function createOrUpdatePreview(context: ImportContext, sourceUrl: string, adId: string, preview: any, submissionId: string) {
  const now = new Date().toISOString();
  const existing = await loadSubmission(context.supabase, submissionId, context.store.id);
  const metadata = {
    ...(existing?.metadata || {}),
    source: 'olx_link_import',
    provider: 'olx',
    olx_ad_id: adId || null,
    publication_status: 'em_revisao',
    imported_preview: preview,
    imported_at: now,
    missing_fields: requiredMissing(preview),
    audit_history: appendAudit(existing?.metadata, auditEntry(context.profile, context.role, 'preview_imported'))
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

function normalizedDraft(body: any, fallbackUrl: string) {
  const images = cleanImages(body.image_urls);
  const cover = cleanImageUrl(body.image_url) || images[0] || '';
  return {
    source_url: normalizeOlxUrl(body.source_url || fallbackUrl),
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
    image_url: cover,
    image_urls: Array.from(new Set([cover, ...images].filter(Boolean))),
    show_on_landing: body.show_on_landing !== false,
    is_featured: body.is_featured === true
  };
}

async function persistSelectedImages(request: Request, draft: any) {
  const result = await importerRequest(request, 'import', draft.source_url, draft.image_urls);
  const uploaded = cleanImages(result.uploadedImages);
  const images = uploaded.length ? uploaded : draft.image_urls;
  return { ...draft, image_url: images[0] || draft.image_url, image_urls: images };
}

async function saveSubmissionDraft(context: ImportContext, submission: any, draft: any, action: ImportAction) {
  const now = new Date().toISOString();
  const metadata = {
    ...(submission.metadata || {}),
    source: 'olx_link_import',
    provider: 'olx',
    olx_ad_id: olxAdId(draft.source_url) || null,
    publication_status: action === 'submit_approval' ? 'aguardando_aprovacao' : 'rascunho_salvo',
    imported_preview: draft,
    missing_fields: requiredMissing(draft),
    submitted_for_approval_at: action === 'submit_approval' ? now : submission.metadata?.submitted_for_approval_at || null,
    audit_history: appendAudit(submission.metadata, auditEntry(context.profile, context.role, action))
  };

  const { data, error } = await context.supabase
    .from('store_vehicle_link_submissions')
    .update({
      vehicle_url: draft.source_url,
      status: 'reviewing',
      notes: draft.description || null,
      metadata,
      updated_at: now
    })
    .eq('id', submission.id)
    .eq('store_id', context.store.id)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

async function publishVehicle(context: ImportContext, submission: any, draft: any) {
  const missing = requiredMissing(draft);
  if (missing.length) {
    return NextResponse.json({ error: `Preencha antes de publicar: ${missing.join(', ')}.`, missing }, { status: 400 });
  }

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

  let vehicle: any = null;
  if (submission.imported_vehicle_id) {
    const result = await context.supabase
      .from('site_vehicles')
      .update(payload)
      .eq('id', submission.imported_vehicle_id)
      .neq('status', 'vendido')
      .select('*')
      .single();
    if (result.error) throw result.error;
    vehicle = result.data;
  } else {
    const result = await context.supabase
      .from('site_vehicles')
      .insert({ ...payload, created_at: now })
      .select('*')
      .single();
    if (result.error) throw result.error;
    vehicle = result.data;
  }

  const metadata = {
    ...(submission.metadata || {}),
    publication_status: 'publicado',
    imported_preview: draft,
    missing_fields: [],
    published_at: now,
    published_by_user_id: context.profile.id,
    audit_history: appendAudit(submission.metadata, auditEntry(context.profile, context.role, 'publish'))
  };

  const { error } = await context.supabase
    .from('store_vehicle_link_submissions')
    .update({
      vehicle_url: draft.source_url,
      status: 'published',
      imported_vehicle_id: vehicle.id,
      notes: draft.description || null,
      metadata,
      updated_at: now
    })
    .eq('id', submission.id)
    .eq('store_id', context.store.id);
  if (error) throw error;

  return NextResponse.json({ success: true, vehicle, submission_id: submission.id, message: 'Veículo publicado no portal.' });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const action = cleanText(body.action, 40) as ImportAction;
    if (!['preview', 'save_draft', 'submit_approval', 'publish'].includes(action)) {
      return NextResponse.json({ error: 'Ação de importação inválida.' }, { status: 400 });
    }

    const contextResult = await resolveContext(request, cleanText(body.store_id, 80));
    if (contextResult instanceof NextResponse) return contextResult;
    const context = contextResult;

    const submissionId = cleanText(body.submission_id, 80);
    const existingSubmission = await loadSubmission(context.supabase, submissionId, context.store.id);
    const sourceUrl = normalizeOlxUrl(body.source_url || body.url || existingSubmission?.vehicle_url);
    if (!sourceUrl) return NextResponse.json({ error: 'Informe um link válido de anúncio da OLX.' }, { status: 400 });

    const adId = olxAdId(sourceUrl);
    const duplicate = await findDuplicate(context.supabase, sourceUrl, adId, existingSubmission?.id || '');
    if (duplicate.vehicle || duplicate.submission) {
      return NextResponse.json({
        error: 'Este anúncio da OLX já foi importado ou está em revisão.',
        duplicate: {
          vehicle_id: duplicate.vehicle?.id || null,
          submission_id: duplicate.submission?.id || null,
          store_id: duplicate.vehicle?.store_id || duplicate.submission?.store_id || null,
          status: duplicate.vehicle?.status || duplicate.submission?.status || null
        }
      }, { status: 409 });
    }

    if (action === 'preview') {
      const [generic, supplement] = await Promise.all([
        importerRequest(request, 'preview', sourceUrl),
        fetchOlxSupplement(sourceUrl).catch(() => null)
      ]);
      const preview = mergePreview(generic, supplement, sourceUrl);
      const submission = await createOrUpdatePreview(context, sourceUrl, adId, preview, existingSubmission?.id || submissionId);
      return NextResponse.json({
        success: true,
        submission_id: submission.id,
        imported: preview,
        missing: requiredMissing(preview),
        role: context.role,
        can_publish: context.canPublish,
        store: context.store
      });
    }

    const submission = existingSubmission;
    if (!submission) return NextResponse.json({ error: 'Importe os dados antes de salvar ou publicar.' }, { status: 404 });

    let draft = normalizedDraft(body.vehicle || body, sourceUrl);
    if (action === 'submit_approval' || action === 'publish') {
      draft = await persistSelectedImages(request, draft);
    }

    if (action === 'publish') {
      if (!context.canPublish) {
        return NextResponse.json({ error: 'Seu perfil pode revisar e enviar para aprovação, mas não publicar diretamente.' }, { status: 403 });
      }
      return publishVehicle(context, submission, draft);
    }

    const saved = await saveSubmissionDraft(context, submission, draft, action);
    return NextResponse.json({
      success: true,
      submission_id: saved.id,
      imported: draft,
      missing: requiredMissing(draft),
      status: action === 'submit_approval' ? 'aguardando_aprovacao' : 'rascunho_salvo',
      message: action === 'submit_approval' ? 'Veículo enviado para aprovação.' : 'Rascunho salvo.'
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Erro ao importar anúncio da OLX.' }, { status: 500 });
  }
}
