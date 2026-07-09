import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const slug = searchParams.get('slug');

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
    { auth: { persistSession: false } }
  );

  if (!slug) {
    return NextResponse.json({ error: 'Slug obrigatório.' }, { status: 400 });
  }

  const { data: campaign, error: campaignError } = await supabase
    .from('site_campaigns')
    .select('*')
    .eq('slug', slug)
    .eq('is_active', true)
    .maybeSingle();

  if (campaignError || !campaign) {
    return NextResponse.json({ error: 'Campanha não encontrada.' }, { status: 404 });
  }

  const { data: vehicles, error } = await supabase
    .from('site_vehicles')
    .select('*')
    .eq('campaign_id', campaign.id)
    .eq('status', 'disponivel')
    .eq('show_on_landing', true)
    .order('is_featured', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ campaign, vehicles: vehicles || [] });
}
