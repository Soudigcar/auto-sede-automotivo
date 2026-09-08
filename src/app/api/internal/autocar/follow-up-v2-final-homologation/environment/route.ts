import { NextResponse } from 'next/server';
import {
  autocarProjectRefFromUrl,
  resolveAutocarRuntimeTarget
} from '@/lib/server/autocar/runtimeEnvironment';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const EXPECTED_BRANCH = 'test/autocar-follow-up-v2-final-homologation';

function unavailable() {
  return new NextResponse(null, {
    status: 404,
    headers: { 'Cache-Control': 'private, no-store' }
  });
}

export async function GET() {
  if (
    process.env.VERCEL_ENV !== 'preview'
    || process.env.VERCEL_GIT_COMMIT_REF !== EXPECTED_BRANCH
  ) {
    return unavailable();
  }

  const crmRef = autocarProjectRefFromUrl(process.env.NEXT_PUBLIC_SUPABASE_URL || '') || null;
  let autocarRef: string | null = null;

  try {
    autocarRef = resolveAutocarRuntimeTarget().projectRef || null;
  } catch {
    autocarRef = null;
  }

  return NextResponse.json({
    vercel_env: process.env.VERCEL_ENV || null,
    branch: process.env.VERCEL_GIT_COMMIT_REF || null,
    commit: process.env.VERCEL_GIT_COMMIT_SHA || null,
    crm_ref: crmRef,
    autocar_ref: autocarRef
  }, {
    headers: {
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer'
    }
  });
}
