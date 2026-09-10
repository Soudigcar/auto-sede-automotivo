import { NextResponse } from 'next/server';
import {
  FOLLOW_UP_V2_GENERATION_CANARY_CONFIRMATION,
  runFollowUpV2GenerationCanary
} from '@/lib/server/autocar/followUpV2GenerationCanary';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const noStoreHeaders = { 'Cache-Control': 'no-store, max-age=0' };

function unavailable() {
  return NextResponse.json(
    {
      ok: false,
      canary: 'follow_up_v2_generation_only',
      reason: 'not_available',
      safety: { synthetic_only: true, persistence_enabled: false, outbound_enabled: false }
    },
    { status: 404, headers: noStoreHeaders }
  );
}

export async function GET(request: Request) {
  const confirmation = new URL(request.url).searchParams.get('confirm');
  if (confirmation !== FOLLOW_UP_V2_GENERATION_CANARY_CONFIRMATION) return unavailable();

  try {
    const result = await runFollowUpV2GenerationCanary();
    const status = result.ok ? 200 : result.reason === 'openai_failure' ? 502 : 422;
    return NextResponse.json(result, { status, headers: noStoreHeaders });
  } catch (error) {
    const code = String((error as Error)?.message || '');
    if (code === 'follow_up_v2_generation_canary_preview_only'
      || code === 'follow_up_v2_generation_canary_branch_only') {
      return unavailable();
    }
    return NextResponse.json(
      {
        ok: false,
        canary: 'follow_up_v2_generation_only',
        reason: 'canary_failed',
        safety: { synthetic_only: true, persistence_enabled: false, outbound_enabled: false }
      },
      { status: 500, headers: noStoreHeaders }
    );
  }
}
