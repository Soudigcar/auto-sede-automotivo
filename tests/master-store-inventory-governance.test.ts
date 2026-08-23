import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const safeRoute = readFileSync('src/app/api/store-stock-safe/route.ts', 'utf8');
const nextConfig = readFileSync('next.config.ts', 'utf8');
const selectorPage = readFileSync('src/app/master/stores/stock/page.tsx', 'utf8');
const detailPage = readFileSync('src/app/master/stores/stock/[slug]/page.tsx', 'utf8');
const storesLayout = readFileSync('src/app/master/stores/layout.tsx', 'utf8');
const storesAdminPage = readFileSync('src/app/master/stores/page.tsx', 'utf8');

test('todo acesso externo ao /api/store-stock passa pelo guard antes do handler legado', () => {
  assert.match(nextConfig, /source:\s*'\/api\/store-stock'/);
  assert.match(nextConfig, /destination:\s*'\/api\/store-stock-safe'/);
  assert.match(nextConfig, /x-store-stock-internal/);
  assert.match(safeRoute, /headers\.set\('x-store-stock-internal', '1'\)/);
});

test('Master exige loja explícita e nunca escolhe tenant a partir do corpo do veículo', () => {
  assert.match(safeRoute, /resolveMasterStore\(supabase, slug\)/);
  assert.match(safeRoute, /\.eq\('slug', slug\)\.eq\('status', 'active'\)/);
  assert.match(safeRoute, /store_id:\s*store\.id/);
});

test('vínculo cross-tenant bloqueia leitura e mutações do Master', () => {
  assert.match(safeRoute, /String\(vehicle\.store_id \|\| ''\) !== storeId/);
  assert.match(safeRoute, /Conflito de isolamento detectado/);
  assert.match(safeRoute, /\.eq\('id', link\.imported_vehicle_id\)\.eq\('store_id', store\.id\)/);
  assert.match(safeRoute, /\.eq\('id', vehicleId\)\.eq\('store_id', store\.id\)/);
});

test('ações Master de estoque deixam trilha de auditoria', () => {
  assert.match(safeRoute, /from\('audit_logs'\)\.insert/);
  assert.match(safeRoute, /user_role:\s*'master'/);
  assert.match(safeRoute, /action_type:\s*`master_stock_\$\{action\}`/);
  assert.match(safeRoute, /integrity_level:\s*'trusted_server'/);
});

test('Master permanece em rota própria e não navega para portal da loja', () => {
  assert.match(selectorPage, /href=\{`\/master\/stores\/stock\/\$\{encodeURIComponent\(store\.slug\)\}`\}/);
  assert.doesNotMatch(selectorPage, /href=\{`\/loja\/\$\{encodeURIComponent\(store\.slug\)\}\/estoque`\}/);
  assert.match(detailPage, /data-master-stock-shell/);
  assert.match(detailPage, /Gestão Master/);
  assert.match(detailPage, /<StoreStockPage \/>/);
  assert.match(detailPage, /href="\/master\/stores\/stock"/);
});

test('menu Master permanece no estoque e separa central de estoque da administração de lojas', () => {
  assert.match(storesLayout, /href="\/master\/stores\/stock"/);
  assert.match(storesLayout, /> Lojas & Estoque<\/Link>/);
  assert.match(storesLayout, /href="\/master\/stores"/);
  assert.match(storesLayout, /> Administrar lojas<\/Link>/);
  assert.match(selectorPage, /href="\/master\/stores"/);
  assert.match(selectorPage, /Administrar lojas/);
  assert.match(storesAdminPage, /Cadastrar loja/);
  assert.match(storesAdminPage, /Anexar estoque/);
});

test('importação Master reutiliza revisão por IA e preserva fotos técnicas', () => {
  assert.match(safeRoute, /reviewVehicleImportWithOpenAI/);
  assert.match(safeRoute, /mergeImportedVehicle/);
  assert.match(safeRoute, /image_urls:\s*technical\.image_urls/);
  assert.match(safeRoute, /master_import_with_ai/);
});
