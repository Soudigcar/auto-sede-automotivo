import { NextResponse } from 'next/server';
import {
  OPENAI_KEY_IDENTITY_DIAGNOSTIC_CONFIRMATION,
  runOpenAiKeyIdentityDiagnostic
} from '@/lib/server/autocar/openAiKeyIdentityDiagnostic';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const noStoreHeaders = { 'Cache-Control': 'no-store, max-age=0' };

function unavailable() {
  return NextResponse.json(
    {
      ok: false,
      diagnostic: 'openai_key_identity_only',
      reason: 'not_available',
      safety: {
        preview_only: true,
        branch_only: true,
        key_exposed: false,
        persistence_enabled: false,
        outbound_enabled: false
      }
    },
    { status: 404, headers: noStoreHeaders }
  );
}

export async function GET(request: Request) {
  const confirmation = new URL(request.url).searchParams.get('confirm');
  if (confirmation !== OPENAI_KEY_IDENTITY_DIAGNOSTIC_CONFIRMATION) return unavailable();

  try {
    const result = await runOpenAiKeyIdentityDiagnostic();
    return NextResponse.json(result, {
      status: result.ok ? 200 : result.reason === 'identity_request_failed' ? 502 : 422,
      headers: noStoreHeaders
    });
  } catch (error) {
    const code = String((error as Error)?.message || '');
    if (
      code === 'openai_key_identity_diagnostic_preview_only'
      || code === 'openai_key_identity_diagnostic_branch_only'
    ) {
      return unavailable();
    }
    return NextResponse.json(
      {
        ok: false,
        diagnostic: 'openai_key_identity_only',
        reason: 'diagnostic_failed',
        safety: {
          preview_only: true,
          branch_only: true,
          key_exposed: false,
          persistence_enabled: false,
          outbound_enabled: false
        }
      },
      { status: 500, headers: noStoreHeaders }
    );
  }
}
