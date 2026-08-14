import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { autocarModelName } from '@/lib/server/autocar/client';

const KNOWLEDGE_BUCKET = 'autocar-knowledge';
const MAX_FILE_BYTES = 25 * 1024 * 1024;
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

function requiredOpenAiKey() {
  const key = String(process.env.OPENAI_API_KEY || '').trim();
  if (!key) throw new Error('OPENAI_API_KEY não disponível no ambiente de execução.');
  return key;
}

function createKnowledgeAdminClient() {
  const url = String(process.env.AUTOCAR_KNOWLEDGE_SUPABASE_URL || '').trim();
  const serviceRoleKey = String(process.env.AUTOCAR_KNOWLEDGE_SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!url || !serviceRoleKey) {
    throw new Error('AUTOCAR_KNOWLEDGE_SUPABASE não configurado para este ambiente.');
  }
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

function safeName(value: string) {
  return value.normalize('NFKD').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 120) || 'documento';
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

export function autocarKnowledgeConfigured() {
  return Boolean(
    String(process.env.AUTOCAR_KNOWLEDGE_SUPABASE_URL || '').trim()
    && String(process.env.AUTOCAR_KNOWLEDGE_SUPABASE_SERVICE_ROLE_KEY || '').trim()
  );
}

export async function uploadAndIndexAutocarKnowledge(input: UploadInput) {
  const supabase: any = createKnowledgeAdminClient();
  const file = input.file;
  const mimeType = String(file.type || '').trim().toLowerCase();
  if (!SUPPORTED_MIME_TYPES.has(mimeType)) throw new Error('Formato não suportado. Use PDF, DOCX, TXT, MD ou CSV.');
  if (!file.size || file.size > MAX_FILE_BYTES) throw new Error('O arquivo deve ter até 25 MB.');
  if (input.scope === 'method' && input.storeId) throw new Error('Documento oficial do método não pode ser vinculado a uma única loja.');
  if (input.scope === 'store' && !input.storeId) throw new Error('Documento da loja exige store_id confiável.');

  const bytes = Buffer.from(await file.arrayBuffer());
  const checksum = createHash('sha256').update(bytes).digest('hex');
  const storagePath = `${input.scope}/${input.scope === 'method' ? 'official' : input.storeId}/${Date.now()}-${checksum.slice(0, 12)}-${safeName(file.name)}`;

  const duplicateQuery = supabase.from('ai_knowledge_documents').select('id,title,status,created_at').eq('scope', input.scope).eq('checksum_sha256', checksum).neq('status', 'archived');
  if (input.scope === 'store') duplicateQuery.eq('store_id', input.storeId);
  else duplicateQuery.is('store_id', null);
  const { data: duplicate, error: duplicateError } = await duplicateQuery.maybeSingle();
  if (duplicateError) throw duplicateError;
  if (duplicate) throw new Error(`Este arquivo já existe na biblioteca como “${duplicate.title}”.`);

  const { error: uploadError } = await supabase.storage.from(KNOWLEDGE_BUCKET).upload(storagePath, bytes, { contentType: mimeType, upsert: false });
  if (uploadError) throw uploadError;

  const { data: document, error: documentError } = await supabase.from('ai_knowledge_documents').insert({
    scope: input.scope,
    store_id: input.storeId,
    title: input.title || file.name,
    original_filename: file.name,
    mime_type: mimeType,
    file_size_bytes: file.size,
    checksum_sha256: checksum,
    storage_bucket: KNOWLEDGE_BUCKET,
    storage_path: storagePath,
    status: 'processing',
    embedding_model: EMBEDDING_MODEL,
    metadata: { source: 'portal_upload', model_route: autocarModelName(), actor_profile_id: input.userId }
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
    const batchSize = 32;
    for (let start = 0; start < chunks.length; start += batchSize) {
      const batch = chunks.slice(start, start + batchSize);
      const embeddings = await embedBatch(batch);
      if (embeddings.length !== batch.length) throw new Error('A indexação semântica retornou quantidade inesperada de embeddings.');
      batch.forEach((content, index) => {
        const embedding = embeddings[index];
        rows.push({
          document_id: document.id,
          scope: input.scope,
          store_id: input.storeId,
          chunk_index: start + index,
          content,
          content_hash: createHash('sha256').update(content).digest('hex'),
          token_estimate: Math.ceil(content.length / 4),
          embedding: vectorLiteral(embedding),
          metadata: { filename: file.name, title: input.title || file.name }
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
    await supabase.from('ai_knowledge_documents').update({ status: 'failed', extraction_error: String(error?.message || error).slice(0, 1000), updated_at: new Date().toISOString() }).eq('id', document.id);
    throw error;
  }
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
