import { NextResponse } from 'next/server';
import { authorizeStorePortal } from '@/lib/server/storePortal';
import { cleanText } from '@/lib/server/storeTeam';
import { readJsonBody, publicError } from '@/lib/server/requestSecurity';
import {
  getAutocarStoreKnowledgeConfig,
  saveAutocarStoreKnowledgeConfig
} from '@/lib/server/autocar/storeKnowledgeConfig';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function contextFor(request: Request, slug: string) {
  const context = await authorizeStorePortal(request, slug);
  if ('error' in context) return context;
  if (!context.permissions.includes('view_autocar')) {
    return { error: NextResponse.json({ error: 'Usuário sem permissão para visualizar a AUTOCAR.' }, { status: 403 }) } as const;
  }
  return context;
}

export async function GET(request: Request) {
  try {
    const slug = cleanText(new URL(request.url).searchParams.get('slug'), 120);
    const context = await contextFor(request, slug);
    if ('error' in context) return context.error;

    const knowledge = await getAutocarStoreKnowledgeConfig(context.store.id);
    return NextResponse.json({ success: true, knowledge });
  } catch (error: any) {
    const publicFailure = publicError(error, 'Não foi possível carregar o conhecimento configurável da loja.');
    return NextResponse.json({ error: publicFailure.message }, { status: publicFailure.status });
  }
}

export async function POST(request: Request) {
  try {
    const body = await readJsonBody<any>(request, 32 * 1024);
    const slug = cleanText(body?.slug, 120);
    const context = await contextFor(request, slug);
    if ('error' in context) return context.error;
    if (!context.permissions.includes('manage_autocar') || !['store', 'master'].includes(context.role)) {
      return NextResponse.json({ error: 'Somente Gestor da loja ou Master pode alterar o conhecimento da AUTOCAR.' }, { status: 403 });
    }

    const knowledge = await saveAutocarStoreKnowledgeConfig({
      store: context.store,
      profileId: context.profile.id,
      config: body?.config && typeof body.config === 'object' ? body.config : {}
    });

    return NextResponse.json({ success: true, knowledge });
  } catch (error: any) {
    const publicFailure = publicError(error, 'Não foi possível salvar o conhecimento configurável da loja.');
    return NextResponse.json({ error: publicFailure.message }, { status: publicFailure.status });
  }
}
