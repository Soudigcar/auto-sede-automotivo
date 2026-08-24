import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const api = fs.readFileSync('src/app/api/master/base-lead-bulk-distribution/route.ts', 'utf8');
const routingApi = fs.readFileSync('src/app/api/lead-routing-rules/route.ts', 'utf8');
const ui = fs.readFileSync('src/components/MasterBulkLeadDistribution.tsx', 'utf8');
const baseMigration = fs.readFileSync('supabase/migrations/20260823223000_lead_routing_rules_master_store.sql', 'utf8');
const hardening = fs.readFileSync('supabase/migrations/20260824204500_lead_routing_bulk_distribution_hardening.sql', 'utf8');
const migration = fs.readFileSync('supabase/migrations/20260824211800_lead_routing_bulk_distribution_fail_closed_v2.sql', 'utf8');

test('bulk distribution remains Master-only and preview write-closed', () => {
  assert.match(api, /requireMaster/);
  assert.match(api, /Acesso restrito ao Master/);
  assert.match(api, /process\.env\.VERCEL_ENV === 'preview'/);
  assert.match(api, /Preview está em modo somente leitura/);
  assert.match(api, /confirmation[^\n]+DISTRIBUIR/);
});

test('rollout has no committed trigger window before final hardening', () => {
  assert.match(baseMigration, /drop trigger if exists leads_auto_route_by_rules/);
  assert.match(baseMigration, /drop trigger if exists leads_base_auto_route_by_rules/);
  assert.doesNotMatch(baseMigration, /create constraint trigger leads_auto_route_by_rules/);
  assert.doesNotMatch(hardening, /create constraint trigger leads_auto_route_by_rules/);
  assert.match(migration, /create constraint trigger leads_auto_route_by_rules/);
  assert.match(migration, /create trigger leads_base_auto_route_by_rules/);
});

test('existing portfolios and final leads are protected before write', () => {
  assert.match(api, /Venda concluída/);
  assert.match(api, /Perdido/);
  assert.match(api, /assigned_consultant_id \|\| routed\?\.assigned_user_id/);
  assert.match(api, /não será retirado da carteira/);
  assert.match(migration, /v_base\.status in \('Venda concluída','Perdido'\)/);
  assert.match(migration, /from public\.leads_base[\s\S]*for update/);
});

test('RPC validates manual member and capacity before first lead insert', () => {
  const memberValidation = migration.indexOf("if p_selected_user_id is null then");
  const memberCapacity = migration.indexOf("'member_capacity_reached'");
  const firstLeadInsert = migration.indexOf('insert into public.leads(');
  assert.ok(memberValidation >= 0 && memberValidation < firstLeadInsert);
  assert.ok(memberCapacity >= 0 && memberCapacity < firstLeadInsert);
  assert.match(migration, /Roteamento fail-closed cancelado/);
  assert.match(migration, /transacao cancelada/);
});

test('active store rotation cannot be replaced by an ad-hoc member round robin', () => {
  assert.match(api, /mode === 'configured_rotation'/);
  assert.match(api, /distribute_base_lead_to_store/);
  assert.match(api, /Esta loja já possui rodízio ativo/);
  assert.match(ui, /Seguir rodízio da loja/);
  assert.match(ui, /Não será criado um segundo rodízio/);
});

test('event distribution accepts only active participation in API and transaction', () => {
  assert.match(api, /store_event_participations/);
  assert.match(api, /\.eq\('status', 'active'\)/);
  assert.match(api, /participação ativa no evento/);
  assert.match(migration, /sep\.status = 'active'/);
  assert.doesNotMatch(migration, /sep\.status in \('active','inactive'\)/);
});

test('select all filtered is resolved server-side with pagination and exclusions', () => {
  assert.match(api, /resolveAllFilteredLeadIds/);
  assert.match(api, /QUERY_PAGE_SIZE = 400/);
  assert.match(api, /\.range\(offset, offset \+ QUERY_PAGE_SIZE - 1\)/);
  assert.match(api, /selection\.all_filtered === true/);
  assert.match(api, /excluded_lead_ids/);
  assert.match(api, /eligible_lead_ids/);
  assert.match(ui, /Seleção server-side ativa/);
  assert.match(ui, /currentBaseFilterSnapshot/);
  assert.match(ui, /all_filtered: true/);
});

test('actual execution is bounded to 100-lead batches', () => {
  assert.match(api, /EXECUTION_BATCH_SIZE = 100/);
  assert.match(api, /A execução aceita no máximo/);
  assert.match(ui, /EXECUTION_BATCH_SIZE = 100/);
  assert.match(ui, /chunks\(eligibleLeadIds, EXECUTION_BATCH_SIZE\)/);
});

test('selected-member capacity falls through to the next member', () => {
  assert.match(api, /for \(let attempt = 0; attempt < selectedMembers\.length; attempt \+= 1\)/);
  assert.match(api, /member_capacity_reached/);
  assert.match(api, /continue;/);
  assert.match(api, /team_capacity_reached/);
  assert.match(ui, /tentará o próximo membro selecionado/);
});

test('dry run precedes confirmation and exposes blocked lead count', () => {
  assert.match(ui, /dry_run: true/);
  assert.match(ui, /Pré-validação concluída no servidor\. Nenhum dado foi alterado/);
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
  assert.match(migration, /v_base\.campaign_id/);
  assert.match(migration, /v_source := lower\(btrim\(coalesce\(v_base\.source,''\)\)\)/);
});

test('round robin and member assignment serialize concurrency', () => {
  assert.match(migration, /from public\.leads_base[\s\S]*for update/);
  assert.match(migration, /from public\.lead_routing_rule_state[\s\S]*for update/);
  assert.match(migration, /order by u\.id[\s\S]*for update/);
  assert.match(migration, /max_open_leads/);
});

test('permission denied is not misclassified as a missing migration', () => {
  assert.match(api, /PGRST205/);
  assert.match(api, /PGRST202/);
  assert.doesNotMatch(api, /lead_routing_rules\|route_lead_by_rules/);
  assert.match(routingApi, /\['42P01','42883','PGRST205','PGRST202'\]/);
  assert.doesNotMatch(routingApi, /\/lead_routing_rules\/i/);
});
