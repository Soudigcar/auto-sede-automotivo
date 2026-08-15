import { NextResponse } from 'next/server';
import { authorizeStorePortal } from '@/lib/server/storePortal';
import { cleanText } from '@/lib/server/storeTeam';
import {
  archiveAutocarKnowledge,
  finalizeAutocarKnowledgeUpload,
  listAutocarKnowledge,
  prepareAutocarKnowledgeUpload
} from '@/lib/server/autocar/knowledgeLibrary';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function schemaUnavailable(error: any) {
  const message = String(error?.message || error || '');
  return /ai_knowledge_documents|ai_knowledge_chunks|autocar-knowledge|relation .* does not exist|bucket not found/i.test(message);
}

function validScope(value: unknown): value is 'method' | 'store' {
  return value === 'method' || value === 'store';
}

function humanError(error: any) {
  const message = String(error?.message || error || '').trim();
  if (/entity too large|request too large|payload too large|413/i.test(message)) return 'O arquivo é grande demais para passar pela API. Atualize a página e tente novamente pelo upload direto da Biblioteca.';
  if (/mime|formato não suportado/i.test(message)) return 'Formato não suportado. Use PDF, DOCX, TXT, Markdown ou CSV.';
  if (/25 MB|file size|tamanho/i.test(message)) return 'O arquivo deve ter no máximo 25 MB.';
  return message || 'Não foi possível processar o documento.';
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
        return NextResponse.json({ success: true, schema_ready: false, documents: [], message: 'A Biblioteca AUTOCAR ainda não foi ativada neste ambiente.' });
      }
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
    const scope = body?.scope;

    const context = await authorizeStorePortal(request, slug);
    if ('error' in context) return context.error;
    if (!context.permissions.includes('manage_autocar')) {
      return NextResponse.json({ error: 'Usuário sem permissão para administrar a Biblioteca AUTOCAR.' }, { status: 403 });
    }
    if (!validScope(scope)) {
      return NextResponse.json({ error: 'Escopo de conhecimento inválido.' }, { status: 400 });
    }
    if (scope === 'method' && context.role !== 'master') {
      return NextResponse.json({ error: 'Somente o Master pode publicar conhecimento oficial do Método Venda Mais.' }, { status: 403 });
    }

    try {
      if (action === 'prepare-upload') {
        const fileName = cleanText(body?.file_name, 220);
        const mimeType = cleanText(body?.mime_type, 160);
        const fileSizeBytes = Number(body?.file_size_bytes || 0);
        const title = cleanText(body?.title, 200) || fileName;
        const upload = await prepareAutocarKnowledgeUpload({
          scope,
          storeId: scope === 'store' ? context.store.id : null,
          title,
          fileName,
          mimeType,
          fileSizeBytes
        });
        return NextResponse.json({ success: true, upload });
      }

      if (action === 'finalize-upload') {
        const storagePath = cleanText(body?.storage_path, 500);
        const originalFilename = cleanText(body?.file_name, 220);
        const mimeType = cleanText(body?.mime_type, 160);
        const fileSizeBytes = Number(body?.file_size_bytes || 0);
        const title = cleanText(body?.title, 200) || originalFilename;
        const document = await finalizeAutocarKnowledgeUpload({
          scope,
          storeId: scope === 'store' ? context.store.id : null,
          userId: context.profile.id,
          title,
          originalFilename,
          mimeType,
          fileSizeBytes,
          storagePath
        });
        return NextResponse.json({ success: true, document });
      }

      return NextResponse.json({ error: 'Ação inválida para a Biblioteca AUTOCAR.' }, { status: 400 });
    } catch (error: any) {
      if (schemaUnavailable(error)) {
        return NextResponse.json({ error: 'A Biblioteca AUTOCAR está implementada, mas o banco/Storage ainda não foi ativado neste ambiente.' }, { status: 409 });
      }
      throw error;
    }
  } catch (error: any) {
    console.error('AUTOCAR knowledge upload error:', error?.message || error);
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
    if (!context.permissions.includes('manage_autocar')) {
      return NextResponse.json({ error: 'Usuário sem permissão para administrar a Biblioteca AUTOCAR.' }, { status: 403 });
    }
    if (!documentId) return NextResponse.json({ error: 'Documento obrigatório.' }, { status: 400 });

    await archiveAutocarKnowledge(documentId, context.store.id, context.role === 'master');
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: humanError(error) }, { status: 500 });
  }
}
