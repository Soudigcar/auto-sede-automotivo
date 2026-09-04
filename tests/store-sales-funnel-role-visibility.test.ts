import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const pipelineRoute = readFileSync('src/app/api/store/portal/pipeline/route.ts', 'utf8');
const dashboardRoute = readFileSync('src/app/api/store/portal/dashboard/route.ts', 'utf8');
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

test('dashboard counts attendance as a historical milestone instead of only the current lead status', () => {
  assert.match(dashboardRoute, /from\('lead_activity_logs'\)/);
  assert.match(dashboardRoute, /eq\('activity_type', 'showed_up_marked'\)/);
  assert.match(dashboardRoute, /const showedUpLeadIds = new Set<string>/);
  assert.match(dashboardRoute, /if \(event\?\.lead_id\) showedUpLeadIds\.add/);
  assert.match(dashboardRoute, /showed_up: showedUpLeadIds\.size/);
  assert.doesNotMatch(dashboardRoute, /showed_up: statusCount\('showed_up'\)/);
});

test('dashboard retains confirmed sales for the SDR, seller or prospecting user that participated', () => {
  assert.match(dashboardRoute, /function applyDashboardLeadScope/);
  assert.match(dashboardRoute, /assigned_user_id\.eq\.\$\{userId\},and\(status\.eq\.sale_confirmed,\$\{participantField\}\.eq\.\$\{userId\}\)/);
  assert.match(dashboardRoute, /vendas confirmadas com sua participação/);
});
