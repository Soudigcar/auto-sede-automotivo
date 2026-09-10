import type { FollowUpV2Event } from './followUpV2Execution';

function eventTime(event: FollowUpV2Event) {
  const value = Date.parse(event.dueAt);
  return Number.isFinite(value) ? value : Number.NEGATIVE_INFINITY;
}

function sequenceKey(event: FollowUpV2Event) {
  return `${event.storeId}:${event.leadId || event.conversationId}:${event.sequenceKey || event.scenario}`;
}

function leadKey(event: FollowUpV2Event) {
  return `${event.storeId}:${event.leadId || event.conversationId}`;
}

export function selectFollowUpV2RunBatch(events: FollowUpV2Event[]) {
  const latestBySequence = new Map<string, FollowUpV2Event>();
  const superseded: FollowUpV2Event[] = [];
  for (const event of events) {
    const key = sequenceKey(event);
    const current = latestBySequence.get(key);
    if (!current) {
      latestBySequence.set(key, event);
      continue;
    }
    const replace = eventTime(event) > eventTime(current)
      || (eventTime(event) === eventTime(current) && event.id.localeCompare(current.id) > 0);
    if (replace) {
      superseded.push(current);
      latestBySequence.set(key, event);
    } else {
      superseded.push(event);
    }
  }

  const ordered = Array.from(latestBySequence.values()).sort((a, b) => eventTime(a) - eventTime(b));
  const runnable: FollowUpV2Event[] = [];
  const deferred: FollowUpV2Event[] = [];
  const attemptedLeads = new Set<string>();
  for (const event of ordered) {
    const key = leadKey(event);
    if (attemptedLeads.has(key)) deferred.push(event);
    else {
      attemptedLeads.add(key);
      runnable.push(event);
    }
  }
  return { runnable, superseded, deferred };
}
