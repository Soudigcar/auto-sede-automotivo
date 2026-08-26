import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const api = fs.readFileSync('src/app/api/master/base-lead-private-transfer/route.ts', 'utf8');
const ui = fs.readFileSync('src/app/master/transferencia-leads/page.tsx', 'utf8');
const migration = fs.readFileSync('supabase/migrations/20260825001000_master_lead_transfer_privacy.sql', 'utf8');
const storePipeline = fs.readFileSync('src/app/api/store/portal/pipeline/route.ts', 'utf8');
const storeLead = fs.readFileSync('src/app/api/store/portal/pipeline/lead/route.ts', 'utf8');
const storeWhatsapp = fs.readFileSync('src/app/api/store/portal/pipeline/whatsapp/route.ts', 'utf8');

test('private transfer is Master-only, confirmed and Preview write-closed', () => {
  assert.match(api, /requireMaster/);
  assert.match(api, /Acesso restrito ao Master/);
  assert.match(api, /process\.env\.VERCEL_ENV === 'preview'/);
  assert.match(api, /Preview está em modo somente leitura para transferência Master/);
  assert.match(api, /confirmation[^\n]+TRANSFERIR/);
});

test('private transfer bypasses historical event participation and store routing rules', () => {
  assert.doesNotMatch(api, /store_event_participations/);
  assert.doesNotMatch(api, /matchingRoutingRule/);
  assert.doesNotMatch(api, /lead_routing_rules/);
  assert.doesNotMatch(api, /participação ativa no evento/);
});

test('sale completed stays protected while lost leads are not globally blocked', () => {
  assert.match(api, /Venda concluída/);
  assert.match(api, /sale_confirmed/);
  assert.doesNotMatch(api, /FINAL_BASE_STATUSES/);
  assert.doesNotMatch(api, /String\(lead\.status \|\| ''\) === 'Perdido'/);
  assert.match(migration, /v_base\.status = 'Venda concluída'/);
  assert.doesNotMatch(migration, /v_base\.status in \('Venda concluída','Perdido'\)/);
});

test('origin constraint keeps every audited value and adds only master_transfer', () => {
  for (const value of [
    'street_survey','quick_registration','manual','event_landing','Facebook Lead Ads','facebook_lead_ads',
    'WhatsApp Oficial','whatsapp_official','WATI / Click-to-WhatsApp','wati_leads','WATI','marketplace_site',
    'Umbler Talk / WhatsApp','umbler_talk','inventory_sale_door','inventory_sale_internet','inventory_sale_event'
  ]) {
    assert.match(migration, new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.match(migration, /'master_transfer'::text/);
  assert.match(migration, /v_current_definition is distinct from v_expected_definition/);
  assert.match(migration, /migration abortada/);
  assert.match(migration, /validate constraint leads_origin_check/);
});

test('operational lead is sanitized for the receiving store', () => {
  assert.match(migration, /event_id = null/);
  assert.match(migration, /origin = 'master_transfer'/);
  assert.match(migration, /assignment_source = 'master_transfer'/);
  assert.match(migration, /notes = 'Lead transferido pelo Master\.'/);
  assert.match(migration, /assigned_user_id = null/);
  assert.match(migration, /assigned_user_role = null/);
  assert.match(migration, /scheduled_at = null/);
  assert.match(migration, /lost_reason = null/);
  assert.match(migration, /'operational_origin','master_transfer'/);
  assert.match(migration, /'operational_event_id',null/);
});

test('Master Base preserves source, event, campaign and complete pre-transfer context', () => {
  assert.match(migration, /'original_event_id',v_base\.event_id/);
  assert.match(migration, /'original_source',v_base\.source/);
  assert.match(migration, /'original_campaign_id',v_base\.campaign_id/);
  assert.match(migration, /'original_campaign_name',v_base\.campaign_name/);
  assert.match(migration, /'master_transfer_history'/);
  assert.match(migration, /'previous_operational',jsonb_build_object/);
  assert.match(migration, /'scheduled_at',v_previous_scheduled_at/);
  assert.match(migration, /'appointment_notes',v_previous_appointment_notes/);
  assert.match(migration, /'appointment_cancelled_reason',v_previous_appointment_cancelled_reason/);
  assert.match(migration, /'lost_reason',v_previous_lost_reason/);

  const baseUpdate = migration.match(/update public\.leads_base[\s\S]*?where id = v_base\.id;/)?.[0] || '';
  assert.doesNotMatch(baseUpdate, /\bsource\s*=/);
  assert.doesNotMatch(baseUpdate, /\bevent_id\s*=/);
  assert.doesNotMatch(baseUpdate, /\bcampaign_id\s*=/);
  assert.doesNotMatch(baseUpdate, /\bcampaign_name\s*=/);
});

test('RPC is service-role only and transactionally locks the Base lead', () => {
  assert.match(migration, /from public\.leads_base[\s\S]*for update/);
  assert.match(migration, /set_config\('app\.lead_routing_explicit','on',true\)/);
  assert.match(migration, /revoke all on function public\.master_transfer_base_lead_to_store\(uuid,uuid,uuid\) from public/);
  assert.match(migration, /from anon/);
  assert.match(migration, /from authenticated/);
  assert.match(migration, /grant execute on function public\.master_transfer_base_lead_to_store\(uuid,uuid,uuid\) to service_role/);
});

test('selection remains server validated and execution is bounded to 100 leads per batch', () => {
  assert.match(api, /resolveAllFilteredLeadIds/);
  assert.match(api, /MAX_FILTERED_SELECTION = 10000/);
  assert.match(api, /EXECUTION_BATCH_SIZE = 100/);
  assert.match(api, /A execução aceita no máximo/);
  assert.match(ui, /EXECUTION_BATCH_SIZE = 100/);
  assert.match(ui, /chunks\(eligibleLeadIds, EXECUTION_BATCH_SIZE\)/);
  assert.match(ui, /dry_run: true/);
  assert.match(ui, /dry_run: false/);
});

test('receiving-store primary surfaces consume operational leads and not Master Base provenance', () => {
  assert.match(storePipeline, /\.from\('leads'\)/);
  assert.match(storePipeline, /'origin'/);
  assert.doesNotMatch(storePipeline, /\.from\('leads_base'\)/);

  assert.match(storeLead, /\.from\('leads'\)/);
  assert.match(storeLead, /'event_id'/);
  assert.match(storeLead, /'origin'/);
  assert.doesNotMatch(storeLead, /\.from\('leads_base'\)/);

  assert.match(storeWhatsapp, /\.from\('leads'\)/);
  assert.match(storeWhatsapp, /\.eq\('store_id', context\.store\.id\)/);
  assert.doesNotMatch(storeWhatsapp, /\.from\('leads_base'\)/);
});

test('Preview console explains privacy boundary before transfer', () => {
  assert.match(ui, /Distribuição multiloja de leads/);
  assert.match(ui, /Origem, evento, campanha, loja anterior e histórico ficam preservados na Base Master/);
  assert.match(ui, /Transferência Master/);
  assert.match(ui, /evento operacional vazio/);
});
