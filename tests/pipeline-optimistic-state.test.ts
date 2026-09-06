import assert from 'node:assert/strict';
import test from 'node:test';
import {
  classifyPipelineRealtimeEvent,
  pipelineStatusPatchFromServerLead,
  transitionPipelineMetrics,
  type PipelineRealtimeGuard
} from '../src/lib/pipelineOptimisticState';

test('transitionPipelineMetrics updates only affected counters', () => {
  const initial = { total: 25, scheduled: 4, cancelled: 2, sold: 3, lost: 5 };

  assert.deepEqual(
    transitionPipelineMetrics(initial, 'scheduled', 'showed_up'),
    { total: 25, scheduled: 3, cancelled: 2, sold: 3, lost: 5 }
  );

  assert.deepEqual(
    transitionPipelineMetrics(initial, 'in_service', 'lost'),
    { total: 25, scheduled: 4, cancelled: 2, sold: 3, lost: 6 }
  );
});

test('server reconciliation never copies raw customer fields', () => {
  const patch = pipelineStatusPatchFromServerLead({
    id: 'lead-1',
    status: 'scheduled',
    scheduled_at: '2026-09-07T15:00:00.000Z',
    customer_phone: '5561999999999',
    customer_name: 'Nome privado',
    origin: 'facebook_lead_ads',
    updated_at: 'u1'
  });

  assert.equal(patch.status, 'scheduled');
  assert.equal(patch.scheduled_at, '2026-09-07T15:00:00.000Z');
  assert.equal('customer_phone' in patch, false);
  assert.equal('customer_name' in patch, false);
  assert.equal('origin' in patch, false);
});

test('Realtime guard defers the local echo until the server fingerprint is known', () => {
  const guard: PipelineRealtimeGuard = {
    leadId: 'lead-1',
    expectedStatus: 'showed_up',
    serverUpdatedAt: null,
    serverLastActivityAt: null,
    expiresAt: 10_000,
    pendingRows: []
  };

  assert.equal(
    classifyPipelineRealtimeEvent(guard, { id: 'lead-1', status: 'showed_up', updated_at: 'u1' }, 1_000),
    'defer'
  );
});

test('Realtime guard ignores both local trigger echoes sharing the server fingerprint', () => {
  const guard: PipelineRealtimeGuard = {
    leadId: 'lead-1',
    expectedStatus: 'showed_up',
    serverUpdatedAt: 'u1',
    serverLastActivityAt: 'a1',
    expiresAt: 10_000,
    pendingRows: []
  };

  const ownEcho = { id: 'lead-1', status: 'showed_up', updated_at: 'u1', last_activity_at: 'a1' };
  assert.equal(classifyPipelineRealtimeEvent(guard, ownEcho, 2_000), 'ignore');
  assert.equal(
    classifyPipelineRealtimeEvent(guard, { ...ownEcho, last_activity_label: 'Loja marcou compareceu' }, 2_100),
    'ignore'
  );
});

test('Realtime guard refreshes for a real external change on the same lead', () => {
  const guard: PipelineRealtimeGuard = {
    leadId: 'lead-1',
    expectedStatus: 'showed_up',
    serverUpdatedAt: 'u1',
    serverLastActivityAt: 'a1',
    expiresAt: 10_000,
    pendingRows: []
  };

  assert.equal(
    classifyPipelineRealtimeEvent(guard, { id: 'lead-1', status: 'lost', updated_at: 'u2', last_activity_at: 'a2' }, 3_000),
    'refresh'
  );

  assert.equal(
    classifyPipelineRealtimeEvent(guard, { id: 'lead-1', status: 'showed_up', updated_at: 'u2', last_activity_at: 'a2' }, 3_000),
    'refresh'
  );
});
