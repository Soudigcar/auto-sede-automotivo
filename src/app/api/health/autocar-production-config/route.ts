import { NextResponse } from 'next/server';
import { diagnoseAutocarProductionConfig } from '@/lib/server/autocar/productionConfigDiagnostic';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const report = await diagnoseAutocarProductionConfig(process.env);
  const status = report.status === 'ok' || report.status === 'preview_fail_closed' ? 200 : 503;

  return NextResponse.json(report, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff'
    }
  });
}
