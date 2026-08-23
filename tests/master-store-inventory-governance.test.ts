import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const stockRoute = readFileSync('src/app/api/store-stock/route.ts', 'utf8');
const storesList = readFileSync('src/components/PermanentStoresByEventList.tsx', 'utf8');
const masterDetail = readFileSync('src/app/master/stores/stock/[slug]/page.tsx', 'utf8');

test('Master stock requires explicit store context and store users stay bound to their own store', () => {
  assert.match(stockRoute, /role === 'master' && !slug/);
  assert.match(stockRoute, /role === 'master'[\s\S]*?storeQuery\.eq\('slug', slug\)/);
  assert.match(stockRoute, /role === 'store'[\s\S]*?storeQuery\.eq\('id', profile\.store_id\)/);
  assert.match(stockRoute, /role === 'store' && slug && store\.slug !== slug/);
});

test('linked vehicles are fail-closed when store_id is absent or different', () => {
  assert.match(stockRoute, /function tenantConflictError\(\)/);
  assert.match(stockRoute, /\.eq\('id', vehicleId\)[\s\S]*?\.eq\('store_id', storeId\)/);
  assert.match(stockRoute, /\.in\('id', vehicleIds\)[\s\S]*?\.eq\('store_id', context\.store\.id\)/);
  assert.match(stockRoute, /missingTenantVehicle/);
  assert.match(stockRoute, /if \(!vehicle\) throw tenantConflictError\(\)/);
});

test('all existing site_vehicle mutations repeat the selected store_id boundary', () => {
  assert.match(stockRoute, /update\(\{ source_url: vehicleUrl[\s\S]*?\.eq\('id', link\.imported_vehicle_id\)[\s\S]*?\.eq\('store_id', store\.id\)/);
  assert.match(stockRoute, /update\(vehiclePayload\)[\s\S]*?\.eq\('id', vehicleId\)[\s\S]*?\.eq\('store_id', store\.id\)/);
  assert.match(stockRoute, /show_on_landing: false[\s\S]*?\.eq\('id', link\.imported_vehicle_id\)[\s\S]*?\.eq\('store_id', store\.id\)/);
});

test('Master actions use trusted server audit trail before mutations', () => {
  assert.match(stockRoute, /from\('audit_logs'\)\.insert/);
  assert.match(stockRoute, /user_role: 'master'/);
  assert.match(stockRoute, /action_type: `master_stock_\$\{action\}`/);
  assert.match(stockRoute, /entity_type: 'store_inventory'/);
  assert.match(stockRoute, /integrity_level: 'trusted_server'/);
  assert.match(stockRoute, /phase: 'authorized_request'/);
});

test('Master import and reimport retain AI review flow', () => {
  assert.match(stockRoute, /reviewVehicleImportWithOpenAI/);
  assert.match(stockRoute, /mergeImportedVehicle/);
  assert.match(stockRoute, /master_import_with_ai/);
  assert.match(stockRoute, /estoque administrado pelo Master/);
});

test('Master remains on native Master route instead of store portal', () => {
  assert.match(storesList, /\/master\/stores\/stock\/\$\{encodeURIComponent\(store\.slug\)\}/);
  assert.doesNotMatch(storesList, /href=\{`\/loja\/\$\{store\.slug\}\/estoque`\}/);
  assert.match(masterDetail, /<MasterSidebar active="Lojas & Estoque" \/>/);
  assert.match(masterDetail, /data-master-stock-engine/);
  assert.match(masterDetail, /<StoreStockPage \/>/);
  assert.match(masterDetail, /href="\/master\/stores\/events"/);
  assert.match(masterDetail, /data-master-stock-engine\] > main > section > aside/);
});
