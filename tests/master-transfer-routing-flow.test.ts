import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const routingMigration = fs.readFileSync('supabase/migrations/20260825111500_master_transfer_obey_destination_routing.sql', 'utf8');
const triggerMigration = fs.readFileSync('supabase/migrations/20260825111800_master_transfer_deferred_routing_trigger.sql', 'utf8');

test('Master transfer routing ignores historical event, campaign and source provenance', () => {
  assert.match(routingMigration, /route_master_transfer_lead_by_rules/);
  assert.match(routingMigration, /historical_provenance_used[^\n]*false/);
  assert.match(routingMigration, /source_key,''\)\)\) = 'master_transfer'/);
  assert.match(routingMigration, /r\.match_type = 'default'/);
  assert.doesNotMatch(routingMigration, /r\.match_type = 'event' and r\.event_id = v_lead\.event_id/);
  assert.doesNotMatch(routingMigration, /lb\.campaign_id/);
  assert.doesNotMatch(routingMigration, /lb\.campaign_name/);
  assert.doesNotMatch(routingMigration, /lb\.source/);
});

test('Master transfer routing keeps the same store eligibility and round-robin safeguards', () => {
  assert.match(routingMigration, /u\.store_id = v_lead\.assigned_store_id/);
  assert.match(routingMigration, /u\.status = 'active'/);
  assert.match(routingMigration, /u\.receives_leads = true/);
  assert.match(routingMigration, /u\.max_open_leads is null/);
  assert.match(routingMigration, /lead_routing_rule_state/);
  assert.match(routingMigration, /routed_count = routed_count \+ 1/);
  assert.match(routingMigration, /v_next_position/);
  assert.match(routingMigration, /assignment_source = 'routing_rule'/);
});

test('routing is deferred until transfer sanitization finishes and remains transactional', () => {
  assert.match(triggerMigration, /create constraint trigger trg_route_master_transfer_after_sanitization/);
  assert.match(triggerMigration, /deferrable initially deferred/);
  assert.match(triggerMigration, /when \(new\.origin = 'master_transfer'\)/);
  assert.match(triggerMigration, /perform public\.route_master_transfer_lead_by_rules\(new\.id,v_actor_user_id\)/);
  assert.match(triggerMigration, /action_type = 'master_lead_transfer'/);
});

test('no existing Master-transferred lead is reprocessed by the migration', () => {
  assert.match(triggerMigration, /Existing transferred rows are NOT reprocessed/);
  assert.doesNotMatch(triggerMigration, /update public\.leads\s+set assigned_user_id/i);
  assert.doesNotMatch(triggerMigration, /select public\.route_master_transfer_lead_by_rules/i);
});

test('routing helpers are not exposed to browser roles', () => {
  assert.match(routingMigration, /revoke all on function public\.route_master_transfer_lead_by_rules\(uuid,uuid\) from public/);
  assert.match(routingMigration, /from anon/);
  assert.match(routingMigration, /from authenticated/);
  assert.match(routingMigration, /grant execute on function public\.route_master_transfer_lead_by_rules\(uuid,uuid\) to service_role/);
  assert.match(triggerMigration, /drop function if exists public\.master_transfer_base_lead_to_store_routed/);
});
