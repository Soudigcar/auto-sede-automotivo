import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sidebar = fs.readFileSync('src/components/MasterSidebar.tsx', 'utf8');
const base = fs.readFileSync('src/app/master/base/page.tsx', 'utf8');
const transfer = fs.readFileSync('src/app/master/transferencia-leads/page.tsx', 'utf8');
const baseLoading = fs.readFileSync('src/app/master/base/loading.tsx', 'utf8');
const transferLoading = fs.readFileSync('src/app/master/transferencia-leads/loading.tsx', 'utf8');

test('Master sidebar does not prefetch every route', () => {
  assert.match(sidebar, /prefetch=\{false\}/);
});

test('Master Base loads leads in bounded pages with an explicit projection', () => {
  assert.match(base, /BASE_PAGE_SIZE = 200/);
  assert.match(base, /BASE_LEAD_SELECT/);
  assert.match(base, /\.range\(offset, offset \+ BASE_PAGE_SIZE - 1\)/);
  assert.doesNotMatch(base, /from\('leads_base'\)\.select\('\*'\)/);
});

test('private transfer screen loads leads in bounded pages with minimal columns', () => {
  assert.match(transfer, /LOAD_PAGE_SIZE = 200/);
  assert.match(transfer, /LEAD_SELECT/);
  assert.match(transfer, /\.range\(offset, offset \+ LOAD_PAGE_SIZE - 1\)/);
  assert.doesNotMatch(transfer, /from\('leads_base'\)\.select\('\*'\)/);
});

test('Base and private transfer expose immediate loading UI', () => {
  assert.match(baseLoading, /animate-pulse/);
  assert.match(transferLoading, /animate-pulse/);
  assert.match(base, /Carregando leads da Base/);
  assert.match(transfer, /Carregando leads/);
});
