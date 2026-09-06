import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

// Execute the actual modules with an explicit dependency allowlist. No network,
// provider credentials or real database clients are available to these tests.
function loadModule(file: string, dependencies: Record<string, any>) {
  const exports: any = {};
  const source = ts.transpileModule(readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  runInNewContext(source, {
    exports,
    process: { env: { VERCEL_ENV: 'preview' } },
    require(name: string) {
      assert.ok(Object.hasOwn(dependencies, name), `Unmocked dependency: ${name}`);
      return dependencies[name];
    }
  });
  return exports;
}

function queryMock(resolve: (table: string, operation: string, payload: any) => any) {
  return (table: string) => {
    let operation = 'select';
    let payload: any;
    const query: any = {};
    for (const method of ['select', 'eq', 'in', 'is', 'order', 'limit']) query[method] = () => query;
    for (const method of ['insert', 'update']) query[method] = (value: any) => {
      operation = method;
      payload = value;
      return query;
    };
    const result = () => resolve(table, operation, payload);
    query.single = query.maybeSingle = async () => result();
    query.then = (yes: any, no: any) => Promise.resolve().then(result).then(yes, no);
    return query;
  };
}

function continuityFixture(options: {
  resolution?: string;
  action?: string;
  vehicleId?: string;
  unavailable?: boolean;
  failure?: 'classifier' | 'reply';
  booking?: boolean;
} = {}) {
  const calls: string[] = [];
  const photoRequest = options.action === 'send_photos';
  const shadow = {
    response: 'Resposta contextual original',
    referenced_vehicles: [{ id: 'synthetic-vehicle' }],
    operational_preview: { plan: { needs_photos: photoRequest, needs_location: !photoRequest } }
  };
  const db = { from: queryMock((table) => {
    if (table === 'whatsapp_messages') return { data: [
      { id: 'inbound', direction: 'inbound', body: photoRequest ? 'Me mande fotos desse veículo' : 'Mande a localização da loja', sent_at: '2026-09-06T12:01:00Z' },
      { id: 'outbound', direction: 'outbound', body: 'Olá, como posso ajudar?', sent_at: '2026-09-06T12:00:00Z' }
    ] };
    if (table === 'ai_runtime_message_claims') return { data: [] };
    if (table === 'site_vehicles') return { data: [{ id: 'synthetic-vehicle', model: 'Veículo sintético' }] };
    throw new Error(`Unexpected table: ${table}`);
  }) };
  const loaded = loadModule('src/lib/server/autocar/conversationContinuity.ts', {
    '@/lib/server/autocar/client': { createAutocarStructuredResponse: async (request: any) => {
      calls.push(request.schemaName);
      const classifier = request.schemaName === 'autocar_pending_action_resolution';
      if (options.failure === (classifier ? 'classifier' : 'reply')) throw new Error('Synthetic provider failure');
      return { parsed: classifier ? {
        pending_action: options.action || 'send_location', resolution: options.resolution || 'direct_request',
        vehicle_id: options.vehicleId ?? (photoRequest ? 'synthetic-vehicle' : ''), reason: 'Solicitação sintética'
      } : { response: 'Resposta gerada sintética', next_best_action: 'Aguardar cliente' }, routing: {} };
    } },
    '@/lib/server/autocar/devAdmin': { getAutocarDevClient: () => db },
    '@/lib/server/evolutionMessage': { evolutionDisplayBody: (body: string) => body },
    '@/lib/server/autocar/operationalTools': {
      consultAutocarStoreLocation: async () => ({ configured: !options.unavailable, address: 'Endereço sintético', latitude: -15, longitude: -48 }),
      consultAutocarVehiclePhotos: async () => ({ configured: !options.unavailable, photos: options.unavailable ? [] : ['https://example.test/vehicle.jpg'] })
    }
  });
  return { calls, loaded, run: () => loaded.enhanceAutocarConversationContinuity({
    productionSupabase: db, storeId: 'synthetic-store', conversationId: 'synthetic-conversation', shadow,
    bookingGuard: { state: options.booking ? 'READY_TO_SCHEDULE' : 'NOT_APPLICABLE' }
  }) };
}

for (const action of ['send_location', 'send_photos']) {
  test(`pedido direto de ${action} não exige oferta anterior`, async () => {
    const fixture = continuityFixture({ action });
    const result = await fixture.run();
    assert.equal(result.conversation_continuity.resolution, 'direct_request');
    assert.equal(fixture.loaded.isAutocarContinuityExecutionSafe(result.conversation_continuity), true);
    assert.equal(result.operational_preview.plan[action === 'send_photos' ? 'needs_photos' : 'needs_location'], true);
    assert.equal(result.response, 'Resposta gerada sintética');
  });
}

for (const resolution of ['unclear', 'declined', 'not_applicable']) {
  test(`continuidade ${resolution} não autoriza envio mesmo com plano anterior válido`, async () => {
    const fixture = continuityFixture({ resolution, action: 'none' });
    const result = await fixture.run();
    assert.equal(fixture.loaded.isAutocarContinuityExecutionSafe(result.conversation_continuity), false);
    assert.equal(fixture.calls.length, 1);
  });
}

test('aceite inequívoco continua elegível', async () => {
  const fixture = continuityFixture({ resolution: 'accepted' });
  const result = await fixture.run();
  assert.equal(fixture.loaded.isAutocarContinuityExecutionSafe(result.conversation_continuity), true);
});

for (const options of [
  { unavailable: true },
  { action: 'send_photos', vehicleId: 'outside-store' },
  { failure: 'classifier' as const },
  { failure: 'reply' as const },
  { booking: true }
]) {
  test(`continuidade permanece fail-closed: ${JSON.stringify(options)}`, async () => {
    const fixture = continuityFixture(options);
    const result = await fixture.run();
    assert.equal(fixture.loaded.isAutocarContinuityExecutionSafe(result.conversation_continuity), false);
  });
}

test('metadados incompletos não liberam continuidade', () => {
  const { loaded } = continuityFixture();
  assert.equal(loaded.isAutocarContinuityExecutionSafe({ resolution: 'direct_request', pending_action: 'send_location', execution_ready: true }), false);
  assert.equal(loaded.isAutocarContinuityExecutionSafe(null), true);
});

function visitFixture(changeDuringGeneration: (state: any) => void = () => {}) {
  const events: string[] = [];
  const state = {
    human: 'autocar_active', mode: 'autopilot', master: true, error: false,
    policy: 'allow', generated: false, sent: 0, scheduled: 0,
    claim: { id: 'synthetic-claim', result: {} } as any
  };
  const conversation = { id: 'synthetic-conversation', store_id: 'synthetic-store', whatsapp_number_id: 'synthetic-number', contact_id: 'synthetic-contact', lead_id: 'synthetic-lead' };
  const db = { from: queryMock((table, operation, payload) => {
    let data: any;
    if (table === 'ai_runtime_message_claims') {
      if (operation !== 'select') state.claim = { ...state.claim, ...payload };
      data = state.claim;
    } else if (table === 'ai_store_agents') {
      data = { mode: state.mode, status: 'active', master_enabled: true, master_autopilot_allowed: state.master, store_selected_mode: state.mode };
    } else if (table === 'ai_runtime_conversations') {
      events.push(state.generated ? 'revalidate-after-generation' : 'revalidate-before-generation');
      if (state.error) return { data: null, error: new Error('Synthetic read failure') };
      data = { effective_mode: state.mode, human_state: state.human };
    } else if (table === 'whatsapp_conversations') data = conversation;
    else if (table === 'whatsapp_contacts') data = { id: 'synthetic-contact', phone: '5500000000000' };
    else if (table === 'leads') data = { id: 'synthetic-lead', customer_name: 'CLIENTE SINTETICO' };
    else if (table === 'whatsapp_messages') data = operation === 'insert' ? { id: 'synthetic-message' } : [];
    else throw new Error(`Unexpected table: ${table}`);
    return { data, error: null };
  }), rpc: async () => {
    state.scheduled++;
    return { data: { success: true, scheduled_at: '2026-09-10T17:30:00-03:00' }, error: null };
  } };
  const loaded = loadModule('src/lib/server/autocar/liveVisitPilot.ts', {
    '@/lib/server/autocar/client': { createAutocarStructuredResponse: async () => {
      events.push('generate');
      state.generated = true;
      changeDuringGeneration(state);
      return { parsed: { response: 'Confirmação sintética', next_best_action: 'none' }, routing: {} };
    } },
    '@/lib/server/autocar/devAdmin': { getAutocarDevClient: () => db },
    '@/lib/server/autocar/operationalPolicy': { evaluateAutocarOperationalShadowPolicy: () => ({ effect: state.policy, reason: 'Synthetic policy' }) },
    '@/lib/server/autocar/operationalTools': { consultAutocarStoreLocation: async () => ({ configured: false }) },
    '@/lib/server/evolution': { sendEvolutionText: async () => { state.sent++; events.push('send-mock'); return {}; } }
  });
  return { state, events, run: () => loaded.attemptAutocarLiveVisitPilot({
    productionSupabase: db, storeId: conversation.store_id, conversationId: conversation.id,
    whatsappNumberId: conversation.whatsapp_number_id, leadId: conversation.lead_id,
    inboundMessageId: 'synthetic-inbound', integration: { scope: 'store', status: 'connected', instance_name: 'mock-only' },
    shadowResult: { shadow: {
      booking_guard: { state: 'READY_TO_SCHEDULE', booking_type: 'visit', revalidation: { available: true, starts_at: '2026-09-10T17:30:00-03:00' } },
      operational_preview: { plan: {} }, proposed_actions: [{ capability: 'schedule_visit', decision: { effect: 'allow' } }]
    } }
  }) };
}

for (const [name, change] of [
  ['humano assume', (s: any) => { s.human = 'human_active'; }],
  ['Master desabilita AUTOPILOT', (s: any) => { s.master = false; }],
  ['loja muda para COPILOT', (s: any) => { s.mode = 'copilot'; }],
  ['policy operacional recusa', (s: any) => { s.policy = 'deny'; }],
  ['consulta de revalidação falha', (s: any) => { s.error = true; }]
] as const) {
  test(`visita já salva não envia confirmação quando ${name} durante a geração`, async () => {
    const fixture = visitFixture(change);
    const result = await fixture.run();
    assert.equal(result.scheduled, true);
    assert.equal(result.sent, false);
    assert.equal(fixture.state.scheduled, 1);
    assert.equal(fixture.state.sent, 0);
    assert.equal(fixture.state.claim.result.external_execution, false);
    assert.equal(fixture.state.claim.result.confirmation_send_blocked, true);
    assert.equal(fixture.state.claim.result.automatic_retry_disabled, true);
    assert.ok(fixture.events.indexOf('revalidate-after-generation') > fixture.events.indexOf('generate'));
  });
}

test('visita elegível revalida após geração e chama somente o sender simulado', async () => {
  const fixture = visitFixture();
  const result = await fixture.run();
  assert.equal(result.sent, true);
  assert.equal(fixture.state.sent, 1);
  assert.equal(fixture.state.scheduled, 1);
  assert.deepEqual(fixture.events.slice(-3), ['generate', 'revalidate-after-generation', 'send-mock']);
});
