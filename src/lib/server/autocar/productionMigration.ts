import { createHash } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export const AUTOCAR_SOURCE_REF = 'azszzdotbrczlhrmhrlw';
export const AUTOCAR_SOURCE_URL = `https://${AUTOCAR_SOURCE_REF}.supabase.co`;
export const AUTOCAR_PRODUCTION_REF = 'icmwdggbvijexjgrvsbl';
export const AUTOCAR_PRODUCTION_URL = `https://${AUTOCAR_PRODUCTION_REF}.supabase.co`;
export const A4_STORE_ID = '239755c3-a2d4-4cdd-9502-f1595031c924';
export const AUTOCAR_MIGRATION_CONFIRMATION = 'MIGRAR-AUTOCAR-PRODUCTION-A4';
const KNOWLEDGE_BUCKET = 'autocar-knowledge';

type Row = Record<string, any>;
type KnowledgeDocument = Row & {
  id: string;
  scope: 'method' | 'store';
  store_id: string | null;
  mime_type: string;
  file_size_bytes: number | string;
  checksum_sha256: string;
  storage_bucket: string;
  storage_path: string;
  status: string;
  updated_at: string;
};

export type AutocarMigrationSummary = {
  snapshot_at: string;
  live_enabled: false;
  copied: {
    documents: number;
    chunks: number;
    scenarios: number;
    simulations: number;
    conversations: number;
    claims: number;
    storage_objects: number;
  };
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function sha256(input: Buffer | string) {
  return createHash('sha256').update(input).digest('hex');
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${stable(object[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function vectorDimensions(value: unknown) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed.startsWith('[') || !trimmed.endsWith(']')) return null;
  const body = trimmed.slice(1, -1).trim();
  return body ? body.split(',').length : 0;
}

async function selectAll<T>(client: SupabaseClient, table: string, configure?: (query: any) => any): Promise<T[]> {
  let query: any = client.from(table).select('*');
  if (configure) query = configure(query);
  const { data, error } = await query;
  if (error) throw new Error(`${table}: ${error.message}`);
  return (data || []) as T[];
}

async function upsertRows(client: SupabaseClient, table: string, rows: Row[], batchSize = 20) {
  for (let offset = 0; offset < rows.length; offset += batchSize) {
    const { error } = await client.from(table).upsert(rows.slice(offset, offset + batchSize), { onConflict: 'id' });
    if (error) throw new Error(`${table} lote ${offset}: ${error.message}`);
  }
}

async function assertDestinationOffline(destination: SupabaseClient) {
  const { data, error } = await destination
    .from('autocar_runtime_config')
    .select('environment,schema_version,live_enabled')
    .eq('id', 'primary')
    .single();
  if (error) throw new Error(`Não foi possível validar a trava LIVE: ${error.message}`);
  assert(data.environment === 'production', 'Destino não está identificado como production.');
  assert(data.schema_version === 2, `Schema inesperado no destino: ${data.schema_version}.`);
  assert(data.live_enabled === false, 'ABORTADO: AUTOCAR Production está com live_enabled diferente de false.');
}

async function assertA4Reference(destination: SupabaseClient) {
  const { data, error } = await destination
    .from('ai_store_refs')
    .select('store_id,store_slug')
    .eq('store_id', A4_STORE_ID)
    .single();
  if (error) throw new Error(`Referência A4 ausente no destino: ${error.message}`);
  assert(data.store_slug === 'a4-multimarcas', 'Referência A4 do destino não corresponde à loja esperada.');
}

async function assertSourceA4(source: SupabaseClient) {
  const { data, error } = await source
    .from('ai_store_agents')
    .select('id,store_id')
    .eq('store_id', A4_STORE_ID)
    .maybeSingle();
  if (error) throw new Error(`Não foi possível validar a origem autocar-dev: ${error.message}`);
  assert(data?.store_id === A4_STORE_ID, 'A origem não contém o agente AUTOCAR esperado da A4.');
}

function destinationDocument(source: KnowledgeDocument): Row {
  const { created_by, updated_by, ...rest } = source;
  return {
    ...rest,
    publication_status: source.status === 'ready' ? 'published' : 'draft',
    published_at: source.status === 'ready' ? source.updated_at : null,
    published_by_profile_id: null,
    created_by_profile_id: created_by || null,
    updated_by_profile_id: updated_by || null
  };
}

async function migrateStorageObject(source: SupabaseClient, destination: SupabaseClient, document: KnowledgeDocument) {
  assert(document.storage_bucket === KNOWLEDGE_BUCKET, `Bucket inesperado no documento ${document.id}.`);

  const sourceDownload = await source.storage.from(KNOWLEDGE_BUCKET).download(document.storage_path);
  if (sourceDownload.error) throw new Error(`Falha ao baixar ${document.storage_path}: ${sourceDownload.error.message}`);
  const sourceBytes = Buffer.from(await sourceDownload.data.arrayBuffer());
  assert(sourceBytes.byteLength === Number(document.file_size_bytes), `Tamanho divergente em ${document.storage_path}.`);
  assert(sha256(sourceBytes) === document.checksum_sha256, `SHA-256 divergente na origem em ${document.storage_path}.`);

  const existing = await destination.storage.from(KNOWLEDGE_BUCKET).download(document.storage_path);
  if (!existing.error) {
    const existingBytes = Buffer.from(await existing.data.arrayBuffer());
    assert(existingBytes.byteLength === sourceBytes.byteLength, `Arquivo já existente com tamanho divergente: ${document.storage_path}.`);
    assert(sha256(existingBytes) === document.checksum_sha256, `Arquivo já existente com SHA-256 divergente: ${document.storage_path}.`);
    return;
  }

  const upload = await destination.storage.from(KNOWLEDGE_BUCKET).upload(document.storage_path, sourceBytes, {
    contentType: document.mime_type,
    upsert: false
  });
  if (upload.error) throw new Error(`Falha ao enviar ${document.storage_path}: ${upload.error.message}`);

  const verify = await destination.storage.from(KNOWLEDGE_BUCKET).download(document.storage_path);
  if (verify.error) throw new Error(`Falha na verificação de ${document.storage_path}: ${verify.error.message}`);
  const verifiedBytes = Buffer.from(await verify.data.arrayBuffer());
  assert(sha256(verifiedBytes) === document.checksum_sha256, `SHA-256 divergente após upload: ${document.storage_path}.`);
}

function assertSameIds(sourceRows: Row[], destinationRows: Row[], label: string) {
  const sourceIds = sourceRows.map((row) => row.id).sort();
  const destinationIds = destinationRows.map((row) => row.id).sort();
  assert(stable(sourceIds) === stable(destinationIds), `Conjunto de IDs divergente em ${label}.`);
}

export function autocarPreviewMigrationEnvironment() {
  return {
    vercel_environment: String(process.env.VERCEL_ENV || ''),
    source_ref: AUTOCAR_SOURCE_REF,
    expected_source_ref: AUTOCAR_SOURCE_REF,
    destination_ref: AUTOCAR_PRODUCTION_REF,
    source_key_stored: false,
    destination_key_stored: false
  };
}

export async function runAutocarProductionMigration(
  sourceServiceRoleKey: string,
  destinationServiceRoleKey: string
): Promise<AutocarMigrationSummary> {
  assert(process.env.VERCEL_ENV === 'preview', 'Migração disponível exclusivamente no Vercel Preview.');
  assert(sourceServiceRoleKey.trim().length >= 20, 'Credencial do autocar-dev ausente ou inválida.');
  assert(destinationServiceRoleKey.trim().length >= 20, 'Credencial do AUTOCAR Production ausente ou inválida.');
  assert(sourceServiceRoleKey.trim() !== destinationServiceRoleKey.trim(), 'As credenciais de origem e destino não podem ser iguais.');

  const source = createClient(AUTOCAR_SOURCE_URL, sourceServiceRoleKey.trim(), {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const destination = createClient(AUTOCAR_PRODUCTION_URL, destinationServiceRoleKey.trim(), {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  await assertSourceA4(source);
  await assertDestinationOffline(destination);
  await assertA4Reference(destination);

  const snapshotAt = new Date().toISOString();
  const [documents, chunks, scenarios, simulations, conversations, claims] = await Promise.all([
    selectAll<KnowledgeDocument>(source, 'ai_knowledge_documents', (q) => q.or(`scope.eq.method,store_id.eq.${A4_STORE_ID}`).order('created_at')),
    selectAll<Row>(source, 'ai_knowledge_chunks', (q) => q.or(`scope.eq.method,store_id.eq.${A4_STORE_ID}`).order('created_at')),
    selectAll<Row>(source, 'ai_training_scenarios', (q) => q.or(`scope.eq.global,store_id.eq.${A4_STORE_ID}`).order('created_at')),
    selectAll<Row>(source, 'ai_training_simulations', (q) => q.or(`store_id.is.null,store_id.eq.${A4_STORE_ID}`).order('created_at')),
    selectAll<Row>(source, 'ai_runtime_conversations', (q) => q.eq('store_id', A4_STORE_ID).order('created_at')),
    selectAll<Row>(source, 'ai_runtime_message_claims', (q) => q.eq('store_id', A4_STORE_ID).order('created_at'))
  ]);

  assert(documents.length === 4, `Esperados 4 documentos; encontrados ${documents.length}.`);
  assert(chunks.length === 63, `Esperados 63 chunks; encontrados ${chunks.length}.`);
  assert(scenarios.length === 2, `Esperados 2 cenários; encontrados ${scenarios.length}.`);
  assert(simulations.length >= 8, `Esperadas ao menos 8 simulações; encontradas ${simulations.length}.`);
  assert(conversations.length >= 4, `Esperadas ao menos 4 conversas A4; encontradas ${conversations.length}.`);
  assert(claims.length >= 115, `Esperados ao menos 115 claims A4; encontrados ${claims.length}.`);

  for (const chunk of chunks) assert(vectorDimensions(chunk.embedding) === 1536, `Embedding inválido no chunk ${chunk.id}.`);
  for (const scenario of scenarios) {
    if (scenario.embedding != null) assert(vectorDimensions(scenario.embedding) === 1536, `Embedding inválido no cenário ${scenario.id}.`);
  }

  await assertDestinationOffline(destination);
  for (const document of documents) await migrateStorageObject(source, destination, document);

  await assertDestinationOffline(destination);
  await upsertRows(destination, 'ai_knowledge_documents', documents.map(destinationDocument), 10);
  await upsertRows(destination, 'ai_knowledge_chunks', chunks, 10);
  await upsertRows(destination, 'ai_training_scenarios', scenarios, 10);
  await upsertRows(destination, 'ai_training_simulations', simulations, 20);
  await upsertRows(destination, 'ai_runtime_conversations', conversations, 20);
  await upsertRows(destination, 'ai_runtime_message_claims', claims, 20);
  await assertDestinationOffline(destination);

  const [targetDocuments, targetChunks, targetScenarios, targetSimulations, targetConversations, targetClaims] = await Promise.all([
    selectAll<Row>(destination, 'ai_knowledge_documents', (q) => q.or(`scope.eq.method,store_id.eq.${A4_STORE_ID}`)),
    selectAll<Row>(destination, 'ai_knowledge_chunks', (q) => q.or(`scope.eq.method,store_id.eq.${A4_STORE_ID}`)),
    selectAll<Row>(destination, 'ai_training_scenarios', (q) => q.or(`scope.eq.global,store_id.eq.${A4_STORE_ID}`)),
    selectAll<Row>(destination, 'ai_training_simulations', (q) => q.or(`store_id.is.null,store_id.eq.${A4_STORE_ID}`)),
    selectAll<Row>(destination, 'ai_runtime_conversations', (q) => q.eq('store_id', A4_STORE_ID)),
    selectAll<Row>(destination, 'ai_runtime_message_claims', (q) => q.eq('store_id', A4_STORE_ID))
  ]);

  assertSameIds(documents, targetDocuments, 'documentos');
  assertSameIds(chunks, targetChunks, 'chunks');
  assertSameIds(scenarios, targetScenarios, 'cenários');
  assertSameIds(simulations, targetSimulations, 'simulações');
  assertSameIds(conversations, targetConversations, 'conversas');
  assertSameIds(claims, targetClaims, 'claims');

  const targetChunksById = new Map(targetChunks.map((row) => [row.id, row]));
  for (const chunk of chunks) {
    const target = targetChunksById.get(chunk.id);
    assert(target, `Chunk ausente no destino: ${chunk.id}.`);
    assert(target.content_hash === chunk.content_hash, `content_hash divergente no chunk ${chunk.id}.`);
    assert(sha256(String(target.embedding)) === sha256(String(chunk.embedding)), `Vetor divergente no chunk ${chunk.id}.`);
  }

  const targetScenariosById = new Map(targetScenarios.map((row) => [row.id, row]));
  for (const scenario of scenarios) {
    const target = targetScenariosById.get(scenario.id);
    assert(target, `Cenário ausente no destino: ${scenario.id}.`);
    assert(sha256(String(target.embedding || '')) === sha256(String(scenario.embedding || '')), `Vetor divergente no cenário ${scenario.id}.`);
  }

  const targetClaimsById = new Map(targetClaims.map((row) => [row.id, row]));
  for (const claim of claims) {
    const target = targetClaimsById.get(claim.id);
    assert(target, `Claim ausente no destino: ${claim.id}.`);
    assert(target.idempotency_key === claim.idempotency_key, `Idempotência divergente no claim ${claim.id}.`);
    assert(stable(target.result) === stable(claim.result), `Resultado divergente no claim ${claim.id}.`);
  }

  for (const document of documents) {
    const verify = await destination.storage.from(KNOWLEDGE_BUCKET).download(document.storage_path);
    if (verify.error) throw new Error(`Arquivo ausente na verificação final: ${document.storage_path}.`);
    const bytes = Buffer.from(await verify.data.arrayBuffer());
    assert(sha256(bytes) === document.checksum_sha256, `Checksum final divergente: ${document.storage_path}.`);
  }

  await assertDestinationOffline(destination);
  return {
    snapshot_at: snapshotAt,
    live_enabled: false,
    copied: {
      documents: targetDocuments.length,
      chunks: targetChunks.length,
      scenarios: targetScenarios.length,
      simulations: targetSimulations.length,
      conversations: targetConversations.length,
      claims: targetClaims.length,
      storage_objects: documents.length
    }
  };
}
