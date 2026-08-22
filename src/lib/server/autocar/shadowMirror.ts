import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export const AUTOCAR_SHADOW_MIRROR_SOURCE_REF = 'azszzdotbrczlhrmhrlw';
export const AUTOCAR_SHADOW_MIRROR_DESTINATION_REF = 'icmwdggbvijexjgrvsbl';
export const AUTOCAR_SHADOW_MIRROR_SCHEMA_VERSION = 2;
export const AUTOCAR_SHADOW_MIRROR_IGNORED_EQUIVALENCE_FIELDS = ['updated_at'] as const;

/**
 * Bridge control is deliberately code-controlled and independent from the final
 * runtime cutover flag. It only permits the already explicit forward mirror to
 * keep AUTOCAR Production synchronized while Production is armed with
 * live_enabled=true. It never selects AUTOCAR Production as primary runtime.
 */
export const AUTOCAR_CUTOVER_BRIDGE_CODE_ENABLED = true;

const MIRRORED_TABLES = new Set(['ai_runtime_conversations', 'ai_runtime_message_claims']);
const WRITE_METHODS = new Set(['insert', 'upsert', 'update']);

type RuntimeRow = Record<string, unknown> & {
  id?: string;
  store_id?: string | null;
  production_conversation_id?: string | null;
  production_message_id?: string | null;
  purpose?: string | null;
  idempotency_key?: string | null;
};

type MirrorGate = {
  enabled: boolean;
  reason: string;
  destinationUrl: string;
  destinationServiceRoleKey: string;
};

function clean(value: unknown) {
  return String(value ?? '').trim();
}

function projectRefFromUrl(rawUrl: string) {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'https:' || !parsed.hostname.endsWith('.supabase.co')) return '';
    return parsed.hostname.split('.')[0] || '';
  } catch {
    return '';
  }
}

function devCredentials(environment: NodeJS.ProcessEnv) {
  const modernUrl = clean(environment.AUTOCAR_DEV_SUPABASE_URL);
  const modernKey = clean(environment.AUTOCAR_DEV_SUPABASE_SERVICE_ROLE_KEY);
  if (modernUrl && modernKey) return { url: modernUrl, serviceRoleKey: modernKey };

  return {
    url: clean(environment.AUTOCAR_KNOWLEDGE_SUPABASE_URL),
    serviceRoleKey: clean(environment.AUTOCAR_KNOWLEDGE_SUPABASE_SERVICE_ROLE_KEY)
  };
}

export function evaluateAutocarShadowMirrorGate(environment: NodeJS.ProcessEnv = process.env): MirrorGate {
  const destinationUrl = clean(environment.AUTOCAR_SUPABASE_URL);
  const destinationServiceRoleKey = clean(environment.AUTOCAR_SUPABASE_SERVICE_ROLE_KEY);

  if (clean(environment.VERCEL_ENV) !== 'production') {
    return { enabled: false, reason: 'non_production_fail_closed', destinationUrl: '', destinationServiceRoleKey: '' };
  }
  if (clean(environment.AUTOCAR_SHADOW_MIRROR_ENABLED).toLowerCase() !== 'true') {
    return { enabled: false, reason: 'mirror_not_enabled', destinationUrl: '', destinationServiceRoleKey: '' };
  }
  if (!destinationUrl || !destinationServiceRoleKey) {
    return { enabled: false, reason: 'destination_credentials_missing', destinationUrl: '', destinationServiceRoleKey: '' };
  }
  if (projectRefFromUrl(destinationUrl) !== AUTOCAR_SHADOW_MIRROR_DESTINATION_REF) {
    return { enabled: false, reason: 'unexpected_destination_project', destinationUrl: '', destinationServiceRoleKey: '' };
  }

  return { enabled: true, reason: 'enabled', destinationUrl, destinationServiceRoleKey };
}

export function evaluateAutocarRollbackMirrorGate(
  environment: NodeJS.ProcessEnv = process.env,
  cutoverEnabled = false
): MirrorGate {
  const destination = devCredentials(environment);

  if (clean(environment.VERCEL_ENV) !== 'production') {
    return { enabled: false, reason: 'non_production_fail_closed', destinationUrl: '', destinationServiceRoleKey: '' };
  }
  if (!AUTOCAR_CUTOVER_BRIDGE_CODE_ENABLED) {
    return { enabled: false, reason: 'bridge_code_disabled', destinationUrl: '', destinationServiceRoleKey: '' };
  }
  if (!cutoverEnabled) {
    return { enabled: false, reason: 'cutover_code_disabled', destinationUrl: '', destinationServiceRoleKey: '' };
  }
  if (clean(environment.AUTOCAR_ROLLBACK_MIRROR_ENABLED).toLowerCase() !== 'true') {
    return { enabled: false, reason: 'rollback_mirror_not_enabled', destinationUrl: '', destinationServiceRoleKey: '' };
  }
  if (!destination.url || !destination.serviceRoleKey) {
    return { enabled: false, reason: 'rollback_destination_credentials_missing', destinationUrl: '', destinationServiceRoleKey: '' };
  }
  if (projectRefFromUrl(destination.url) !== AUTOCAR_SHADOW_MIRROR_SOURCE_REF) {
    return { enabled: false, reason: 'unexpected_rollback_destination_project', destinationUrl: '', destinationServiceRoleKey: '' };
  }

  return {
    enabled: true,
    reason: 'enabled',
    destinationUrl: destination.url,
    destinationServiceRoleKey: destination.serviceRoleKey
  };
}

export function normalizeAutocarShadowMirrorRow(row: RuntimeRow) {
  const normalized = { ...row };
  delete normalized.updated_at;
  return normalized;
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, stableValue(item)])
    );
  }
  return value;
}

export function autocarShadowMirrorRowsEquivalent(source: RuntimeRow, destination: RuntimeRow) {
  return JSON.stringify(stableValue(normalizeAutocarShadowMirrorRow(source)))
    === JSON.stringify(stableValue(normalizeAutocarShadowMirrorRow(destination)));
}

async function readProductionRuntimeConfig(client: SupabaseClient) {
  const { data, error } = await client
    .from('autocar_runtime_config')
    .select('environment,schema_version,live_enabled')
    .eq('id', 'primary')
    .single();

  if (error) throw new Error(`runtime_config_failed:${error.message}`);
  if (clean(data?.environment) !== 'production') throw new Error('runtime_environment_invalid');
  if (Number(data?.schema_version || 0) !== AUTOCAR_SHADOW_MIRROR_SCHEMA_VERSION) throw new Error('runtime_schema_invalid');
  return data;
}

async function assertForwardDestinationSafe(destination: SupabaseClient) {
  const data = await readProductionRuntimeConfig(destination);
  if (data?.live_enabled === true && !AUTOCAR_CUTOVER_BRIDGE_CODE_ENABLED) {
    throw new Error('destination_live_enabled_without_bridge');
  }
}

async function assertRollbackSourceSafe(source: SupabaseClient) {
  const data = await readProductionRuntimeConfig(source);
  if (data?.live_enabled !== true) throw new Error('rollback_source_not_live');
}

async function assertForwardStoreRef(destination: SupabaseClient, storeId: string) {
  const { data, error } = await destination.from('ai_store_refs').select('store_id').eq('store_id', storeId).maybeSingle();
  if (error) throw new Error(`store_ref_validation_failed:${error.message}`);
  if (!data?.store_id) throw new Error('store_ref_missing');
}

async function assertRollbackStoreExists(destination: SupabaseClient, storeId: string) {
  const { data, error } = await destination.from('stores').select('id').eq('id', storeId).maybeSingle();
  if (error) throw new Error(`rollback_store_validation_failed:${error.message}`);
  if (!data?.id) throw new Error('rollback_store_missing');
}

async function assertConversationIdentity(destination: SupabaseClient, row: RuntimeRow) {
  const storeId = clean(row.store_id);
  const productionConversationId = clean(row.production_conversation_id);
  if (!row.id || !storeId || !productionConversationId) throw new Error('conversation_identity_missing');

  const { data, error } = await destination
    .from('ai_runtime_conversations')
    .select('id')
    .eq('store_id', storeId)
    .eq('production_conversation_id', productionConversationId)
    .maybeSingle();
  if (error) throw new Error(`conversation_identity_validation_failed:${error.message}`);
  if (data?.id && data.id !== row.id) throw new Error('conversation_logical_identity_conflict');
}

async function assertClaimIdentity(source: SupabaseClient, destination: SupabaseClient, row: RuntimeRow) {
  const storeId = clean(row.store_id);
  const messageId = clean(row.production_message_id);
  const purpose = clean(row.purpose);
  const idempotencyKey = clean(row.idempotency_key);
  if (!row.id || !storeId || !messageId || !purpose || !idempotencyKey) throw new Error('claim_identity_missing');

  const { data: sourceDuplicates, error: sourceError } = await source
    .from('ai_runtime_message_claims')
    .select('id')
    .eq('idempotency_key', idempotencyKey)
    .neq('id', row.id)
    .limit(1);
  if (sourceError) throw new Error(`source_idempotency_validation_failed:${sourceError.message}`);
  if ((sourceDuplicates || []).length > 0) throw new Error('source_idempotency_duplicate');

  const [{ data: byIdempotency, error: idemError }, { data: byLogical, error: logicalError }] = await Promise.all([
    destination.from('ai_runtime_message_claims').select('id').eq('idempotency_key', idempotencyKey).maybeSingle(),
    destination.from('ai_runtime_message_claims').select('id')
      .eq('store_id', storeId)
      .eq('production_message_id', messageId)
      .eq('purpose', purpose)
      .maybeSingle()
  ]);
  if (idemError) throw new Error(`destination_idempotency_validation_failed:${idemError.message}`);
  if (logicalError) throw new Error(`destination_claim_identity_validation_failed:${logicalError.message}`);
  if (byIdempotency?.id && byIdempotency.id !== row.id) throw new Error('claim_idempotency_conflict');
  if (byLogical?.id && byLogical.id !== row.id) throw new Error('claim_logical_identity_conflict');
}

async function mirrorConversationRow(input: {
  source: SupabaseClient;
  destination: SupabaseClient;
  row: RuntimeRow;
  direction: 'forward' | 'rollback';
}) {
  const storeId = clean(input.row.store_id);
  if (input.direction === 'forward') {
    await assertForwardDestinationSafe(input.destination);
    await assertForwardStoreRef(input.destination, storeId);
  } else {
    await assertRollbackSourceSafe(input.source);
    await assertRollbackStoreExists(input.destination, storeId);
  }
  await assertConversationIdentity(input.destination, input.row);

  const { error } = await input.destination
    .from('ai_runtime_conversations')
    .upsert(input.row, { onConflict: 'id', ignoreDuplicates: false });
  if (error) throw new Error(`conversation_upsert_failed:${error.message}`);

  const { data: destinationRow, error: readError } = await input.destination
    .from('ai_runtime_conversations').select('*').eq('id', input.row.id).single();
  if (readError) throw new Error(`conversation_postread_failed:${readError.message}`);
  if (!autocarShadowMirrorRowsEquivalent(input.row, destinationRow as RuntimeRow)) throw new Error('conversation_postwrite_mismatch');
}

async function mirrorClaimRow(input: {
  source: SupabaseClient;
  destination: SupabaseClient;
  row: RuntimeRow;
  direction: 'forward' | 'rollback';
}) {
  const storeId = clean(input.row.store_id);
  const productionConversationId = clean(input.row.production_conversation_id);
  if (input.direction === 'forward') {
    await assertForwardDestinationSafe(input.destination);
    await assertForwardStoreRef(input.destination, storeId);
  } else {
    await assertRollbackSourceSafe(input.source);
    await assertRollbackStoreExists(input.destination, storeId);
  }

  const { data: sourceConversation, error: sourceConversationError } = await input.source
    .from('ai_runtime_conversations').select('*')
    .eq('store_id', storeId)
    .eq('production_conversation_id', productionConversationId)
    .single();
  if (sourceConversationError) throw new Error(`source_conversation_failed:${sourceConversationError.message}`);

  await mirrorConversationRow({
    source: input.source,
    destination: input.destination,
    row: sourceConversation as RuntimeRow,
    direction: input.direction
  });
  if (input.direction === 'forward') await assertForwardDestinationSafe(input.destination);
  else await assertRollbackSourceSafe(input.source);
  await assertClaimIdentity(input.source, input.destination, input.row);

  const { error } = await input.destination
    .from('ai_runtime_message_claims')
    .upsert(input.row, { onConflict: 'id', ignoreDuplicates: false });
  if (error) throw new Error(`claim_upsert_failed:${error.message}`);

  const { data: destinationRow, error: readError } = await input.destination
    .from('ai_runtime_message_claims').select('*').eq('id', input.row.id).single();
  if (readError) throw new Error(`claim_postread_failed:${readError.message}`);
  if (!autocarShadowMirrorRowsEquivalent(input.row, destinationRow as RuntimeRow)) throw new Error('claim_postwrite_mismatch');
}

async function mirrorRows(input: {
  sourceClient: SupabaseClient;
  destination: SupabaseClient;
  table: string;
  rows: RuntimeRow[];
  direction: 'forward' | 'rollback';
}) {
  for (const row of input.rows) {
    if (input.table === 'ai_runtime_conversations') {
      await mirrorConversationRow({ source: input.sourceClient, destination: input.destination, row, direction: input.direction });
    } else {
      await mirrorClaimRow({ source: input.sourceClient, destination: input.destination, row, direction: input.direction });
    }
  }
}

export async function mirrorAutocarRuntimeRowsBestEffort(input: {
  sourceClient: SupabaseClient;
  table: string;
  rows: RuntimeRow[];
  environment?: NodeJS.ProcessEnv;
}) {
  if (!MIRRORED_TABLES.has(input.table) || input.rows.length === 0) {
    return { mirrored: false, skipped: true, reason: 'not_applicable' };
  }

  const environment = input.environment || process.env;
  const gate = evaluateAutocarShadowMirrorGate(environment);
  if (!gate.enabled) return { mirrored: false, skipped: true, reason: gate.reason };

  try {
    const sourceUrl = clean(environment.AUTOCAR_DEV_SUPABASE_URL || environment.AUTOCAR_KNOWLEDGE_SUPABASE_URL);
    if (projectRefFromUrl(sourceUrl) !== AUTOCAR_SHADOW_MIRROR_SOURCE_REF) throw new Error('unexpected_source_project');

    const destination = createClient(gate.destinationUrl, gate.destinationServiceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });

    await mirrorRows({
      sourceClient: input.sourceClient,
      destination,
      table: input.table,
      rows: input.rows,
      direction: 'forward'
    });

    return { mirrored: true, skipped: false, rows: input.rows.length, direction: 'forward' as const };
  } catch (error: any) {
    console.warn('[AUTOCAR SHADOW MIRROR] Falha best-effort; runtime atual permanece prioritário.', {
      table: input.table,
      rows: input.rows.length,
      error: clean(error?.message || error).slice(0, 500)
    });
    return { mirrored: false, skipped: false, failed: true, reason: clean(error?.message || error).slice(0, 500) };
  }
}

export async function mirrorAutocarRuntimeRowsToRollbackBestEffort(input: {
  sourceClient: SupabaseClient;
  table: string;
  rows: RuntimeRow[];
  cutoverEnabled: boolean;
  environment?: NodeJS.ProcessEnv;
}) {
  if (!MIRRORED_TABLES.has(input.table) || input.rows.length === 0) {
    return { mirrored: false, skipped: true, reason: 'not_applicable' };
  }

  const environment = input.environment || process.env;
  const gate = evaluateAutocarRollbackMirrorGate(environment, input.cutoverEnabled);
  if (!gate.enabled) return { mirrored: false, skipped: true, reason: gate.reason };

  try {
    const sourceUrl = clean(environment.AUTOCAR_SUPABASE_URL);
    if (projectRefFromUrl(sourceUrl) !== AUTOCAR_SHADOW_MIRROR_DESTINATION_REF) throw new Error('unexpected_rollback_source_project');

    const destination = createClient(gate.destinationUrl, gate.destinationServiceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });

    await mirrorRows({
      sourceClient: input.sourceClient,
      destination,
      table: input.table,
      rows: input.rows,
      direction: 'rollback'
    });

    return { mirrored: true, skipped: false, rows: input.rows.length, direction: 'rollback' as const };
  } catch (error: any) {
    console.warn('[AUTOCAR CUTOVER BRIDGE] Rollback mirror falhou em best-effort; runtime Production permanece prioritário.', {
      table: input.table,
      rows: input.rows.length,
      error: clean(error?.message || error).slice(0, 500)
    });
    return { mirrored: false, skipped: false, failed: true, reason: clean(error?.message || error).slice(0, 500) };
  }
}

function rowsFromResult(data: unknown): RuntimeRow[] {
  if (!data) return [];
  return (Array.isArray(data) ? data : [data]).filter((row): row is RuntimeRow => Boolean(row && typeof row === 'object'));
}

function wrapQueryBuilder(builder: any, input: {
  sourceClient: SupabaseClient;
  table: string;
  mutationMethod: string | null;
  direction: 'forward' | 'rollback';
  cutoverEnabled: boolean;
}): any {
  return new Proxy(builder, {
    get(target, property) {
      if (property === 'then') {
        const originalThen = target.then.bind(target);
        return (onFulfilled: any, onRejected: any) => originalThen(async (result: any) => {
          if (input.mutationMethod && WRITE_METHODS.has(input.mutationMethod) && !result?.error) {
            const rows = rowsFromResult(result?.data);
            if (input.direction === 'forward') {
              await mirrorAutocarRuntimeRowsBestEffort({ sourceClient: input.sourceClient, table: input.table, rows });
            } else {
              await mirrorAutocarRuntimeRowsToRollbackBestEffort({
                sourceClient: input.sourceClient,
                table: input.table,
                rows,
                cutoverEnabled: input.cutoverEnabled
              });
            }
          }
          return onFulfilled ? onFulfilled(result) : result;
        }, onRejected);
      }

      const value = target[property];
      if (typeof value !== 'function') return value;
      return (...args: any[]) => {
        const next = value.apply(target, args);
        const method = String(property);
        const mutationMethod = WRITE_METHODS.has(method) ? method : input.mutationMethod;
        return wrapQueryBuilder(next, { ...input, mutationMethod });
      };
    }
  });
}

export function decorateAutocarRuntimeClientWithCutoverBridge<T extends SupabaseClient>(
  client: T,
  input: { direction: 'forward' | 'rollback'; cutoverEnabled: boolean }
): T {
  return new Proxy(client, {
    get(target, property) {
      if (property !== 'from') return (target as any)[property];
      return (table: string) => {
        const builder = target.from(table);
        if (!MIRRORED_TABLES.has(table)) return builder;
        return wrapQueryBuilder(builder, {
          sourceClient: target,
          table,
          mutationMethod: null,
          direction: input.direction,
          cutoverEnabled: input.cutoverEnabled
        });
      };
    }
  }) as T;
}

export function decorateAutocarDevClientWithShadowMirror<T extends SupabaseClient>(client: T): T {
  return decorateAutocarRuntimeClientWithCutoverBridge(client, { direction: 'forward', cutoverEnabled: false });
}
