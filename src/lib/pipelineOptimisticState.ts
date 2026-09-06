export type PipelineMetricsSnapshot = {
  total: number;
  scheduled: number;
  cancelled: number;
  sold: number;
  lost: number;
};

export type PipelineRealtimeRow = {
  id?: unknown;
  status?: unknown;
  updated_at?: unknown;
  last_activity_at?: unknown;
  last_activity_type?: unknown;
  last_activity_by_name?: unknown;
};

export type PipelineRealtimeGuard = {
  leadId: string;
  expectedStatus: string;
  serverUpdatedAt: string | null;
  serverLastActivityAt: string | null;
  expiresAt: number;
  pendingRows: PipelineRealtimeRow[];
};

export type PipelineRealtimeDecision = 'defer' | 'ignore' | 'refresh';

type MetricKey = 'scheduled' | 'cancelled' | 'sold' | 'lost';

const metricByStatus: Partial<Record<string, MetricKey>> = {
  scheduled: 'scheduled',
  appointment_cancelled: 'cancelled',
  sale_confirmed: 'sold',
  lost: 'lost'
};

function text(value: unknown) {
  return String(value || '').trim();
}

export function transitionPipelineMetrics<T extends PipelineMetricsSnapshot>(
  metrics: T,
  fromStatus: string,
  toStatus: string
): T {
  if (fromStatus === toStatus) return metrics;

  const next = { ...metrics } as T;
  const fromKey = metricByStatus[fromStatus];
  const toKey = metricByStatus[toStatus];

  if (fromKey) next[fromKey] = Math.max(0, Number(next[fromKey] || 0) - 1) as T[MetricKey];
  if (toKey) next[toKey] = (Number(next[toKey] || 0) + 1) as T[MetricKey];
  return next;
}

export function classifyPipelineRealtimeEvent(
  guard: PipelineRealtimeGuard,
  row: PipelineRealtimeRow,
  now = Date.now()
): PipelineRealtimeDecision {
  if (now > guard.expiresAt) return 'refresh';
  if (text(row.id) !== guard.leadId) return 'refresh';
  if (text(row.status) !== guard.expectedStatus) return 'refresh';
  if (!guard.serverUpdatedAt) return 'defer';
  if (text(row.updated_at) !== guard.serverUpdatedAt) return 'refresh';

  const rowLastActivityAt = text(row.last_activity_at);
  if (guard.serverLastActivityAt && rowLastActivityAt && rowLastActivityAt !== guard.serverLastActivityAt) {
    return 'refresh';
  }

  return 'ignore';
}

const safeStatusFields = [
  'status',
  'scheduled_at',
  'appointment_notes',
  'appointment_cancelled_at',
  'appointment_cancelled_reason',
  'lost_reason',
  'stage_entered_at',
  'last_activity_at',
  'last_activity_type',
  'last_activity_label',
  'last_activity_by_name',
  'updated_at'
] as const;

export function pipelineStatusPatchFromServerLead(serverLead: Record<string, unknown>) {
  const patch: Record<string, unknown> = {};
  for (const key of safeStatusFields) {
    if (Object.prototype.hasOwnProperty.call(serverLead, key)) patch[key] = serverLead[key];
  }
  if (serverLead.status === 'showed_up') patch.has_showed_up = true;
  return patch;
}
