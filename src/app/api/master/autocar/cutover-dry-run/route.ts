import { NextResponse } from 'next/server';
import { getAdminClient, requireMaster } from '@/lib/server/masterApi';
import { runAutocarCutoverDryRun } from '@/lib/server/autocar/cutoverDryRun';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    if (process.env.VERCEL_ENV !== 'preview') {
      return NextResponse.json(
        { error: 'SAFE CORE: dry-run de cutover disponível exclusivamente no Vercel Preview.' },
        { status: 403 }
      );
    }

    const production = getAdminClient();
    const master = await requireMaster(request, production);
    if (!master) {
      return NextResponse.json({ error: 'Acesso restrito ao perfil Master.' }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const serviceRoleKey = String(body?.production_service_role_key || '').trim();
    if (!serviceRoleKey) {
      return NextResponse.json(
        { error: 'Informe a service-role key do AUTOCAR Production apenas para esta execução do dry-run.' },
        { status: 400 }
      );
    }

    const report = await runAutocarCutoverDryRun(serviceRoleKey);
    return NextResponse.json({ success: true, report });
  } catch (error: any) {
    const message = String(error?.message || error || 'Falha no dry-run AUTOCAR.').slice(0, 500);
    console.error('AUTOCAR cutover dry-run:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
