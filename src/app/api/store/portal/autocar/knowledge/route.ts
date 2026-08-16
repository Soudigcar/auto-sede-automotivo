import { NextResponse } from 'next/server';
import { authorizeStorePortal } from '@/lib/server/storePortal';
import { cleanText } from '@/lib/server/storeTeam';
import { archiveAutocarKnowledge, finalizeAutocarKnowledgeUpload, listAutocarKnowledge, prepareAutocarKnowledgeUpload } from '@/lib/server/autocar/knowledgeLibrary';
import { ensureAutocarDevStore, getAutocarDevClient } from '@/lib/server/autocar/devAdmin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function schemaUnavailable(error: any) {
  const message = String(error?.message || error || '');
  return /ai_knowledge_documents|ai_knowledge_chunks|autocar-knowledge|relation .* does not exist|bucket not found/i.test(message);
}
function humanError(error: any) {
  const message = String(error?.message || error || '').trim();
  if (/entity too large|request too large|payload too large|413/i.test(message)) return 'Arquivo grande demais para a API. Use o upload direto da Biblioteca.';
  if (/mime|formato não suportado/i.test(message)) return 'Formato não suportado. Use PDF, DOCX, TXT, Markdown ou CSV.';
  if (/25 MB|file size|tamanho/i.test(message)) return 'O arquivo deve ter no máximo 25 MB.';
  return message || 'Não foi possível processar o documento.';
}

async function ensureStore(context: any) {
  await ensureAutocarDevStore(getAutocarDevClient(), {
    id: context.store.id,
    store_name: context.store.store_name,
    slug: context.store.slug,
    status: context.store.status,
    portal_enabled: context.store.portal_enabled
  });
}

export async function GET(request: Request) {
  try {
    const slug = cleanText(new URL(request.url).searchParams.get('slug'), 120);
    const context = await authorizeStorePortal(request, slug);
    if ('error' in context) return context.error;
    if (!context.permissions.includes('view_autocar')) return NextResponse.json({ error: 'Usuário sem permissão para visualizar a Biblioteca AUTOCAR.' }, { status: 403 });
    try {
      const documents = await listAutocarKnowledge(context.store.id);
      return NextResponse.json({ success: true, schema_ready: true, documents });
    } catch (error: any) {
      if (schemaUnavailable(error)) return NextResponse.json({ success: true, schema_ready: false, documents: [], message: 'A Biblioteca AUTOCAR ainda não foi ativada neste ambiente.' });
      throw error;
    }
  } catch (error: any) {
    return NextResponse.json({ error: humanError(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const action = cleanText(body?.action, 40);
    const slug = cleanText(body?.slug, 120);
    const context = await authorizeStorePortal(request, slug);
    if ('error' in context) return context.error;
    if (!context.permissions.includes('manage_autocar')) return NextResponse.json({ error: 'Usuário sem permissão para administrar o conhecimento desta loja.' }, { status: 403 });
    if (body?.scope && body.scope !== 'store') return NextResponse.json({ error: 'O Método Venda Mais e a Biblioteca Global são administrados exclusivamente no ambiente Master.' }, { status: 403 });

    await ensureStore(context);

    try {
      if (action === 'prepare-upload') {
        const fileName = cleanText(body?.file_name, 220);
        const upload = await prepareAutocarKnowledgeUpload({
          scope: 'store', storeId: context.store.id, title: cleanText(body?.title, 200) || fileName,
          fileName, mimeType: cleanText(body?.mime_type, 160), fileSizeBytes: Number(body?.file_size_bytes || 0)
        });
        return NextResponse.json({ success: true, upload });
      }
      if (action === 'finalize-upload') {
        const originalFilename = cleanText(body?.file_name, 220);
        const document = await finalizeAutocarKnowledgeUpload({
          scope: 'store', storeId: context.store.id, userId: context.profile.id,
          title: cleanText(body?.title, 200) || originalFilename, originalFilename,
          mimeType: cleanText(body?.mime_type, 160), fileSizeBytes: Number(body?.file_size_bytes || 0),
          storagePath: cleanText(body?.storage_path, 500)
        });
        return NextResponse.json({ success: true, document });
      }
      return NextResponse.json({ error: 'Ação inválida para a Biblioteca AUTOCAR.' }, { status: 400 });
    } catch (error: any) {
      if (schemaUnavailable(error)) return NextResponse.json({ error: 'A Biblioteca AUTOCAR ainda não foi ativada neste ambiente.' }, { status: 409 });
      throw error;
    }
  } catch (error: any) {
    console.error('AUTOCAR store knowledge error:', error?.message || error);
    return NextResponse.json({ error: humanError(error) }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const slug = cleanText(body?.slug, 120);
    const documentId = cleanText(body?.document_id, 100);
    const context = await authorizeStorePortal(request, slug);
    if ('error' in context) return context.error;
    if (!context.permissions.includes('manage_autocar')) return NextResponse.json({ error: 'Usuário sem permissão para administrar o conhecimento desta loja.' }, { status: 403 });
    if (!documentId) return NextResponse.json({ error: 'Documento obrigatório.' }, { status: 400 });
    await archiveAutocarKnowledge(documentId, context.store.id, false);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: humanError(error) }, { status: 500 });
  }
}
