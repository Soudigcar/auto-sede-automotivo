import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { aggregateMarketListings } from '@/lib/server/automotive-market-radar/aggregate';
import type { NormalizedMarketListing, RadarListingStatus } from '@/lib/server/automotive-market-radar/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

type RadarPayload = {
  collected_at: string;
  fipe_reference_month?: string | null;
  notes?: string | null;
  metadata?: Record<string, unknown>;
  listings: NormalizedMarketListing[];
};

const allowedStatuses = new Set<RadarListingStatus>([
  'valid', 'duplicate', 'invalid_price', 'promotional', 'auction', 'damaged',
  'financing_entry', 'version_conflict', 'out_of_region', 'other_rejected'
]);

function unauthorized() {
  return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
}

function validatePayload(payload: RadarPayload) {
  if (!payload || !Array.isArray(payload.listings)) return 'Payload inválido: listings é obrigatório.';
  if (!payload.collected_at || Number.isNaN(Date.parse(payload.collected_at))) {
    return 'Payload inválido: collected_at deve ser uma data ISO válida.';
  }
  if (payload.listings.length > 10000) return 'Payload excede o limite de 10.000 anúncios.';

  for (const listing of payload.listings) {
    if (!listing.source_name || !listing.source_url || !listing.title || !listing.collected_at) {
      return 'Anúncio inválido: fonte, URL, título e data são obrigatórios.';
    }
    if (listing.state_code !== null && listing.state_code !== 'DF' && listing.state_code !== 'GO') {
      return 'Estado inválido: somente DF, GO ou nulo para registro rejeitado.';
    }
    if (!allowedStatuses.has(listing.listing_status)) {
      return `Status de anúncio inválido: ${listing.listing_status}.`;
    }
    if (listing.listing_status === 'valid' && !listing.state_code) {
      return 'Anúncio válido precisa pertencer ao DF ou a Goiás.';
    }
  }
  return null;
}

export async function POST(request: NextRequest) {
  const cronSecret = process.env.AUTOMOTIVE_MARKET_RADAR_SECRET || process.env.CRON_SECRET;
  const suppliedSecret = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!cronSecret || suppliedSecret !== cronSecret) return unauthorized();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: 'Conexão Supabase de servidor não configurada.' }, { status: 503 });
  }

  let payload: RadarPayload;
  try {
    payload = (await request.json()) as RadarPayload;
  } catch {
    return NextResponse.json({ error: 'JSON inválido.' }, { status: 400 });
  }

  const validationError = validatePayload(payload);
  if (validationError) return NextResponse.json({ error: validationError }, { status: 422 });

  const { segments, suggestions } = aggregateMarketListings(payload.listings);
  const validListingCount = payload.listings.filter((item) => item.listing_status === 'valid').length;
  const duplicateCount = payload.listings.filter((item) => item.listing_status === 'duplicate').length;
  const rejectedCount = payload.listings.length - validListingCount - duplicateCount;
  const sourceCount = new Set(payload.listings.map((item) => item.source_name)).size;

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const { data: run, error: runError } = await supabase
    .from('automotive_market_runs')
    .insert({
      collected_at: payload.collected_at,
      region_scope: ['DF', 'GO'],
      status: 'running',
      source_count: sourceCount,
      raw_listing_count: payload.listings.length,
      valid_listing_count: validListingCount,
      duplicate_count: duplicateCount,
      rejected_count: rejectedCount,
      fipe_reference_month: payload.fipe_reference_month || null,
      notes: payload.notes || null,
      metadata: { ...(payload.metadata || {}), aggregation: 'server_generated_v1' }
    })
    .select('id')
    .single();

  if (runError || !run) {
    return NextResponse.json({ error: 'Falha ao criar execução.', details: runError?.message }, { status: 500 });
  }

  try {
    if (payload.listings.length) {
      const { error } = await supabase.from('automotive_market_listings').insert(
        payload.listings.map((listing) => ({ ...listing, run_id: run.id, evidence: listing.evidence || {} }))
      );
      if (error) throw error;
    }

    let insertedSegments: { id: string }[] = [];
    if (segments.length) {
      const { data, error } = await supabase
        .from('automotive_market_segments')
        .insert(segments.map((segment) => ({ ...segment, run_id: run.id })))
        .select('id');
      if (error) throw error;
      insertedSegments = data || [];
    }

    if (suggestions.length) {
      const { error } = await supabase.from('automotive_market_suggestions').insert(
        suggestions.map((suggestion) => ({
          run_id: run.id,
          segment_id: insertedSegments[suggestion.segment_index]?.id || null,
          suggestion_type: suggestion.suggestion_type,
          title: suggestion.title,
          description: suggestion.description,
          proposed_payload: suggestion.proposed_payload,
          source_evidence: suggestion.source_evidence,
          confidence: suggestion.confidence,
          status: 'pending_master'
        }))
      );
      if (error) throw error;
    }

    await supabase.from('automotive_market_runs')
      .update({ status: 'completed', updated_at: new Date().toISOString() })
      .eq('id', run.id);

    return NextResponse.json({
      ok: true,
      run_id: run.id,
      region_scope: ['DF', 'GO'],
      source_count: sourceCount,
      raw_listing_count: payload.listings.length,
      valid_listing_count: validListingCount,
      duplicate_count: duplicateCount,
      rejected_count: rejectedCount,
      segment_count: segments.length,
      suggestion_count: suggestions.length,
      aggregation: 'server_generated_v1'
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro desconhecido.';
    await supabase.from('automotive_market_runs')
      .update({ status: 'failed', error_message: message, updated_at: new Date().toISOString() })
      .eq('id', run.id);
    return NextResponse.json({ error: 'Falha ao gravar coleta.', details: message, run_id: run.id }, { status: 500 });
  }
}
