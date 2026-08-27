import type { SupabaseClient } from '@supabase/supabase-js';
import type { FollowUpScenarioKey } from '@/lib/server/autocar/smartFollowUpV2';

const DAY_MS = 86_400_000;
const DEFAULT_DAYS = 30;
const MAX_SENT_EVENTS = 500;

export type FollowUpPerformanceSlice = {
  sent: number;
  responses: number;
  recovered: number;
  appointments: number;
  sales: number;
  fallbacks: number;
  blocked: number;
  failed: number;
  responseRate: number;
  recoveryRate: number;
  appointmentRate: number;
  salesRate: number;
  avgResponseMinutes: number | null;
};

export type FollowUpPerformance = {
  periodDays: number;
  generatedAt: string;
  total: FollowUpPerformanceSlice;
  scenarios: Partial<Record<FollowUpScenarioKey, FollowUpPerformanceSlice>>;
};

type SentRow = {
  scenario_key: FollowUpScenarioKey;
  production_conversation_id: string;
  production_lead_id: string | null;
  source_occurred_at: string;
  attribution_window_minutes: number;
};

function safeDate(value: unknown) {
  const date = value ? new Date(String(value)) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
}

function emptySlice(): FollowUpPerformanceSlice {
  return {
    sent: 0,
    responses: 0,
    recovered: 0,
    appointments: 0,
    sales: 0,
    fallbacks: 0,
    blocked: 0,
    failed: 0,
    responseRate: 0,
    recoveryRate: 0,
    appointmentRate: 0,
    salesRate: 0,
    avgResponseMinutes: null
  };
}

function finalize(slice: FollowUpPerformanceSlice, responseMinutes: number[]) {
  const sent = slice.sent || 0;
  slice.responseRate = sent ? Number(((slice.responses / sent) * 100).toFixed(1)) : 0;
  slice.recoveryRate = sent ? Number(((slice.recovered / sent) * 100).toFixed(1)) : 0;
  slice.appointmentRate = sent ? Number(((slice.appointments / sent) * 100).toFixed(1)) : 0;
  slice.salesRate = sent ? Number(((slice.sales / sent) * 100).toFixed(1)) : 0;
  slice.avgResponseMinutes = responseMinutes.length
    ? Number((responseMinutes.reduce((sum, value) => sum + value, 0) / responseMinutes.length).toFixed(1))
    : null;
}

export async function readFollowUpV2Performance(input: {
  autocar: SupabaseClient;
  crm: SupabaseClient;
  storeId: string;
  periodDays?: number;
}): Promise<FollowUpPerformance> {
  const periodDays = Math.max(1, Math.min(Number(input.periodDays || DEFAULT_DAYS), 90));
  const since = new Date(Date.now() - periodDays * DAY_MS).toISOString();

  const [sentResult, executionResult] = await Promise.all([
    input.autocar.from('ai_follow_up_performance_events')
      .select('scenario_key,production_conversation_id,production_lead_id,source_occurred_at,attribution_window_minutes')
      .eq('store_id', input.storeId)
      .eq('event_type', 'sent')
      .eq('attributed_to_follow_up', true)
      .gte('source_occurred_at', since)
      .order('source_occurred_at', { ascending: false })
      .limit(MAX_SENT_EVENTS),
    input.autocar.from('ai_follow_up_autopilot_executions')
      .select('scenario_key,status,created_at')
      .eq('store_id', input.storeId)
      .gte('created_at', since)
  ]);
  if (sentResult.error) throw sentResult.error;
  if (executionResult.error) throw executionResult.error;

  const sentRows = (sentResult.data || []) as SentRow[];
  const executionRows = executionResult.data || [];
  const total = emptySlice();
  const scenarios: Partial<Record<FollowUpScenarioKey, FollowUpPerformanceSlice>> = {};
  const responseTimes = new Map<string, number[]>();
  const totalResponseTimes: number[] = [];

  function scenarioSlice(key: FollowUpScenarioKey) {
    if (!scenarios[key]) scenarios[key] = emptySlice();
    return scenarios[key]!;
  }

  for (const execution of executionRows as any[]) {
    const key = String(execution.scenario_key || '') as FollowUpScenarioKey;
    if (!key) continue;
    const target = scenarioSlice(key);
    if (execution.status === 'fallback_copilot') { total.fallbacks += 1; target.fallbacks += 1; }
    if (execution.status === 'blocked') { total.blocked += 1; target.blocked += 1; }
    if (execution.status === 'failed') { total.failed += 1; target.failed += 1; }
  }

  if (!sentRows.length) {
    finalize(total, totalResponseTimes);
    for (const [key, slice] of Object.entries(scenarios)) finalize(slice!, responseTimes.get(key) || []);
    return { periodDays, generatedAt: new Date().toISOString(), total, scenarios };
  }

  const conversations = [...new Set(sentRows.map((row) => row.production_conversation_id).filter(Boolean))];
  const leads = [...new Set(sentRows.map((row) => row.production_lead_id).filter(Boolean))] as string[];
  const earliest = sentRows.reduce((min, row) => {
    const value = safeDate(row.source_occurred_at)?.getTime() || Date.now();
    return Math.min(min, value);
  }, Date.now());
  const earliestIso = new Date(earliest).toISOString();

  const [messagesResult, activityResult, leadsResult] = await Promise.all([
    conversations.length
      ? input.crm.from('whatsapp_messages')
        .select('conversation_id,direction,sent_at,created_at')
        .eq('store_id', input.storeId)
        .in('conversation_id', conversations)
        .gte('created_at', earliestIso)
        .order('created_at', { ascending: true })
      : Promise.resolve({ data: [], error: null } as any),
    leads.length
      ? input.crm.from('lead_activity_logs')
        .select('lead_id,activity_type,to_status,created_at')
        .eq('store_id', input.storeId)
        .in('lead_id', leads)
        .gte('created_at', earliestIso)
        .order('created_at', { ascending: true })
      : Promise.resolve({ data: [], error: null } as any),
    leads.length
      ? input.crm.from('leads')
        .select('id,status,updated_at,scheduled_at,appointment_cancelled_at')
        .eq('assigned_store_id', input.storeId)
        .in('id', leads)
      : Promise.resolve({ data: [], error: null } as any)
  ]);
  if (messagesResult.error) throw messagesResult.error;
  if (activityResult.error) throw activityResult.error;
  if (leadsResult.error) throw leadsResult.error;

  const messagesByConversation = new Map<string, any[]>();
  for (const message of messagesResult.data || []) {
    const id = String(message.conversation_id || '');
    if (!id) continue;
    const list = messagesByConversation.get(id) || [];
    list.push(message);
    messagesByConversation.set(id, list);
  }
  const activityByLead = new Map<string, any[]>();
  for (const activity of activityResult.data || []) {
    const id = String(activity.lead_id || '');
    if (!id) continue;
    const list = activityByLead.get(id) || [];
    list.push(activity);
    activityByLead.set(id, list);
  }
  const leadById = new Map<string, any>((leadsResult.data || []).map((lead: any) => [String(lead.id), lead]));

  for (const sent of sentRows) {
    const key = sent.scenario_key;
    const target = scenarioSlice(key);
    total.sent += 1;
    target.sent += 1;
    const sentAt = safeDate(sent.source_occurred_at);
    if (!sentAt) continue;
    const deadline = sentAt.getTime() + Math.max(1, Number(sent.attribution_window_minutes || 1440)) * 60_000;
    const inWindow = (value: unknown) => {
      const at = safeDate(value)?.getTime();
      return Boolean(at && at > sentAt.getTime() && at <= deadline);
    };

    const conversationMessages = messagesByConversation.get(sent.production_conversation_id) || [];
    const firstInbound = conversationMessages.find((message) => message.direction === 'inbound' && inWindow(message.sent_at || message.created_at));
    const firstInboundAt = firstInbound ? safeDate(firstInbound.sent_at || firstInbound.created_at) : null;
    if (firstInboundAt) {
      total.responses += 1;
      target.responses += 1;
      const minutes = Math.max(0, (firstInboundAt.getTime() - sentAt.getTime()) / 60_000);
      totalResponseTimes.push(minutes);
      const scenarioTimes = responseTimes.get(key) || [];
      scenarioTimes.push(minutes);
      responseTimes.set(key, scenarioTimes);
    }

    const activities = sent.production_lead_id ? activityByLead.get(sent.production_lead_id) || [] : [];
    const relevantActivity = activities.filter((activity) => inWindow(activity.created_at));
    const hadCommercialContinuation = firstInboundAt ? (
      conversationMessages.some((message) => {
        const at = safeDate(message.sent_at || message.created_at)?.getTime();
        return message.direction === 'outbound' && Boolean(at && at > firstInboundAt.getTime() && inWindow(message.sent_at || message.created_at));
      }) ||
      relevantActivity.some((activity) => {
        const at = safeDate(activity.created_at)?.getTime();
        return Boolean(at && at > firstInboundAt.getTime());
      })
    ) : false;
    if (firstInboundAt && hadCommercialContinuation) {
      total.recovered += 1;
      target.recovered += 1;
    }

    const appointment = relevantActivity.some((activity) => activity.activity_type === 'schedule_created' || activity.to_status === 'scheduled');
    if (appointment) { total.appointments += 1; target.appointments += 1; }

    const saleFromLog = relevantActivity.some((activity) => activity.to_status === 'sale_confirmed');
    const currentLead = sent.production_lead_id ? leadById.get(sent.production_lead_id) : null;
    const saleFromCurrent = Boolean(currentLead && currentLead.status === 'sale_confirmed' && inWindow(currentLead.updated_at));
    if (saleFromLog || saleFromCurrent) { total.sales += 1; target.sales += 1; }
  }

  finalize(total, totalResponseTimes);
  for (const [key, slice] of Object.entries(scenarios)) finalize(slice!, responseTimes.get(key) || []);
  return { periodDays, generatedAt: new Date().toISOString(), total, scenarios };
}