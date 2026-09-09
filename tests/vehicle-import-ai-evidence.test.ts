import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { extractTargetVehicle } from '../src/lib/server/vehicleTargetExtraction';
import { reviewVehicleImportWithOpenAI, mergeImportedVehicle } from '../src/lib/server/vehicleImportAi';

test('actual AI adapter receives intact source evidence and a simulated response cannot override target numbers', async () => {
  const names = ['OPENAI_API_KEY', 'NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];
  const saved = Object.fromEntries(names.map(k => [k, process.env[k]]));
  const originalFetch = globalThis.fetch;
  const url = 'https://g3premium.com.br/carros/Toyota/Yaris/Ha-Xls15/Toyota-Yaris-Ha-Xls15-2025-Bras%C3%ADlia-Distrito-Federal-8347873.html';
  const page = extractTargetVehicle(readFileSync('tests/fixtures/g3-yaris.html', 'utf8'), url);
  let sent: any;
  try {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    process.env.OPENAI_API_KEY = 'synthetic-test-value';
    globalThis.fetch = async (_url, init) => {
      sent = JSON.parse(JSON.parse(String(init?.body)).input);
      return Response.json({ output_text: JSON.stringify({ vehicle: { ...page.vehicle, price: 89900, mileage: '242.145 Km' }, optimized_description: 'Synthetic optional description', warnings: [], conflicts: [] }) });
    };
    const reviewed = await reviewVehicleImportWithOpenAI({ ...page.vehicle, price: 89900, mileage: '242.145 Km' }, 'synthetic', { source_evidence: page.evidence });
    assert.equal(reviewed.ok, true);
    assert.equal(sent.vehicle.description, page.source_description);
    assert.equal(sent.vehicle.price, 106900);
    assert.equal(sent.vehicle.mileage, '33.444 Km');
    assert.equal(sent.evidence.source.provenance.price.target_entity_match, true);
    const merged = mergeImportedVehicle({ ...page.vehicle, price: 89900 }, reviewed.vehicle, page.evidence);
    assert.equal(merged.price, 106900);
    assert.equal(merged.mileage, '33.444 Km');
  } finally {
    globalThis.fetch = originalFetch;
    for (const key of names) if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key];
  }
});
