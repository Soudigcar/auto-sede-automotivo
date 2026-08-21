import { NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/server/masterApi';
import { runAutocarCutoverDryRun } from '@/lib/server/autocar/cutoverDryRun';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function requireMasterReadOnly(request: Request, production: ReturnType<typeof getAdminClient>) {
  const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;

  const { data: authData, error: authError } = await production.auth.getUser(token);
  if (authError || !authData.user) return null;

  const { data: profile, error: profileError } = await production
    .from('users')
    .select('id,auth_user_id,role,status,full_name,email')
    .eq('auth_user_id', authData.user.id)
    .maybeSingle();

  if (profileError || !profile) return null;
  if (String(profile.role || '').toLowerCase() !== 'master') return null;
  if (String(profile.status || '').toLowerCase() !== 'active') return null;
  return profile;
}

export async function POST(request: Request) {
  try {
    if (process.env.VERCEL_ENV !== 'preview') {
      return NextResponse.json(
        { error: 'SAFE CORE: dry-run de cutover disponível exclusivamente no Vercel Preview.' },
        { status: 403 }
      );
    }

    const production = getAdminClient();
    const master = await requireMasterReadOnly(request, production);
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
