import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const api = fs.readFileSync('src/app/api/master/base-lead-bulk-distribution/route.ts', 'utf8');
const routingApi = fs.readFileSync('src/app/api/lead-routing-rules/route.ts', 'utf8');
const ui = fs.readFileSync('src/components/MasterBulkLeadDistribution.tsx', 'utf8');
const base = fs.readFileSync('src/app/master/base/page.tsx', 'utf8');
const migration = fs.readFileSync('supabase/migrations/20260824204500_lead_routing_bulk_distribution_hardening.sql', 'utf8');

test('bulk distribution remains Master-only and preview write-closed', () => {
  assert.match(api, /requireMaster/);
  assert.match(api, /Acesso restrito ao Master/);
  assert.match(api, /process\.env\.VERCEL_ENV === 'preview'/);
  assert.match(api, /Preview está em modo somente leitura/);
  assert.match(api, /confirmation[^\n]+DISTRIBUIR/);
});

test('existing portfolios and final leads are protected before write', () => {
  assert.match(api, /Venda concluída/);
  assert.match(api, /Perdido/);
  assert.match(api, /assigned_consultant_id \|\| routed\?\.assigned_user_id/);
  assert.match(api, /não será retirado da carteira/);
  assert.match(migration, /v_base\.status in \('Venda concluída','Perdido'\)/);
  assert.match(migration, /for update/);
});

test('active store rotation cannot be replaced by an ad-hoc member round robin', () => {
  assert.match(api, /mode === 'configured_rotation'/);
  assert.match(api, /distribute_base_lead_to_store/);
  assert.match(api, /Esta loja já possui rodízio ativo/);
  assert.match(ui, /Seguir rodízio da loja/);
  assert.match(ui, /Não será criado um segundo rodízio/);
});

test('event participation is checked both in preview and transaction', () => {
  assert.match(api, /store_event_participations/);
  assert.match(api, /allowedEventIds/);
  assert.match(api, /não participa do evento deste lead/);
  assert.match(migration, /public\.store_event_participations/);
  assert.match(migration, /event_blocked/);
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

test('transaction suppresses automatic trigger and routes once after full Base context', () => {
  assert.match(migration, /set_config\('app\.lead_routing_explicit','on',true\)/);
  assert.match(migration, /current_setting\('app\.lead_routing_explicit'/);
  const baseUpdate = migration.indexOf('update public.leads_base');
  const explicitRoute = migration.indexOf('v_route_result := public.route_lead_by_rules');
  assert.ok(baseUpdate >= 0 && explicitRoute > baseUpdate);
  assert.match(migration, /already_assigned'[\s\S]*'audited',false/);
});

test('routing precedence is Event then Campaign then Origin then Default', () => {
  assert.match(migration, /case r\.match_type when 'event' then 1 when 'campaign' then 2 when 'source' then 3 else 4 end/);
  assert.match(migration, /lb\.campaign_id/);
  assert.match(migration, /nullif\(btrim\(lb\.source\),''\)/);
});

test('round robin and member assignment serialize concurrency', () => {
  assert.match(migration, /from public\.leads_base[\s\S]*for update/);
  assert.match(migration, /from public\.lead_routing_rule_state[\s\S]*for update/);
  assert.match(migration, /from public\.users u[\s\S]*for update/);
  assert.match(migration, /max_open_leads/);
});

test('service role receives only required routing table grants', () => {
  assert.match(migration, /grant select, insert, update on table public\.lead_routing_rules to service_role/);
  assert.match(migration, /grant select on table public\.lead_routing_rule_state to service_role/);
  assert.match(migration, /grant select on table public\.lead_routing_decisions to service_role/);
  assert.match(migration, /grant select on table public\.lead_unassigned_queue to service_role/);
  assert.match(migration, /grant execute on function public\.distribute_base_lead_to_store/);
});

test('permission denied is not misclassified as a missing migration', () => {
  assert.match(api, /PGRST205/);
  assert.match(api, /PGRST202/);
  assert.doesNotMatch(api, /lead_routing_rules\|route_lead_by_rules/);
  assert.match(routingApi, /\['42P01','42883','PGRST205','PGRST202'\]/);
  assert.doesNotMatch(routingApi, /\/lead_routing_rules\/i/);
});
