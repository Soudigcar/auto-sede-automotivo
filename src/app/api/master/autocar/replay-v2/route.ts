import { NextResponse } from 'next/server';
import { cleanText, getAdminClient, requireMaster } from '@/lib/server/masterApi';
import { replayAutocarConversationV2 } from '@/lib/server/autocar/intelligenceReplayV2';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALLOWED_BRANCH = 'feature/autocar-intelligence-v2-foundation';
const PILOT_STORE_ID = '239755c3-a2d4-4cdd-9502-f1595031c924';

function previewScope() {
  const env = String(process.env.VERCEL_ENV || '').trim();
  const branch = String(process.env.VERCEL_GIT_COMMIT_REF || '').trim();
  if (env !== 'preview') {
    return { allowed: false, reason: 'Replay AUTOCAR Intelligence V2 é permitido somente em Vercel Preview.' };
  }
  if (branch !== ALLOWED_BRANCH) {
    return { allowed: false, reason: 'Replay AUTOCAR Intelligence V2 restrito à branch autorizada.' };
  }
  return { allowed: true, reason: 'Preview e branch autorizados para replay read-only.' };
}

export async function POST(request: Request) {
  try {
    const scope = previewScope();
    if (!scope.allowed) return NextResponse.json({ error: scope.reason }, { status: 403 });

    const production = getAdminClient();
    const master = await requireMaster(request, production);
    if (!master) return NextResponse.json({ error: 'Acesso restrito ao perfil Master.' }, { status: 403 });

    const body = await request.json().catch(() => ({}));
    const storeId = cleanText(body?.store_id, 100);
    const conversationId = cleanText(body?.conversation_id, 100);
    if (!storeId || !conversationId) {
      return NextResponse.json({ error: 'Loja e conversa são obrigatórias para o replay.' }, { status: 400 });
    }
    if (storeId !== PILOT_STORE_ID) {
      return NextResponse.json({ error: 'Replay V2 está restrito à loja piloto autorizada nesta fase.' }, { status: 403 });
    }

    const result = await replayAutocarConversationV2({
      productionSupabase: production,
      storeId,
      conversationId
    });

    return NextResponse.json({
      success: true,
      scope: {
        environment: 'preview',
        branch: ALLOWED_BRANCH,
        store_id: PILOT_STORE_ID,
        read_only: true,
        external_execution: false
      },
      ...result
    });
  } catch (error: any) {
    console.error('AUTOCAR Intelligence V2 replay error:', error?.message || error);
    return NextResponse.json(
      { error: String(error?.message || 'Não foi possível executar o replay AUTOCAR V2.').slice(0, 500) },
      { status: 500 }
    );
  }
}
