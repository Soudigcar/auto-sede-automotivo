import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const api = fs.readFileSync('src/app/api/master/base-lead-bulk-distribution/route.ts', 'utf8');
const ui = fs.readFileSync('src/components/MasterBulkLeadDistribution.tsx', 'utf8');
const base = fs.readFileSync('src/app/master/base/page.tsx', 'utf8');

test('bulk distribution remains Master-only and preview write-closed', () => {
  assert.match(api, /requireMaster/);
  assert.match(api, /Acesso restrito ao Master/);
  assert.match(api, /process\.env\.VERCEL_ENV === 'preview'/);
  assert.match(api, /Preview está em modo somente leitura/);
  assert.match(api, /confirmation[^\n]+DISTRIBUIR/);
});

test('existing portfolios and final leads are protected', () => {
  assert.match(api, /Venda concluída/);
  assert.match(api, /Perdido/);
  assert.match(api, /assigned_consultant_id \|\| routed\?\.assigned_user_id/);
  assert.match(api, /não será retirado da carteira/);
});

test('active store rotation cannot be replaced by an ad-hoc member round robin', () => {
  assert.match(api, /mode === 'configured_rotation'/);
  assert.match(api, /route_lead_by_rules/);
  assert.match(api, /Esta loja já possui rodízio ativo/);
  assert.match(ui, /Seguir rodízio da loja/);
  assert.match(ui, /Não será criado um segundo rodízio/);
});

test('event participation is checked before a lead becomes eligible', () => {
  assert.match(api, /store_event_participations/);
  assert.match(api, /allowedEventIds/);
  assert.match(api, /não participa do evento deste lead/);
});

test('selection uses the already filtered Master Base result', () => {
  assert.match(base, /MasterBulkLeadDistribution leads=\{filtered\}/);
  assert.match(ui, /Selecionar todos os filtrados/);
  assert.match(ui, /evento, origem, loja, status, cidade, data e busca/);
});

test('dry run precedes confirmation and exposes blocked lead count', () => {
  assert.match(ui, /dry_run: true/);
  assert.match(ui, /Pré-validação concluída\. Nenhum dado foi alterado/);
  assert.match(ui, /Leads protegidos não serão redistribuídos/);
  assert.match(ui, /dry_run: false/);
});
