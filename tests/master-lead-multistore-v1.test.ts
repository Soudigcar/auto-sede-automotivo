import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration = fs.readFileSync('supabase/migrations/20260825133000_master_lead_multistore_v1.sql', 'utf8');
const routingHardening = fs.readFileSync('supabase/migrations/20260825134500_master_multistore_fail_closed_routing.sql', 'utf8');
const distributionApi = fs.readFileSync('src/app/api/master/base-lead-multistore/route.ts', 'utf8');
const instancesApi = fs.readFileSync('src/app/api/master/base-lead-store-instances/route.ts', 'utf8');
const distributionUi = fs.readFileSync('src/app/master/transferencia-leads/page.tsx', 'utf8');
const pipeline = fs.readFileSync('src/app/api/store/portal/pipeline/route.ts', 'utf8');
const sidebar = fs.readFileSync('src/components/MasterSidebar.tsx', 'utf8');

test('canonical identity never auto-merges by CPF, phone or email', () => {
  assert.match(migration, /only groups rows that already share the exact same routed_lead_id/i);
  assert.doesNotMatch(migration, /normalize_lead_import_phone\(base\.phone\).*canonical_lead_id/s);
  assert.doesNotMatch(migration, /lower\(btrim\(coalesce\(base\.email/s);
  assert.doesNotMatch(migration, /regexp_replace\(coalesce\(base\.cpf/s);
});

test('store instance is unique per canonical lead and store', () => {
  assert.match(migration, /unique\(canonical_lead_id,store_id\)/i);
  assert.match(migration, /unique\(lead_id\)/i);
  assert.match(migration, /lead_store_instances/);
});

test('new store distribution inserts a new operational lead instead of moving legacy lead', () => {
  const core = migration.match(/create or replace function public\.distribute_base_lead_multistore[\s\S]*?revoke all on function public\.distribute_base_lead_multistore/)?.[0] || '';
  assert.match(core, /insert into public\.leads\(/);
  assert.match(core, /'master_transfer'/);
  assert.match(core, /event_id,customer_name/);
  assert.doesNotMatch(core, /update public\.leads\s+set\s+assigned_store_id\s*=\s*v_store\.id/i);
});

test('distribution is idempotent by canonical lead plus store', () => {
  assert.match(migration, /where canonical_lead_id = v_canonical_id\s+and store_id = v_store\.id/s);
  assert.match(migration, /'outcome','already_present'/);
  assert.match(distributionApi, /already_present/);
  assert.match(distributionUi, /não será duplicado/i);
});

test('configured rotation is transactionally fail-closed', () => {
  assert.match(routingHardening, /rename to distribute_base_lead_multistore_impl/);
  assert.match(routingHardening, /p_mode = 'configured_rotation'/);
  assert.match(routingHardening, /v_routing_outcome <> 'assigned'/);
  assert.match(routingHardening, /Roteamento multiloja fail-closed cancelado/);
  assert.match(routingHardening, /revoke all on function public\.distribute_base_lead_multistore_impl.*service_role/);
});

test('legacy distribution and transfer wrappers route through public fail-closed multistore core', () => {
  const bulkWrapper = routingHardening.match(/create or replace function public\.distribute_base_lead_to_store[\s\S]*?revoke all on function public\.distribute_base_lead_to_store/)?.[0] || '';
  const transferWrapper = routingHardening.match(/create or replace function public\.master_transfer_base_lead_to_store[\s\S]*?revoke all on function public\.master_transfer_base_lead_to_store/)?.[0] || '';
  assert.match(bulkWrapper, /distribute_base_lead_multistore/);
  assert.match(transferWrapper, /distribute_base_lead_multistore/);
});

test('multistore control plane is service-role only', () => {
  assert.match(migration, /alter table public\.lead_master_identities enable row level security/);
  assert.match(migration, /alter table public\.lead_store_instances enable row level security/);
  assert.match(migration, /revoke all on table public\.lead_master_identities from public, anon, authenticated/);
  assert.match(migration, /revoke all on table public\.lead_store_instances from public, anon, authenticated/);
  assert.match(routingHardening, /grant execute on function public\.distribute_base_lead_multistore.*to service_role/);
});

test('master_transfer deferred trigger ignores generic unrelated updates', () => {
  assert.match(migration, /tg_op = 'UPDATE'/);
  assert.match(migration, /new\.origin is not distinct from old\.origin/);
  assert.match(migration, /new\.assigned_store_id is not distinct from old\.assigned_store_id/);
  assert.match(migration, /new\.assignment_source is not distinct from old\.assignment_source/);
  assert.match(migration, /app\.master_multistore_explicit_routing/);
});

test('Preview remains write-closed for multistore distribution', () => {
  assert.match(distributionApi, /process\.env\.VERCEL_ENV === 'preview'/);
  assert.match(distributionApi, /Preview está em modo somente leitura/);
  assert.match(distributionApi, /confirmation[^\n]+DISTRIBUIR/);
});

test('Master exposes multistore coverage without exposing instance tables to stores', () => {
  assert.match(instancesApi, /requireMaster/);
  assert.match(instancesApi, /summary/);
  assert.match(instancesApi, /multistore_leads/);
  assert.match(sidebar, /MasterLeadStoreCoverage/);
  assert.match(sidebar, /Distribuir Leads/);
});

test('Pipeline WhatsApp enrichment is fail-soft', () => {
  assert.match(pipeline, /WhatsApp is enrichment for the Pipeline/);
  assert.match(pipeline, /whatsappEnrichment = 'degraded'/);
  assert.match(pipeline, /returning leads without blocking Pipeline/);
  assert.match(pipeline, /enrichment:/);
});

test('store-facing multistore lead uses operational privacy context', () => {
  assert.match(migration, /event_id,customer_name,customer_phone/);
  assert.match(migration, /'master_transfer'/);
  assert.match(migration, /'historical_provenance_used_for_assignment',false/);
  assert.doesNotMatch(distributionApi, /store_event_participations/);
  assert.doesNotMatch(distributionApi, /campaign_name/);
});
