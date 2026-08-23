import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canAccessStoreConversation,
  type StorePortalRole
} from '../src/lib/server/storePortal.ts';
import {
  publicWhatsappNumber,
  resolveEvolutionAvailability
} from '../src/lib/server/storeWhatsappChannel.ts';

const storeId = '239755c3-a2d4-4cdd-9502-f1595031c924';
const assignedUserId = 'collaborator-a';
const conversation = { id: 'conversation-a', store_id: storeId, lead_id: 'lead-a' };
const assignedLead = { id: 'lead-a', assigned_store_id: storeId, assigned_user_id: assignedUserId };

for (const role of ['pre_sales', 'seller', 'prospector'] satisfies StorePortalRole[]) {
  test(`${role} acessa e assume somente conversa do lead atribuído`, () => {
    const profile = { id: assignedUserId, store_id: storeId };
    assert.equal(canAccessStoreConversation(profile, role, conversation, assignedLead), true);
    assert.equal(
      canAccessStoreConversation(
        { id: 'collaborator-b', store_id: storeId },
        role,
        conversation,
        assignedLead
      ),
      false
    );
    assert.equal(
      canAccessStoreConversation(
        { id: assignedUserId, store_id: 'other-store' },
        role,
        conversation,
        assignedLead
      ),
      false
    );
  });
}

test('Gestor acessa as conversas da própria loja e não cruza tenant', () => {
  assert.equal(
    canAccessStoreConversation({ id: 'manager', store_id: storeId }, 'store', conversation, null),
    true
  );
  assert.equal(
    canAccessStoreConversation({ id: 'manager', store_id: 'other-store' }, 'store', conversation, null),
    false
  );
});

test('estado live conectado prevalece sobre status Evolution antigo connecting', () => {
  const integration = { status: 'connecting', instance_name: 'a4-instance' };
  const availability = resolveEvolutionAvailability(integration, { status: 'connected', live_error: null });

  assert.deepEqual(availability, {
    connected: true,
    status: 'connected',
    source: 'evolution_live'
  });
});

test('estado live desconectado prevalece sobre status antigo connected', () => {
  const integration = { status: 'connected', instance_name: 'a4-instance' };
  const availability = resolveEvolutionAvailability(integration, { status: 'disconnected', live_error: null });

  assert.equal(availability.connected, false);
  assert.equal(availability.status, 'disconnected');
});

test('falha ao consultar Evolution permanece fail-closed', () => {
  const integration = { status: 'connected', instance_name: 'a4-instance' };
  const availability = resolveEvolutionAvailability(integration, {
    status: 'connected',
    live_error: 'timeout'
  });

  assert.equal(availability.connected, false);
  assert.equal(availability.status, 'disconnected');
  assert.equal(availability.source, 'stored_fail_closed');
});

test('payload público usa estado live sem expor credenciais da integração', () => {
  const number = {
    id: 'number-a',
    label: 'A4',
    phone_number: '556100000000',
    phone_number_id: 'evolution:a4-instance',
    status: 'connected',
    is_active: true,
    settings: { provider: 'evolution', instance_name: 'a4-instance' }
  };
  const integration = {
    status: 'connecting',
    instance_name: 'a4-instance',
    api_key: 'nao-pode-sair'
  };
  const result = publicWhatsappNumber(number, integration, { status: 'connected', live_error: null });

  assert.equal(result.integration_status, 'connected');
  assert.equal(result.integration_status_source, 'evolution_live');
  assert.equal('api_key' in result, false);
});
