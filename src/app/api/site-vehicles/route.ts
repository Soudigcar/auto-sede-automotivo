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

export async function GET(request: Request) {
  try {
    const slug = new URL(request.url).searchParams.get('slug')?.trim() || '';

    const supabase = getAdminClient();
    let campaignQuery = supabase
      .from('site_campaigns')
      .select(publicCampaignFields)
      .eq('is_active', true);

    campaignQuery = slug
      ? campaignQuery.eq('slug', slug)
      : campaignQuery.order('published_at', { ascending: false, nullsFirst: false }).limit(1);

    const { data: campaign, error: campaignError } = await campaignQuery.maybeSingle();

    if (campaignError || !campaign) {
      return NextResponse.json({ error: 'Campanha não encontrada.' }, { status: 404 });
    }

    const campaignRecord = campaign as any;

    const { data: visualLayout, error: layoutError } = await supabase
      .from('site_campaign_layouts')
      .select('published_layout,layout_version,published_at')
      .eq('campaign_id', campaignRecord.id)
      .maybeSingle();

    if (layoutError) return NextResponse.json({ error: layoutError.message }, { status: 500 });

    const publicCampaign = {
      ...campaignRecord,
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

    const [eventResult, participationResult, assignmentResult] = await Promise.all([
      supabase.from('events').select('*').eq('id', campaignRecord.event_id).maybeSingle(),
      supabase.from('store_event_participations').select('store_id,status').eq('event_id', campaignRecord.event_id).eq('status', 'active'),
      supabase
        .from('event_vehicle_assignments')
        .select('*')
        .eq('event_id', campaignRecord.event_id)
        .eq('status', 'active')
        .eq('show_on_landing', true)
    ]);

    const firstError = eventResult.error || participationResult.error || assignmentResult.error;
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
      event: eventResult.data || null,
      stores: storeResult.data || [],
      vehicles
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Erro ao carregar campanha.' }, { status: 500 });
  }
}
