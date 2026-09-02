import type { SupabaseClient } from '@supabase/supabase-js';
import {
  readStoreFollowUpV2,
  saveStoreFollowUpV2
} from '@/lib/server/autocar/followUpV2ConfigStore';
import type { FollowUpConfigV2 } from '@/lib/server/autocar/smartFollowUpV2';

export type MasterAutopilotCeiling = {
  allowed: boolean;
  agent_status: string | null;
  master_enabled: boolean;
  master_autopilot_allowed: boolean;
  reason: string;
};

export function masterAutopilotCeilingFromAgent(agent: any): MasterAutopilotCeiling {
  const status = String(agent?.status || '').trim().toLowerCase();
  const masterEnabled = agent?.master_enabled === true;
  const masterAutopilotAllowed = agent?.master_autopilot_allowed === true;
  const allowed = status === 'active' && masterEnabled && masterAutopilotAllowed;

  let reason = 'AUTOPILOT liberado pelo teto Master desta loja.';
  if (!agent) reason = 'AUTOPILOT bloqueado: loja sem agente AUTOCAR governado pelo Master.';
  else if (status !== 'active') reason = 'AUTOPILOT bloqueado: agente AUTOCAR da loja não está ativo.';
  else if (!masterEnabled) reason = 'AUTOPILOT bloqueado: AUTOCAR Master não está liberada para esta loja.';
  else if (!masterAutopilotAllowed) reason = 'AUTOPILOT bloqueado: o Master não permitiu AUTOPILOT para esta loja.';

  return {
    allowed,
    agent_status: agent?.status ? String(agent.status) : null,
    master_enabled: masterEnabled,
    master_autopilot_allowed: masterAutopilotAllowed,
    reason
  };
}

export async function readMasterAutopilotCeiling(client: SupabaseClient, storeId: string): Promise<MasterAutopilotCeiling> {
  const { data, error } = await client
    .from('ai_store_agents')
    .select('status,master_enabled,master_autopilot_allowed')
    .eq('store_id', storeId)
    .maybeSingle();
  if (error) throw error;
  return masterAutopilotCeilingFromAgent(data);
}

export function clampFollowUpModeToMasterCeiling(
  mode: 'off' | 'copilot' | 'autopilot',
  ceiling: Pick<MasterAutopilotCeiling, 'allowed'>
): 'off' | 'copilot' | 'autopilot' {
  return mode === 'autopilot' && !ceiling.allowed ? 'copilot' : mode;
}

export async function readGovernedStoreFollowUpV2(client: SupabaseClient, storeId: string) {
  const [config, ceiling] = await Promise.all([
    readStoreFollowUpV2(client, storeId),
    readMasterAutopilotCeiling(client, storeId)
  ]);
  const effectiveMode = clampFollowUpModeToMasterCeiling(config.effective.global.mode, ceiling);
  return {
    ...config,
    effective: {
      ...config.effective,
      global: {
        ...config.effective.global,
        mode: effectiveMode
      }
    },
    autopilot_ceiling: ceiling
  };
}

export async function assertStoreFollowUpAutopilotAllowed(
  client: SupabaseClient,
  storeId: string,
  mode: FollowUpConfigV2['global']['mode']
) {
  const ceiling = await readMasterAutopilotCeiling(client, storeId);
  if (mode === 'autopilot' && !ceiling.allowed) {
    throw new Error(ceiling.reason);
  }
  return ceiling;
}

export async function saveGovernedStoreFollowUpV2(
  client: SupabaseClient,
  storeId: string,
  input: FollowUpConfigV2,
  actorProfileId: string | null
) {
  await assertStoreFollowUpAutopilotAllowed(client, storeId, input.global.mode);
  await saveStoreFollowUpV2(client, storeId, input, actorProfileId);
  return readGovernedStoreFollowUpV2(client, storeId);
}
