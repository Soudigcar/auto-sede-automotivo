import { NextResponse } from 'next/server';
import { asStorePortalRole, type StorePortalRole } from '@/lib/server/storePortal';
import { cleanText, createAdminClient, getProfileFromToken, readBearerToken } from '@/lib/server/storeTeam';
import { extractCanonicalOlxUrl, extractOlxAdId } from '@/lib/olxSharedUrl';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function parsePrice(value: unknown) {
  if (typeof value === 'number') return Number.isFinite(value) ? Math.max(0, value) : 0;
  const raw = String(value || '').replace(/[^\d,.]/g, '');
  if (!raw) return 0;
  if (raw.includes(',')) return Number(raw.replace(/\./g, '').replace(',', '.')) || 0;
  return Number(raw.replace(/\D/g, '')) || 0;
}

function cleanHttpUrl(value: unknown) {
  try {
    const url = new URL(cleanText(value, 2200));
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : '';
  } catch {
    return '';
  }
}

function normalizeVehicle(value: any, sourceUrl: string) {
  const images = Array.from(new Set((Array.isArray(value?.image_urls) ? value.image_urls : []).map(cleanHttpUrl).filter(Boolean))).slice(0, 20);
  const cover = cleanHttpUrl(value?.image_url) || images[0] || '';
  return {
    source_url: sourceUrl,
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

function audit(profile: any, role: StorePortalRole) {
  return {
    action: 'browser_preview_imported',
    at: new Date().toISOString(),
    user_id: profile.id,
    user_name: profile.full_name || profile.email || 'Usuário',
    role
  };
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const supabase: any = createAdminClient();
    const profile = await getProfileFromToken(supabase, readBearerToken(request));
    const role = asStorePortalRole(profile?.role);

    if (!profile || profile.status !== 'active' || !role) {
      return NextResponse.json({ error: 'Usuário sem perfil ativo para importar veículos.' }, { status: 403 });
    }

    const storeId = role === 'master' ? cleanText(body.store_id, 80) : cleanText(profile.store_id, 80);
    if (!storeId) return NextResponse.json({ error: 'Selecione a loja proprietária.' }, { status: 400 });

    const { data: store, error: storeError } = await supabase
      .from('stores')
      .select('id,store_name,event_id,status,portal_enabled')
      .eq('id', storeId)
      .maybeSingle();
    if (storeError) throw storeError;
    if (!store || store.status !== 'active' || !store.portal_enabled) {
      return NextResponse.json({ error: 'A loja está inativa ou indisponível no portal.' }, { status: 409 });
    }
    if (role !== 'master' && profile.store_id !== store.id) {
      return NextResponse.json({ error: 'Você não pode importar veículos para outra loja.' }, { status: 403 });
    }

    const sourceUrl = extractCanonicalOlxUrl(body.source_url || body.vehicle?.source_url);
    if (!sourceUrl) return NextResponse.json({ error: 'O navegador não enviou um link válido da OLX.' }, { status: 400 });
    const preview = normalizeVehicle(body.vehicle || body, sourceUrl);
    if (!preview.title && !preview.model && !preview.description && !preview.image_urls.length) {
      return NextResponse.json({ error: 'A extensão não encontrou dados suficientes neste anúncio.' }, { status: 422 });
    }

    const submissionId = cleanText(body.submission_id, 80);
    let existing: any = null;
    if (submissionId) {
      const result = await supabase
        .from('store_vehicle_link_submissions')
        .select('*')
        .eq('id', submissionId)
        .eq('store_id', store.id)
        .maybeSingle();
      existing = result.data || null;
    }

    const adId = extractOlxAdId(sourceUrl);
    let duplicateQuery = supabase
      .from('store_vehicle_link_submissions')
      .select('id,store_id,status')
      .not('status', 'in', '(rejected,duplicate)')
      .limit(5);
    duplicateQuery = adId ? duplicateQuery.ilike('vehicle_url', `%${adId}%`) : duplicateQuery.eq('vehicle_url', sourceUrl);
    const duplicateResult = await duplicateQuery;
    const duplicate = (duplicateResult.data || []).find((item: any) => item.id !== existing?.id);
    if (duplicate) {
      return NextResponse.json({ error: 'Este anúncio da OLX já foi importado ou está em revisão.', duplicate }, { status: 409 });
    }

    const now = new Date().toISOString();
    const previousAudit = Array.isArray(existing?.metadata?.audit_history) ? existing.metadata.audit_history : [];
    const metadata = {
      ...(existing?.metadata || {}),
      source: 'olx_browser_extension',
      provider: 'olx',
      olx_ad_id: adId || null,
      publication_status: 'em_revisao',
      imported_preview: preview,
      missing_fields: missingFields(preview),
      imported_at: now,
      audit_history: [...previousAudit, audit(profile, role)].slice(-100)
    };

    let submission: any;
    if (existing) {
      const result = await supabase
        .from('store_vehicle_link_submissions')
        .update({ vehicle_url: sourceUrl, status: 'reviewing', notes: preview.description || null, metadata, updated_at: now })
        .eq('id', existing.id)
        .select('*')
        .single();
      if (result.error) throw result.error;
      submission = result.data;
    } else {
      const { count } = await supabase
        .from('store_vehicle_link_submissions')
        .select('id', { count: 'exact', head: true })
        .eq('store_id', store.id);
      const result = await supabase
        .from('store_vehicle_link_submissions')
        .insert({
          event_id: store.event_id || null,
          store_id: store.id,
          submitted_by_user_id: profile.id,
          position: (Number(count || 0) % 6) + 1,
          vehicle_url: sourceUrl,
          status: 'reviewing',
          notes: preview.description || null,
          metadata
        })
        .select('*')
        .single();
      if (result.error) throw result.error;
      submission = result.data;
    }

    return NextResponse.json({
      success: true,
      submission_id: submission.id,
      imported: preview,
      missing: missingFields(preview),
      role,
      can_publish: role === 'master' || role === 'store',
      store
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Erro ao receber o anúncio lido pelo navegador.' }, { status: 500 });
  }
}
