import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const baseMigration = fs.readFileSync('supabase/migrations/20260823223000_lead_routing_rules_master_store.sql','utf8');
const migration = fs.readFileSync('supabase/migrations/20260824211800_lead_routing_bulk_distribution_fail_closed_v2.sql','utf8');
const route = fs.readFileSync('src/app/api/lead-routing-rules/route.ts','utf8');
const portal = fs.readFileSync('src/lib/server/storePortal.ts','utf8');
const ui = fs.readFileSync('src/components/LeadRoutingRulesManager.tsx','utf8');

test('base migration is structural only and leaves routing triggers disabled', () => {
  assert.match(baseMigration, /Fase estrutural do rollout/);
  assert.match(baseMigration, /drop trigger if exists leads_auto_route_by_rules/);
  assert.match(baseMigration, /drop trigger if exists leads_base_auto_route_by_rules/);
  assert.doesNotMatch(baseMigration, /create constraint trigger leads_auto_route_by_rules/);
  assert.doesNotMatch(baseMigration, /create trigger leads_base_auto_route_by_rules/);
});

test('state is isolated per rule and matched rules fail closed',()=>{
  assert.match(baseMigration,/lead_routing_rule_state/);
  assert.match(baseMigration,/rule_id uuid primary key/);
  assert.match(baseMigration,/lead_unassigned_queue/);
  assert.match(migration,/fallback_allowed',false/);
  assert.match(migration,/for update/);
});

test('eligibility respects tenant, active status, pause and capacity',()=>{
  assert.match(migration,/u\.store_id = v_lead\.assigned_store_id/);
  assert.match(migration,/u\.status = 'active'/);
  assert.match(migration,/u\.receives_leads = true/);
  assert.match(migration,/max_open_leads/);
  assert.match(migration,/excluded_member_ids/);
});

test('precedence is event campaign source default then priority',()=>{
  assert.match(migration,/when 'event' then 1 when 'campaign' then 2 when 'source' then 3 else 4/);
  assert.match(migration,/r\.priority asc/);
});

test('automatic ingestion wiring is enabled only by final hardening',()=>{
  assert.match(migration,/auto_route_lead_by_rules_trigger/);
  assert.match(migration,/create constraint trigger leads_auto_route_by_rules/);
  assert.match(migration,/create trigger leads_base_auto_route_by_rules/);
  assert.match(migration,/v_store_id is null or v_assigned_user_id is not null/);
  assert.match(migration,/transaction_timestamp\(\)/);
  assert.match(migration,/perform public\.route_lead_by_rules/);
});

test('round robin serializes candidate capacity and rule state', () => {
  assert.match(migration,/order by u\.id[\s\S]*for update/);
  assert.match(migration,/lead_routing_rule_state[\s\S]*for update/);
  assert.match(migration,/max_open_leads/);
});

test('management API enforces store scope server-side',()=>{
  assert.match(route,/profile\.role==='master'/);
  assert.match(route,/profile\.role==='store'/);
  assert.match(route,/Loja fora do seu escopo/);
  assert.match(route,/m\.store_id!==storeId/);
});

test('management API validates optional dates before converting to ISO',()=>{
  assert.match(route,/function optionalIsoDate/);
  assert.match(route,/Number\.isNaN\(date\.getTime\(\)\)/);
  assert.match(route,/Data de início ou fim inválida\./);
  assert.match(route,/A data de fim deve ser posterior à data de início\./);
  assert.doesNotMatch(route,/body\.starts_at \? new Date\(String\(body\.starts_at\)\)\.toISOString\(\)/);
  assert.doesNotMatch(route,/body\.ends_at \? new Date\(String\(body\.ends_at\)\)\.toISOString\(\)/);
});

test('only Master and store manager receive routing permission',()=>{
  assert.match(portal,/master: \[[^\]]*'manage_lead_routing'/s);
  assert.match(portal,/store: \[[^\]]*'manage_lead_routing'/s);
  assert.match(portal,/pre_sales: \['view_dashboard'/);
  assert.doesNotMatch(portal,/pre_sales: \[[^\]]*manage_lead_routing/s);
  assert.doesNotMatch(portal,/seller: \[[^\]]*manage_lead_routing/s);
  assert.doesNotMatch(portal,/prospector: \[[^\]]*manage_lead_routing/s);
});

test('store portal keeps tenant and portfolio access guards',()=>{
  assert.match(portal,/profile\.store_id!==lead\?\.assigned_store_id/);
  assert.match(portal,/lead\?\.assigned_user_id===profile\.id/);
  assert.match(portal,/profile\.store_id!==conversation\.store_id/);
  assert.match(portal,/profile\.store_id!==store\.id/);
  assert.match(portal,/store\.status!=='active'\|\|!store\.portal_enabled/);
  assert.match(portal,/origin==='master_transfer'\?'Transferência Master':origin/);
});

test('UI exposes strategies, exclusions, validity and safe queue',()=>{
  assert.match(ui,/Rodízio uniforme/);
  assert.match(ui,/Responsável fixo/);
  assert.match(ui,/Excluir do recebimento nesta regra/);
  assert.match(ui,/Fila não distribuída/);
  assert.match(ui,/Início opcional/);
  assert.match(ui,/Fim opcional/);
});

test('UI uses explicit high-contrast form and selection states',()=>{
  assert.match(ui,/text-zinc-950 placeholder:text-zinc-500/);
  assert.match(ui,/border-red-400 bg-red-50 text-red-800/);
  assert.match(ui,/border-blue-400 bg-blue-50 text-blue-950/);
  assert.match(ui,/disabled:bg-zinc-300 disabled:text-zinc-600/);
  assert.match(ui,/text-amber-950/);
});
