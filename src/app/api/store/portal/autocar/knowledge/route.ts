import { NextResponse } from 'next/server';
import { authorizeStorePortal } from '@/lib/server/storePortal';
import { cleanText } from '@/lib/server/storeTeam';
import {
  archiveAutocarKnowledge,
  listAutocarKnowledge,
  uploadAndIndexAutocarKnowledge
} from '@/lib/server/autocar/knowledgeLibrary';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function schemaUnavailable(error: any) {
  const message = String(error?.message || error || '');
  return /ai_knowledge_documents|ai_knowledge_chunks|autocar-knowledge|relation .* does not exist|bucket not found/i.test(message);
}

export async function GET(request: Request) {
  try {
    const slug = cleanText(new URL(request.url).searchParams.get('slug'), 120);
    const context = await authorizeStorePortal(request, slug);
    if ('error' in context) return context.error;
    if (!context.permissions.includes('view_autocar')) {
      return NextResponse.json({ error: 'Usuário sem permissão para visualizar a Biblioteca AUTOCAR.' }, { status: 403 });
    }

    try {
      const documents = await listAutocarKnowledge(context.store.id);
      return NextResponse.json({ success: true, schema_ready: true, documents });
    } catch (error: any) {
      if (schemaUnavailable(error)) {
        return NextResponse.json({ success: true, schema_ready: false, documents: [], message: 'A migration da Biblioteca AUTOCAR está apenas versionada e ainda não foi aplicada ao Supabase Production.' });
      }
      throw error;
    }
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Não foi possível carregar a Biblioteca AUTOCAR.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const slug = cleanText(form.get('slug'), 120);
    const scope = cleanText(form.get('scope'), 20) as 'method' | 'store';
    const title = cleanText(form.get('title'), 200);
    const file = form.get('file');

    const context = await authorizeStorePortal(request, slug);
    if ('error' in context) return context.error;
    if (!context.permissions.includes('manage_autocar')) {
      return NextResponse.json({ error: 'Usuário sem permissão para administrar a Biblioteca AUTOCAR.' }, { status: 403 });
    }
    if (scope !== 'method' && scope !== 'store') {
      return NextResponse.json({ error: 'Escopo de conhecimento inválido.' }, { status: 400 });
    }
    if (scope === 'method' && context.role !== 'master') {
      return NextResponse.json({ error: 'Somente o Master pode publicar conhecimento oficial do Método Venda Mais.' }, { status: 403 });
    }
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Selecione um arquivo.' }, { status: 400 });
    }

    try {
      const document = await uploadAndIndexAutocarKnowledge({
        scope,
        storeId: scope === 'store' ? context.store.id : null,
        userId: context.profile.id,
        title: title || file.name,
        file
      });
      return NextResponse.json({ success: true, document });
    } catch (error: any) {
      if (schemaUnavailable(error)) {
        return NextResponse.json({ error: 'A Biblioteca AUTOCAR está implementada, mas o banco/Storage ainda não foi ativado neste ambiente.' }, { status: 409 });
      }
      throw error;
    }
  } catch (error: any) {
    console.error('AUTOCAR knowledge upload error:', error?.message || error);
    return NextResponse.json({ error: error?.message || 'Não foi possível processar o documento.' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const slug = cleanText(body?.slug, 120);
    const documentId = cleanText(body?.document_id, 100);
    const context = await authorizeStorePortal(request, slug);
    if ('error' in context) return context.error;
    if (!context.permissions.includes('manage_autocar')) {
      return NextResponse.json({ error: 'Usuário sem permissão para administrar a Biblioteca AUTOCAR.' }, { status: 403 });
    }
    if (!documentId) return NextResponse.json({ error: 'Documento obrigatório.' }, { status: 400 });

    await archiveAutocarKnowledge(documentId, context.store.id, context.role === 'master');
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Não foi possível arquivar o documento.' }, { status: 500 });
  }
}
