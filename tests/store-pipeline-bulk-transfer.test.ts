import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const pipelinePage = readFileSync('src/app/loja/[slug]/pipeline/page.tsx', 'utf8');
const pipelineRoute = readFileSync('src/app/api/store/portal/pipeline/route.ts', 'utf8');
const transferRoute = readFileSync('src/app/api/store/lead-transfer/route.ts', 'utf8');

test('only Master and Store Manager receive the bulk-transfer capability', () => {
  assert.match(pipelineRoute, /can_bulk_transfer: context\.role === 'master' \|\| context\.role === 'store'/);
  assert.match(transferRoute, /const bulkActorRoles = \['master', 'store'\]/);
  assert.match(transferRoute, /bulkRequested && !bulkActorRoles\.includes\(profile\.role\)/);
});

test('bulk transfer validates, deduplicates and caps the selected lead ids', () => {
  assert.match(transferRoute, /const bulkRequested = Array\.isArray\(body\?\.lead_ids\)/);
  assert.match(transferRoute, /Array\.from\(new Set\(rawIds/);
  assert.match(transferRoute, /const maxBulkTransferLeads = 200/);
  assert.match(transferRoute, /leadIds\.length > maxBulkTransferLeads/);
});

test('bulk transfer fails closed outside the authorized store portfolio', () => {
  assert.match(transferRoute, /leads\.some\(\(lead: any\) => !lead\.assigned_store_id \|\| !canAccessLead\(profile, lead\)\)/);
  assert.match(transferRoute, /storeIds\.length !== 1/);
  assert.match(transferRoute, /\.in\('id', transferableLeadIds\)/);
  assert.match(transferRoute, /\.eq\('assigned_store_id', storeId\)/);
  assert.match(transferRoute, /loadTeam\(supabase, storeId\)/);
});

test('bulk transfer preserves commercial ownership snapshots and audits every changed lead', () => {
  assert.match(transferRoute, /if \(target\?\.role === 'pre_sales'\) updatePayload\.pre_sales_user_id = target\.id/);
  assert.match(transferRoute, /if \(target\?\.role === 'seller'\) updatePayload\.seller_user_id = target\.id/);
  assert.match(transferRoute, /updatePayload\.captured_by_user_id = target\.id/);
  assert.match(transferRoute, /sale_closer_preserved_in_sales: true/);
  assert.match(transferRoute, /registered_from: bulkRequested \? 'pipeline_bulk_lead_transfer' : 'pipeline_lead_transfer'/);
  assert.match(transferRoute, /auditRows\.map/);
  assert.match(transferRoute, /from\('lead_activity_logs'\)/);
  assert.match(transferRoute, /from\('lead_activities'\)/);
  assert.match(transferRoute, /from\('audit_logs'\)/);
});

test('list mode offers controlled multi-selection and an explicit destination confirmation', () => {
  assert.match(pipelinePage, /data-pipeline-bulk-transfer-bar="true"/);
  assert.match(pipelinePage, /Selecionar todos os exibidos/);
  assert.match(pipelinePage, /Transferir selecionados/);
  assert.match(pipelinePage, /selectedLeadIds\.length/);
  assert.match(pipelinePage, /lead_ids: selectedLeadIds/);
  assert.match(pipelinePage, /value="__unselected__" disabled/);
  assert.match(pipelinePage, /A etapa comercial não será alterada/);
});

test('list mode identifies the current responsible member beside every lead', () => {
  assert.match(pipelineRoute, /team,/);
  assert.match(pipelinePage, /team: Array<\{ id: string; full_name: string; role: string; role_label: string \}>/);
  assert.match(pipelinePage, /<span>Lead<\/span><span>Responsável<\/span><span>Origem<\/span>/);
  assert.match(pipelinePage, /const responsibleMember = responsibleId \? teamById\.get\(responsibleId\) \|\| null : null/);
  assert.match(pipelinePage, /Fila geral da loja/);
  assert.match(pipelinePage, /Responsável não localizado/);
});

test('the existing one-at-a-time transfer remains available', () => {
  assert.match(pipelinePage, /body: JSON\.stringify\(\{ lead_id: transferLead\.id, target_user_id: targetUserId \|\| null \}\)/);
  assert.match(pipelinePage, /<CompactMenuAction label="Transferir"/);
});
