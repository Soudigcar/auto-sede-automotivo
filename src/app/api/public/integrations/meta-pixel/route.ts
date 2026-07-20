import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

const defaultEvents = {
  page_view: true,
  view_content: true,
  simulator_opened: true,
  simulation_started: true,
  lead: true,
  contact: true
};

function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

  if (!supabaseUrl || !serviceKey) {
    throw new Error('Supabase Service Role não configurada no servidor.');
  }

  return createClient(supabaseUrl, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
}

export async function GET() {
  try {
    const supabase = getAdminClient();

    const { data, error } = await supabase
      .from('marketing_integrations')
      .select('pixel_id,is_active,settings')
      .eq('integration_type', 'meta_pixel')
      .eq('is_active', true)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ active: false, error: error.message }, { status: 200 });
    }

    if (!data?.pixel_id) {
      return NextResponse.json({ active: false });
    }

    return NextResponse.json({
      active: true,
      pixel_id: data.pixel_id,
      events: {
        ...defaultEvents,
        ...(data?.settings?.events || {})
      }
    });
  } catch {
    return NextResponse.json({ active: false });
  }
}
