import type { SupabaseClient } from '@supabase/supabase-js';
import {
  clampStoreFollowUpSettings,
  defaultFollowUpConfigV2,
  validateFollowUpConfigV2,
  type FollowUpConfigV2,
  type FollowUpScenario,
  type FollowUpSettings
} from '@/lib/server/autocar/smartFollowUpV2';

export const FOLLOW_UP_V2_AUTOPILOT_CANARY_STORE_ID = '239755c3-a2d4-4cdd-9502-f1595031c924';
export const FOLLOW_UP_V2_AUTOPILOT_LOCKED = false;

export function followUpAutopilotCanaryAllowed(storeId: string) {
  return String(storeId || '').trim() === FOLLOW_UP_V2_AUTOPILOT_CANARY_STORE_ID;
}

function cleanTime(value: unknown, fallback: string) {
  const text = String(value || '').trim();
  const match = /^(\d{2}):(\d{2})/.exec(text);
  return match ? `${match[1]}:${match[2]}` : fallback;
}

function dbMode(value: unknown): FollowUpSettings['mode'] {
  return value === 'autopilot' ? 'autopilot' : value === 'copilot' ? 'copilot' : 'off';
}

function dbSettings(row: any, fallback: FollowUpSettings): FollowUpSettings {
  if (!row) return structuredClone(fallback);
  return {
    enabled: row.enabled === true,
    mode: dbMode(row.mode),
    allowedStart: cleanTime(row.allowed_start, fallback.allowedStart),
    allowedEnd: cleanTime(row.allowed_end, fallback.allowedEnd),
    maxPerLeadPerDay: Number(row.max_per_lead_per_day || fallback.maxPerLeadPerDay),
    maxPerSequence: Number(row.max_per_sequence || fallback.maxPerSequence),
    maxSequenceDays: Number(row.max_sequence_days || fallback.maxSequenceDays),
    minIntervalMinutes: Number(row.min_interval_minutes || fallback.minIntervalMinutes),
    cancelOnCustomerReply: true,
    cancelOnSale: true,
    cancelOnHumanTakeover: true,
    cancelOnClosedConversation: true
  };
}

function dbScenario(row: any, steps: any[], fallback: FollowUpScenario): FollowUpScenario {
  return {
    key: fallback.key,
    title: String(row?.title || fallback.title),
    description: String(row?.description || fallback.description),
    enabled: row?.enabled === true,
    attributionWindowMinutes: Number(row?.attribution_window_minutes || fallback.attributionWindowMinutes),
    steps: steps.length
      ? steps.map((step) => ({
          id: String(step.id),
          delayMinutes: Number(step.delay_minutes),
          label: String(step.label || ''),
          enabled: step.enabled !== false
        }))
      : structuredClone(fallback.steps)
  };
}

function assertMode(mode: unknown, storeId?: string | null) {
  if (!['off', 'copilot', 'autopilot'].includes(String(mode || ''))) {
    throw new Error('Modo do Smart Follow-up inválido.');
  }
  if (mode === 'autopilot' && storeId && !followUpAutopilotCanaryAllowed(storeId)) {
    throw new Error('AUTOPILOT do Smart Follow-up está liberado somente para a A4 no canário atual.');
  }
}

function assertConfig(config: FollowUpConfigV2) {
  assertMode(config.global.mode);
  const normalized: FollowUpConfigV2 = {
    ...config,
    global: {
      ...config.global,
      cancelOnCustomerReply: true,
      cancelOnSale: true,
      cancelOnHumanTakeover: true,
      cancelOnClosedConversation: true
    }
  };
  const validation = validateFollowUpConfigV2(normalized);
  if (!validation.ok) throw new Error(validation.errors[0] || 'Configuração de Follow-up inválida.');
  return normalized;
}

async function readScenarios(client: SupabaseClient, scope: 'global' | 'store', storeId?: string | null) {
  let query = client
    .from('ai_follow_up_scenarios')
    .select('id,scope,store_id,scenario_key,title,description,enabled,attribution_window_minutes,version,updated_at')
    .eq('scope', scope);
  query = scope === 'store' ? query.eq('store_id', String(storeId || '')) : query.is('store_id', null);
  const { data, error } = await query;
  if (error) throw error;
  const rows = data || [];
  const ids = rows.map((row: any) => row.id);
  let steps: any[] = [];
  if (ids.length) {
    const result = await client
      .from('ai_follow_up_scenario_steps')
      .select('id,scenario_id,step_order,delay_minutes,label,enabled')
      .in('scenario_id', ids)
      .order('step_order', { ascending: true });
    if (result.error) throw result.error;
    steps = result.data || [];
  }
  return { rows, steps };
}

export async function readMasterFollowUpV2(client: SupabaseClient): Promise<FollowUpConfigV2> {
  const [settingsResult, scenarioData] = await Promise.all([
    client.from('ai_follow_up_global_settings').select('*').eq('id', 'primary').maybeSingle(),
    readScenarios(client, 'global')
  ]);
  if (settingsResult.error) throw settingsResult.error;
  const rowMap = new Map(scenarioData.rows.map((row: any) => [row.scenario_key, row]));
  return {
    version: 2,
    global: dbSettings(settingsResult.data, defaultFollowUpConfigV2.global),
    scenarios: defaultFollowUpConfigV2.scenarios.map((fallback) => {
      const row: any = rowMap.get(fallback.key);
      if (!row) return structuredClone(fallback);
      return dbScenario(row, scenarioData.steps.filter((step: any) => step.scenario_id === row.id), fallback);
    })
  };
}

function safeStoreFallback(master: FollowUpSettings): FollowUpSettings {
  return {
    ...master,
    enabled: false,
    mode: 'off',
    allowedStart: master.allowedStart < '09:00' ? '09:00' : master.allowedStart,
    allowedEnd: master.allowedEnd > '19:00' ? '19:00' : master.allowedEnd,
    maxPerLeadPerDay: Math.min(master.maxPerLeadPerDay, 1),
    maxPerSequence: Math.min(master.maxPerSequence, 3),
    maxSequenceDays: Math.min(master.maxSequenceDays, 7),
    minIntervalMinutes: Math.max(master.minIntervalMinutes, 60),
    cancelOnCustomerReply: true,
    cancelOnSale: true,
    cancelOnHumanTakeover: true,
    cancelOnClosedConversation: true
  };
}

export async function readStoreFollowUpV2(client: SupabaseClient, storeId: string) {
  const master = await readMasterFollowUpV2(client);
  const [settingsResult, scenarioData] = await Promise.all([
    client.from('ai_follow_up_store_settings').select('*').eq('store_id', storeId).maybeSingle(),
    readScenarios(client, 'store', storeId)
  ]);
  if (settingsResult.error) throw settingsResult.error;
  const requestedSettings = dbSettings(settingsResult.data, safeStoreFallback(master.global));
  if (requestedSettings.mode === 'autopilot' && !followUpAutopilotCanaryAllowed(storeId)) {
    requestedSettings.mode = 'copilot';
  }
  const effectiveSettings = clampStoreFollowUpSettings(master.global, requestedSettings);
  const rowMap = new Map(scenarioData.rows.map((row: any) => [row.scenario_key, row]));
  const requestedScenarios = master.scenarios.map((masterScenario) => {
    const row: any = rowMap.get(masterScenario.key);
    if (!row) return { ...structuredClone(masterScenario), enabled: false };
    return dbScenario(row, scenarioData.steps.filter((step: any) => step.scenario_id === row.id), masterScenario);
  });
  const effectiveScenarios = master.scenarios.map((masterScenario) => {
    const requested = requestedScenarios.find((row) => row.key === masterScenario.key)!;
    return {
      ...requested,
      enabled: Boolean(masterScenario.enabled && requested.enabled),
      steps: requested.steps.slice(0, Math.max(1, effectiveSettings.maxPerSequence))
    };
  });
  return {
    master,
    requested: { version: 2 as const, global: requestedSettings, scenarios: requestedScenarios },
    effective: { version: 2 as const, global: effectiveSettings, scenarios: effectiveScenarios }
  };
}

async function saveScenarioSet(
  client: SupabaseClient,
  scope: 'global' | 'store',
  storeId: string | null,
  scenarios: FollowUpScenario[],
  actorProfileId: string | null
) {
  for (const scenario of scenarios) {
    let lookup = client
      .from('ai_follow_up_scenarios')
      .select('id,version')
      .eq('scope', scope)
      .eq('scenario_key', scenario.key);
    lookup = scope === 'store' ? lookup.eq('store_id', String(storeId || '')) : lookup.is('store_id', null);
    const current = await lookup.maybeSingle();
    if (current.error) throw current.error;
    const payload = {
      scope,
      store_id: storeId,
      scenario_key: scenario.key,
      title: scenario.title,
      description: scenario.description,
      enabled: Boolean(scenario.enabled),
      attribution_window_minutes: scenario.attributionWindowMinutes,
      version: Number(current.data?.version || 0) + 1,
      updated_by_profile_id: actorProfileId,
      updated_at: new Date().toISOString()
    };
    let scenarioId = current.data?.id;
    if (scenarioId) {
      const result = await client.from('ai_follow_up_scenarios').update(payload).eq('id', scenarioId).select('id').single();
      if (result.error) throw result.error;
      scenarioId = result.data.id;
    } else {
      const result = await client.from('ai_follow_up_scenarios').insert(payload).select('id').single();
      if (result.error) throw result.error;
      scenarioId = result.data.id;
    }
    const deleted = await client.from('ai_follow_up_scenario_steps').delete().eq('scenario_id', scenarioId);
    if (deleted.error) throw deleted.error;
    if (scenario.steps.length) {
      const inserted = await client.from('ai_follow_up_scenario_steps').insert(scenario.steps.map((step, index) => ({
        scenario_id: scenarioId,
        step_order: index + 1,
        delay_minutes: step.delayMinutes,
        label: step.label,
        enabled: Boolean(step.enabled)
      })));
      if (inserted.error) throw inserted.error;
    }
  }
}

export async function saveMasterFollowUpV2(client: SupabaseClient, input: FollowUpConfigV2, actorProfileId: string | null) {
  const config = assertConfig(input);
  const before = await readMasterFollowUpV2(client);
  const { data: current, error: currentError } = await client.from('ai_follow_up_global_settings').select('version').eq('id', 'primary').maybeSingle();
  if (currentError) throw currentError;
  const result = await client.from('ai_follow_up_global_settings').upsert({
    id: 'primary',
    enabled: config.global.enabled,
    mode: config.global.mode,
    allowed_start: config.global.allowedStart,
    allowed_end: config.global.allowedEnd,
    max_per_lead_per_day: config.global.maxPerLeadPerDay,
    max_per_sequence: config.global.maxPerSequence,
    max_sequence_days: config.global.maxSequenceDays,
    min_interval_minutes: config.global.minIntervalMinutes,
    cancel_on_customer_reply: true,
    cancel_on_sale: true,
    cancel_on_human_takeover: true,
    cancel_on_closed_conversation: true,
    version: Number(current?.version || 0) + 1,
    updated_by_profile_id: actorProfileId,
    updated_at: new Date().toISOString()
  }, { onConflict: 'id' });
  if (result.error) throw result.error;
  await saveScenarioSet(client, 'global', null, config.scenarios, actorProfileId);
  const after = await readMasterFollowUpV2(client);
  const audit = await client.from('ai_follow_up_config_audit').insert({
    scope: 'global', record_key: 'primary', previous_value: before, new_value: after, actor_profile_id: actorProfileId
  });
  if (audit.error) throw audit.error;
  return after;
}

export async function saveStoreFollowUpV2(
  client: SupabaseClient,
  storeId: string,
  input: FollowUpConfigV2,
  actorProfileId: string | null
) {
  assertMode(input.global.mode, storeId);
  const master = await readMasterFollowUpV2(client);
  const requested: FollowUpConfigV2 = {
    ...input,
    global: {
      ...input.global,
      cancelOnCustomerReply: true,
      cancelOnSale: true,
      cancelOnHumanTakeover: true,
      cancelOnClosedConversation: true
    }
  };
  const effectiveSettings = clampStoreFollowUpSettings(master.global, requested.global);
  if (requested.global.enabled && !master.global.enabled) throw new Error('O Master ainda não habilitou Smart Follow-up.');
  if (requested.global.mode === 'autopilot' && master.global.mode !== 'autopilot') {
    throw new Error('O Master ainda não liberou AUTOPILOT como teto do Smart Follow-up.');
  }
  const before = await readStoreFollowUpV2(client, storeId);
  const { data: current, error: currentError } = await client.from('ai_follow_up_store_settings').select('version').eq('store_id', storeId).maybeSingle();
  if (currentError) throw currentError;
  const saved = await client.from('ai_follow_up_store_settings').upsert({
    store_id: storeId,
    enabled: Boolean(master.global.enabled && requested.global.enabled),
    mode: effectiveSettings.mode,
    allowed_start: effectiveSettings.allowedStart,
    allowed_end: effectiveSettings.allowedEnd,
    max_per_lead_per_day: effectiveSettings.maxPerLeadPerDay,
    max_per_sequence: effectiveSettings.maxPerSequence,
    max_sequence_days: effectiveSettings.maxSequenceDays,
    min_interval_minutes: effectiveSettings.minIntervalMinutes,
    version: Number(current?.version || 0) + 1,
    updated_by_profile_id: actorProfileId,
    updated_at: new Date().toISOString()
  }, { onConflict: 'store_id' });
  if (saved.error) throw saved.error;
  const storeScenarios = requested.scenarios.map((scenario) => {
    const ceiling = master.scenarios.find((row) => row.key === scenario.key);
    return { ...scenario, enabled: Boolean(ceiling?.enabled && scenario.enabled) };
  });
  await saveScenarioSet(client, 'store', storeId, storeScenarios, actorProfileId);
  const after = await readStoreFollowUpV2(client, storeId);
  const audit = await client.from('ai_follow_up_config_audit').insert({
    scope: 'store', record_key: storeId, previous_value: before.requested, new_value: after.requested, actor_profile_id: actorProfileId
  });
  if (audit.error) throw audit.error;
  return after;
}
