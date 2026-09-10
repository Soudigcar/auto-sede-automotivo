import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { planFollowUpV2Sources, type FollowUpV2Facts } from '../src/lib/server/autocar/followUpV2Sources';
import { defaultFollowUpConfigV2 } from '../src/lib/server/autocar/smartFollowUpV2';

function enabledConfig() {
  const config = structuredClone(defaultFollowUpConfigV2);
  config.global = { ...config.global, enabled: true, mode: 'autopilot' };
  config.scenarios.forEach((scenario) => { scenario.enabled = true; });
  return config;
}

function facts(overrides: Partial<FollowUpV2Facts> = {}): FollowUpV2Facts {
  return {
    storeId: 'store', conversationId: 'conversation', leadId: 'lead', leadStatus: 'in_service',
    inboundAt: '2026-09-07T12:00:00.000Z', outboundAt: '2026-09-07T12:05:00.000Z', outboundId: 'outbound',
    scheduledAt: null, vehicleInterest: true, financingPending: false, appointments: [], callbacks: [],
    ...overrides
  };
}

test('planner nunca cria Follow-up quando o cliente respondeu depois da última resposta da loja', () => {
  const planned = planFollowUpV2Sources(facts({
    inboundAt: '2026-09-07T12:10:00.000Z', outboundAt: '2026-09-07T12:05:00.000Z'
  }), enabledConfig(), false);
  assert.deepEqual(planned, []);
});

test('jornadas operacionais usam leads.status + scheduled_at mesmo sem linha em appointments', () => {
  const config = enabledConfig();
  const scheduledAt = '2026-09-08T18:00:00.000Z';
  const scheduled = planFollowUpV2Sources(facts({ leadStatus: 'scheduled', scheduledAt }), config, false);
  assert.deepEqual(scheduled.map((event) => event.scenario), ['visit_confirmation']);
  assert.match(scheduled[0].sourceId, /^lead-scheduled:/);
  assert.equal(scheduled[0].dueAt, '2026-09-07T18:00:00.000Z');

  const noShow = planFollowUpV2Sources(facts({ leadStatus: 'no_show', scheduledAt }), config, false);
  assert.deepEqual(noShow.map((event) => event.scenario), ['no_show']);
  assert.equal(noShow[0].dueAt, '2026-09-08T18:30:00.000Z');

  const showedUp = planFollowUpV2Sources(facts({ leadStatus: 'showed_up', scheduledAt }), config, false);
  assert.deepEqual(showedUp.map((event) => event.scenario), ['post_visit']);
  assert.equal(showedUp[0].dueAt, '2026-09-08T20:00:00.000Z');
});

test('scheduled_at ambíguo não vira no-show, pós-visita nem sequência genérica', () => {
  assert.deepEqual(planFollowUpV2Sources(facts({
    leadStatus: 'in_service', scheduledAt: '2026-09-08T18:00:00.000Z'
  }), enabledConfig(), false), []);
});

test('release hardening usa claim por execução, só executa vencidos e restaura observabilidade/fallback', () => {
  const source = fs.readFileSync('src/lib/server/autocar/followUpV2Data.ts', 'utf8');
  assert.match(source, /liveOutboundMessageId=randomUUID\(\)/);
  assert.match(source, /p_message_id:liveOutboundMessageId/);
  assert.doesNotMatch(source, /p_message_id:latest\.facts\.outboundId/);
  assert.match(source, /\.lte\('due_at',runNow\.toISOString\(\)\)/);
  assert.match(source, /Date\.parse\(event\.dueAt\)<=runNow\.getTime\(\)/);
  assert.match(source, /ai_follow_up_copilot_suggestions/);
  assert.match(source, /autopilot_fallback:true/);
  assert.match(source, /ai_follow_up_performance_events/);
  assert.match(source, /production_outbound_message_id/);
  assert.match(source, /claimReasonsAuditedByDatabase/);
});

test('pacote de release não carrega rota temporária de homologação', () => {
  assert.equal(fs.existsSync('src/app/api/internal/autocar/follow-up-v2-homologation/route.ts'), false);
  assert.equal(fs.existsSync('tests/autocar-follow-up-v2-homologation.test.ts'), false);
});
