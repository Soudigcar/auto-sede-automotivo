import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const portalPolicy = readFileSync('src/lib/server/storePortal.ts', 'utf8');
const readonlyRoute = readFileSync('src/app/api/store-stock-readonly/route.ts', 'utf8');
const readonlyPage = readFileSync('src/app/loja/[slug]/estoque-consulta/page.tsx', 'utf8');

test('pre-sales, seller and prospector receive stock view permission without stock mutation permissions', () => {
  for (const role of ['pre_sales', 'seller', 'prospector']) {
    const rolePattern = new RegExp(`${role}: \\[([^\\]]+)\\]`);
    const match = portalPolicy.match(rolePattern);
    assert.ok(match, `permissions for ${role} must exist`);
    assert.match(match[1], /'view_stock'/);
    assert.doesNotMatch(match[1], /'manage_stock'/);
    assert.doesNotMatch(match[1], /'submit_stock_import'/);
  }
});

test('commercial users see Estoque in a dedicated read-only route', () => {
  assert.match(portalPolicy, /key: 'stock', label: 'Estoque', segment: 'estoque-consulta', permission: 'view_stock'/);
  assert.match(portalPolicy, /key: 'stock', label: 'Estoque', segment: 'estoque', permission: 'manage_stock'/);
});

test('read-only stock endpoint is bound to authenticated store_id and exposes no mutation method', () => {
  assert.match(readonlyRoute, /authorizeStorePortal\(request, slug\)/);
  assert.match(readonlyRoute, /READ_ONLY_ROLES/);
  assert.match(readonlyRoute, /context\.permissions\.includes\('view_stock'\)/);
  assert.match(readonlyRoute, /\.eq\('store_id', context\.store\.id\)/);
  assert.match(readonlyRoute, /vehicle\.store_id !== context\.store\.id/);
  assert.doesNotMatch(readonlyRoute, /export async function POST/);
  assert.doesNotMatch(readonlyRoute, /\.insert\(/);
  assert.doesNotMatch(readonlyRoute, /\.update\(/);
  assert.doesNotMatch(readonlyRoute, /\.delete\(/);
});

test('read-only page contains consultation only controls', () => {
  assert.match(readonlyPage, /Somente leitura/);
  assert.match(readonlyPage, /Abrir anúncio/);
  assert.match(readonlyPage, /\/api\/store-stock-readonly\?slug=/);
  assert.doesNotMatch(readonlyPage, /Adicionar e importar/);
  assert.doesNotMatch(readonlyPage, /Reimportar/);
  assert.doesNotMatch(readonlyPage, /Conferir e editar/);
  assert.doesNotMatch(readonlyPage, /Excluir/);
  assert.doesNotMatch(readonlyPage, /Marcar como vendido/);
});
