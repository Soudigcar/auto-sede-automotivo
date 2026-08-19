import { createHash } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const SOURCE_REF = "azszzdotbrczlhrmhrlw";
const DESTINATION_REF = "icmwdggbvijexjgrvsbl";
const A4_STORE_ID = "239755c3-a2d4-4cdd-9502-f1595031c924";
const KNOWLEDGE_BUCKET = "autocar-knowledge";
const CONFIRMATION = `${SOURCE_REF}->${DESTINATION_REF}`;

const APPLY = process.argv.includes("--apply");

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function projectRefFromUrl(rawUrl: string): string {
  const hostname = new URL(rawUrl).hostname;
  return hostname.split(".")[0] ?? "";
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function sha256(input: Buffer | string): string {
  return createHash("sha256").update(input).digest("hex");
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stable(object[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function vectorDimensions(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed.startsWith("[") || !trimmed.endsWith("]")) return null;
  const body = trimmed.slice(1, -1).trim();
  return body ? body.split(",").length : 0;
}

async function selectAll<T>(
  client: SupabaseClient,
  table: string,
  configure?: (query: any) => any,
): Promise<T[]> {
  let query: any = client.from(table).select("*");
  if (configure) query = configure(query);
  const { data, error } = await query;
  if (error) throw new Error(`${table} read failed: ${error.message}`);
  return (data ?? []) as T[];
}

async function upsertRows(
  client: SupabaseClient,
  table: string,
  rows: Record<string, unknown>[],
  batchSize = 25,
): Promise<void> {
  if (!rows.length) return;
  for (let offset = 0; offset < rows.length; offset += batchSize) {
    const batch = rows.slice(offset, offset + batchSize);
    const { error } = await client.from(table).upsert(batch, { onConflict: "id" });
    if (error) throw new Error(`${table} upsert failed at ${offset}: ${error.message}`);
  }
}

async function assertDestinationOffline(destination: SupabaseClient): Promise<void> {
  const { data, error } = await destination
    .from("autocar_runtime_config")
    .select("id,environment,schema_version,live_enabled")
    .eq("id", "primary")
    .single();
  if (error) throw new Error(`Unable to read destination runtime guard: ${error.message}`);
  assert(data.environment === "production", "Destination runtime environment is not production");
  assert(data.schema_version === 2, `Unexpected destination schema_version=${data.schema_version}`);
  assert(data.live_enabled === false, "ABORT: destination live_enabled is not false");
}

async function assertStoreRef(destination: SupabaseClient): Promise<void> {
  const { data, error } = await destination
    .from("ai_store_refs")
    .select("store_id,store_slug")
    .eq("store_id", A4_STORE_ID)
    .single();
  if (error) throw new Error(`A4 store reference missing in destination: ${error.message}`);
  assert(data.store_slug === "a4-multimarcas", "A4 store reference has an unexpected slug");
}

type KnowledgeDocument = Record<string, any> & {
  id: string;
  scope: "method" | "store";
  store_id: string | null;
  mime_type: string;
  file_size_bytes: number | string;
  checksum_sha256: string;
  storage_bucket: string;
  storage_path: string;
  status: string;
  updated_at: string;
};

function destinationDocument(source: KnowledgeDocument): Record<string, unknown> {
  const { created_by, updated_by, ...rest } = source;
  return {
    ...rest,
    publication_status: source.status === "ready" ? "published" : "draft",
    published_at: source.status === "ready" ? source.updated_at : null,
    published_by_profile_id: null,
    created_by_profile_id: created_by ?? null,
    updated_by_profile_id: updated_by ?? null,
  };
}

async function migrateStorageObject(
  source: SupabaseClient,
  destination: SupabaseClient,
  document: KnowledgeDocument,
): Promise<void> {
  assert(document.storage_bucket === KNOWLEDGE_BUCKET, `Unexpected source bucket for ${document.id}`);

  const sourceDownload = await source.storage.from(KNOWLEDGE_BUCKET).download(document.storage_path);
  if (sourceDownload.error) {
    throw new Error(`Source storage download failed for ${document.storage_path}: ${sourceDownload.error.message}`);
  }

  const sourceBytes = Buffer.from(await sourceDownload.data.arrayBuffer());
  assert(
    sourceBytes.byteLength === Number(document.file_size_bytes),
    `Source file size mismatch for ${document.storage_path}`,
  );
  assert(
    sha256(sourceBytes) === document.checksum_sha256,
    `Source SHA-256 mismatch for ${document.storage_path}`,
  );

  const existing = await destination.storage.from(KNOWLEDGE_BUCKET).download(document.storage_path);
  if (!existing.error) {
    const destinationBytes = Buffer.from(await existing.data.arrayBuffer());
    assert(
      destinationBytes.byteLength === sourceBytes.byteLength,
      `Existing destination file size mismatch for ${document.storage_path}`,
    );
    assert(
      sha256(destinationBytes) === document.checksum_sha256,
      `Existing destination SHA-256 mismatch for ${document.storage_path}`,
    );
    return;
  }

  if (!APPLY) return;

  const upload = await destination.storage.from(KNOWLEDGE_BUCKET).upload(document.storage_path, sourceBytes, {
    contentType: document.mime_type,
    upsert: false,
  });
  if (upload.error) {
    throw new Error(`Destination storage upload failed for ${document.storage_path}: ${upload.error.message}`);
  }

  const verify = await destination.storage.from(KNOWLEDGE_BUCKET).download(document.storage_path);
  if (verify.error) throw new Error(`Destination verification download failed: ${verify.error.message}`);
  const verifiedBytes = Buffer.from(await verify.data.arrayBuffer());
  assert(sha256(verifiedBytes) === document.checksum_sha256, `Uploaded SHA-256 mismatch for ${document.storage_path}`);
}

async function compareIdSets(
  sourceRows: Record<string, any>[],
  destinationRows: Record<string, any>[],
  label: string,
): Promise<void> {
  const sourceIds = sourceRows.map((row) => row.id).sort();
  const destinationIds = destinationRows.map((row) => row.id).sort();
  assert(stable(sourceIds) === stable(destinationIds), `${label} ID set mismatch`);
}

async function main(): Promise<void> {
  const sourceUrl = requiredEnv("AUTOCAR_DEV_SUPABASE_URL");
  const sourceServiceRole = requiredEnv("AUTOCAR_DEV_SUPABASE_SERVICE_ROLE_KEY");
  const destinationUrl = requiredEnv("AUTOCAR_PROD_SUPABASE_URL");
  const destinationServiceRole = requiredEnv("AUTOCAR_PROD_SUPABASE_SERVICE_ROLE_KEY");

  assert(projectRefFromUrl(sourceUrl) === SOURCE_REF, "Source URL is not the expected autocar-dev project");
  assert(projectRefFromUrl(destinationUrl) === DESTINATION_REF, "Destination URL is not the expected AUTOCAR Production project");
  assert(sourceUrl !== destinationUrl, "Source and destination URLs must differ");
  assert(sourceServiceRole !== destinationServiceRole, "Source and destination service-role keys must differ");

  if (APPLY) {
    assert(
      process.env.AUTOCAR_MIGRATION_CONFIRM === CONFIRMATION,
      `Set AUTOCAR_MIGRATION_CONFIRM=${CONFIRMATION} to execute writes`,
    );
  }

  const source = createClient(sourceUrl, sourceServiceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const destination = createClient(destinationUrl, destinationServiceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  await assertDestinationOffline(destination);
  await assertStoreRef(destination);

  const documents = await selectAll<KnowledgeDocument>(source, "ai_knowledge_documents", (q) =>
    q.or(`scope.eq.method,store_id.eq.${A4_STORE_ID}`).order("created_at"),
  );
  const chunks = await selectAll<Record<string, any>>(source, "ai_knowledge_chunks", (q) =>
    q.or(`scope.eq.method,store_id.eq.${A4_STORE_ID}`).order("created_at"),
  );
  const scenarios = await selectAll<Record<string, any>>(source, "ai_training_scenarios", (q) =>
    q.or(`scope.eq.global,store_id.eq.${A4_STORE_ID}`).order("created_at"),
  );
  const simulations = await selectAll<Record<string, any>>(source, "ai_training_simulations", (q) =>
    q.or(`store_id.is.null,store_id.eq.${A4_STORE_ID}`).order("created_at"),
  );
  const conversations = await selectAll<Record<string, any>>(source, "ai_runtime_conversations", (q) =>
    q.eq("store_id", A4_STORE_ID).order("created_at"),
  );
  const claims = await selectAll<Record<string, any>>(source, "ai_runtime_message_claims", (q) =>
    q.eq("store_id", A4_STORE_ID).order("created_at"),
  );

  assert(documents.length === 4, `Expected 4 selected documents, got ${documents.length}`);
  assert(chunks.length === 63, `Expected 63 selected chunks, got ${chunks.length}`);
  assert(scenarios.length === 2, `Expected 2 selected training scenarios, got ${scenarios.length}`);
  assert(simulations.length >= 8, `Expected at least 8 selected simulations, got ${simulations.length}`);
  assert(conversations.length >= 4, `Expected at least 4 A4 runtime conversations, got ${conversations.length}`);
  assert(claims.length >= 115, `Expected at least 115 A4 claims, got ${claims.length}`);

  for (const chunk of chunks) {
    assert(vectorDimensions(chunk.embedding) === 1536, `Chunk ${chunk.id} does not contain a 1536-d embedding`);
  }
  for (const scenario of scenarios) {
    if (scenario.embedding != null) {
      assert(vectorDimensions(scenario.embedding) === 1536, `Scenario ${scenario.id} does not contain a 1536-d embedding`);
    }
  }

  console.log(
    JSON.stringify({
      mode: APPLY ? "apply" : "dry-run",
      source: SOURCE_REF,
      destination: DESTINATION_REF,
      store: A4_STORE_ID,
      selected: {
        documents: documents.length,
        chunks: chunks.length,
        scenarios: scenarios.length,
        simulations: simulations.length,
        conversations: conversations.length,
        claims: claims.length,
      },
    }),
  );

  for (const document of documents) {
    await migrateStorageObject(source, destination, document);
  }

  if (!APPLY) {
    console.log("Dry-run complete: no database rows or storage objects were written.");
    return;
  }

  await upsertRows(destination, "ai_knowledge_documents", documents.map(destinationDocument));
  await upsertRows(destination, "ai_knowledge_chunks", chunks, 10);
  await upsertRows(destination, "ai_training_scenarios", scenarios, 10);
  await upsertRows(destination, "ai_training_simulations", simulations, 20);
  await upsertRows(destination, "ai_runtime_conversations", conversations, 20);
  await upsertRows(destination, "ai_runtime_message_claims", claims, 20);

  await assertDestinationOffline(destination);

  const destinationDocuments = await selectAll<Record<string, any>>(destination, "ai_knowledge_documents", (q) =>
    q.or(`scope.eq.method,store_id.eq.${A4_STORE_ID}`),
  );
  const destinationChunks = await selectAll<Record<string, any>>(destination, "ai_knowledge_chunks", (q) =>
    q.or(`scope.eq.method,store_id.eq.${A4_STORE_ID}`),
  );
  const destinationScenarios = await selectAll<Record<string, any>>(destination, "ai_training_scenarios", (q) =>
    q.or(`scope.eq.global,store_id.eq.${A4_STORE_ID}`),
  );
  const destinationSimulations = await selectAll<Record<string, any>>(destination, "ai_training_simulations", (q) =>
    q.or(`store_id.is.null,store_id.eq.${A4_STORE_ID}`),
  );
  const destinationConversations = await selectAll<Record<string, any>>(destination, "ai_runtime_conversations", (q) =>
    q.eq("store_id", A4_STORE_ID),
  );
  const destinationClaims = await selectAll<Record<string, any>>(destination, "ai_runtime_message_claims", (q) =>
    q.eq("store_id", A4_STORE_ID),
  );

  await compareIdSets(documents, destinationDocuments, "documents");
  await compareIdSets(chunks, destinationChunks, "chunks");
  await compareIdSets(scenarios, destinationScenarios, "scenarios");
  await compareIdSets(simulations, destinationSimulations, "simulations");
  await compareIdSets(conversations, destinationConversations, "runtime conversations");
  await compareIdSets(claims, destinationClaims, "runtime claims");

  const destinationChunkById = new Map(destinationChunks.map((row) => [row.id, row]));
  for (const chunk of chunks) {
    const target = destinationChunkById.get(chunk.id);
    assert(target, `Missing destination chunk ${chunk.id}`);
    assert(target.content_hash === chunk.content_hash, `Chunk content_hash mismatch for ${chunk.id}`);
    assert(sha256(String(target.embedding)) === sha256(String(chunk.embedding)), `Chunk vector mismatch for ${chunk.id}`);
  }

  const destinationScenarioById = new Map(destinationScenarios.map((row) => [row.id, row]));
  for (const scenario of scenarios) {
    const target = destinationScenarioById.get(scenario.id);
    assert(target, `Missing destination scenario ${scenario.id}`);
    assert(sha256(String(target.embedding ?? "")) === sha256(String(scenario.embedding ?? "")), `Scenario vector mismatch for ${scenario.id}`);
  }

  const destinationClaimById = new Map(destinationClaims.map((row) => [row.id, row]));
  for (const claim of claims) {
    const target = destinationClaimById.get(claim.id);
    assert(target, `Missing destination claim ${claim.id}`);
    assert(target.idempotency_key === claim.idempotency_key, `Claim idempotency mismatch for ${claim.id}`);
    assert(stable(target.result) === stable(claim.result), `Claim result mismatch for ${claim.id}`);
  }

  for (const document of documents) {
    const verify = await destination.storage.from(KNOWLEDGE_BUCKET).download(document.storage_path);
    if (verify.error) throw new Error(`Final storage verification failed for ${document.storage_path}: ${verify.error.message}`);
    const bytes = Buffer.from(await verify.data.arrayBuffer());
    assert(sha256(bytes) === document.checksum_sha256, `Final storage checksum mismatch for ${document.storage_path}`);
  }

  await assertDestinationOffline(destination);

  console.log(
    JSON.stringify({
      migrated: true,
      live_enabled: false,
      verified: {
        documents: destinationDocuments.length,
        chunks: destinationChunks.length,
        scenarios: destinationScenarios.length,
        simulations: destinationSimulations.length,
        conversations: destinationConversations.length,
        claims: destinationClaims.length,
        storage_objects: documents.length,
      },
    }),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Unknown migration error");
  process.exitCode = 1;
});
