import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { extractTargetVehicle } from '@/lib/server/vehicleTargetExtraction';
import { renderVehicleImportValidation } from '@/lib/server/vehicleImportValidation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Standalone HTML avoids the CRM layout, authentication clients and telemetry. */
export async function GET() {
  if (process.env.VERCEL_ENV !== 'preview' && !(process.env.NODE_ENV === 'development' && !process.env.VERCEL_ENV)) {
    return new Response('Not found', { status: 404 });
  }
  const html = await readFile(join(process.cwd(), 'tests/fixtures/g3-yaris.html'), 'utf8');
  const result = extractTargetVehicle(html, 'https://g3premium.com.br/carros/Toyota/Yaris/Ha-Xls15/Toyota-Yaris-Ha-Xls15-2025-Bras%C3%ADlia-Distrito-Federal-8347873.html');
  return new Response(renderVehicleImportValidation(result), {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'private, no-store',
      'X-Robots-Tag': 'noindex, nofollow, noarchive',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; script-src 'none'; connect-src 'none'; img-src 'none'; frame-ancestors 'none'; form-action 'none'; base-uri 'none'",
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer'
    }
  });
}
