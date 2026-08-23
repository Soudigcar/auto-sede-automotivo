import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const stockRoute = readFileSync('src/app/api/store-stock/route.ts', 'utf8');
const storesList = readFileSync('src/components/PermanentStoresByEventList.tsx', 'utf8');
const masterDetail = readFileSync('src/app/master/stores/stock/[slug]/page.tsx', 'utf8');
const masterManager = readFileSync('src/components/MasterStoreStockManager.tsx', 'utf8');

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
  assert.match(masterManager, /action: 'import-data'/);
  assert.match(masterManager, /Reimportando fotos e dados com revisão por IA/);
});

test('Master remains on native Master route instead of store portal', () => {
  assert.match(storesList, /\/master\/stores\/stock\/\$\{encodeURIComponent\(store\.slug\)\}/);
  assert.doesNotMatch(storesList, /href=\{`\/loja\/\$\{store\.slug\}\/estoque`\}/);
  assert.match(masterDetail, /<MasterSidebar active="Lojas & Estoque" \/>/);
  assert.match(masterDetail, /<MasterStoreStockManager \/>/);
  assert.doesNotMatch(masterDetail, /StoreStockPage/);
  assert.match(masterDetail, /href="\/master\/stores\/events"/);
});

test('Master editor uses existing vehicle catalog with manual fallback', () => {
  assert.match(masterManager, /from\('vehicle_catalog_brands'\)/);
  assert.match(masterManager, /from\('vehicle_catalog_models'\)/);
  assert.match(masterManager, /from\('vehicle_catalog_versions'\)/);
  assert.match(masterManager, /from\('vehicle_catalog_configurations'\)/);
  assert.match(masterManager, /list="master-stock-brands"/);
  assert.match(masterManager, /list="master-stock-models"/);
  assert.match(masterManager, /list="master-stock-versions"/);
  assert.match(masterManager, /A entrada manual continua liberada/);
});

test('year fields preserve partial typing and validate only when complete', () => {
  assert.match(masterManager, /function yearDigits\(value: unknown\)/);
  assert.match(masterManager, /replace\(\/\\D\/g, ''\)\.slice\(0, 4\)/);
  assert.match(masterManager, /manufacture_year: yearDigits\(event\.target\.value\)/);
  assert.match(masterManager, /model_year: yearDigits\(event\.target\.value\)/);
  assert.doesNotMatch(masterManager, /onChange=\{\(e\)=>setEditForm\(updateYearField/);
});

test('pending fields are actionable and configuration can populate related fields', () => {
  assert.match(masterManager, /function focusField\(key: string\)/);
  assert.match(masterManager, /Campos pendentes — clique para ir direto ao campo/);
  assert.match(masterManager, /onClick=\{\(\) => focusField\(field\.key\)\}/);
  assert.match(masterManager, /function applyConfiguration\(configurationId: string\)/);
  assert.match(masterManager, /manufacture_year: configuration\.manufacture_year/);
  assert.match(masterManager, /model_year: configuration\.model_year/);
  assert.match(masterManager, /fuel: fuel \|\| current\.fuel/);
  assert.match(masterManager, /transmission: transmission \|\| current\.transmission/);
});
