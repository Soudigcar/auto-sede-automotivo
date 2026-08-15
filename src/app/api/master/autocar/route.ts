import { NextResponse } from 'next/server';
import { cleanText, getAdminClient, requireMaster } from '@/lib/server/masterApi';
import {
  archiveAutocarKnowledge,
  finalizeAutocarKnowledgeUpload,
  prepareAutocarKnowledgeUpload
} from '@/lib/server/autocar/knowledgeLibrary';
import { getAutocarDevClient, setAutocarStoreMode, type AutocarStoreMode } from '@/lib/server/autocar/devAdmin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function humanError(error: any) {
  const message = String(error?.message || error || '').trim();
  if (/entity too large|request too large|payload too large|413/i.test(message)) return 'Arquivo grande demais para a API. Use o upload direto da Central AUTOCAR.';
  if (/25 MB|file size|tamanho/i.test(message)) return 'O arquivo deve ter no máximo 25 MB.';
  return message || 'Não foi possível concluir a operação da AUTOCAR.';
}

function validMode(value: unknown): value is AutocarStoreMode {
  return value === 'off' || value === 'copilot' || value === 'autopilot';
}

async function masterContext(request: Request) {
  const production = getAdminClient();
  const master = await requireMaster(request, production);
  if (!master) return { error: NextResponse.json({ error: 'Acesso restrito ao perfil Master.' }, { status: 403 }) } as const;
  return { production, master } as const;
}

export async function GET(request: Request) {
  try {
    const context = await masterContext(request);
    if ('error' in context) return context.error;

    const autocar = getAutocarDevClient();
    const [storesResult, agentsResult, documentsResult] = await Promise.all([
      context.production
        .from('stores')
        .select('id,store_name,slug,status,portal_enabled,city,state')
        .order('store_name', { ascending: true }),
      autocar
        .from('ai_store_agents')
        .select('id,store_id,name,status,mode,tone,language,version,updated_at')
        .order('updated_at', { ascending: false }),
      autocar
        .from('ai_knowledge_documents')
        .select('id,scope,store_id,title,original_filename,mime_type,file_size_bytes,status,extracted_characters,chunk_count,embedding_model,extraction_error,metadata,created_at,updated_at')
        .eq('scope', 'method')
        .neq('status', 'archived')
        .order('created_at', { ascending: false })
    ]);

    if (storesResult.error) throw storesResult.error;
    if (agentsResult.error) throw agentsResult.error;
    if (documentsResult.error) throw documentsResult.error;

    const agentMap = new Map((agentsResult.data || []).map((agent: any) => [agent.store_id, agent]));
    const stores = (storesResult.data || [])
      .filter((store: any) => !['deleted', 'excluido'].includes(String(store.status || '').toLowerCase()))
      .map((store: any) => ({ ...store, autocar: agentMap.get(store.id) || null }));

    return NextResponse.json({
      success: true,
      environment: 'autocar-dev',
      stores,
      documents: documentsResult.data || [],
      summary: {
        total_stores: stores.length,
        enabled: stores.filter((store: any) => store.autocar && store.autocar.mode !== 'off').length,
        copilot: stores.filter((store: any) => store.autocar?.mode === 'copilot').length,
        autopilot: stores.filter((store: any) => store.autocar?.mode === 'autopilot').length,
        global_documents: (documentsResult.data || []).length
      }
    });
  } catch (error: any) {
    return NextResponse.json({ error: humanError(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const context = await masterContext(request);
    if ('error' in context) return context.error;
    const body = await request.json().catch(() => ({}));
    const action = cleanText(body?.action, 60);

    if (action === 'set-store-mode') {
      const storeId = cleanText(body?.store_id, 100);
      const mode = body?.mode;
      if (!storeId || !validMode(mode)) return NextResponse.json({ error: 'Loja ou modo AUTOCAR inválido.' }, { status: 400 });

      const { data: store, error } = await context.production
        .from('stores')
        .select('id,store_name,slug,status,portal_enabled')
        .eq('id', storeId)
        .maybeSingle();
      if (error) throw error;
      if (!store) return NextResponse.json({ error: 'Loja não encontrada no CRM.' }, { status: 404 });

      const agent = await setAutocarStoreMode(getAutocarDevClient(), store, mode);
      return NextResponse.json({ success: true, agent });
    }

    if (action === 'prepare-upload') {
      const fileName = cleanText(body?.file_name, 220);
      const mimeType = cleanText(body?.mime_type, 160);
      const fileSizeBytes = Number(body?.file_size_bytes || 0);
      const upload = await prepareAutocarKnowledgeUpload({
        scope: 'method',
        storeId: null,
        title: cleanText(body?.title, 200) || fileName,
        fileName,
        mimeType,
        fileSizeBytes
      });
      return NextResponse.json({ success: true, upload });
    }

    if (action === 'finalize-upload') {
      const originalFilename = cleanText(body?.file_name, 220);
      const document = await finalizeAutocarKnowledgeUpload({
        scope: 'method',
        storeId: null,
        userId: context.master.id,
        title: cleanText(body?.title, 200) || originalFilename,
        originalFilename,
        mimeType: cleanText(body?.mime_type, 160),
        fileSizeBytes: Number(body?.file_size_bytes || 0),
        storagePath: cleanText(body?.storage_path, 500)
      });
      return NextResponse.json({ success: true, document });
    }

    return NextResponse.json({ error: 'Ação Master AUTOCAR inválida.' }, { status: 400 });
  } catch (error: any) {
    console.error('Master AUTOCAR error:', error?.message || error);
    return NextResponse.json({ error: humanError(error) }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const context = await masterContext(request);
    if ('error' in context) return context.error;
    const body = await request.json().catch(() => ({}));
    const documentId = cleanText(body?.document_id, 100);
    if (!documentId) return NextResponse.json({ error: 'Documento obrigatório.' }, { status: 400 });

    await archiveAutocarKnowledge(documentId, '', true);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: humanError(error) }, { status: 500 });
  }
}
