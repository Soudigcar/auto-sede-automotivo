import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import { extractTargetVehicle } from '../src/lib/server/vehicleTargetExtraction';
import { mergeImportedVehicle } from '../src/lib/server/vehicleImportAi';
import * as years from '../src/lib/vehicleYears';
import * as drafts from '../src/lib/server/vehicleImportDraft';

const url = 'https://g3premium.com.br/carros/Toyota/Yaris/Ha-Xls15/Toyota-Yaris-Ha-Xls15-2025-Bras%C3%ADlia-Distrito-Federal-8347873.html';
const page = extractTargetVehicle(readFileSync('tests/fixtures/g3-yaris.html', 'utf8'), url);
const source = readFileSync('src/app/api/store-stock/route.ts', 'utf8');

function harness(role: 'master' | 'store') {
  let row: any = { id: 'link', store_id: 'store', vehicle_url: url, status: 'reviewing', metadata: {}, updated_at: '2026-01-01T00:00:00.000Z' };
  const counters = { ai: 0, images: 0, writes: 0, fetch: 0 };
  let onReview: (() => void) | undefined;
  const profile = { id: 'actor', role, status: 'active', store_id: 'store', auth_user_id: 'auth' };
  const store = { id: 'store', slug: 'g3-premium', status: 'active' };
  const copy = (x: any) => JSON.parse(JSON.stringify(x));
  function query(table: string) {
    const filters: Array<[string, unknown]> = [];
    let changes: any = null;
    let insertion = false;
    const q: any = {
      select() { return q; }, eq(k: string, v: unknown) { filters.push([k, v]); return q; },
      is(k: string, v: unknown) { filters.push([k, v]); return q; },
      update(v: any) { changes = v; return q; }, insert() { insertion = true; return q; },
      async maybeSingle() { return execute(); }, async single() { return execute(); },
      then(resolve: any, reject: any) { return Promise.resolve(execute()).then(resolve, reject); }
    };
    function execute() {
      if (table === 'audit_logs' && insertion) return { data: null, error: null };
      const item = table === 'users' ? profile : table === 'stores' ? store : table === 'store_vehicle_link_submissions' ? row : null;
      if (!item || filters.some(([k,v]) => (item[k] ?? null) !== v)) return { data: null, error: null };
      if (changes) { row = { ...row, ...copy(changes) }; counters.writes++; return { data: { id: row.id, updated_at: row.updated_at }, error: null }; }
      return { data: copy(item), error: null };
    }
    return q;
  }
  const client = { auth: { getUser: async () => ({ data: { user: { id: 'auth' } } }) }, from: query };
  const dependencies: Record<string, any> = {
    'next/server': { NextResponse: { json: (value: any, init?: ResponseInit) => Response.json(value, init) } },
    '@supabase/supabase-js': { createClient: () => client },
    '@/lib/server/siteVehicleImporter': { importDistinctVehicleImages: async () => { counters.images++; return { uploadedImages: ['https://example.invalid/synthetic.jpg'] }; } },
    '@/lib/server/vehicleImportDraft': drafts,
    '@/lib/vehicleYears': years,
    '@/lib/server/vehicleImportAi': {
      mergeImportedVehicle,
      reviewVehicleImportWithOpenAI: async (input: any) => {
        counters.ai++; onReview?.();
        return { ok: true, model: 'synthetic', vehicle: { ...input, price: 89900, mileage: '242.145 Km' }, optimized_description: 'Synthetic optimized text', warnings: [], conflicts: [] };
      }
    }
  };
  const exports: any = {};
  // Execute the actual route with every network/service boundary replaced. No runtime credentials are used.
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const fakeProcess = { env: { NEXT_PUBLIC_SUPABASE_URL: 'https://example.invalid', SUPABASE_SERVICE_ROLE_KEY: 'synthetic' } };
  const fakeFetch = async (destination: string, init: any) => {
    assert.equal(destination, 'https://preview.invalid/api/site-import');
    assert.equal(JSON.parse(init.body).action, 'preview');
    counters.fetch++; return Response.json(page);
  };
  new Function('exports', 'require', 'process', 'fetch', compiled)(exports, (id: string) => {
    assert.ok(id in dependencies, `Unexpected dependency: ${id}`); return dependencies[id];
  }, fakeProcess, fakeFetch);
  const send = async (action: string, extra: any = {}) => {
    const response = await exports.POST(new Request('https://preview.invalid/api/store-stock', { method: 'POST', headers: { Authorization: 'Bearer synthetic', 'Content-Type': 'application/json' }, body: JSON.stringify({ action, slug: 'g3-premium', link_id: 'link', ...extra }) }));
    return { status: response.status, body: await response.json() };
  };
  return { send, counters, get row() { return row; }, setRow(v: any) { row = v; }, duringReview(fn: () => void) { onReview = fn; } };
}

for (const role of ['master', 'store'] as const) {
  test(`${role}: actual stock route imports correct draft and preserves source independently of AI`, async () => {
    const h = harness(role);
    const result = await h.send('import-data');
    assert.equal(result.status, 200);
    assert.equal(result.body.imported.price, 106900);
    assert.equal(result.body.imported.mileage, '33.444 Km');
    assert.equal(result.body.imported.transmission, 'CVT');
    assert.equal(h.row.metadata.source_description, page.source_description);
    assert.equal(h.row.metadata.imported_preview.description, page.source_description);
    assert.equal(h.row.metadata.optimized_description, 'Synthetic optimized text');
    assert.equal(h.row.imported_vehicle_id, undefined);
    assert.equal(h.row.status, 'reviewing');
    const repeated = await h.send('import-data');
    assert.equal(repeated.status, 200);
    assert.deepEqual(repeated.body.imported, result.body.imported);
    assert.equal(h.counters.ai, 1);
    assert.equal(h.counters.images, 1);
  });
  test(`${role}: saved manual fields survive reimport through the actual route`, async () => {
    const h = harness(role);
    const imported = await h.send('import-data');
    const draft = { ...imported.body.imported, price: 105000, transmission: 'Manual', description: 'Confirmed manually' };
    assert.equal((await h.send('save-draft', draft)).status, 200);
    const repeated = await h.send('retry-import');
    assert.equal(repeated.status, 200);
    assert.equal(repeated.body.imported.price, 105000);
    assert.equal(repeated.body.imported.transmission, 'Manual');
    assert.equal(repeated.body.imported.description, 'Confirmed manually');
  });
  test(`${role}: published vehicles are not automatically reimported`, async () => {
    const h = harness(role); h.setRow({ ...h.row, status: 'published' });
    assert.equal((await h.send('import-data')).status, 422);
    assert.equal(h.counters.writes, 0);
    assert.equal(h.counters.fetch, 0);
  });
}

test('a concurrent manual edit wins over in-flight import and its error handler', async () => {
  const h = harness('store');
  h.duringReview(() => h.setRow({ ...h.row, updated_at: '2099-01-01T00:00:00.000Z', metadata: { imported_preview: { price: 105000 } } }));
  assert.equal((await h.send('import-data')).status, 422);
  assert.equal(h.row.metadata.imported_preview.price, 105000);
  assert.equal(h.row.updated_at, '2099-01-01T00:00:00.000Z');
});

test('store users cannot switch the target store by changing slug', async () => {
  const h = harness('store');
  assert.equal((await h.send('import-data', { slug: 'another-store' })).status, 403);
  assert.equal(h.counters.writes, 0);
});
