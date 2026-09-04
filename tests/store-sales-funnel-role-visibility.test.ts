import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const pipelineRoute = readFileSync('src/app/api/store/portal/pipeline/route.ts', 'utf8');
const dashboardRoute = readFileSync('src/app/api/store/portal/dashboard/route.ts', 'utf8');
const pipelineCockpit = readFileSync('src/components/StorePipelineCockpitUx.tsx', 'utf8');
const pipelinePage = readFileSync('src/app/loja/[slug]/pipeline/page.tsx', 'utf8');
const storeLayout = readFileSync('src/app/loja/[slug]/layout.tsx', 'utf8');
const storePortal = readFileSync('src/lib/server/storePortal.ts', 'utf8');

test('pipeline preserves current-owner scope and only adds historical confirmed sales by commercial role', () => {
  assert.match(pipelineRoute, /function applyPipelineLeadScope/);
  assert.match(pipelineRoute, /role === 'pre_sales'.*'pre_sales_user_id'/s);
  assert.match(pipelineRoute, /role === 'seller'.*'seller_user_id'/s);
  assert.match(pipelineRoute, /role === 'prospector'.*'captured_by_user_id'/s);
  assert.match(pipelineRoute, /assigned_user_id\.eq\.\$\{userId\},and\(status\.eq\.sale_confirmed,\$\{participantField\}\.eq\.\$\{userId\}\)/);
  assert.match(pipelineRoute, /access_mode: accessMode/);
  assert.match(pipelineRoute, /can_operate: accessMode === 'current_owner'/);
});

test('global operational and WhatsApp authorization remains current-owner only', () => {
  assert.match(storePortal, /lead\?\.assigned_user_id===profile\.id/);
  assert.match(storePortal, /return query\.eq\('assigned_user_id',userId\)/);
  assert.doesNotMatch(storePortal, /historical_sale/);
});

test('dashboard counts attendance as a historical milestone across current and legacy audit formats', () => {
  assert.match(dashboardRoute, /from\('lead_activity_logs'\)/);
  assert.match(dashboardRoute, /or\('activity_type\.eq\.showed_up_marked,to_status\.eq\.showed_up'\)/);
  assert.match(dashboardRoute, /const showedUpLeadIds = new Set<string>/);
  assert.match(dashboardRoute, /if \(event\?\.lead_id\) showedUpLeadIds\.add/);
  assert.match(dashboardRoute, /showed_up: showedUpLeadIds\.size/);
  assert.doesNotMatch(dashboardRoute, /showed_up: statusCount\('showed_up'\)/);
});

test('pipeline exposes the same historical attendance milestone without changing current stage status', () => {
  assert.match(pipelineRoute, /from\('lead_activity_logs'\)/);
  assert.match(pipelineRoute, /or\('activity_type\.eq\.showed_up_marked,to_status\.eq\.showed_up'\)/);
  assert.match(pipelineRoute, /has_showed_up: showedUpLeadIds\.has\(String\(lead\.id\)\)/);
  assert.doesNotMatch(pipelineRoute, /status:\s*'showed_up'/);
});

test('cockpit uses historical attendance for KPI while stage columns remain current-state', () => {
  assert.match(pipelineCockpit, /has_showed_up\?: boolean/);
  assert.match(pipelineCockpit, /visibleLeads\.filter\(\(lead\) => lead\.has_showed_up === true\)\.length/);
  assert.match(pipelineCockpit, /lead\.status === stage\.systemKey/);
  assert.doesNotMatch(storeLayout, /StorePipelineHistoricalAttendanceKpi/);
});

test('responsible filter keeps active leads by current owner and confirmed sales by any commercial participant', () => {
  assert.match(pipelineCockpit, /function matchesResponsible/);
  assert.match(pipelineCockpit, /lead\.status === 'sale_confirmed'/);
  assert.match(pipelineCockpit, /lead\.assigned_user_id, lead\.seller_user_id, lead\.pre_sales_user_id, lead\.captured_by_user_id/);
  assert.match(pipelineCockpit, /return lead\.assigned_user_id === selectedResponsible/);
  assert.match(pipelinePage, /function matchesSelectedResponsible/);
  assert.match(pipelinePage, /lead\.status === 'sale_confirmed'/);
  assert.match(pipelinePage, /lead\.assigned_user_id, lead\.seller_user_id, lead\.pre_sales_user_id, lead\.captured_by_user_id/);
  assert.match(pipelinePage, /return lead\.assigned_user_id === selectedResponsible/);
  assert.match(pipelinePage, /leads\.filter\(\(lead\) => matchesSelectedResponsible\(lead, selectedResponsible\)\)/);
});

test('historical confirmed sales are visible but non-operable for non-current owners', () => {
  assert.match(pipelinePage, /function canOperateLead/);
  assert.match(pipelinePage, /lead\.can_operate !== false/);
  assert.match(pipelinePage, /historicalSaleReadonlyMessage/);
  assert.match(pipelinePage, /if \(!requireOperable\(lead\)\)/);
  assert.match(pipelinePage, /draggable=\{!readOnly\}/);
  assert.match(pipelinePage, /Venda histórica · somente leitura/);
  assert.match(pipelinePage, /visibleLeads\.filter\(\(\{ lead \}\) => canOperateLead\(lead\)\)/);
  assert.match(pipelinePage, /disabled=\{busy \|\| readOnly\}/);
});
