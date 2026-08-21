import { NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/server/masterApi';
import {
  AUTOCAR_CUTOVER_CONFIRMATION,
  executeAutocarCutoverSync,
  prepareAutocarCutoverExecution
} from '@/lib/server/autocar/cutoverSync';

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
        { error: 'SAFE CORE: endpoint de cutover disponível exclusivamente no Vercel Preview.' },
        { status: 403 }
      );
    }

    const production = getAdminClient();
    const master = await requireMasterReadOnly(request, production);
    if (!master) {
      return NextResponse.json({ error: 'Acesso restrito ao perfil Master.' }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const action = String(body?.action || 'preflight').trim().toLowerCase();
    const serviceRoleKey = String(body?.production_service_role_key || '').trim();
    if (!serviceRoleKey) {
      return NextResponse.json(
        { error: 'Informe a service-role do AUTOCAR Production apenas para esta requisição transitória.' },
        { status: 400 }
      );
    }

    if (action === 'preflight') {
      const preflight = await prepareAutocarCutoverExecution(serviceRoleKey);
      return NextResponse.json({
        success: true,
        action: 'preflight',
        execution_performed: false,
        confirmation_phrase: AUTOCAR_CUTOVER_CONFIRMATION,
        preflight
      });
    }

    if (action !== 'execute') {
      return NextResponse.json({ error: 'Ação de cutover inválida.' }, { status: 400 });
    }

    const result = await executeAutocarCutoverSync({
      productionServiceRoleKey: serviceRoleKey,
      confirmation: String(body?.confirmation || ''),
      acknowledgeNoDeletes: body?.acknowledge_no_deletes === true,
      acknowledgeLiveMustRemainFalse: body?.acknowledge_live_must_remain_false === true
    });

    return NextResponse.json({ success: true, action: 'execute', execution_performed: true, result });
  } catch (error: any) {
    const message = String(error?.message || error || 'Falha na operação de cutover AUTOCAR.').slice(0, 800);
    console.error('AUTOCAR cutover sync:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
