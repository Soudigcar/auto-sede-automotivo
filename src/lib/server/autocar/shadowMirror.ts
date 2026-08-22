import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export const AUTOCAR_SHADOW_MIRROR_SOURCE_REF = 'azszzdotbrczlhrmhrlw';
export const AUTOCAR_SHADOW_MIRROR_DESTINATION_REF = 'icmwdggbvijexjgrvsbl';
export const AUTOCAR_SHADOW_MIRROR_SCHEMA_VERSION = 2;
export const AUTOCAR_SHADOW_MIRROR_IGNORED_EQUIVALENCE_FIELDS = ['updated_at'] as const;

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

async function assertDestinationLocked(destination: SupabaseClient) {
  const { data, error } = await destination
    .from('autocar_runtime_config')
    .select('environment,schema_version,live_enabled')
    .eq('id', 'primary')
    .single();

  if (error) throw new Error(`destination_runtime_config_failed:${error.message}`);
  if (clean(data?.environment) !== 'production') throw new Error('destination_environment_invalid');
  if (Number(data?.schema_version || 0) !== AUTOCAR_SHADOW_MIRROR_SCHEMA_VERSION) throw new Error('destination_schema_invalid');
  if (data?.live_enabled === true) throw new Error('destination_live_enabled');
}

async function assertStoreRef(destination: SupabaseClient, storeId: string) {
  const { data, error } = await destination.from('ai_store_refs').select('store_id').eq('store_id', storeId).maybeSingle();
  if (error) throw new Error(`store_ref_validation_failed:${error.message}`);
  if (!data?.store_id) throw new Error('store_ref_missing');
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

async function mirrorConversationRow(source: SupabaseClient, destination: SupabaseClient, row: RuntimeRow) {
  const storeId = clean(row.store_id);
  await assertDestinationLocked(destination);
  await assertStoreRef(destination, storeId);
  await assertConversationIdentity(destination, row);

  const { error } = await destination.from('ai_runtime_conversations').upsert(row, { onConflict: 'id', ignoreDuplicates: false });
  if (error) throw new Error(`conversation_upsert_failed:${error.message}`);

  const { data: destinationRow, error: readError } = await destination
    .from('ai_runtime_conversations').select('*').eq('id', row.id).single();
  if (readError) throw new Error(`conversation_postread_failed:${readError.message}`);
  if (!autocarShadowMirrorRowsEquivalent(row, destinationRow as RuntimeRow)) throw new Error('conversation_postwrite_mismatch');
}

async function mirrorClaimRow(source: SupabaseClient, destination: SupabaseClient, row: RuntimeRow) {
  const storeId = clean(row.store_id);
  const productionConversationId = clean(row.production_conversation_id);
  await assertDestinationLocked(destination);
  await assertStoreRef(destination, storeId);

  const { data: sourceConversation, error: sourceConversationError } = await source
    .from('ai_runtime_conversations').select('*')
    .eq('store_id', storeId)
    .eq('production_conversation_id', productionConversationId)
    .single();
  if (sourceConversationError) throw new Error(`source_conversation_failed:${sourceConversationError.message}`);

  await mirrorConversationRow(source, destination, sourceConversation as RuntimeRow);
  await assertDestinationLocked(destination);
  await assertClaimIdentity(source, destination, row);

  const { error } = await destination.from('ai_runtime_message_claims').upsert(row, { onConflict: 'id', ignoreDuplicates: false });
  if (error) throw new Error(`claim_upsert_failed:${error.message}`);

  const { data: destinationRow, error: readError } = await destination
    .from('ai_runtime_message_claims').select('*').eq('id', row.id).single();
  if (readError) throw new Error(`claim_postread_failed:${readError.message}`);
  if (!autocarShadowMirrorRowsEquivalent(row, destinationRow as RuntimeRow)) throw new Error('claim_postwrite_mismatch');
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

  const gate = evaluateAutocarShadowMirrorGate(input.environment || process.env);
  if (!gate.enabled) return { mirrored: false, skipped: true, reason: gate.reason };

  try {
    const sourceUrl = clean((input.environment || process.env).AUTOCAR_KNOWLEDGE_SUPABASE_URL);
    if (projectRefFromUrl(sourceUrl) !== AUTOCAR_SHADOW_MIRROR_SOURCE_REF) throw new Error('unexpected_source_project');

    const destination = createClient(gate.destinationUrl, gate.destinationServiceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });

    for (const row of input.rows) {
      if (input.table === 'ai_runtime_conversations') await mirrorConversationRow(input.sourceClient, destination, row);
      else await mirrorClaimRow(input.sourceClient, destination, row);
    }

    return { mirrored: true, skipped: false, rows: input.rows.length };
  } catch (error: any) {
    console.warn('[AUTOCAR SHADOW MIRROR] Falha best-effort; runtime atual permanece prioritário.', {
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
}): any {
  return new Proxy(builder, {
    get(target, property) {
      if (property === 'then') {
        const originalThen = target.then.bind(target);
        return (onFulfilled: any, onRejected: any) => originalThen(async (result: any) => {
          if (input.mutationMethod && WRITE_METHODS.has(input.mutationMethod) && !result?.error) {
            await mirrorAutocarRuntimeRowsBestEffort({
              sourceClient: input.sourceClient,
              table: input.table,
              rows: rowsFromResult(result?.data)
            });
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

export function decorateAutocarDevClientWithShadowMirror<T extends SupabaseClient>(client: T): T {
  return new Proxy(client, {
    get(target, property) {
      if (property !== 'from') return (target as any)[property];
      return (table: string) => {
        const builder = target.from(table);
        if (!MIRRORED_TABLES.has(table)) return builder;
        return wrapQueryBuilder(builder, { sourceClient: target, table, mutationMethod: null });
      };
    }
  }) as T;
}
