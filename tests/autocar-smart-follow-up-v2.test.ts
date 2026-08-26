import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { clampStoreFollowUpSettings, defaultFollowUpConfigV2, validateFollowUpConfigV2 } from '../src/lib/server/autocar/smartFollowUpV2';

const sidebar = readFileSync('src/components/MasterSidebar.tsx', 'utf8');
const page = readFileSync('src/app/master/autocar/follow-up-v2/page.tsx', 'utf8');
const followUpUi = readFileSync('src/components/MasterAutocarFollowUpV2.tsx', 'utf8');

test('Smart Follow-up V2 nasce fail-closed e sem AUTOPILOT', () => {
  assert.equal(defaultFollowUpConfigV2.global.enabled, false);
  assert.equal(defaultFollowUpConfigV2.global.mode, 'off');
  assert.equal(validateFollowUpConfigV2(defaultFollowUpConfigV2).ok, true);
});

test('proteções obrigatórias não podem ser reduzidas pela loja', () => {
  const master = { ...defaultFollowUpConfigV2.global, enabled: true, mode: 'copilot' as const };
  const requested = {
    ...master,
    mode: 'autopilot' as const,
    allowedStart: '07:00',
    allowedEnd: '23:00',
    maxPerLeadPerDay: 5,
    maxPerSequence: 10,
    minIntervalMinutes: 15
  };
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
  const result = validateFollowUpConfigV2(invalid);
  assert.equal(result.ok, false);
  assert.ok(result.errors.length >= 3);
});

test('jornadas V2 incluem os cenários comerciais e os quatro cenários do V1', () => {
  const keys = new Set(defaultFollowUpConfigV2.scenarios.map((scenario) => scenario.key));
  for (const key of ['silent_lead','simulation_pending','vehicle_interest','visit_confirmation','post_visit','no_show','callback_requested']) {
    assert.equal(keys.has(key as any), true);
  }
});

test('timing de jornada é editável por quantidade e unidade sem criar sender', () => {
  assert.match(followUpUi, /setStepTiming/);
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

test('dashboard por jornada não inventa performance no dry-run', () => {
  assert.match(followUpUi, /Dashboard ·/);
  assert.match(followUpUi, /Conversas recuperadas/);
  assert.match(followUpUi, /Taxa de recuperação/);
  assert.match(followUpUi, /Vendas atribuídas/);
  assert.match(followUpUi, /permanecem zerados/);
});
