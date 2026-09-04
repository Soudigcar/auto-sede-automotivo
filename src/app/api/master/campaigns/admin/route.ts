import { NextResponse } from 'next/server';
import { cleanText, getAdminClient, requireMaster } from '@/lib/server/masterApi';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const defaultBenefits = [
  { title: 'Simulação rápida', description: 'Faça uma estimativa inicial de financiamento.' },
  { title: 'Estoque das lojas participantes', description: 'Consulte veículos vinculados ao evento.' },
  { title: 'Atendimento direto', description: 'Seu interesse segue para a loja responsável pelo veículo.' }
];

function slugify(value: string) {
  return cleanText(value, 180)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '') || 'evento';
}

function safeRate(value: unknown) {
  const rate = Number(value ?? 1.89);
  return Number.isFinite(rate) ? Math.max(rate, 0) : 1.89;
}

function publicIdentity(campaign: any, event: any) {
  const storedSlug = String(campaign?.slug || '');
  const eventSlug = String(event?.slug || '');
  const publicSlug = eventSlug || storedSlug;
  return {
    stored_slug: storedSlug,
    public_slug: publicSlug,
    legacy_slug: publicSlug && storedSlug && publicSlug !== storedSlug ? storedSlug : null,
    slug: publicSlug
  };
}

export async function POST(request: Request) {
  try {
    const supabase = getAdminClient();
    const master = await requireMaster(request, supabase);
    if (!master) {
      return NextResponse.json(
        { error: 'Sua sessão ainda não foi validada. Atualize a página e tente novamente.' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const id = cleanText(body.id, 80);
    const eventId = cleanText(body.event_id, 80);
    if (!eventId) return NextResponse.json({ error: 'Selecione o evento da landing page.' }, { status: 400 });

    const { data: event, error: eventError } = await supabase
      .from('events')
      .select('id,event_name,slug,status')
      .eq('id', eventId)
      .neq('status', 'deleted')
      .maybeSingle();

    if (eventError) return NextResponse.json({ error: eventError.message }, { status: 500 });
    if (!event) return NextResponse.json({ error: 'Evento não encontrado.' }, { status: 404 });

    const currentResult = id
      ? await supabase.from('site_campaigns').select('id,event_id,is_active,slug,published_at').eq('id', id).maybeSingle()
      : { data: null, error: null };
    if (currentResult.error) return NextResponse.json({ error: currentResult.error.message }, { status: 500 });
    const currentCampaign = currentResult.data;
    if (id && !currentCampaign) return NextResponse.json({ error: 'Landing não encontrada.' }, { status: 404 });
    if (currentCampaign?.is_active && event.status !== 'active') {
      return NextResponse.json({ error: 'Ative o evento antes de vinculá-lo a uma landing publicada.' }, { status: 409 });
    }

    const publishedLayoutResult = id
      ? await supabase.from('site_campaign_layouts').select('published_at').eq('campaign_id', id).maybeSingle()
      : { data: null, error: null };
    if (publishedLayoutResult.error) return NextResponse.json({ error: publishedLayoutResult.error.message }, { status: 500 });

    const requestedSlug = slugify(cleanText(body.slug, 180) || event.slug || event.event_name);
    const slugProtected = Boolean(currentCampaign?.published_at || publishedLayoutResult.data?.published_at);
    if (slugProtected && currentCampaign?.event_id && currentCampaign.event_id !== eventId) {
      return NextResponse.json({
        error: 'Uma landing já publicada não pode ser vinculada a outro evento. Use “Nova landing” para o novo evento.',
        event_protected: true
      }, { status: 409 });
    }
    const stableSlug = slugProtected && currentCampaign?.slug ? currentCampaign.slug : requestedSlug;

    let duplicateQuery = supabase.from('site_campaigns').select('id,name').eq('event_id', eventId);
    if (id) duplicateQuery = duplicateQuery.neq('id', id);
    const { data: duplicate, error: duplicateError } = await duplicateQuery.maybeSingle();
    if (duplicateError) return NextResponse.json({ error: duplicateError.message }, { status: 500 });
    if (duplicate) return NextResponse.json({ error: 'Este evento já possui uma landing page vinculada.' }, { status: 409 });

    const now = new Date().toISOString();
    const administrativePayload = {
      event_id: eventId,
      name: cleanText(body.name, 180) || event.event_name,
      slug: stableSlug,
      interest_rate: safeRate(body.interest_rate),
      whatsapp_number: cleanText(body.whatsapp_number, 40) || null,
      auto_sync_inventory: body.auto_sync_inventory !== false,
      updated_at: now
    };

    if (process.env.VERCEL_ENV === 'preview') {
      return NextResponse.json({
        error: 'O Preview está em modo somente leitura para preservar as landings reais.',
        preview_read_only: true,
        event_protected: slugProtected,
        slug_protected: slugProtected,
        stable_slug: stableSlug
      }, { status: 409 });
    }

    const result = id
      ? await supabase
          .from('site_campaigns')
          .update(administrativePayload)
          .eq('id', id)
          .select('*')
          .single()
      : await supabase
          .from('site_campaigns')
          .insert({
            ...administrativePayload,
            title: `Encontre seu próximo carro no ${event.event_name}`,
            description: 'Escolha um veículo das lojas participantes e faça uma simulação inicial de financiamento.',
            is_active: false,
            logo_url: null,
            hero_image_url: null,
            mobile_hero_image_url: null,
            sponsor_logo_urls: [],
            hero_eyebrow: 'Evento automotivo',
            cta_label: 'Simular agora',
            primary_color: '#DC2626',
            secondary_color: '#071020',
            benefits: defaultBenefits,
            terms_text: null,
            published_at: null
          })
          .select('*')
          .single();

    if (result.error || !result.data) {
      return NextResponse.json({ error: result.error?.message || 'Não foi possível salvar a landing.' }, { status: 400 });
    }

    if (administrativePayload.auto_sync_inventory) {
      await supabase
        .from('store_event_participations')
        .update({ auto_sync_inventory: true })
        .eq('event_id', eventId)
        .eq('status', 'active');
      await supabase.rpc('sync_event_inventory', { p_event_id: eventId });
    }

    const { data: layout, error: layoutError } = await supabase
      .from('site_campaign_layouts')
      .select('editor_draft,published_layout,layout_version,draft_updated_at,published_at,published_by')
      .eq('campaign_id', result.data.id)
      .maybeSingle();

    if (layoutError) return NextResponse.json({ error: layoutError.message }, { status: 500 });

    return NextResponse.json({
      success: true,
      event_protected: slugProtected,
      slug_protected: slugProtected,
      slug_warning: slugProtected && requestedSlug !== stableSlug
        ? 'O endereço antigo foi preservado como alias histórico para não interromper anúncios, Pixel e links compartilhados.'
        : null,
      campaign: {
        ...result.data,
        ...publicIdentity(result.data, event),
        editor_draft: layout?.editor_draft || null,
        published_layout: layout?.published_layout || null,
        layout_version: layout?.layout_version || 2,
        draft_updated_at: layout?.draft_updated_at || null,
        published_at: layout?.published_at || result.data.published_at || null,
        published_by: layout?.published_by || null
      }
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Erro ao salvar configurações administrativas.' }, { status: 500 });
  }
}
