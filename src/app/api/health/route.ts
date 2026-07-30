import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const startedAt = Date.now();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({
      status: 'degraded',
      service: 'auto-sede-automotivo',
      checks: { database: 'configuration_missing' },
      timestamp: new Date().toISOString(),
      response_ms: Date.now() - startedAt
    }, {
      status: 503,
      headers: { 'Cache-Control': 'no-store' }
    });
  }

  try {
    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });

    const { data, error } = await supabase
      .from('portal_settings')
      .select('key,published')
      .eq('key', 'official')
      .maybeSingle();

    if (error || !data) throw error || new Error('Portal settings unavailable.');

    return NextResponse.json({
      status: 'ok',
      service: 'auto-sede-automotivo',
      checks: { database: 'ok', portal_settings: data.published ? 'published' : 'draft' },
      commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) || null,
      timestamp: new Date().toISOString(),
      response_ms: Date.now() - startedAt
    }, {
      status: 200,
      headers: { 'Cache-Control': 'no-store' }
    });
  } catch {
    return NextResponse.json({
      status: 'degraded',
      service: 'auto-sede-automotivo',
      checks: { database: 'unavailable' },
      timestamp: new Date().toISOString(),
      response_ms: Date.now() - startedAt
    }, {
      status: 503,
      headers: { 'Cache-Control': 'no-store' }
    });
  }
}
