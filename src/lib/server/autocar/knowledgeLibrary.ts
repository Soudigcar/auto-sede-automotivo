import { createHash, randomUUID } from 'node:crypto';
import { autocarModelName } from '@/lib/server/autocar/client';
import {
  getAutocarRuntimeClient,
  resolveAutocarRuntimeTarget
} from '@/lib/server/autocar/runtimeEnvironment';

const KNOWLEDGE_BUCKET = 'autocar-knowledge';
export const AUTOCAR_KNOWLEDGE_MAX_FILE_BYTES = 25 * 1024 * 1024;
const EMBEDDING_MODEL = 'text-embedding-3-small';
const EMBEDDING_DIMENSIONS = 1536;
const SUPPORTED_MIME_TYPES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'text/markdown',
  'text/csv'
]);

export type AutocarKnowledgeScope = 'method' | 'store';

type UploadInput = {
  scope: AutocarKnowledgeScope;
  storeId: string | null;
  userId: string;
  title: string;
  file: File;
};

type DirectUploadPreparationInput = {
  scope: AutocarKnowledgeScope;
  storeId: string | null;
  title: string;
  fileName: string;
  mimeType: string;
  fileSizeBytes: number;
};

type FinalizeStoredUploadInput = {
  scope: AutocarKnowledgeScope;
  storeId: string | null;
  userId: string;
  title: string;
  originalFilename: string;
  mimeType: string;
  fileSizeBytes: number;
  storagePath: string;
};

function requiredOpenAiKey() {
  const key = String(process.env.OPENAI_API_KEY || '').trim();
  if (!key) throw new Error('OPENAI_API_KEY não disponível no ambiente de execução.');
  return key;
}

function createKnowledgeAdminClient() {
  return getAutocarRuntimeClient();
}

function assertKnowledgeWriteAllowed() {
  const target = resolveAutocarRuntimeTarget();
  if (target.schema === 'production_v2') {
    throw new Error('Biblioteca AUTOCAR Production está em leitura segura durante o cutover. Publicação/edição exige o fluxo Draft → Teste → Aprovação → Publicação.');
  }
}

function safeName(value: string) {
  return value.normalize('NFKD').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 120) || 'documento';
}

function normalizeMimeType(value: string) {
  return String(value || '').split(';')[0].trim().toLowerCase();
}

function validateScope(scope: AutocarKnowledgeScope, storeId: string | null) {
  if (scope === 'method' && storeId) throw new Error('Documento oficial do Método Venda Mais não pode ser vinculado a uma única loja.');
  if (scope === 'store' && !storeId) throw new Error('Documento da loja exige store_id confiável.');
}

function validateFileDescriptor(fileName: string, mimeType: string, fileSizeBytes: number) {
  const normalizedMime = normalizeMimeType(mimeType);
  if (!SUPPORTED_MIME_TYPES.has(normalizedMime)) throw new Error('Formato não suportado. Use PDF, DOCX, TXT, MD ou CSV.');
  if (!fileName.trim()) throw new Error('Nome do arquivo obrigatório.');
  if (!Number.isFinite(fileSizeBytes) || fileSizeBytes <= 0 || fileSizeBytes > AUTOCAR_KNOWLEDGE_MAX_FILE_BYTES) {
    throw new Error('O arquivo deve ter até 25 MB.');
  }
  return normalizedMime;
}

function expectedStoragePrefix(scope: AutocarKnowledgeScope, storeId: string | null) {
  validateScope(scope, storeId);
  return `${scope}/${scope === 'method' ? 'official' : storeId}/`;
}

function assertOwnedStoragePath(scope: AutocarKnowledgeScope, storeId: string | null, storagePath: string) {
  const prefix = expectedStoragePrefix(scope, storeId);
  if (!storagePath || !storagePath.startsWith(prefix) || storagePath.includes('..')) {
    throw new Error('Caminho de armazenamento inválido para este escopo AUTOCAR.');
  }
}

function normalizeText(value: string) {
  return value.replace(/\u0000/g, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

function chunkText(text: string) {
  const paragraphs = normalizeText(text).split(/\n{2,}/).map((item) => item.trim()).filter(Boolean);
  const chunks: string[] = [];
  let current = '';

  for (const paragraph of paragraphs) {
    if (paragraph.length > 5000) {
      const sentences = paragraph.split(/(?<=[.!?])\s+/);
      for (const sentence of sentences) {
        if ((current + '\n' + sentence).length > 4200 && current) {
          chunks.push(current.trim());
          current = '';
        }
        current += `${current ? '\n' : ''}${sentence}`;
      }
      continue;
    }

    if ((current + '\n\n' + paragraph).length > 4200 && current) {
      chunks.push(current.trim());
      current = '';
    }
    current += `${current ? '\n\n' : ''}${paragraph}`;
  }

  if (current.trim()) chunks.push(current.trim());
  return chunks.filter((item) => item.length >= 40).slice(0, 1500);
}

async function extractPdf(buffer: Buffer) {
  const pdfParse = (await import('pdf-parse')).default;
  const parsed = await pdfParse(buffer);
  return normalizeText(String(parsed.text || ''));
}

async function extractDocx(buffer: Buffer) {
  const mammoth = await import('mammoth');
  const parsed = await mammoth.extractRawText({ buffer });
  return normalizeText(String(parsed.value || ''));
}

async function extractText(buffer: Buffer, mimeType: string) {
  if (mimeType === 'application/pdf') return extractPdf(buffer);
  if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return extractDocx(buffer);
  return normalizeText(buffer.toString('utf8'));
}

async function embedBatch(inputs: string[]) {
  if (!inputs.length) return [] as number[][];
  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: { Authorization: `Bearer ${requiredOpenAiKey()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: inputs, dimensions: EMBEDDING_DIMENSIONS }),
    cache: 'no-store'
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(String(payload?.error?.message || `OpenAI embeddings respondeu com HTTP ${response.status}.`).slice(0, 500));
  return (payload?.data || []).map((item: any) => item.embedding as number[]);
}

function vectorLiteral(values: number[]) {
  return `[${values.map((value) => Number(value).toFixed(8)).join(',')}]`;
}

async function findDuplicate(supabase: any, scope: AutocarKnowledgeScope, storeId: string | null, checksum: string) {
  const query = supabase.from('ai_knowledge_documents')
    .select('id,title,status,created_at')
    .eq('scope', scope)
    .eq('checksum_sha256', checksum)
    .neq('status', 'archived');
  if (scope === 'store') query.eq('store_id', storeId);
  else query.is('store_id', null);
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data;
}

async function persistAndIndexAutocarKnowledge(input: {
  supabase: any;
  scope: AutocarKnowledgeScope;
  storeId: string | null;
  userId: string;
  title: string;
  originalFilename: string;
  mimeType: string;
  storagePath: string;
  bytes: Buffer;
  checksum: string;
  source: 'portal_upload' | 'direct_storage_upload';
}) {
  const { supabase, scope, storeId, userId, title, originalFilename, mimeType, storagePath, bytes, checksum, source } = input;
  const { data: document, error: documentError } = await supabase.from('ai_knowledge_documents').insert({
    scope,
    store_id: storeId,
    title: title || originalFilename,
    original_filename: originalFilename,
    mime_type: mimeType,
    file_size_bytes: bytes.length,
    checksum_sha256: checksum,
    storage_bucket: KNOWLEDGE_BUCKET,
    storage_path: storagePath,
    status: 'processing',
    embedding_model: EMBEDDING_MODEL,
    metadata: { source, model_route: autocarModelName(), actor_profile_id: userId }
  }).select('*').single();

  if (documentError) {
    await supabase.storage.from(KNOWLEDGE_BUCKET).remove([storagePath]);
    throw documentError;
  }

  try {
    const extracted = await extractText(bytes, mimeType);
    if (extracted.length < 40) throw new Error('Não foi possível extrair texto suficiente deste arquivo. Se for um PDF escaneado, será necessário OCR em uma etapa futura.');
    const chunks = chunkText(extracted);
    if (!chunks.length) throw new Error('O documento não gerou trechos úteis para indexação.');

    const rows: any[] = [];
    const batchSize = 48;
    for (let start = 0; start < chunks.length; start += batchSize) {
      const batch = chunks.slice(start, start + batchSize);
      const embeddings = await embedBatch(batch);
      if (embeddings.length !== batch.length) throw new Error('A indexação semântica retornou quantidade inesperada de embeddings.');
      batch.forEach((content, index) => {
        const embedding = embeddings[index];
        rows.push({
          document_id: document.id,
          scope,
          store_id: storeId,
          chunk_index: start + index,
          content,
          content_hash: createHash('sha256').update(content).digest('hex'),
          token_estimate: Math.ceil(content.length / 4),
          embedding: vectorLiteral(embedding),
          metadata: { filename: originalFilename, title: title || originalFilename }
        });
      });
    }

    for (let start = 0; start < rows.length; start += 100) {
      const { error } = await supabase.from('ai_knowledge_chunks').insert(rows.slice(start, start + 100));
      if (error) throw error;
    }

    const { data: ready, error: readyError } = await supabase.from('ai_knowledge_documents').update({
      status: 'ready',
      extracted_characters: extracted.length,
      chunk_count: chunks.length,
      extraction_error: null,
      updated_at: new Date().toISOString()
    }).eq('id', document.id).select('*').single();
    if (readyError) throw readyError;
    return ready;
  } catch (error: any) {
    await supabase.from('ai_knowledge_documents').update({
      status: 'failed',
      extraction_error: String(error?.message || error).slice(0, 1000),
      updated_at: new Date().toISOString()
    }).eq('id', document.id);
    throw error;
  }
}

export function autocarKnowledgeConfigured() {
  try {
    resolveAutocarRuntimeTarget();
    return true;
  } catch {
    return false;
  }
}

export async function prepareAutocarKnowledgeUpload(input: DirectUploadPreparationInput) {
  assertKnowledgeWriteAllowed();
  const supabase: any = createKnowledgeAdminClient();
  validateScope(input.scope, input.storeId);
  const mimeType = validateFileDescriptor(input.fileName, input.mimeType, input.fileSizeBytes);
  const prefix = expectedStoragePrefix(input.scope, input.storeId);
  const storagePath = `${prefix}${Date.now()}-${randomUUID()}-${safeName(input.fileName)}`;
  const { data, error } = await supabase.storage.from(KNOWLEDGE_BUCKET).createSignedUploadUrl(storagePath, { upsert: false });
  if (error) throw error;
  if (!data?.signedUrl) throw new Error('Não foi possível criar a autorização temporária de upload.');
  return {
    storage_path: storagePath,
    signed_url: data.signedUrl,
    mime_type: mimeType,
    max_file_bytes: AUTOCAR_KNOWLEDGE_MAX_FILE_BYTES,
    expires_in_seconds: 7200
  };
}

export async function finalizeAutocarKnowledgeUpload(input: FinalizeStoredUploadInput) {
  assertKnowledgeWriteAllowed();
  const supabase: any = createKnowledgeAdminClient();
  validateScope(input.scope, input.storeId);
  const mimeType = validateFileDescriptor(input.originalFilename, input.mimeType, input.fileSizeBytes);
  assertOwnedStoragePath(input.scope, input.storeId, input.storagePath);

  const { data: downloaded, error: downloadError } = await supabase.storage.from(KNOWLEDGE_BUCKET).download(input.storagePath);
  if (downloadError || !downloaded) throw downloadError || new Error('Arquivo enviado não foi encontrado no Storage privado.');
  const bytes = Buffer.from(await downloaded.arrayBuffer());
  if (!bytes.length || bytes.length > AUTOCAR_KNOWLEDGE_MAX_FILE_BYTES) {
    await supabase.storage.from(KNOWLEDGE_BUCKET).remove([input.storagePath]);
    throw new Error('O arquivo armazenado deve ter até 25 MB.');
  }

  const checksum = createHash('sha256').update(bytes).digest('hex');
  const duplicate = await findDuplicate(supabase, input.scope, input.storeId, checksum);
  if (duplicate) {
    await supabase.storage.from(KNOWLEDGE_BUCKET).remove([input.storagePath]);
    throw new Error(`Este arquivo já existe na biblioteca como “${duplicate.title}”.`);
  }

  return persistAndIndexAutocarKnowledge({
    supabase,
    scope: input.scope,
    storeId: input.storeId,
    userId: input.userId,
    title: input.title,
    originalFilename: input.originalFilename,
    mimeType,
    storagePath: input.storagePath,
    bytes,
    checksum,
    source: 'direct_storage_upload'
  });
}

export async function uploadAndIndexAutocarKnowledge(input: UploadInput) {
  assertKnowledgeWriteAllowed();
  const supabase: any = createKnowledgeAdminClient();
  const file = input.file;
  validateScope(input.scope, input.storeId);
  const mimeType = validateFileDescriptor(file.name, file.type, file.size);
  const bytes = Buffer.from(await file.arrayBuffer());
  const checksum = createHash('sha256').update(bytes).digest('hex');
  const duplicate = await findDuplicate(supabase, input.scope, input.storeId, checksum);
  if (duplicate) throw new Error(`Este arquivo já existe na biblioteca como “${duplicate.title}”.`);

  const storagePath = `${expectedStoragePrefix(input.scope, input.storeId)}${Date.now()}-${checksum.slice(0, 12)}-${safeName(file.name)}`;
  const { error: uploadError } = await supabase.storage.from(KNOWLEDGE_BUCKET).upload(storagePath, bytes, { contentType: mimeType, upsert: false });
  if (uploadError) throw uploadError;

  return persistAndIndexAutocarKnowledge({
    supabase,
    scope: input.scope,
    storeId: input.storeId,
    userId: input.userId,
    title: input.title,
    originalFilename: file.name,
    mimeType,
    storagePath,
    bytes,
    checksum,
    source: 'portal_upload'
  });
}

export async function listAutocarKnowledge(storeId: string) {
  const supabase: any = createKnowledgeAdminClient();
  const { data, error } = await supabase.from('ai_knowledge_documents')
    .select('id,scope,store_id,title,original_filename,mime_type,file_size_bytes,status,extracted_characters,chunk_count,embedding_model,extraction_error,created_at,updated_at')
    .or(`scope.eq.method,and(scope.eq.store,store_id.eq.${storeId})`)
    .neq('status', 'archived')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function archiveAutocarKnowledge(documentId: string, storeId: string, isMaster: boolean) {
  assertKnowledgeWriteAllowed();
  const supabase: any = createKnowledgeAdminClient();
  const { data: document, error } = await supabase.from('ai_knowledge_documents').select('id,scope,store_id').eq('id', documentId).maybeSingle();
  if (error) throw error;
  if (!document) throw new Error('Documento não encontrado.');
  if (document.scope === 'method' && !isMaster) throw new Error('Somente o Master pode arquivar o Método Venda Mais oficial.');
  if (document.scope === 'store' && document.store_id !== storeId) throw new Error('Documento não pertence a esta loja.');
  const { error: updateError } = await supabase.from('ai_knowledge_documents').update({ status: 'archived', updated_at: new Date().toISOString() }).eq('id', document.id);
  if (updateError) throw updateError;
}

export async function searchAutocarKnowledge(storeId: string, query: string, matchCount = 8) {
  const clean = normalizeText(query).slice(0, 4000);
  if (!clean) return [];
  const [embedding] = await embedBatch([clean]);
  const supabase: any = createKnowledgeAdminClient();
  const { data, error } = await supabase.rpc('match_autocar_knowledge', { p_store_id: storeId, p_query_embedding: vectorLiteral(embedding), p_match_count: matchCount });
  if (error) throw error;
  return data || [];
}
