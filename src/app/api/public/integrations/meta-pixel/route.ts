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

function cleanText(value: unknown) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function cleanPixelId(value: unknown) {
  return cleanText(value).replace(/\D/g, '');
}

function parsePixelIds(value: unknown) {
  if (Array.isArray(value)) {
    return Array.from(new Set(value.map(cleanPixelId).filter((item) => item.length >= 8)));
  }

  return Array.from(
    new Set(
      cleanText(value)
        .split(/[\n,;| ]+/)
        .map(cleanPixelId)
        .filter((item) => item.length >= 8)
    )
  );
}

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

    if (error || !data?.is_active) {
      return NextResponse.json({ active: false });
    }

    const primaryPixelId = cleanPixelId(data.pixel_id);
    const additionalPixelIds = parsePixelIds(data?.settings?.additional_pixel_ids || []);
    const pixelIds = Array.from(new Set([primaryPixelId, ...additionalPixelIds].filter(Boolean)));

    if (!pixelIds.length) {
      return NextResponse.json({ active: false });
    }

    return NextResponse.json({
      active: true,
      pixel_id: pixelIds[0],
      pixel_ids: pixelIds,
      events: {
        ...defaultEvents,
        ...(data?.settings?.events || {})
      }
    });
  } catch {
    return NextResponse.json({ active: false });
  }
}
