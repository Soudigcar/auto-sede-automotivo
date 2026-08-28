import { NextResponse } from 'next/server';
import { asStorePortalRole, authorizeStoreEntitlement, type StorePortalRole } from '@/lib/server/storePortal';
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
  event: any | null;
  eventId: string;
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

function readableError(value: unknown, fallback: string): string {
  if (typeof value === 'string') {
    const text = cleanText(value, 900);
    if (text && !/^\[object Object\]$/i.test(text)) return text;
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return readableError(record.message || record.error || record.detail, fallback);
  }
  return fallback;
}

function normalizeWebsiteUrl(value: unknown) {
  const raw = cleanText(value, 2200);
  if (!raw) return '';
  try {
    const parsed = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    if (!['http:', 'https:'].includes(parsed.protocol)) return '';
    if (parsed.username || parsed.password) return '';
    const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
    if (host === 'olx.com.br' || host.endsWith('.olx.com.br')) return '';
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return '';
  }
}

function cleanImageUrl(value: unknown) {
  const raw = cleanText(value, 2200);
  if (!raw) return '';
  try {
    const parsed = new URL(raw);
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.toString() : '';
  } catch {
    return '';
  }
}

function cleanImages(value: unknown) {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map(cleanImageUrl).filter(Boolean))).slice(0, 30);
}

function parsePrice(value: unknown) {
  if (typeof value === 'number') return Number.isFinite(value) ? Math.max(0, value) : 0;
  const raw = String(value || '').replace(/[^\d,.]/g, '');
  if (!raw) return 0;
  if (raw.includes(',')) return Number(raw.replace(/\./g, '').replace(',', '.')) || 0;
  return Number(raw.replace(/\D/g, '')) || 0;
}

function normalizeDraft(value: any, sourceUrl: string) {
  const images = cleanImages(value?.image_urls || value?.images);
  const cover = cleanImageUrl(value?.image_url) || images[0] || '';
  return {
    source_url: normalizeWebsiteUrl(value?.source_url || sourceUrl),
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

function internalHeaders(request: Request) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  for (const name of ['cookie', 'authorization', 'x-vercel-protection-bypass', 'x-vercel-set-bypass-cookie']) {
    const value = request.headers.get(name);
    if (value) headers[name] = value;
  }
  return headers;
}

async function siteImporterRequest(request: Request, action: 'preview' | 'import', url: string, images?: string[]) {
  const response = await fetch(`${new URL(request.url).origin}/api/site-import`, {
    method: 'POST',
    headers: internalHeaders(request),
    body: JSON.stringify({ action, url, images }),
    cache: 'no-store'
  });

  const raw = await response.text();
  let result: any = {};
  try {
    result = raw ? JSON.parse(raw) : {};
  } catch {
    result = { error: raw };
  }

  if (!response.ok) {
    throw new ImportHttpError(
      `${readableError(result?.error || result, 'Não foi possível ler o site da loja.')} Status ${response.status}.`,
      response.status === 403 ? 502 : response.status
    );
  }

  return result;
}

function mapImporterPreview(result: any, sourceUrl: string) {
  const vehicle = result?.vehicle || {};
  return normalizeDraft({
    source_url: sourceUrl,
    title: result?.title || vehicle?.title,
    description: result?.description || vehicle?.description,
    brand: vehicle?.brand,
    model: vehicle?.model,
    version: vehicle?.version,
    year: vehicle?.year,
    mileage: vehicle?.mileage,
    color: vehicle?.color,
    transmission: vehicle?.transmission,
    fuel: vehicle?.fuel,
    price: result?.price || vehicle?.price,
    image_url: vehicle?.image_url || result?.images?.[0],
    image_urls: result?.images || vehicle?.image_urls,
    show_on_landing: true,
    is_featured: false
  }, sourceUrl);
}

async function resolveContext(request: Request, body: any): Promise<ImportContext> {
  const supabase: any = createAdminClient();
  const profile = await getProfileFromToken(supabase, readBearerToken(request));
  const role = asStorePortalRole(profile?.role);

  if (!profile || profile.status !== 'active' || !role) {
    throw new ImportHttpError('Usuário sem perfil ativo para importar veículos.', 403);
  }

  const storeId = role === 'master' ? cleanText(body.store_id, 80) : cleanText(profile.store_id, 80);
  if (!storeId) throw new ImportHttpError('Selecione a loja proprietária.', 400);

  const { data: store, error: storeError } = await supabase
    .from('stores')
    .select('id,store_name,slug,event_id,status,portal_enabled')
    .eq('id', storeId)
    .maybeSingle();
  if (storeError) throw storeError;
  if (!store || store.status !== 'active') {
    throw new ImportHttpError('A loja está inativa ou indisponível.', 409);
  }
  if (role !== 'master' && profile.store_id !== store.id) {
    throw new ImportHttpError('Você não pode importar veículos para outra loja.', 403);
  }

  const entitlement = await authorizeStoreEntitlement(supabase, {
    role,
    storeId: store.id,
    profileStoreId: profile.store_id,
    store
  });
  if ('error' in entitlement) {
    throw new ImportHttpError('O acesso ao sistema requer uma assinatura válida.', entitlement.error.status);
  }

  const requestedEventId = cleanText(body.event_id, 80);
  const eventId = requestedEventId || cleanText(store.event_id, 80);
  let event: any = null;

  if (eventId) {
    const eventResult = await supabase
      .from('events')
      .select('id,event_name,status,start_date,end_date')
      .eq('id', eventId)
      .neq('status', 'deleted')
      .maybeSingle();
    if (eventResult.error) throw eventResult.error;
    if (!eventResult.data) throw new ImportHttpError('Evento não encontrado.', 404);
    event = eventResult.data;

    const participationResult = await supabase
      .from('store_event_participations')
      .select('id,status')
      .eq('event_id', eventId)
      .eq('store_id', store.id)
      .maybeSingle();
    const legacyParticipation = String(store.event_id || '') === eventId;
    const activeParticipation = participationResult.data && !['deleted', 'inactive', 'ended'].includes(String(participationResult.data.status || '').toLowerCase());
    if (!legacyParticipation && !activeParticipation) {
      throw new ImportHttpError('A loja selecionada não participa deste evento.', 409);
    }
  }

  return { supabase, profile, role, store, event, eventId, canPublish: role === 'master' || role === 'store' };
}

async function loadSubmission(supabase: any, id: string, storeId: string) {
  if (!id) return null;
  const result = await supabase
    .from('store_vehicle_link_submissions')
    .select('*')
    .eq('id', id)
    .eq('store_id', storeId)
    .maybeSingle();
  if (result.error) throw result.error;
  return result.data || null;
}

async function findReusableSubmission(context: ImportContext, sourceUrl: string, existing: any) {
  if (existing) return existing;
  let query = context.supabase
    .from('store_vehicle_link_submissions')
    .select('*')
    .eq('store_id', context.store.id)
    .eq('vehicle_url', sourceUrl)
    .not('status', 'in', '(rejected,duplicate,published)')
    .limit(1);
  if (context.eventId) query = query.eq('event_id', context.eventId);
  else query = query.is('event_id', null);
  const result = await query.maybeSingle();
  return result.data || null;
}

async function ensureNoPublishedDuplicate(context: ImportContext, sourceUrl: string) {
  const result = await context.supabase
    .from('site_vehicles')
    .select('id,store_id,status,source_url')
    .eq('source_url', sourceUrl)
    .neq('status', 'excluido')
    .limit(1);
  if (result.data?.[0]) {
    throw new ImportHttpError('Este link já corresponde a um veículo publicado no portal.', 409, { duplicate: result.data[0] });
  }
}

async function savePreview(context: ImportContext, existing: any, sourceUrl: string, preview: any) {
  const now = new Date().toISOString();
  const metadata = {
    ...(existing?.metadata || {}),
    source: 'website_link_import',
    provider: 'website',
    publication_status: 'em_revisao',
    imported_preview: preview,
    missing_fields: missingFields(preview),
    imported_at: now,
    audit_history: withAudit(existing?.metadata, audit(context.profile, context.role, 'website_preview_imported'))
  };

  if (existing) {
    const result = await context.supabase
      .from('store_vehicle_link_submissions')
      .update({
        event_id: context.eventId || null,
        vehicle_url: sourceUrl,
        status: 'reviewing',
        notes: preview.description || null,
        metadata,
        updated_at: now
      })
      .eq('id', existing.id)
      .eq('store_id', context.store.id)
      .select('*')
      .single();
    if (result.error) throw result.error;
    return result.data;
  }

  const countResult = await context.supabase
    .from('store_vehicle_link_submissions')
    .select('id', { count: 'exact', head: true })
    .eq('store_id', context.store.id);

  const result = await context.supabase
    .from('store_vehicle_link_submissions')
    .insert({
      event_id: context.eventId || null,
      store_id: context.store.id,
      submitted_by_user_id: context.profile.id,
      position: (Number(countResult.count || 0) % 6) + 1,
      vehicle_url: sourceUrl,
      status: 'reviewing',
      notes: preview.description || null,
      metadata
    })
    .select('*')
    .single();
  if (result.error) throw result.error;
  return result.data;
}

function isStoredImage(url: string) {
  return url.includes('/storage/v1/object/public/vehicle-images/');
}

async function persistImages(request: Request, draft: any) {
  const selected = cleanImages(draft.image_urls);
  if (!selected.length || selected.every(isStoredImage)) return draft;
  const result = await siteImporterRequest(request, 'import', draft.source_url, selected);
  const uploaded = cleanImages(result.uploadedImages);
  if (!uploaded.length) return draft;
  return { ...draft, image_url: uploaded[0], image_urls: uploaded };
}

async function saveDraft(context: ImportContext, submission: any, draft: any, action: ImportAction) {
  const now = new Date().toISOString();
  const metadata = {
    ...(submission.metadata || {}),
    source: 'website_link_import',
    provider: 'website',
    publication_status: action === 'submit_approval' ? 'aguardando_aprovacao' : 'rascunho_salvo',
    imported_preview: draft,
    missing_fields: missingFields(draft),
    submitted_for_approval_at: action === 'submit_approval' ? now : submission.metadata?.submitted_for_approval_at || null,
    audit_history: withAudit(submission.metadata, audit(context.profile, context.role, action))
  };

  const result = await context.supabase
    .from('store_vehicle_link_submissions')
    .update({
      event_id: context.eventId || submission.event_id || null,
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
  if (result.error) throw result.error;
  return result.data;
}

async function publish(context: ImportContext, submission: any, draft: any) {
  const missing = missingFields(draft);
  if (missing.length) {
    throw new ImportHttpError(`Preencha antes de publicar: ${missing.join(', ')}.`, 400, { missing });
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
    show_on_landing: context.store.portal_enabled === true && draft.show_on_landing === true,
    is_featured: context.store.portal_enabled === true && draft.is_featured === true,
    updated_at: now
  };

  const vehicleResult = submission.imported_vehicle_id
    ? await context.supabase.from('site_vehicles').update(payload).eq('id', submission.imported_vehicle_id).neq('status', 'vendido').select('*').single()
    : await context.supabase.from('site_vehicles').insert({ ...payload, created_at: now }).select('*').single();
  if (vehicleResult.error || !vehicleResult.data) {
    throw vehicleResult.error || new Error('Não foi possível publicar o veículo.');
  }

  if (context.eventId) {
    const assignmentResult = await context.supabase
      .from('event_vehicle_assignments')
      .upsert({
        event_id: context.eventId,
        store_id: context.store.id,
        vehicle_id: vehicleResult.data.id,
        status: 'active',
        show_on_landing: true,
        is_featured: false,
        display_order: 0,
        promotional_price: null,
        source: 'manual',
        updated_at: now
      }, { onConflict: 'event_id,vehicle_id' });
    if (assignmentResult.error) throw assignmentResult.error;
  }

  const metadata = {
    ...(submission.metadata || {}),
    publication_status: 'publicado',
    imported_preview: draft,
    missing_fields: [],
    published_at: now,
    published_by_user_id: context.profile.id,
    audit_history: withAudit(submission.metadata, audit(context.profile, context.role, 'publish'))
  };

  const submissionResult = await context.supabase
    .from('store_vehicle_link_submissions')
    .update({
      event_id: context.eventId || submission.event_id || null,
      vehicle_url: draft.source_url,
      status: 'published',
      imported_vehicle_id: vehicleResult.data.id,
      notes: draft.description || null,
      metadata,
      updated_at: now
    })
    .eq('id', submission.id)
    .eq('store_id', context.store.id);
  if (submissionResult.error) throw submissionResult.error;

  return vehicleResult.data;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const action = cleanText(body.action, 40) as ImportAction;
    if (!['preview', 'save_draft', 'submit_approval', 'publish'].includes(action)) {
      throw new ImportHttpError('Ação de importação inválida.', 400);
    }

    const context = await resolveContext(request, body);
    if (context.event && context.event.status !== 'active') {
      throw new ImportHttpError('Este evento está inativo e disponível somente para consulta histórica.', 409);
    }

    const submissionId = cleanText(body.submission_id, 80);
    let existing = await loadSubmission(context.supabase, submissionId, context.store.id);
    const sourceUrl = normalizeWebsiteUrl(body.source_url || body.url || body.vehicle?.source_url || existing?.vehicle_url);
    if (!sourceUrl) {
      throw new ImportHttpError('Informe um link válido do site da loja. Links da OLX devem usar a extensão do navegador.', 400);
    }

    if (action === 'preview') {
      existing = await findReusableSubmission(context, sourceUrl, existing);
      await ensureNoPublishedDuplicate(context, sourceUrl);
      const imported = await siteImporterRequest(request, 'preview', sourceUrl);
      const preview = mapImporterPreview(imported, sourceUrl);
      if (!preview.title && !preview.model && !preview.description && !preview.image_urls.length) {
        throw new ImportHttpError('O site foi acessado, mas não foram encontrados dados suficientes do veículo.', 422);
      }
      const submission = await savePreview(context, existing, sourceUrl, preview);
      return NextResponse.json({
        success: true,
        submission_id: submission.id,
        imported: preview,
        missing: missingFields(preview),
        role: context.role,
        can_publish: context.canPublish,
        store: context.store,
        event: context.event
      });
    }

    if (!existing) throw new ImportHttpError('Importe os dados antes de salvar ou publicar.', 404);
    let draft = normalizeDraft(body.vehicle || body, sourceUrl);
    draft = await persistImages(request, draft);

    if (action === 'publish') {
      if (!context.canPublish) {
        throw new ImportHttpError('Seu perfil pode revisar e enviar para aprovação, mas não publicar diretamente.', 403);
      }
      const vehicle = await publish(context, existing, draft);
      return NextResponse.json({ success: true, submission_id: existing.id, vehicle, message: 'Veículo publicado no portal e vinculado ao evento.' });
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
      error: readableError(error?.message || error, 'Erro ao importar o site da loja.'),
      ...(error instanceof ImportHttpError && error.details ? error.details : {})
    }, { status });
  }
}
