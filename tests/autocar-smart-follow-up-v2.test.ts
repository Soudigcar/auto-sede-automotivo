import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { clampStoreFollowUpSettings, defaultFollowUpConfigV2, evaluateFollowUpRecoveryAttribution, validateFollowUpConfigV2 } from '../src/lib/server/autocar/smartFollowUpV2';

const sidebar = readFileSync('src/components/MasterSidebar.tsx', 'utf8');
const page = readFileSync('src/app/master/autocar/follow-up-v2/page.tsx', 'utf8');
const followUpUi = readFileSync('src/components/MasterAutocarFollowUpV2.tsx', 'utf8');
const storeGovernanceUi = readFileSync('src/components/MasterAutocarFollowUpStoreGovernanceV2.tsx', 'utf8');
const migration = readFileSync('supabase/migrations/20260826102000_autocar_smart_follow_up_v2_config.sql', 'utf8');

test('Smart Follow-up V2 nasce fail-closed e sem AUTOPILOT', () => {
  assert.equal(defaultFollowUpConfigV2.global.enabled, false);
  assert.equal(defaultFollowUpConfigV2.global.mode, 'off');
  assert.equal(validateFollowUpConfigV2(defaultFollowUpConfigV2).ok, true);
});

test('proteções obrigatórias não podem ser reduzidas pela loja', () => {
  const master = { ...defaultFollowUpConfigV2.global, enabled: true, mode: 'copilot' as const };
  const requested = { ...master, mode: 'autopilot' as const, allowedStart: '07:00', allowedEnd: '23:00', maxPerLeadPerDay: 5, maxPerSequence: 10, minIntervalMinutes: 15 };
  const effective = clampStoreFollowUpSettings(master, requested);
  assert.equal(effective.mode, 'copilot');
  assert.equal(effective.allowedStart, master.allowedStart);
  assert.equal(effective.allowedEnd, master.allowedEnd);
  assert.equal(effective.maxPerLeadPerDay, master.maxPerLeadPerDay);
  assert.equal(effective.maxPerSequence, master.maxPerSequence);
  assert.equal(effective.minIntervalMinutes, master.minIntervalMinutes);
  assert.equal(effective.cancelOnCustomerReply, true);
  assert.equal(effective.cancelOnSale, true);
  assert.equal(effective.cancelOnHumanTakeover, true);
  assert.equal(effective.cancelOnClosedConversation, true);
});

test('validador rejeita janela e limites comerciais inseguros', () => {
  const invalid = structuredClone(defaultFollowUpConfigV2);
  invalid.global.allowedStart = '22:00';
  invalid.global.allowedEnd = '08:00';
  invalid.global.maxPerLeadPerDay = 8;
  invalid.global.minIntervalMinutes = 5;
  invalid.scenarios[0].attributionWindowMinutes = 10;
  const result = validateFollowUpConfigV2(invalid);
  assert.equal(result.ok, false);
  assert.ok(result.errors.length >= 4);
});

test('jornadas V2 incluem os cenários comerciais e os quatro cenários do V1', () => {
  const keys = new Set(defaultFollowUpConfigV2.scenarios.map((scenario) => scenario.key));
  for (const key of ['silent_lead','simulation_pending','vehicle_interest','visit_confirmation','post_visit','no_show','callback_requested']) assert.equal(keys.has(key as any), true);
});

test('timing e janela de atribuição são editáveis sem criar sender', () => {
  assert.match(followUpUi, /setStepTiming/);
  assert.match(followUpUi, /setAttributionWindow/);
  assert.match(followUpUi, /Janela de atribuição da jornada/);
  assert.match(followUpUi, /option value="minutes"/);
  assert.match(followUpUi, /option value="hours"/);
  assert.match(followUpUi, /option value="days"/);
  assert.doesNotMatch(followUpUi, /messages\/send|Evolution|sendWhatsApp/i);
});

test('Follow-up V2 aparece como filho da AUTOCAR e oferece retorno explícito', () => {
  assert.match(sidebar, /Follow-up AUTOCAR/);
  assert.match(sidebar, /\/master\/autocar\/follow-up-v2/);
  assert.match(page, /Voltar para AUTOCAR/);
  assert.match(page, /href="\/master\/autocar"/);
});

test('dashboard por jornada separa resposta de recuperação e não inventa performance', () => {
  assert.match(followUpUi, /Dashboard ·/);
  assert.match(followUpUi, /Conversas recuperadas/);
  assert.match(followUpUi, /Taxa de recuperação/);
  assert.match(followUpUi, /Vendas atribuídas/);
  assert.match(followUpUi, /“respondeu” e “recuperou” são métricas diferentes/);
  assert.match(followUpUi, /permanecem zerados/);
});

test('resposta dentro da janela só conta recuperação quando volta ao fluxo comercial', () => {
  const sentAt = new Date('2026-08-26T12:00:00-03:00');
  const repliedButNotRecovered = evaluateFollowUpRecoveryAttribution({ followUpSentAt: sentAt, customerReplyAt: new Date('2026-08-26T13:00:00-03:00'), attributionWindowMinutes: 1440, returnedToCommercialFlow: false });
  assert.equal(repliedButNotRecovered.replied, true);
  assert.equal(repliedButNotRecovered.withinWindow, true);
  assert.equal(repliedButNotRecovered.recovered, false);
  const recovered = evaluateFollowUpRecoveryAttribution({ followUpSentAt: sentAt, customerReplyAt: new Date('2026-08-26T13:00:00-03:00'), attributionWindowMinutes: 1440, returnedToCommercialFlow: true });
  assert.equal(recovered.recovered, true);
});

test('resposta fora da janela não é atribuída à jornada', () => {
  const result = evaluateFollowUpRecoveryAttribution({ followUpSentAt: '2026-08-20T12:00:00-03:00', customerReplyAt: '2026-08-22T12:01:00-03:00', attributionWindowMinutes: 2880, returnedToCommercialFlow: true });
  assert.equal(result.replied, true);
  assert.equal(result.withinWindow, false);
  assert.equal(result.recovered, false);
});

test('governança por loja mostra pedido, teto Master e configuração efetiva sem persistência', () => {
  assert.match(page, /MasterAutocarFollowUpStoreGovernanceV2/);
  assert.match(storeGovernanceUi, /Configuração por Loja/);
  assert.match(storeGovernanceUi, /Configuração efetiva/);
  assert.match(storeGovernanceUi, /Limitado pelo Master/);
  assert.match(storeGovernanceUi, /Nada desta seção é salvo nesta etapa/);
  assert.match(storeGovernanceUi, /clampStoreFollowUpSettings/);
  assert.doesNotMatch(storeGovernanceUi, /POST|PATCH|PUT|DELETE|messages\/send|sendWhatsApp|Evolution/);
});

test('migration de performance é somente analítica e não cria execução externa', () => {
  assert.match(migration, /ai_follow_up_performance_events/);
  assert.match(migration, /attribution_window_minutes/);
  assert.match(migration, /conversation_recovered/);
  assert.doesNotMatch(migration, /cron\.schedule|create\s+extension\s+.*pg_cron|http_request\s*\(|net\.http|messages\/send|Evolution/i);
});
