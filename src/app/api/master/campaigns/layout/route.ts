import { NextResponse } from 'next/server';
import { cleanText, getAdminClient, requireMaster } from '@/lib/server/masterApi';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_LAYOUT_BYTES = 2_000_000;
const LAYOUT_VERSION = 2;

function validLayout(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const serialized = JSON.stringify(value);
  if (Buffer.byteLength(serialized, 'utf8') > MAX_LAYOUT_BYTES) return null;
  return value;
}

function layoutTerms(layout: unknown) {
  if (!layout || typeof layout !== 'object' || Array.isArray(layout)) return '';
  const footer = (layout as Record<string, any>).footer;
  return cleanText(footer?.termsOverride, 5000);
}

export async function GET(request: Request) {
  try {
    const supabase = getAdminClient();
    const master = await requireMaster(request, supabase);
    if (!master) return NextResponse.json({ error: 'Acesso restrito ao usuário master.' }, { status: 403 });

    const id = cleanText(new URL(request.url).searchParams.get('id'), 80);
    if (!id) return NextResponse.json({ error: 'Landing obrigatória.' }, { status: 400 });

    const [{ data: campaign, error: campaignError }, { data: layout, error: layoutError }] = await Promise.all([
      supabase.from('site_campaigns').select('id,slug,is_active,published_at').eq('id', id).maybeSingle(),
      supabase
        .from('site_campaign_layouts')
        .select('campaign_id,editor_draft,published_layout,layout_version,draft_updated_at,published_at,published_by')
        .eq('campaign_id', id)
        .maybeSingle()
    ]);

    const error = campaignError || layoutError;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!campaign) return NextResponse.json({ error: 'Landing não encontrada.' }, { status: 404 });

    return NextResponse.json({
      campaign: {
        ...campaign,
        editor_draft: layout?.editor_draft || null,
        published_layout: layout?.published_layout || null,
        layout_version: layout?.layout_version || LAYOUT_VERSION,
        draft_updated_at: layout?.draft_updated_at || null,
        published_at: layout?.published_at || campaign.published_at || null,
        published_by: layout?.published_by || null
      }
    }, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Erro ao carregar o layout.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const supabase = getAdminClient();
    const master = await requireMaster(request, supabase);
    if (!master) return NextResponse.json({ error: 'Acesso restrito ao usuário master.' }, { status: 403 });

    const body = await request.json();
    const id = cleanText(body.id, 80);
    const action = cleanText(body.action, 20);
    const layout = validLayout(body.layout);

    if (!id) return NextResponse.json({ error: 'Landing obrigatória.' }, { status: 400 });
    if (!layout) return NextResponse.json({ error: 'Layout inválido ou acima do limite permitido.' }, { status: 400 });
    if (action !== 'save' && action !== 'publish') return NextResponse.json({ error: 'Ação inválida.' }, { status: 400 });

    const { data: campaign, error: campaignError } = await supabase
      .from('site_campaigns')
      .select('id,slug,event_id,is_active,published_at,terms_text')
      .eq('id', id)
      .maybeSingle();

    if (campaignError) return NextResponse.json({ error: campaignError.message }, { status: 500 });
    if (!campaign) return NextResponse.json({ error: 'Landing não encontrada.' }, { status: 404 });

    const now = new Date().toISOString();
    const layoutPayload: Record<string, unknown> = {
      campaign_id: id,
      editor_draft: layout,
      layout_version: LAYOUT_VERSION,
      draft_updated_at: now,
      updated_at: now
    };

    if (action === 'publish') {
      const terms = cleanText(campaign.terms_text, 5000) || layoutTerms(layout);
      if (!terms) {
        return NextResponse.json({ error: 'Cadastre os termos/condições da landing antes de publicar.' }, { status: 409 });
      }

      if (campaign.event_id) {
        const [eventResult, participationResult, assignmentResult] = await Promise.all([
          supabase.from('events').select('id,status').eq('id', campaign.event_id).maybeSingle(),
          supabase.from('store_event_participations').select('store_id').eq('event_id', campaign.event_id).eq('status', 'active').limit(1),
          supabase.from('event_vehicle_assignments').select('vehicle_id').eq('event_id', campaign.event_id).eq('status', 'active').eq('show_on_landing', true).limit(1)
        ]);

        const preflightError = eventResult.error || participationResult.error || assignmentResult.error;
        if (preflightError) return NextResponse.json({ error: preflightError.message }, { status: 500 });
        if (!eventResult.data || eventResult.data.status !== 'active') {
          return NextResponse.json({ error: 'Ative o evento antes de publicar a landing page.' }, { status: 409 });
        }
        if (!participationResult.data?.length) {
          return NextResponse.json({ error: 'Vincule ao menos uma loja ativa ao evento antes de publicar.' }, { status: 409 });
        }
        if (!assignmentResult.data?.length) {
          return NextResponse.json({ error: 'A landing precisa ter ao menos um veículo ativo e visível antes de publicar.' }, { status: 409 });
        }
      }

      layoutPayload.published_layout = layout;
      layoutPayload.published_at = now;
      layoutPayload.published_by = master.id;
    }

    const { data: savedLayout, error: layoutError } = await supabase
      .from('site_campaign_layouts')
      .upsert(layoutPayload, { onConflict: 'campaign_id' })
      .select('campaign_id,editor_draft,published_layout,layout_version,draft_updated_at,published_at,published_by')
      .single();

    if (layoutError || !savedLayout) {
      return NextResponse.json({ error: layoutError?.message || 'Não foi possível salvar o layout.' }, { status: 400 });
    }

    let campaignState = campaign;
    if (action === 'publish') {
      const { data: publishedCampaign, error: publishError } = await supabase
        .from('site_campaigns')
        .update({ is_active: true, published_at: now, updated_at: now })
        .eq('id', id)
        .select('id,slug,is_active,published_at')
        .single();

      if (publishError || !publishedCampaign) {
        return NextResponse.json({ error: publishError?.message || 'O layout foi salvo, mas a landing não pôde ser ativada.' }, { status: 400 });
      }
      campaignState = { ...campaign, ...publishedCampaign };
    }

    return NextResponse.json({
      success: true,
      action,
      campaign: {
        ...campaignState,
        editor_draft: savedLayout.editor_draft,
        published_layout: savedLayout.published_layout,
        layout_version: savedLayout.layout_version,
        draft_updated_at: savedLayout.draft_updated_at,
        published_at: savedLayout.published_at || campaignState.published_at || null,
        published_by: savedLayout.published_by
      },
      public_path: `/campanha/${campaign.slug}`
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Erro ao salvar o layout.' }, { status: 500 });
  }
}
