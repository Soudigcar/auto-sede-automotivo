import { NextResponse } from 'next/server';
import { cleanText, getAdminClient, requireMaster } from '@/lib/server/masterApi';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function slugify(value: string) {
  return cleanText(value, 180)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '') || 'evento';
}

function color(value: unknown, fallback: string) {
  const normalized = cleanText(value, 20);
  return /^#[0-9a-f]{6}$/i.test(normalized) ? normalized.toUpperCase() : fallback;
}

function benefits(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 8).map((item) => ({
    title: cleanText(item?.title, 90),
    description: cleanText(item?.description, 240)
  })).filter((item) => item.title || item.description);
}

function urls(value: unknown) {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map((item) => cleanText(item, 1000)).filter((item) => /^https?:\/\//i.test(item)))).slice(0, 8);
}

const eventFields = 'id,event_name,slug,start_date,end_date,state,city,location,status,sponsor_bank,created_at,updated_at';

export async function GET(request: Request) {
  try {
    const supabase = getAdminClient();
    const master = await requireMaster(request, supabase);

    if (!master) {
      const { data: events, error } = await supabase
        .from('events')
        .select(eventFields)
        .neq('status', 'deleted')
        .order('created_at', { ascending: false });

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });

      return NextResponse.json(
        { campaigns: [], events: events || [], authentication_pending: true },
        { headers: { 'Cache-Control': 'no-store, max-age=0' } }
      );
    }

    const [campaignResult, eventResult, participationResult, assignmentResult, layoutResult] = await Promise.all([
      supabase.from('site_campaigns').select('*').order('created_at', { ascending: false }),
      supabase.from('events').select('*').neq('status', 'deleted').order('created_at', { ascending: false }),
      supabase.from('store_event_participations').select('event_id,store_id,status,auto_sync_inventory'),
      supabase.from('event_vehicle_assignments').select('event_id,vehicle_id,status,show_on_landing'),
      supabase.from('site_campaign_layouts').select('campaign_id,editor_draft,published_layout,layout_version,draft_updated_at,published_at,published_by')
    ]);

    const error = campaignResult.error || eventResult.error || participationResult.error || assignmentResult.error || layoutResult.error;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const events = eventResult.data || [];
    const eventMap = Object.fromEntries(events.map((event) => [event.id, event]));
    const participations = participationResult.data || [];
    const assignments = assignmentResult.data || [];
    const layoutMap = Object.fromEntries((layoutResult.data || []).map((layout) => [layout.campaign_id, layout]));

    const campaigns = (campaignResult.data || []).map((campaign) => {
      const visualLayout = layoutMap[campaign.id] || null;
      return {
        ...campaign,
        editor_draft: visualLayout?.editor_draft || null,
        published_layout: visualLayout?.published_layout || null,
        layout_version: visualLayout?.layout_version || 2,
        draft_updated_at: visualLayout?.draft_updated_at || null,
        published_at: visualLayout?.published_at || campaign.published_at || null,
        published_by: visualLayout?.published_by || null,
        event: campaign.event_id ? eventMap[campaign.event_id] || null : null,
        store_count: participations.filter((item) => item.event_id === campaign.event_id && item.status === 'active').length,
        vehicle_count: assignments.filter((item) => item.event_id === campaign.event_id && item.status === 'active' && item.show_on_landing).length
      };
    });

    return NextResponse.json(
      { campaigns, events },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } }
    );
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Erro ao carregar landings.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const supabase = getAdminClient();
    const master = await requireMaster(request, supabase);
    if (!master) return NextResponse.json({ error: 'Sua sessão ainda não foi validada. Atualize a página e tente novamente.' }, { status: 403 });

    const body = await request.json();
    const id = cleanText(body.id, 80);
    const eventId = cleanText(body.event_id, 80);
    if (!eventId) return NextResponse.json({ error: 'Selecione o evento da landing page.' }, { status: 400 });

    const { data: event } = await supabase.from('events').select('*').eq('id', eventId).neq('status', 'deleted').maybeSingle();
    if (!event) return NextResponse.json({ error: 'Evento não encontrado.' }, { status: 404 });

    const isActive = body.is_active === true;
    if (isActive && event.status !== 'active') {
      return NextResponse.json({ error: 'Ative o evento antes de publicar a landing page.' }, { status: 409 });
    }

    const requestedSlug = slugify(cleanText(body.slug, 180) || event.slug || event.event_name);
    const currentResult = id
      ? await supabase.from('site_campaigns').select('id,slug,published_at').eq('id', id).maybeSingle()
      : { data: null, error: null };
    if (currentResult.error) return NextResponse.json({ error: currentResult.error.message }, { status: 500 });
    if (id && !currentResult.data) return NextResponse.json({ error: 'Landing não encontrada.' }, { status: 404 });

    const layoutResult = id
      ? await supabase.from('site_campaign_layouts').select('published_at').eq('campaign_id', id).maybeSingle()
      : { data: null, error: null };
    if (layoutResult.error) return NextResponse.json({ error: layoutResult.error.message }, { status: 500 });

    const slugProtected = Boolean(currentResult.data?.published_at || layoutResult.data?.published_at);
    const stableSlug = slugProtected && currentResult.data?.slug ? currentResult.data.slug : requestedSlug;

    let duplicateQuery = supabase.from('site_campaigns').select('id,name').eq('event_id', eventId);
    if (id) duplicateQuery = duplicateQuery.neq('id', id);
    const { data: duplicate } = await duplicateQuery.maybeSingle();
    if (duplicate) return NextResponse.json({ error: 'Este evento já possui uma landing page vinculada.' }, { status: 409 });

    const payload = {
      event_id: eventId,
      name: cleanText(body.name, 180) || event.event_name,
      slug: stableSlug,
      title: cleanText(body.title, 240) || `Encontre seu próximo carro no ${event.event_name}`,
      description: cleanText(body.description, 1200) || 'Escolha um veículo das lojas participantes e faça uma simulação inicial de financiamento.',
      interest_rate: Math.max(Number(body.interest_rate || 1.89), 0),
      whatsapp_number: cleanText(body.whatsapp_number, 40) || null,
      is_active: isActive,
      logo_url: cleanText(body.logo_url, 1000) || null,
      hero_image_url: cleanText(body.hero_image_url, 1000) || null,
      mobile_hero_image_url: cleanText(body.mobile_hero_image_url, 1000) || null,
      sponsor_logo_urls: urls(body.sponsor_logo_urls),
      hero_eyebrow: cleanText(body.hero_eyebrow, 120) || 'Evento automotivo',
      cta_label: cleanText(body.cta_label, 80) || 'Simular agora',
      primary_color: color(body.primary_color, '#DC2626'),
      secondary_color: color(body.secondary_color, '#071020'),
      benefits: benefits(body.benefits),
      terms_text: cleanText(body.terms_text, 6000) || null,
      auto_sync_inventory: body.auto_sync_inventory !== false,
      published_at: isActive ? (body.published_at || new Date().toISOString()) : null,
      updated_at: new Date().toISOString()
    };

    if (process.env.VERCEL_ENV === 'preview') {
      return NextResponse.json({
        error: 'O Preview está em modo somente leitura para preservar as landings reais.',
        preview_read_only: true,
        slug_protected: slugProtected,
        stable_slug: stableSlug
      }, { status: 409 });
    }

    const result = id
      ? await supabase.from('site_campaigns').update(payload).eq('id', id).select('*').single()
      : await supabase.from('site_campaigns').insert(payload).select('*').single();

    if (result.error || !result.data) {
      return NextResponse.json({ error: result.error?.message || 'Não foi possível salvar a landing.' }, { status: 400 });
    }

    if (payload.auto_sync_inventory) {
      await supabase.from('store_event_participations').update({ auto_sync_inventory: true }).eq('event_id', eventId).eq('status', 'active');
      await supabase.rpc('sync_event_inventory', { p_event_id: eventId });
    }

    return NextResponse.json({
      success: true,
      campaign: result.data,
      slug_protected: slugProtected,
      slug_warning: slugProtected && requestedSlug !== stableSlug
        ? 'O endereço publicado foi preservado para não interromper anúncios, Pixel e links antigos.'
        : null
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Erro ao salvar landing.' }, { status: 500 });
  }
}
