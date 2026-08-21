import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { compareRuntimeRows, stableRuntimeHash } from './cutoverDryRun';
import {
  AUTOCAR_DEV_REF,
  AUTOCAR_PRODUCTION_REF,
  AUTOCAR_PRODUCTION_SCHEMA_VERSION,
  resolveAutocarRuntimeTarget
} from './runtimeEnvironment';

const AUTOCAR_PRODUCTION_URL = `https://${AUTOCAR_PRODUCTION_REF}.supabase.co`;
const PAGE_SIZE = 1000;
const MAX_ROWS_PER_TABLE = 50000;
const UPSERT_BATCH_SIZE = 100;

export const AUTOCAR_CUTOVER_CONFIRMATION = 'SINCRONIZAR AUTOCAR PRODUCTION';
export const AUTOCAR_CUTOVER_WRITE_GATE_MODE = 'code' as const;
export const AUTOCAR_CUTOVER_ALLOWED_BRANCH = 'agent/autocar-production-cutover-guard';
export const AUTOCAR_CUTOVER_CODE_WRITE_ENABLED: boolean = false;
export const AUTOCAR_CUTOVER_EQUIVALENCE_IGNORED_FIELDS = ['updated_at'] as const;

const TABLES = ['ai_runtime_conversations', 'ai_runtime_message_claims'] as const;
type CutoverTable = (typeof TABLES)[number];

type RuntimeRow = Record<string, unknown> & {
  id: string;
  store_id?: string | null;
  idempotency_key?: string | null;
  updated_at?: string | null;
};

type RuntimeComparison = ReturnType<typeof compareRuntimeRows>;

type RuntimeSnapshot = {
  table: CutoverTable;
  sourceRows: RuntimeRow[];
  destinationRows: RuntimeRow[];
  rowsToUpsert: RuntimeRow[];
  comparison: RuntimeComparison;
};

const RUNTIME_COLUMNS: Record<CutoverTable, readonly string[]> = {
  ai_runtime_conversations: [
    'id', 'store_id', 'production_conversation_id', 'production_whatsapp_number_id',
    'production_lead_id', 'effective_mode', 'human_state', 'pause_reason',
    'paused_by_profile_id', 'paused_by_source', 'paused_at', 'resumed_at',
    'last_inbound_message_id', 'last_human_message_id', 'last_processed_message_id',
    'runtime_version', 'metadata', 'created_at', 'updated_at'
  ],
  ai_runtime_message_claims: [
    'id', 'store_id', 'production_conversation_id', 'production_message_id', 'purpose',
    'idempotency_key', 'direction', 'message_type', 'effective_mode', 'status',
    'policy_capability', 'policy_effect', 'policy_source', 'policy_reason', 'result',
    'claimed_at', 'completed_at', 'created_at', 'updated_at'
  ]
};

export type AutocarCutoverExecutionPreflight = {
  mode: 'execution-preflight-read-only';
  generated_at: string;
  vercel_environment: 'preview';
  source_project_ref: typeof AUTOCAR_DEV_REF;
  destination_project_ref: typeof AUTOCAR_PRODUCTION_REF;
  destination_environment: 'production';
  destination_schema_version: number;
  destination_live_enabled: false;
  write_gate_mode: typeof AUTOCAR_CUTOVER_WRITE_GATE_MODE;
  write_gate_allowed_branch: typeof AUTOCAR_CUTOVER_ALLOWED_BRANCH;
  write_gate_enabled: boolean;
  equivalence_ignored_fields: ['updated_at'];
  delete_operations: false;
  operation: 'upsert';
  on_conflict: 'id';
  batch_size: number;
  required_store_ref_count: number;
  present_store_ref_count: number;
  missing_store_ref_ids: string[];
  blockers: string[];
  ready_for_execution: boolean;
  tables: Array<{
    table: CutoverTable;
    source_count: number;
    destination_count: number;
    insert_count: number;
    update_count: number;
    unchanged_count: number;
    upsert_count: number;
    source_snapshot_hash: string;
    destination_snapshot_hash: string;
    logical_identity_conflicts: number;
    idempotency_conflicts: number;
  }>;
};

export type AutocarCutoverExecutionResult = {
  mode: 'executed-protected-upsert';
  started_at: string;
  completed_at: string;
  destination_live_enabled: false;
  deletes_executed: 0;
  applied: Array<{
    table: CutoverTable;
    rows_upserted: number;
    batches: number;
    post_snapshot_matches: true;
  }>;
  residual_preflight: AutocarCutoverExecutionPreflight;
};

function safeString(value: unknown) {
  return String(value ?? '').trim();
}

function assertPreview(environment: NodeJS.ProcessEnv) {
  if (safeString(environment.VERCEL_ENV) !== 'preview') {
    throw new Error('SAFE CORE: sincronização AUTOCAR disponível exclusivamente no Vercel Preview.');
  }
}

export function isAutocarCutoverWriteGateEnabled(environment: NodeJS.ProcessEnv = process.env) {
  return AUTOCAR_CUTOVER_CODE_WRITE_ENABLED
    && safeString(environment.VERCEL_ENV) === 'preview'
    && safeString(environment.VERCEL_GIT_COMMIT_REF) === AUTOCAR_CUTOVER_ALLOWED_BRANCH;
}

export function normalizeAutocarCutoverRuntimeRow(row: RuntimeRow): RuntimeRow {
  const normalized = { ...row };
  delete normalized.updated_at;
  return normalized;
}

export function compareAutocarCutoverRuntimeRows(
  table: CutoverTable,
  sourceRows: RuntimeRow[],
  destinationRows: RuntimeRow[]
): RuntimeComparison {
  return compareRuntimeRows(
    table,
    sourceRows.map(normalizeAutocarCutoverRuntimeRow),
    destinationRows.map(normalizeAutocarCutoverRuntimeRow)
  );
}

function stableAutocarCutoverRuntimeHash(row: RuntimeRow) {
  return stableRuntimeHash(normalizeAutocarCutoverRuntimeRow(row));
}

function projectRuntimeRow(table: CutoverTable, row: RuntimeRow) {
  const projected: Record<string, unknown> = {};
  for (const column of RUNTIME_COLUMNS[table]) {
    if (!Object.prototype.hasOwnProperty.call(row, column)) {
      throw new Error(`SAFE CORE: ${table} não possui a coluna esperada ${column}.`);
    }
    projected[column] = row[column];
  }
  return projected as RuntimeRow;
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
    const page = ((data || []) as RuntimeRow[]).map((row) => projectRuntimeRow(table, row));
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
  throw new Error(`SAFE CORE: ${table} excedeu ${MAX_ROWS_PER_TABLE} registros.`);
}

function productionClient(serviceRoleKey: string) {
  const key = safeString(serviceRoleKey);
  if (!key) throw new Error('Service-role do AUTOCAR Production é obrigatória nesta requisição transitória.');
  return createClient(AUTOCAR_PRODUCTION_URL, key, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

async function assertProductionLocked(client: SupabaseClient) {
  const { data, error } = await client
    .from('autocar_runtime_config')
    .select('environment,schema_version,live_enabled')
    .eq('id', 'primary')
    .single();

  if (error) throw new Error(`SAFE CORE: falha ao validar AUTOCAR Production: ${error.message}`);
  const databaseEnvironment = safeString(data?.environment);
  const schemaVersion = Number(data?.schema_version || 0);
  const liveEnabled = data?.live_enabled === true;

  if (databaseEnvironment !== 'production') {
    throw new Error('SAFE CORE: destino não se identifica como production.');
  }
  if (schemaVersion !== AUTOCAR_PRODUCTION_SCHEMA_VERSION) {
    throw new Error(`SAFE CORE: schema incompatível. Esperado ${AUTOCAR_PRODUCTION_SCHEMA_VERSION}, recebido ${schemaVersion || 'desconhecido'}.`);
  }
  if (liveEnabled) {
    throw new Error('SAFE CORE: operação abortada porque live_enabled=true.');
  }

  return { schemaVersion, liveEnabled: false as const };
}

function comparisonBlockers(comparison: RuntimeComparison) {
  const blockers: string[] = [];
  if (comparison.extra_in_destination_count > 0) {
    blockers.push(`${comparison.table}: ${comparison.extra_in_destination_count} registros existem somente no destino e deletes são proibidos.`);
  }
  if (comparison.logical_identity.cross_conflict_count > 0) {
    blockers.push(`${comparison.table}: ${comparison.logical_identity.cross_conflict_count} conflitos de identidade lógica com IDs divergentes.`);
  }
  if (comparison.idempotency?.source_duplicate_count) {
    blockers.push(`${comparison.table}: ${comparison.idempotency.source_duplicate_count} duplicidades de idempotência na origem.`);
  }
  if (comparison.idempotency?.destination_duplicate_count) {
    blockers.push(`${comparison.table}: ${comparison.idempotency.destination_duplicate_count} duplicidades de idempotência no destino.`);
  }
  if (comparison.idempotency?.cross_conflict_count) {
    blockers.push(`${comparison.table}: ${comparison.idempotency.cross_conflict_count} conflitos cruzados de idempotência.`);
  }
  return blockers;
}

function rowsToUpsert(sourceRows: RuntimeRow[], destinationRows: RuntimeRow[]) {
  const destination = new Map(destinationRows.map((row) => [row.id, row]));
  return sourceRows.filter((row) => {
    const target = destination.get(row.id);
    return !target || stableAutocarCutoverRuntimeHash(row) !== stableAutocarCutoverRuntimeHash(target);
  });
}

async function readDestinationStoreRefs(client: SupabaseClient, requiredStoreIds: string[]) {
  if (requiredStoreIds.length === 0) return [] as string[];
  const { data, error } = await client
    .from('ai_store_refs')
    .select('store_id')
    .in('store_id', requiredStoreIds);
  if (error) throw new Error(`SAFE CORE: falha ao validar ai_store_refs: ${error.message}`);
  return (data || []).map((row: any) => safeString(row.store_id)).filter(Boolean);
}

async function buildPreflight(
  productionServiceRoleKey: string,
  environment: NodeJS.ProcessEnv
): Promise<{
  destinationClient: SupabaseClient;
  snapshots: RuntimeSnapshot[];
  report: AutocarCutoverExecutionPreflight;
}> {
  assertPreview(environment);

  const sourceTarget = resolveAutocarRuntimeTarget(environment);
  if (sourceTarget.projectRef !== AUTOCAR_DEV_REF || sourceTarget.schema !== 'dev_v1') {
    throw new Error('SAFE CORE: origem não é o autocar-dev autorizado.');
  }

  const sourceClient = createClient(sourceTarget.url, sourceTarget.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const destinationClient = productionClient(productionServiceRoleKey);
  const config = await assertProductionLocked(destinationClient);

  const snapshots: RuntimeSnapshot[] = [];
  for (const table of TABLES) {
    const [sourceRows, destinationRows] = await Promise.all([
      readAllRows(sourceClient, table),
      readAllRows(destinationClient, table)
    ]);
    const comparison = compareAutocarCutoverRuntimeRows(table, sourceRows, destinationRows);
    snapshots.push({
      table,
      sourceRows,
      destinationRows,
      rowsToUpsert: rowsToUpsert(sourceRows, destinationRows),
      comparison
    });
  }

  const requiredStoreIds = [...new Set(
    snapshots.flatMap((snapshot) => snapshot.sourceRows.map((row) => safeString(row.store_id))).filter(Boolean)
  )].sort();
  const presentStoreIds = [...new Set(await readDestinationStoreRefs(destinationClient, requiredStoreIds))].sort();
  const presentStoreSet = new Set(presentStoreIds);
  const missingStoreRefIds = requiredStoreIds.filter((storeId) => !presentStoreSet.has(storeId));

  const blockers = snapshots.flatMap((snapshot) => comparisonBlockers(snapshot.comparison));
  if (missingStoreRefIds.length > 0) {
    blockers.push(`ai_store_refs: faltam ${missingStoreRefIds.length} store_id exigidos pelo runtime de origem.`);
  }

  const writeGateEnabled = isAutocarCutoverWriteGateEnabled(environment);
  const report: AutocarCutoverExecutionPreflight = {
    mode: 'execution-preflight-read-only',
    generated_at: new Date().toISOString(),
    vercel_environment: 'preview',
    source_project_ref: AUTOCAR_DEV_REF,
    destination_project_ref: AUTOCAR_PRODUCTION_REF,
    destination_environment: 'production',
    destination_schema_version: config.schemaVersion,
    destination_live_enabled: false,
    write_gate_mode: AUTOCAR_CUTOVER_WRITE_GATE_MODE,
    write_gate_allowed_branch: AUTOCAR_CUTOVER_ALLOWED_BRANCH,
    write_gate_enabled: writeGateEnabled,
    equivalence_ignored_fields: ['updated_at'],
    delete_operations: false,
    operation: 'upsert',
    on_conflict: 'id',
    batch_size: UPSERT_BATCH_SIZE,
    required_store_ref_count: requiredStoreIds.length,
    present_store_ref_count: presentStoreIds.length,
    missing_store_ref_ids: missingStoreRefIds,
    blockers,
    ready_for_execution: blockers.length === 0 && writeGateEnabled,
    tables: snapshots.map((snapshot) => ({
      table: snapshot.table,
      source_count: snapshot.comparison.source_count,
      destination_count: snapshot.comparison.destination_count,
      insert_count: snapshot.comparison.missing_in_destination_count,
      update_count: snapshot.comparison.changed_count,
      unchanged_count: Math.max(
        0,
        snapshot.comparison.source_count
          - snapshot.comparison.missing_in_destination_count
          - snapshot.comparison.changed_count
      ),
      upsert_count: snapshot.rowsToUpsert.length,
      source_snapshot_hash: snapshot.comparison.source_hash,
      destination_snapshot_hash: snapshot.comparison.destination_hash,
      logical_identity_conflicts: snapshot.comparison.logical_identity.cross_conflict_count,
      idempotency_conflicts: snapshot.comparison.idempotency?.cross_conflict_count || 0
    }))
  };

  return { destinationClient, snapshots, report };
}

export async function prepareAutocarCutoverExecution(
  productionServiceRoleKey: string,
  environment: NodeJS.ProcessEnv = process.env
) {
  const { report } = await buildPreflight(productionServiceRoleKey, environment);
  return report;
}

function assertPostSnapshotMatch(comparison: RuntimeComparison) {
  const blockers = comparisonBlockers(comparison);
  if (
    comparison.missing_in_destination_count !== 0
    || comparison.changed_count !== 0
    || comparison.extra_in_destination_count !== 0
    || blockers.length !== 0
  ) {
    throw new Error(`SAFE CORE: validação pós-upsert falhou em ${comparison.table}. Reexecute o dry-run antes de qualquer nova ação.`);
  }
}

export async function executeAutocarCutoverSync(
  input: {
    productionServiceRoleKey: string;
    confirmation: string;
    acknowledgeNoDeletes: boolean;
    acknowledgeLiveMustRemainFalse: boolean;
  },
  environment: NodeJS.ProcessEnv = process.env
): Promise<AutocarCutoverExecutionResult> {
  assertPreview(environment);
  if (!isAutocarCutoverWriteGateEnabled(environment)) {
    throw new Error('SAFE CORE: gate de escrita controlado por código está DESABILITADO para este Preview/branch.');
  }
  if (safeString(input.confirmation) !== AUTOCAR_CUTOVER_CONFIRMATION) {
    throw new Error('SAFE CORE: frase de confirmação inválida.');
  }
  if (!input.acknowledgeNoDeletes || !input.acknowledgeLiveMustRemainFalse) {
    throw new Error('SAFE CORE: confirmações obrigatórias não foram aceitas.');
  }

  const startedAt = new Date().toISOString();
  const { destinationClient, snapshots, report } = await buildPreflight(
    input.productionServiceRoleKey,
    environment
  );
  if (report.blockers.length > 0) {
    throw new Error(`SAFE CORE: preflight bloqueou a sincronização: ${report.blockers.join(' | ')}`);
  }

  await assertProductionLocked(destinationClient);
  const applied: AutocarCutoverExecutionResult['applied'] = [];

  for (const snapshot of snapshots) {
    let rowsUpserted = 0;
    let batches = 0;

    for (let offset = 0; offset < snapshot.rowsToUpsert.length; offset += UPSERT_BATCH_SIZE) {
      await assertProductionLocked(destinationClient);
      const batch = snapshot.rowsToUpsert.slice(offset, offset + UPSERT_BATCH_SIZE);
      const { error } = await destinationClient
        .from(snapshot.table)
        .upsert(batch, { onConflict: 'id', ignoreDuplicates: false });
      if (error) {
        throw new Error(`SAFE CORE: upsert interrompido em ${snapshot.table} após ${rowsUpserted} registros: ${error.message}`);
      }
      rowsUpserted += batch.length;
      batches += 1;
    }

    await assertProductionLocked(destinationClient);
    const destinationAfter = await readAllRows(destinationClient, snapshot.table);
    const postComparison = compareAutocarCutoverRuntimeRows(snapshot.table, snapshot.sourceRows, destinationAfter);
    assertPostSnapshotMatch(postComparison);

    applied.push({
      table: snapshot.table,
      rows_upserted: rowsUpserted,
      batches,
      post_snapshot_matches: true
    });
  }

  await assertProductionLocked(destinationClient);
  const residualPreflight = await prepareAutocarCutoverExecution(
    input.productionServiceRoleKey,
    environment
  );

  return {
    mode: 'executed-protected-upsert',
    started_at: startedAt,
    completed_at: new Date().toISOString(),
    destination_live_enabled: false,
    deletes_executed: 0,
    applied,
    residual_preflight: residualPreflight
  };
}
