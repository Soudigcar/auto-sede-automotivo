import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

type ListingInput = {
  source_name: string;
  source_url: string;
  external_id?: string | null;
  municipality?: string | null;
  state_code: 'DF' | 'GO';
  title: string;
  brand?: string | null;
  model?: string | null;
  version?: string | null;
  manufacture_year?: number | null;
  model_year?: number | null;
  fuel?: string | null;
  transmission?: string | null;
  mileage?: number | null;
  price?: number | null;
  fipe_price?: number | null;
  listing_status?: string;
  rejection_reason?: string | null;
  normalized_key?: string | null;
  content_hash?: string | null;
  evidence?: Record<string, unknown>;
  confidence?: number | null;
  collected_at: string;
};

type SegmentInput = {
  state_code: 'DF' | 'GO' | 'DF+GO';
  brand: string;
  model: string;
  version: string;
  manufacture_year?: number | null;
  model_year: number;
  fuel: string;
  transmission: string;
  valid_listing_count: number;
  minimum_price?: number | null;
  maximum_price?: number | null;
  median_price?: number | null;
  average_price?: number | null;
  fipe_price?: number | null;
  difference_to_fipe_amount?: number | null;
  difference_to_fipe_percent?: number | null;
  alternative_names?: string[];
  divergences?: unknown[];
  interpretation_rules?: unknown[];
  evidence?: unknown[];
  confidence?: number | null;
};

type SuggestionInput = {
  segment_index?: number | null;
  suggestion_type: string;
  title: string;
  description: string;
  proposed_payload?: Record<string, unknown>;
  source_evidence?: unknown[];
  confidence: number;
};

type RadarPayload = {
  collected_at: string;
  fipe_reference_month?: string | null;
  notes?: string | null;
  metadata?: Record<string, unknown>;
  listings: ListingInput[];
  segments: SegmentInput[];
  suggestions?: SuggestionInput[];
};

const allowedStatuses = new Set([
  'valid',
  'duplicate',
  'invalid_price',
  'promotional',
  'auction',
  'damaged',
  'financing_entry',
  'version_conflict',
  'out_of_region',
  'other_rejected'
]);

function unauthorized() {
  return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
}

function validatePayload(payload: RadarPayload) {
  if (!payload || !Array.isArray(payload.listings) || !Array.isArray(payload.segments)) {
    return 'Payload inválido: listings e segments são obrigatórios.';
  }

  if (!payload.collected_at || Number.isNaN(Date.parse(payload.collected_at))) {
    return 'Payload inválido: collected_at deve ser uma data ISO válida.';
  }

  for (const listing of payload.listings) {
    if (!listing.source_name || !listing.source_url || !listing.title || !listing.collected_at) {
      return 'Anúncio inválido: fonte, URL, título e data são obrigatórios.';
    }
    if (listing.state_code !== 'DF' && listing.state_code !== 'GO') {
      return 'Anúncio fora do escopo: somente DF e GO são aceitos.';
    }
    if (listing.listing_status && !allowedStatuses.has(listing.listing_status)) {
      return `Status de anúncio inválido: ${listing.listing_status}.`;
    }
  }

  for (const segment of payload.segments) {
    if (!['DF', 'GO', 'DF+GO'].includes(segment.state_code)) {
      return 'Segmento fora do escopo regional.';
    }
    if (!segment.brand || !segment.model || !segment.version || !segment.model_year || !segment.fuel || !segment.transmission) {
      return 'Segmento inválido: combinação veicular incompleta.';
    }
    if (segment.valid_listing_count < 0) {
      return 'Segmento inválido: quantidade não pode ser negativa.';
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
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 422 });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const validListingCount = payload.listings.filter((item) => (item.listing_status || 'valid') === 'valid').length;
  const duplicateCount = payload.listings.filter((item) => item.listing_status === 'duplicate').length;
  const rejectedCount = payload.listings.length - validListingCount - duplicateCount;
  const sourceCount = new Set(payload.listings.map((item) => item.source_name)).size;

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
      metadata: payload.metadata || {}
    })
    .select('id')
    .single();

  if (runError || !run) {
    return NextResponse.json({ error: 'Falha ao criar execução.', details: runError?.message }, { status: 500 });
  }

  try {
    if (payload.listings.length) {
      const { error } = await supabase.from('automotive_market_listings').insert(
        payload.listings.map((listing) => ({
          ...listing,
          run_id: run.id,
          listing_status: listing.listing_status || 'valid',
          evidence: listing.evidence || {}
        }))
      );
      if (error) throw error;
    }

    let insertedSegments: { id: string }[] = [];
    if (payload.segments.length) {
      const { data, error } = await supabase
        .from('automotive_market_segments')
        .insert(
          payload.segments.map((segment) => ({
            ...segment,
            run_id: run.id,
            alternative_names: segment.alternative_names || [],
            divergences: segment.divergences || [],
            interpretation_rules: segment.interpretation_rules || [],
            evidence: segment.evidence || []
          }))
        )
        .select('id');
      if (error) throw error;
      insertedSegments = data || [];
    }

    if (payload.suggestions?.length) {
      const { error } = await supabase.from('automotive_market_suggestions').insert(
        payload.suggestions.map((suggestion) => ({
          run_id: run.id,
          segment_id:
            suggestion.segment_index === null || suggestion.segment_index === undefined
              ? null
              : insertedSegments[suggestion.segment_index]?.id || null,
          suggestion_type: suggestion.suggestion_type,
          title: suggestion.title,
          description: suggestion.description,
          proposed_payload: suggestion.proposed_payload || {},
          source_evidence: suggestion.source_evidence || [],
          confidence: suggestion.confidence,
          status: 'pending_master'
        }))
      );
      if (error) throw error;
    }

    await supabase
      .from('automotive_market_runs')
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
      segment_count: payload.segments.length,
      suggestion_count: payload.suggestions?.length || 0
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro desconhecido.';
    await supabase
      .from('automotive_market_runs')
      .update({ status: 'failed', error_message: message, updated_at: new Date().toISOString() })
      .eq('id', run.id);

    return NextResponse.json({ error: 'Falha ao gravar coleta.', details: message, run_id: run.id }, { status: 500 });
  }
}