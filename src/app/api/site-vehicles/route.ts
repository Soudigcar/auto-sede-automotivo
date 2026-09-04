import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const publicCampaignFields = [
  'id',
  'event_id',
  'name',
  'slug',
  'title',
  'description',
  'interest_rate',
  'whatsapp_number',
  'is_active',
  'logo_url',
  'hero_image_url',
  'mobile_hero_image_url',
  'sponsor_logo_urls',
  'hero_eyebrow',
  'cta_label',
  'primary_color',
  'secondary_color',
  'benefits',
  'terms_text',
  'published_at',
  'auto_sync_inventory'
].join(',');

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !serviceKey) throw new Error('Configuração do servidor incompleta.');
  return createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

function isCurrentEvent(event: any) {
  if (!event || event.status !== 'active') return false;
  const today = new Date().toISOString().slice(0, 10);
  return !event.end_date || event.end_date >= today;
}

export async function GET(request: Request) {
  try {
    const searchParams = new URL(request.url).searchParams;
    const slug = searchParams.get('slug')?.trim() || '';
    const campaignId = searchParams.get('campaign_id')?.trim() || '';

    if (campaignId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(campaignId)) {
      return NextResponse.json({ error: 'Identificador de campanha inválido.' }, { status: 400 });
    }

    const supabase = getAdminClient();
    let campaignQuery = supabase
      .from('site_campaigns')
      .select(publicCampaignFields)
      .eq('is_active', true)
      .not('published_at', 'is', null);

    if (campaignId) {
      campaignQuery = campaignQuery.eq('id', campaignId).limit(1);
    } else if (slug) {
      campaignQuery = campaignQuery.eq('slug', slug).limit(1);
    } else {
      campaignQuery = campaignQuery.order('published_at', { ascending: false, nullsFirst: false }).limit(25);
    }

    let { data: campaignCandidates, error: campaignError } = await campaignQuery;

    if (!campaignError && !campaignCandidates?.length && slug && !campaignId) {
      const { data: eventAlias, error: eventAliasError } = await supabase
        .from('events')
        .select('id')
        .eq('slug', slug)
        .neq('status', 'deleted')
        .maybeSingle();
      if (eventAliasError) return NextResponse.json({ error: eventAliasError.message }, { status: 500 });
      if (eventAlias?.id) {
        const aliasResult = await supabase
          .from('site_campaigns')
          .select(publicCampaignFields)
          .eq('event_id', eventAlias.id)
          .eq('is_active', true)
          .not('published_at', 'is', null)
          .limit(1);
        campaignCandidates = aliasResult.data;
        campaignError = aliasResult.error;
      }
    }

    if (campaignError || !campaignCandidates?.length) {
      return NextResponse.json({ error: 'Campanha não encontrada.' }, { status: 404 });
    }

    const eventIds = Array.from(
      new Set(campaignCandidates.map((campaign: any) => campaign.event_id).filter(Boolean))
    );
    const { data: candidateEvents, error: candidateEventsError } = eventIds.length
      ? await supabase.from('events').select('*').in('id', eventIds)
      : { data: [], error: null };

    if (candidateEventsError) {
      return NextResponse.json({ error: candidateEventsError.message }, { status: 500 });
    }

    const eventMap = new Map((candidateEvents || []).map((event: any) => [event.id, event]));
    const campaignRecord = campaignCandidates.find((campaign: any) => {
      if (!campaign.event_id) return true;
      return isCurrentEvent(eventMap.get(campaign.event_id));
    }) as any;

    if (!campaignRecord) {
      return NextResponse.json({ error: 'Esta campanha pertence a um evento inativo ou encerrado.' }, { status: 404 });
    }

    const { data: visualLayout, error: layoutError } = await supabase
      .from('site_campaign_layouts')
      .select('published_layout,layout_version,published_at')
      .eq('campaign_id', campaignRecord.id)
      .maybeSingle();

    if (layoutError) return NextResponse.json({ error: layoutError.message }, { status: 500 });

    const linkedEvent = campaignRecord.event_id ? eventMap.get(campaignRecord.event_id) as any : null;
    const canonicalSlug = linkedEvent?.slug || campaignRecord.slug;
    const publicCampaign = {
      ...campaignRecord,
      slug: canonicalSlug,
      legacy_slug: canonicalSlug !== campaignRecord.slug ? campaignRecord.slug : null,
      published_layout: visualLayout?.published_layout || null,
      layout_version: visualLayout?.layout_version || 2,
      published_at: visualLayout?.published_at || campaignRecord.published_at || null
    };

    if (!campaignRecord.event_id) {
      const { data: legacyVehicles, error } = await supabase
        .from('site_vehicles')
        .select('*')
        .eq('campaign_id', campaignRecord.id)
        .eq('status', 'disponivel')
        .eq('show_on_landing', true)
        .gt('price', 0)
        .order('is_featured', { ascending: false })
        .order('created_at', { ascending: false });

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ campaign: publicCampaign, event: null, stores: [], vehicles: legacyVehicles || [] });
    }

    const eventRecord = eventMap.get(campaignRecord.event_id) as any;
    if (!isCurrentEvent(eventRecord)) {
      return NextResponse.json({ error: 'Esta campanha pertence a um evento inativo ou encerrado.' }, { status: 404 });
    }

    const [participationResult, assignmentResult] = await Promise.all([
      supabase.from('store_event_participations').select('store_id,status').eq('event_id', campaignRecord.event_id).eq('status', 'active'),
      supabase
        .from('event_vehicle_assignments')
        .select('*')
        .eq('event_id', campaignRecord.event_id)
        .eq('status', 'active')
        .eq('show_on_landing', true)
    ]);

    const firstError = participationResult.error || assignmentResult.error;
    if (firstError) return NextResponse.json({ error: firstError.message }, { status: 500 });

    const storeIds = Array.from(new Set((participationResult.data || []).map((item) => item.store_id)));
    const assignments = assignmentResult.data || [];
    const vehicleIds = Array.from(new Set(assignments.map((item) => item.vehicle_id)));

    const [storeResult, vehicleResult] = await Promise.all([
      storeIds.length
        ? supabase.from('stores').select('id,store_name,slug,portal_enabled,status').in('id', storeIds).eq('status', 'active')
        : Promise.resolve({ data: [], error: null } as any),
      vehicleIds.length
        ? supabase
            .from('site_vehicles')
            .select('*')
            .in('id', vehicleIds)
            .in('store_id', storeIds.length ? storeIds : ['00000000-0000-0000-0000-000000000000'])
            .eq('status', 'disponivel')
            .eq('show_on_landing', true)
            .gt('price', 0)
        : Promise.resolve({ data: [], error: null } as any)
    ]);

    const secondaryError = storeResult.error || vehicleResult.error;
    if (secondaryError) return NextResponse.json({ error: secondaryError.message }, { status: 500 });

    const assignmentMap = Object.fromEntries(assignments.map((item) => [item.vehicle_id, item]));
    const storeMap = Object.fromEntries((storeResult.data || []).map((item: any) => [item.id, item]));

    const vehicles = (vehicleResult.data || [])
      .filter((vehicle: any) => storeMap[vehicle.store_id])
      .map((vehicle: any) => {
        const assignment = assignmentMap[vehicle.id];
        const promotionalPrice = Number(assignment?.promotional_price || 0);
        return {
          ...vehicle,
          price: promotionalPrice > 0 ? promotionalPrice : Number(vehicle.price || 0),
          original_price: promotionalPrice > 0 ? Number(vehicle.price || 0) : null,
          is_featured: assignment?.is_featured === true || vehicle.is_featured === true,
          display_order: Number(assignment?.display_order || 0),
          event_assignment_id: assignment?.id || null,
          store_name: storeMap[vehicle.store_id]?.store_name || vehicle.store_name
        };
      })
      .sort((a: any, b: any) => {
        if (a.is_featured !== b.is_featured) return a.is_featured ? -1 : 1;
        if (a.display_order !== b.display_order) return a.display_order - b.display_order;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });

    return NextResponse.json({
      campaign: publicCampaign,
      event: eventRecord,
      stores: storeResult.data || [],
      vehicles
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Erro ao carregar campanha.' }, { status: 500 });
  }
}