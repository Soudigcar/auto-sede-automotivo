import { NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/server/masterApi';
import {
  AUTOCAR_MIGRATION_CONFIRMATION,
  autocarPreviewMigrationEnvironment,
  runAutocarProductionMigration
} from '@/lib/server/autocar/productionMigration';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

function bearerToken(request: Request) {
  return (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
}

async function requireMasterReadOnly(request: Request) {
  const production = getAdminClient();
  const token = bearerToken(request);
  if (!token) return null;

  const { data, error } = await production.auth.getUser(token);
  if (error || !data.user) return null;

  const fields = 'id,auth_user_id,role,status,full_name,email';
  let profile: any = null;

  const { data: linked } = await production.from('users')
    .select(fields)
    .eq('auth_user_id', data.user.id)
    .maybeSingle();
  profile = linked || null;

  if (!profile && data.user.email) {
    const { data: byEmail } = await production.from('users')
      .select(fields)
      .ilike('email', data.user.email)
      .limit(1)
      .maybeSingle();
    profile = byEmail || null;
  }

  if (!profile) return null;
  if (String(profile.role || '').toLowerCase() !== 'master') return null;
  if (String(profile.status || '').toLowerCase() !== 'active') return null;
  return profile;
}

function previewOnly() {
  return process.env.VERCEL_ENV === 'preview';
}

export async function GET(request: Request) {
  if (!previewOnly()) {
    return NextResponse.json({ error: 'Ferramenta disponível exclusivamente em Preview.' }, { status: 404 });
  }

  const master = await requireMasterReadOnly(request);
  if (!master) return NextResponse.json({ error: 'Acesso restrito ao Master.' }, { status: 403 });

  return NextResponse.json({
    success: true,
    environment: autocarPreviewMigrationEnvironment(),
    confirmation_phrase: AUTOCAR_MIGRATION_CONFIRMATION,
    source_key_stored: false,
    source_key_logged: false,
    destination_key_stored: false,
    destination_key_logged: false
  });
}

export async function POST(request: Request) {
  if (!previewOnly()) {
    return NextResponse.json({ error: 'Ferramenta disponível exclusivamente em Preview.' }, { status: 404 });
  }

  const master = await requireMasterReadOnly(request);
  if (!master) return NextResponse.json({ error: 'Acesso restrito ao Master.' }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const confirmation = String(body?.confirmation || '').trim();
  const sourceServiceRoleKey = String(body?.source_service_role_key || '').trim();
  const destinationServiceRoleKey = String(body?.destination_service_role_key || '').trim();

  if (confirmation !== AUTOCAR_MIGRATION_CONFIRMATION) {
    return NextResponse.json({ error: 'Frase de confirmação inválida.' }, { status: 400 });
  }
  if (!sourceServiceRoleKey) {
    return NextResponse.json({ error: 'Service role do autocar-dev é obrigatória para esta execução única.' }, { status: 400 });
  }
  if (!destinationServiceRoleKey) {
    return NextResponse.json({ error: 'Service role do AUTOCAR Production é obrigatória para esta execução única.' }, { status: 400 });
  }

  try {
    const result = await runAutocarProductionMigration(sourceServiceRoleKey, destinationServiceRoleKey);
    return NextResponse.json({ success: true, result });
  } catch (error: any) {
    const message = String(error?.message || error || 'Falha na migração AUTOCAR.').slice(0, 800);
    console.error('AUTOCAR production migration failed:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
