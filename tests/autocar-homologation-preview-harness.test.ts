import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const route = readFileSync('src/app/api/internal/autocar-homologation-69cdb9c1/route.ts', 'utf8');
const followUp = readFileSync('src/lib/server/autocar/smartFollowUp.ts', 'utf8');

test('harness temporário é restrito ao Preview, branch, DEV e dry-run', () => {
  assert.match(route, /process\.env\.VERCEL_ENV !== 'preview'/);
  assert.match(route, /VERCEL_GIT_COMMIT_REF !== AUTHORIZED_BRANCH/);
  assert.match(route, /AUTOCAR_SMART_FOLLOW_UP_DRY_RUN_ENABLED !== 'true'/);
  assert.match(route, /crmRef !== AUTOCAR_DEV_REF \|\| autocar\.project_ref !== AUTOCAR_DEV_REF/);
  assert.match(route, /external_execution: false/);
  assert.doesNotMatch(route, /Evolution|WhatsApp.*send|sendEvolution/i);
});

test('harness só avalia os dois eventos e a loja sintéticos autorizados', () => {
  assert.match(route, /69000000-0000-4000-8000-000000000001/);
  assert.match(route, /69000000-0000-4000-8000-000000000008/);
  assert.match(route, /69000000-0000-4000-8000-000000000009/);
  assert.match(route, /event\.store_id !== SYNTHETIC_STORE_ID/);
  assert.match(route, /\.eq\('id', eventId\)\.eq\('store_id', SYNTHETIC_STORE_ID\)/);
});

test('falha controlada usa injeção de gerador e preserva o fail-closed real', () => {
  assert.match(route, /generateText: async \(\) => \{ throw new Error\('Falha sintética controlada de geração\.'\); \}/);
  assert.match(followUp, /input\.generateText \|\| generateSmartFollowUpText/);
  assert.match(followUp, /gates\.generation_fail_closed = true/);
  assert.match(followUp, /proposed_text: null/);
});

test('Vehicle Presentation cobre abertura generativa e ausência sem fallback', () => {
  assert.match(route, /createAutocarStructuredResponse/);
  assert.match(route, /scenarioA = buildAutocarVehiclePresentationV2/);
  assert.match(route, /scenarioB = buildAutocarVehiclePresentationV2\(\{ referencedVehicles: groundedVehicles, aiResponse: '' \}\)/);
  assert.doesNotMatch(route, /Separei 2 opções para você comparar[^”]/);
});
