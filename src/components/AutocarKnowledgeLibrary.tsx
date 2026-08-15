'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Archive, BookOpen, CheckCircle2, FileText, LibraryBig, Loader2, LockKeyhole, RefreshCw, Store, Upload, XCircle } from 'lucide-react';
import { createClient } from '@/lib/supabase';

type KnowledgeDocument = {
  id: string;
  scope: 'method' | 'store';
  store_id: string | null;
  title: string;
  original_filename: string;
  mime_type: string;
  file_size_bytes: number;
  status: 'uploaded' | 'processing' | 'ready' | 'failed' | 'archived';
  extracted_characters: number;
  chunk_count: number;
  embedding_model: string | null;
  extraction_error: string | null;
  created_at: string;
};

type PreparedUpload = {
  storage_path: string;
  signed_url: string;
  mime_type: string;
  max_file_bytes: number;
  expires_in_seconds: number;
};

const MAX_FILE_BYTES = 25 * 1024 * 1024;

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function statusLabel(status: KnowledgeDocument['status']) {
  if (status === 'ready') return 'Pronto para consulta';
  if (status === 'processing') return 'Processando';
  if (status === 'failed') return 'Falhou';
  if (status === 'uploaded') return 'Enviado';
  return 'Arquivado';
}

async function readResponse(response: Response) {
  const text = await response.text();
  if (!text) return {} as any;
  try {
    return JSON.parse(text);
  } catch {
    if (response.status === 413 || /request entity too large|payload too large/i.test(text)) {
      return { error: 'O arquivo é grande demais para passar pela API. Atualize a página e tente novamente pelo upload direto.' };
    }
    return { error: text.slice(0, 300) };
  }
}

function uploadDirectly(signedUrl: string, file: File) {
  const form = new FormData();
  form.append('cacheControl', '3600');
  form.append('', file);
  return fetch(signedUrl, {
    method: 'PUT',
    headers: { 'x-upsert': 'false' },
    body: form
  });
}

export function AutocarKnowledgeLibrary({ slug, canManage, isMaster }: { slug: string; canManage: boolean; isMaster: boolean }) {
  const supabase = useMemo(() => createClient(), []);
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
  const [schemaReady, setSchemaReady] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [scope, setScope] = useState<'method' | 'store'>(isMaster ? 'method' : 'store');
  const [title, setTitle] = useState('');
  const [file, setFile] = useState<File | null>(null);

  useEffect(() => {
    if (!isMaster && scope !== 'store') setScope('store');
  }, [isMaster, scope]);

  const token = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token || '';
  }, [supabase]);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const accessToken = await token();
      if (!accessToken) throw new Error('Sessão expirada.');
      const response = await fetch(`/api/store/portal/autocar/knowledge?slug=${encodeURIComponent(slug)}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: 'no-store'
      });
      const body = await readResponse(response);
      if (!response.ok) throw new Error(body.error || 'Não foi possível carregar a biblioteca.');
      setDocuments(body.documents || []);
      setSchemaReady(Boolean(body.schema_ready));
      setMessage(body.schema_ready ? '' : (body.message || 'A Biblioteca ainda aguarda ativação do banco.'));
    } catch (error: any) {
      setMessage(error?.message || 'Não foi possível carregar a Biblioteca AUTOCAR.');
    } finally {
      setBusy(false);
    }
  }, [slug, token]);

  useEffect(() => { void load(); }, [load]);

  async function uploadDocument(event: React.FormEvent) {
    event.preventDefault();
    if (!file || !schemaReady || !canManage) return;
    if (file.size > MAX_FILE_BYTES) {
      setMessage('O arquivo deve ter no máximo 25 MB.');
      return;
    }
    if (scope === 'method' && !isMaster) {
      setMessage('Somente o Master pode publicar o Método Venda Mais oficial.');
      return;
    }

    setBusy(true);
    setMessage('Preparando upload privado e seguro...');
    try {
      const accessToken = await token();
      if (!accessToken) throw new Error('Sessão expirada.');

      const prepareResponse = await fetch('/api/store/portal/autocar/knowledge', {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'prepare-upload',
          slug,
          scope,
          title: title || file.name,
          file_name: file.name,
          mime_type: file.type,
          file_size_bytes: file.size
        })
      });
      const preparedBody = await readResponse(prepareResponse);
      if (!prepareResponse.ok) throw new Error(preparedBody.error || 'Não foi possível preparar o upload privado.');
      const upload = preparedBody.upload as PreparedUpload;
      if (!upload?.signed_url || !upload?.storage_path) throw new Error('O servidor não retornou a autorização temporária de upload.');

      setMessage(`Enviando ${formatBytes(file.size)} diretamente ao Storage privado...`);
      const storageResponse = await uploadDirectly(upload.signed_url, file);
      if (!storageResponse.ok) {
        const storageBody = await readResponse(storageResponse);
        throw new Error(storageBody.error || `O Storage recusou o arquivo (HTTP ${storageResponse.status}).`);
      }

      setMessage('Arquivo recebido. Extraindo texto e criando o índice semântico...');
      const finalizeResponse = await fetch('/api/store/portal/autocar/knowledge', {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'finalize-upload',
          slug,
          scope,
          title: title || file.name,
          file_name: file.name,
          mime_type: file.type,
          file_size_bytes: file.size,
          storage_path: upload.storage_path
        })
      });
      const finalBody = await readResponse(finalizeResponse);
      if (!finalizeResponse.ok) throw new Error(finalBody.error || 'O arquivo foi enviado, mas não foi possível concluir a indexação.');

      setFile(null);
      setTitle('');
      setMessage('Documento processado e pronto para ser consultado pela AUTOCAR.');
      await load();
    } catch (error: any) {
      setMessage(error?.message || 'Não foi possível processar o documento.');
    } finally {
      setBusy(false);
    }
  }

  async function archive(document: KnowledgeDocument) {
    if (!canManage) return;
    setBusy(true);
    try {
      const accessToken = await token();
      const response = await fetch('/api/store/portal/autocar/knowledge', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, document_id: document.id })
      });
      const body = await readResponse(response);
      if (!response.ok) throw new Error(body.error || 'Não foi possível arquivar.');
      setMessage('Documento arquivado. Ele deixa de participar das consultas da AUTOCAR.');
      await load();
    } catch (error: any) {
      setMessage(error?.message || 'Não foi possível arquivar o documento.');
    } finally {
      setBusy(false);
    }
  }

  const methodDocuments = documents.filter((item) => item.scope === 'method');
  const storeDocuments = documents.filter((item) => item.scope === 'store');

  return (
    <section className="mt-6 overflow-hidden rounded-[28px] border border-zinc-200 bg-white shadow-sm">
      <div className="border-b border-zinc-200 p-5 md:p-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <div className="flex items-center gap-2 text-red-600"><LibraryBig size={18} /><span className="premium-eyebrow">Biblioteca de Inteligência</span></div>
            <h2 className="mt-2 text-2xl font-black text-zinc-950 md:text-3xl">Documentos que ensinam a AUTOCAR</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-600">O livro do Método Venda Mais fica como conhecimento oficial e é herdado pelas lojas. Cada loja também pode ter documentos próprios, sempre isolados por <code className="rounded bg-zinc-100 px-1 py-0.5 font-bold">store_id</code>.</p>
          </div>
          <button type="button" onClick={() => void load()} disabled={busy} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-zinc-200 px-4 text-xs font-black text-zinc-700 disabled:opacity-50"><RefreshCw size={15} className={busy ? 'animate-spin' : ''} /> Atualizar</button>
        </div>
      </div>

      <div className="grid gap-5 p-4 md:p-6 xl:grid-cols-[0.78fr_1.22fr]">
        <form onSubmit={uploadDocument} className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 md:p-5">
          <div className="flex items-center gap-2"><Upload size={18} className="text-red-600" /><h3 className="text-base font-black text-zinc-950">Adicionar conhecimento</h3></div>
          <p className="mt-2 text-xs leading-5 text-zinc-600">PDF, DOCX, TXT, Markdown ou CSV. Máximo de 25 MB. Arquivos grandes vão direto ao Storage privado e não passam pelo limite da Function.</p>

          <div className="mt-4 grid gap-3">
            {isMaster ? (
              <label className="text-xs font-black text-zinc-700">Destino do documento
                <select className="premium-input mt-1.5" value={scope} onChange={(event) => setScope(event.target.value as 'method' | 'store')}>
                  <option value="method">Método Venda Mais — oficial/global</option>
                  <option value="store">Conhecimento específico desta loja</option>
                </select>
              </label>
            ) : <div className="rounded-xl border border-zinc-200 bg-white p-3 text-xs font-bold text-zinc-700"><Store size={14} className="mr-1 inline text-red-600" /> Este arquivo ficará disponível somente para esta loja. Para publicar o Método Venda Mais oficial, entre com uma sessão Master.</div>}

            <label className="text-xs font-black text-zinc-700">Título
              <input className="premium-input mt-1.5" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Ex.: Livro Método Venda Mais — edição 2026" />
            </label>
            <label className="text-xs font-black text-zinc-700">Arquivo
              <input className="premium-input mt-1.5 file:mr-3 file:rounded-lg file:border-0 file:bg-zinc-950 file:px-3 file:py-2 file:text-xs file:font-black file:text-white" type="file" accept=".pdf,.docx,.txt,.md,.csv,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown,text/csv" onChange={(event) => { const selected = event.target.files?.[0] || null; setFile(selected); if (selected && selected.size > MAX_FILE_BYTES) setMessage('O arquivo deve ter no máximo 25 MB.'); }} />
            </label>
            {file ? <div className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-[11px] font-bold text-zinc-600">Selecionado: {file.name} · {formatBytes(file.size)}</div> : null}
          </div>

          {!schemaReady ? (
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3"><div className="flex items-center gap-2 text-amber-800"><LockKeyhole size={15} /><strong className="text-xs">Banco ainda não ativado</strong></div><p className="mt-1 text-xs leading-5 text-amber-800">A Biblioteca aguarda um ambiente de banco/Storage próprio. Nenhum arquivo será enviado ao Supabase Production.</p></div>
          ) : null}

          <button type="submit" disabled={!canManage || !schemaReady || !file || file.size > MAX_FILE_BYTES || busy} className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-red-600 px-4 text-xs font-black text-white disabled:cursor-not-allowed disabled:bg-zinc-300">{busy ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />} {busy ? 'Processando...' : 'Enviar e indexar'}</button>
        </form>

        <div className="space-y-4">
          <LibraryGroup title="Método Venda Mais — Oficial" helper="Conhecimento global protegido, herdado por todas as lojas. Somente Master publica." icon={<BookOpen size={17} />} documents={methodDocuments} canArchive={isMaster && canManage} onArchive={archive} />
          <LibraryGroup title="Conhecimento desta loja" helper="Políticas, treinamentos e materiais exclusivos da operação." icon={<Store size={17} />} documents={storeDocuments} canArchive={canManage} onArchive={archive} />
        </div>
      </div>

      <div className="border-t border-zinc-200 bg-zinc-50 px-5 py-4 text-xs leading-5 text-zinc-600">
        <strong className="text-zinc-900">Como a inteligência será usada:</strong> arquivo privado → extração de texto → divisão em trechos → embeddings → busca semântica → somente trechos relevantes entram no contexto da AUTOCAR. O arquivo inteiro não precisa ser enviado a cada atendimento.
      </div>
      {message ? <div className="border-t border-zinc-200 px-5 py-3 text-xs font-bold text-zinc-700">{message}</div> : null}
    </section>
  );
}

function LibraryGroup({ title, helper, icon, documents, canArchive, onArchive }: { title: string; helper: string; icon: React.ReactNode; documents: KnowledgeDocument[]; canArchive: boolean; onArchive: (document: KnowledgeDocument) => void }) {
  return (
    <div className="rounded-2xl border border-zinc-200 p-4 md:p-5">
      <div className="flex items-center gap-2 text-red-600">{icon}<div><h3 className="text-sm font-black text-zinc-950">{title}</h3><p className="mt-0.5 text-[10px] font-bold text-zinc-400">{helper}</p></div></div>
      <div className="mt-4 space-y-2">
        {!documents.length ? <div className="rounded-xl border border-dashed border-zinc-300 p-4 text-center text-xs font-bold text-zinc-400">Nenhum documento disponível neste ambiente.</div> : null}
        {documents.map((document) => (
          <div key={document.id} className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-red-600"><FileText size={17} /></div>
              <div className="min-w-0 flex-1"><p className="truncate text-xs font-black text-zinc-900">{document.title}</p><p className="mt-1 truncate text-[10px] font-bold text-zinc-400">{document.original_filename} · {formatBytes(Number(document.file_size_bytes || 0))}</p><div className="mt-2 flex flex-wrap gap-2"><span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[9px] font-black uppercase ${document.status === 'ready' ? 'bg-emerald-50 text-emerald-700' : document.status === 'failed' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'}`}>{document.status === 'ready' ? <CheckCircle2 size={11} /> : document.status === 'failed' ? <XCircle size={11} /> : <Loader2 size={11} />}{statusLabel(document.status)}</span>{document.chunk_count ? <span className="rounded-full bg-white px-2 py-1 text-[9px] font-black text-zinc-500">{document.chunk_count} trechos</span> : null}</div>{document.extraction_error ? <p className="mt-2 text-[10px] font-bold text-red-600">{document.extraction_error}</p> : null}</div>
              {canArchive ? <button type="button" onClick={() => onArchive(document)} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-500 hover:text-red-600" title="Arquivar"><Archive size={14} /></button> : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
