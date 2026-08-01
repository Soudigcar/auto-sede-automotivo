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

export async function GET(request: Request) {
  try {
    const supabase = getAdminClient();
    const master = await requireMaster(request, supabase);
    if (!master) return NextResponse.json({ error: 'Acesso restrito ao usuário master.' }, { status: 403 });

    const id = cleanText(new URL(request.url).searchParams.get('id'), 80);
    if (!id) return NextResponse.json({ error: 'Landing obrigatória.' }, { status: 400 });

    const { data, error } = await supabase
      .from('site_campaigns')
      .select('id,slug,is_active,editor_draft,published_layout,layout_version,draft_updated_at,published_at,published_by')
      .eq('id', id)
      .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: 'Landing não encontrada.' }, { status: 404 });

    return NextResponse.json({ campaign: data }, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
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
      .select('id,slug,event_id,is_active')
      .eq('id', id)
      .maybeSingle();

    if (campaignError) return NextResponse.json({ error: campaignError.message }, { status: 500 });
    if (!campaign) return NextResponse.json({ error: 'Landing não encontrada.' }, { status: 404 });

    const now = new Date().toISOString();
    const payload: Record<string, unknown> = {
      editor_draft: layout,
      layout_version: LAYOUT_VERSION,
      draft_updated_at: now,
      updated_at: now
    };

    if (action === 'publish') {
      if (campaign.event_id) {
        const { data: event, error: eventError } = await supabase
          .from('events')
          .select('id,status')
          .eq('id', campaign.event_id)
          .maybeSingle();

        if (eventError) return NextResponse.json({ error: eventError.message }, { status: 500 });
        if (!event || event.status !== 'active') {
          return NextResponse.json({ error: 'Ative o evento antes de publicar a landing page.' }, { status: 409 });
        }
      }

      payload.published_layout = layout;
      payload.published_at = now;
      payload.published_by = master.id;
      payload.is_active = true;
    }

    const { data, error } = await supabase
      .from('site_campaigns')
      .update(payload)
      .eq('id', id)
      .select('id,slug,is_active,editor_draft,published_layout,layout_version,draft_updated_at,published_at,published_by')
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    return NextResponse.json({
      success: true,
      action,
      campaign: data,
      public_path: `/campanha/${data.slug}`
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Erro ao salvar o layout.' }, { status: 500 });
  }
}
