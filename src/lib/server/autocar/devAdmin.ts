import {
  AUTOCAR_RUNTIME_CUTOVER_CODE_ENABLED,
  createAutocarRuntimeClient,
  resolveAutocarRuntimeTarget
} from '@/lib/server/autocar/runtimeEnvironment';
import { decorateAutocarRuntimeClientWithCutoverBridge } from '@/lib/server/autocar/shadowMirror';

export type AutocarStoreMode = 'off' | 'copilot' | 'autopilot';

/**
 * Legacy name intentionally preserved during the controlled cutover.
 *
 * - Preview/development -> autocar-dev
 * - Vercel Production pre-cutover -> autocar-dev + Forward Shadow Mirror
 * - Vercel Production after the future code-controlled cutover -> AUTOCAR Production
 *   + optional rollback mirror to autocar-dev, only when its explicit gate is enabled.
 *
 * There is no silent Production -> DEV fallback: pre-cutover DEV is an explicit
 * transition mode selected by code and validated against the exact DEV ref.
 */
export function getAutocarDevClient() {
  const target = resolveAutocarRuntimeTarget();
  const client = createAutocarRuntimeClient(target);

  if (target.schema === 'dev_v1') {
    return decorateAutocarRuntimeClientWithCutoverBridge(client, {
      direction: 'forward',
      cutoverEnabled: false
    });
  }

  return decorateAutocarRuntimeClientWithCutoverBridge(client, {
    direction: 'rollback',
    cutoverEnabled: AUTOCAR_RUNTIME_CUTOVER_CODE_ENABLED
  });
}

export async function ensureAutocarDevStore(
  supabase: ReturnType<typeof getAutocarDevClient>,
  store: { id: string; store_name: string; slug?: string | null; status?: string | null; portal_enabled?: boolean | null }
) {
  const slug = String(store.slug || '').trim() || `autocar-${store.id.slice(0, 8)}`;
  const status = String(store.status || 'active').trim() || 'active';
  const target = resolveAutocarRuntimeTarget();

  if (target.schema === 'production_v2') {
    const { error } = await supabase.from('ai_store_refs').upsert({
      store_id: store.id,
      store_name: store.store_name,
      store_slug: slug,
      crm_status: status,
      portal_enabled: Boolean(store.portal_enabled ?? true),
      synced_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }, { onConflict: 'store_id' });
    if (error) throw error;
    return;
  }

  const { error } = await supabase.from('stores').upsert({
    id: store.id,
    store_name: store.store_name,
    responsible_name: 'AUTOCAR DEV',
    slug,
    status,
    portal_enabled: Boolean(store.portal_enabled ?? true),
    registration_source: 'autocar-master-preview',
    updated_at: new Date().toISOString()
  }, { onConflict: 'id' });

  if (error) throw error;
}

async function currentAgent(supabase: ReturnType<typeof getAutocarDevClient>, storeId: string) {
  const { data, error } = await supabase.from('ai_store_agents')
    .select('id,store_id,name,status,mode,tone,language,version,master_enabled,master_autopilot_allowed,store_selected_mode,updated_at')
    .eq('store_id', storeId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function setAutocarMasterAccess(
  supabase: ReturnType<typeof getAutocarDevClient>,
  store: { id: string; store_name: string; slug?: string | null; status?: string | null; portal_enabled?: boolean | null },
  input: { enabled: boolean; autopilotAllowed: boolean }
) {
  await ensureAutocarDevStore(supabase, store);
  const existing = await currentAgent(supabase, store.id);
  const selectedMode: AutocarStoreMode = existing?.store_selected_mode || (input.enabled ? 'copilot' : 'off');

  const { data, error } = await supabase.from('ai_store_agents').upsert({
    store_id: store.id,
    name: 'AUTOCAR',
    master_enabled: Boolean(input.enabled),
    master_autopilot_allowed: Boolean(input.enabled && input.autopilotAllowed),
    store_selected_mode: selectedMode,
    updated_at: new Date().toISOString()
  }, { onConflict: 'store_id' }).select('id,store_id,name,status,mode,tone,language,version,master_enabled,master_autopilot_allowed,store_selected_mode,updated_at').single();

  if (error) throw error;
  return data;
}

export async function setAutocarStoreSelectedMode(
  supabase: ReturnType<typeof getAutocarDevClient>,
  store: { id: string; store_name: string; slug?: string | null; status?: string | null; portal_enabled?: boolean | null },
  mode: AutocarStoreMode
) {
  await ensureAutocarDevStore(supabase, store);
  const existing = await currentAgent(supabase, store.id);

  if (!existing?.master_enabled) {
    throw new Error('A AUTOCAR ainda não foi liberada pelo Master para esta loja.');
  }
  if (mode === 'autopilot' && !existing.master_autopilot_allowed) {
    throw new Error('O AUTOPILOT ainda não foi liberado pelo Master para esta loja.');
  }

  const { data, error } = await supabase.from('ai_store_agents').update({
    store_selected_mode: mode,
    updated_at: new Date().toISOString()
  }).eq('store_id', store.id)
    .select('id,store_id,name,status,mode,tone,language,version,master_enabled,master_autopilot_allowed,store_selected_mode,updated_at')
    .single();

  if (error) throw error;
  return data;
}

export async function setAutocarStoreMode(
  supabase: ReturnType<typeof getAutocarDevClient>,
  store: { id: string; store_name: string; slug?: string | null; status?: string | null; portal_enabled?: boolean | null },
  mode: AutocarStoreMode
) {
  return setAutocarMasterAccess(supabase, store, {
    enabled: mode !== 'off',
    autopilotAllowed: mode === 'autopilot'
  });
}
