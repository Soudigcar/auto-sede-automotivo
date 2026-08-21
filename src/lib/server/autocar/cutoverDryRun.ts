import { createHash } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  AUTOCAR_DEV_REF,
  AUTOCAR_PRODUCTION_REF,
  AUTOCAR_PRODUCTION_SCHEMA_VERSION,
  resolveAutocarRuntimeTarget
} from './runtimeEnvironment';

const AUTOCAR_PRODUCTION_URL = `https://${AUTOCAR_PRODUCTION_REF}.supabase.co`;
const PAGE_SIZE = 1000;
const MAX_ROWS_PER_TABLE = 50000;

export const AUTOCAR_CUTOVER_TABLES = [
  'ai_runtime_conversations',
  'ai_runtime_message_claims'
] as const;

type CutoverTable = (typeof AUTOCAR_CUTOVER_TABLES)[number];
type RuntimeRow = Record<string, unknown> & {
  id: string;
  store_id?: string | null;
  idempotency_key?: string | null;
  updated_at?: string | null;
};

type IdempotencyConflict = {
  key_hash: string;
  source_id: string;
  destination_id: string;
};

export type RuntimeTableComparison = {
  table: CutoverTable;
  source_count: number;
  destination_count: number;
  delta: number;
  source_hash: string;
  destination_hash: string;
  missing_in_destination_count: number;
  missing_in_destination_ids: string[];
  changed_count: number;
  changed: Array<{
    id: string;
    source_hash: string;
    destination_hash: string;
    source_updated_at: string | null;
    destination_updated_at: string | null;
  }>;
  extra_in_destination_count: number;
  extra_in_destination_ids: string[];
  source_by_store: Array<{ store_id: string; count: number }>;
  destination_by_store: Array<{ store_id: string; count: number }>;
  idempotency?: {
    source_duplicate_count: number;
    destination_duplicate_count: number;
    cross_conflict_count: number;
    cross_conflicts: IdempotencyConflict[];
  };
};

export type AutocarCutoverDryRunReport = {
  mode: 'dry-run-read-only';
  vercel_environment: 'preview';
  generated_at: string;
  source: {
    project_ref: typeof AUTOCAR_DEV_REF;
    schema: 'dev_v1';
  };
  destination: {
    project_ref: typeof AUTOCAR_PRODUCTION_REF;
    environment: 'production';
    schema_version: number;
    live_enabled: false;
  };
  write_operations_available: false;
  safe_to_prepare_sync: boolean;
  blockers: string[];
  tables: RuntimeTableComparison[];
};

function safeString(value: unknown) {
  return String(value ?? '').trim();
}

export function assertCutoverDryRunPreview(environment: NodeJS.ProcessEnv = process.env) {
  const vercelEnvironment = safeString(environment.VERCEL_ENV);
  if (vercelEnvironment !== 'preview') {
    throw new Error('SAFE CORE: ferramenta de cutover dry-run disponível exclusivamente no Vercel Preview.');
  }
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalize(entry)])
    );
  }
  return value;
}

export function stableRuntimeHash(value: unknown) {
  const canonical = JSON.stringify(canonicalize(value));
  return createHash('sha256').update(canonical).digest('hex');
}

function tableHash(rows: RuntimeRow[]) {
  const ordered = [...rows].sort((left, right) => left.id.localeCompare(right));
  return stableRuntimeHash(ordered);
}

function rowsByStore(rows: RuntimeRow[]) {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const storeId = safeString(row.store_id) || '(sem-store-id)';
    counts.set(storeId, (counts.get(storeId) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([store_id, count]) => ({ store_id, count }))
    .sort((left, right) => left.store_id.localeCompare(right.store_id));
}

function duplicateIdempotencyKeys(rows: RuntimeRow[]) {
  const seen = new Map<string, string>();
  const duplicates = new Set<string>();
  for (const row of rows) {
    const key = safeString(row.idempotency_key);
    if (!key) continue;
    if (seen.has(key)) duplicates.add(key);
    else seen.set(key, row.id);
  }
  return { seen, duplicates };
}

function compareIdempotency(source: RuntimeRow[], destination: RuntimeRow[]) {
  const sourceKeys = duplicateIdempotencyKeys(source);
  const destinationKeys = duplicateIdempotencyKeys(destination);
  const conflicts: IdempotencyConflict[] = [];

  for (const [key, sourceId] of sourceKeys.seen.entries()) {
    const destinationId = destinationKeys.seen.get(key);
    if (destinationId && destinationId !== sourceId) {
      conflicts.push({
        key_hash: stableRuntimeHash(key),
        source_id: sourceId,
        destination_id: destinationId
      });
    }
  }

  return {
    source_duplicate_count: sourceKeys.duplicates.size,
    destination_duplicate_count: destinationKeys.duplicates.size,
    cross_conflict_count: conflicts.length,
    cross_conflicts: conflicts.slice(0, 100)
  };
}

export function compareRuntimeRows(
  table: CutoverTable,
  sourceRows: RuntimeRow[],
  destinationRows: RuntimeRow[]
): RuntimeTableComparison {
  const source = new Map(sourceRows.map((row) => [row.id, row]));
  const destination = new Map(destinationRows.map((row) => [row.id, row]));
  const missing: string[] = [];
  const extra: string[] = [];
  const changed: RuntimeTableComparison['changed'] = [];

  for (const [id, row] of source.entries()) {
    const target = destination.get(id);
    if (!target) {
      missing.push(id);
      continue;
    }
    const sourceHash = stableRuntimeHash(row);
    const destinationHash = stableRuntimeHash(target);
    if (sourceHash !== destinationHash) {
      changed.push({
        id,
        source_hash: sourceHash,
        destination_hash: destinationHash,
        source_updated_at: safeString(row.updated_at) || null,
        destination_updated_at: safeString(target.updated_at) || null
      });
    }
  }

  for (const id of destination.keys()) {
    if (!source.has(id)) extra.push(id);
  }

  missing.sort();
  extra.sort();
  changed.sort((left, right) => left.id.localeCompare(right.id));

  const comparison: RuntimeTableComparison = {
    table,
    source_count: sourceRows.length,
    destination_count: destinationRows.length,
    delta: sourceRows.length - destinationRows.length,
    source_hash: tableHash(sourceRows),
    destination_hash: tableHash(destinationRows),
    missing_in_destination_count: missing.length,
    missing_in_destination_ids: missing.slice(0, 500),
    changed_count: changed.length,
    changed: changed.slice(0, 500),
    extra_in_destination_count: extra.length,
    extra_in_destination_ids: extra.slice(0, 500),
    source_by_store: rowsByStore(sourceRows),
    destination_by_store: rowsByStore(destinationRows)
  };

  if (table === 'ai_runtime_message_claims') {
    comparison.idempotency = compareIdempotency(sourceRows, destinationRows);
  }

  return comparison;
}

async function readAllRows(client: SupabaseClient, table: CutoverTable): Promise<RuntimeRow[]> {
  const rows: RuntimeRow[] = [];
  for (let from = 0; from < MAX_ROWS_PER_TABLE; from += PAGE_SIZE) {
    const { data, error } = await client
      .from(table)
      .select('*')
      .order('id', { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw new Error(`Falha ao ler ${table}: ${error.message}`);
    const page = (data || []) as RuntimeRow[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
  throw new Error(`SAFE CORE: ${table} excedeu o limite de ${MAX_ROWS_PER_TABLE} registros do dry-run.`);
}

function productionClient(serviceRoleKey: string) {
  const key = safeString(serviceRoleKey);
  if (!key) throw new Error('Service-role key do AUTOCAR Production é obrigatória para esta requisição transitória.');
  return createClient(AUTOCAR_PRODUCTION_URL, key, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

export async function runAutocarCutoverDryRun(
  productionServiceRoleKey: string,
  environment: NodeJS.ProcessEnv = process.env
): Promise<AutocarCutoverDryRunReport> {
  assertCutoverDryRunPreview(environment);

  const sourceTarget = resolveAutocarRuntimeTarget(environment);
  if (sourceTarget.projectRef !== AUTOCAR_DEV_REF || sourceTarget.schema !== 'dev_v1') {
    throw new Error('SAFE CORE: origem do dry-run não é o autocar-dev autorizado.');
  }

  const sourceClient = createClient(sourceTarget.url, sourceTarget.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const destinationClient = productionClient(productionServiceRoleKey);

  const { data: runtimeConfig, error: runtimeConfigError } = await destinationClient
    .from('autocar_runtime_config')
    .select('environment,schema_version,live_enabled')
    .eq('id', 'primary')
    .single();

  if (runtimeConfigError) {
    throw new Error(`SAFE CORE: não foi possível validar AUTOCAR Production: ${runtimeConfigError.message}`);
  }

  const databaseEnvironment = safeString(runtimeConfig?.environment);
  const schemaVersion = Number(runtimeConfig?.schema_version || 0);
  const liveEnabled = runtimeConfig?.live_enabled === true;

  if (databaseEnvironment !== 'production') {
    throw new Error('SAFE CORE: destino não se identifica como AUTOCAR Production.');
  }
  if (schemaVersion !== AUTOCAR_PRODUCTION_SCHEMA_VERSION) {
    throw new Error(`SAFE CORE: schema do destino incompatível. Esperado ${AUTOCAR_PRODUCTION_SCHEMA_VERSION}, recebido ${schemaVersion || 'desconhecido'}.`);
  }
  if (liveEnabled) {
    throw new Error('SAFE CORE: dry-run abortado porque AUTOCAR Production está com live_enabled=true.');
  }

  const tables: RuntimeTableComparison[] = [];
  for (const table of AUTOCAR_CUTOVER_TABLES) {
    const [sourceRows, destinationRows] = await Promise.all([
      readAllRows(sourceClient, table),
      readAllRows(destinationClient, table)
    ]);
    tables.push(compareRuntimeRows(table, sourceRows, destinationRows));
  }

  const blockers: string[] = [];
  for (const table of tables) {
    if (table.extra_in_destination_count > 0) {
      blockers.push(`${table.table}: existem ${table.extra_in_destination_count} registros apenas no destino; upsert não os removeria.`);
    }
    if (table.idempotency?.source_duplicate_count) {
      blockers.push(`${table.table}: existem ${table.idempotency.source_duplicate_count} chaves de idempotência duplicadas na origem.`);
    }
    if (table.idempotency?.destination_duplicate_count) {
      blockers.push(`${table.table}: existem ${table.idempotency.destination_duplicate_count} chaves de idempotência duplicadas no destino.`);
    }
    if (table.idempotency?.cross_conflict_count) {
      blockers.push(`${table.table}: existem ${table.idempotency.cross_conflict_count} conflitos de idempotência entre origem e destino.`);
    }
  }

  return {
    mode: 'dry-run-read-only',
    vercel_environment: 'preview',
    generated_at: new Date().toISOString(),
    source: {
      project_ref: AUTOCAR_DEV_REF,
      schema: 'dev_v1'
    },
    destination: {
      project_ref: AUTOCAR_PRODUCTION_REF,
      environment: 'production',
      schema_version: schemaVersion,
      live_enabled: false
    },
    write_operations_available: false,
    safe_to_prepare_sync: blockers.length === 0,
    blockers,
    tables
  };
}
