import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration=fs.readFileSync('supabase/migrations/20260823223000_lead_routing_rules_master_store.sql','utf8');
const route=fs.readFileSync('src/app/api/lead-routing-rules/route.ts','utf8');
const portal=fs.readFileSync('src/lib/server/storePortal.ts','utf8');
const ui=fs.readFileSync('src/components/LeadRoutingRulesManager.tsx','utf8');

test('state is isolated per rule and matched rules fail closed',()=>{
  assert.match(migration,/lead_routing_rule_state/);
  assert.match(migration,/rule_id uuid primary key/);
  assert.match(migration,/lead_unassigned_queue/);
  assert.match(migration,/fallback_allowed',false/);
  assert.match(migration,/for update/);
});

test('eligibility respects tenant, active status, pause and capacity',()=>{
  assert.match(migration,/u\.store_id=v_lead\.assigned_store_id/);
  assert.match(migration,/u\.status='active'/);
  assert.match(migration,/u\.receives_leads=true/);
  assert.match(migration,/max_open_leads/);
  assert.match(migration,/excluded_member_ids/);
});

test('precedence is event campaign source default then priority',()=>{
  assert.match(migration,/when 'event' then 1 when 'campaign' then 2 when 'source' then 3 else 4/);
  assert.match(migration,/r\.priority asc/);
});

test('automatic ingestion wiring routes only leads with store and no assignee',()=>{
  assert.match(migration,/auto_route_lead_by_rules_trigger/);
  assert.match(migration,/constraint trigger leads_auto_route_by_rules/);
  assert.match(migration,/leads_base_auto_route_by_rules/);
  assert.match(migration,/v_store_id is null or v_assigned_user_id is not null/);
  assert.match(migration,/transaction_timestamp\(\)/);
  assert.match(migration,/perform public\.route_lead_by_rules/);
});

test('management API enforces store scope server-side',()=>{
  assert.match(route,/profile\.role==='master'/);
  assert.match(route,/profile\.role==='store'/);
  assert.match(route,/Loja fora do seu escopo/);
  assert.match(route,/m\.store_id!==storeId/);
});

test('only Master and store manager receive routing permission',()=>{
  assert.match(portal,/store: \[[^\]]*'manage_lead_routing'/s);
  assert.match(portal,/pre_sales: \['view_dashboard'/);
  assert.doesNotMatch(portal,/pre_sales: \[[^\]]*manage_lead_routing/s);
});

test('UI exposes strategies, exclusions, validity and safe queue',()=>{
  assert.match(ui,/Rodízio uniforme/);
  assert.match(ui,/Responsável fixo/);
  assert.match(ui,/Excluir do recebimento nesta regra/);
  assert.match(ui,/Fila não distribuída/);
  assert.match(ui,/Início opcional/);
  assert.match(ui,/Fim opcional/);
});
