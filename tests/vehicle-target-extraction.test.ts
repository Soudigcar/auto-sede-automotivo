import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { extractTargetVehicle } from '../src/lib/server/vehicleTargetExtraction';
import { mergeImportedVehicle } from '../src/lib/server/vehicleImportAi';
import { canReuseImport, confirmedFields, preserveConfirmedFields, resolveEvidenceValues, importDiagnostic } from '../src/lib/server/vehicleImportDraft';

const url = 'https://g3premium.com.br/carros/Toyota/Yaris/Ha-Xls15/Toyota-Yaris-Ha-Xls15-2025-Bras%C3%ADlia-Distrito-Federal-8347873.html';
const fixture = readFileSync('tests/fixtures/g3-yaris.html', 'utf8');
const page = (extra = '', transmission = 'automático CVT', price = '<p>R$ <span>106.900,00</span></p>') => `<article><h1>TOYOTA YARIS HA XLS15</h1><p>Km<br>33.444</p>${price}<h3>Detalhes do Ve&iacute;culo</h3><div>Câmbio ${transmission} de 7 marchas<br>End of source</div>${extra}</article>`;

test('saved G3 HTML reproduces the target, never the related Strada or Outlander', () => {
  const r = extractTargetVehicle(fixture, url);
  assert.deepEqual({ ...r.vehicle, source_url: undefined, description: undefined }, {
    brand: 'TOYOTA', model: 'YARIS', version: 'HA XLS15', manufacture_year: '2024', model_year: '2025', year: '2024/2025', mileage: '33.444 Km', color: 'Branco', fuel: 'Flex', transmission: 'CVT', source_url: undefined, description: undefined
  });
  assert.equal(r.price, 106900);
  assert.notEqual(r.price, 89900);
  assert.notEqual(r.vehicle.mileage, '242.145 Km');
  assert.match(r.source_description, /Câmbio automático CVT/);
  assert.match(r.source_description, /CEP/);
  assert.doesNotMatch(r.source_description, /STRADA|OUTLANDER|Oferta Imperdivel/i);
  for (const field of ['price', 'mileage', 'transmission']) assert.equal(r.evidence.provenance[field].target_entity_match, true);
  assert.ok(r.images.length > 0);
  assert.ok(r.images.every(i => i.includes('8347873_')));
});

for (const [label, expected] of [['Automático', 'Automático'], ['Automática', 'Automático'], ['CVT', 'CVT'], ['automático CVT', 'CVT'], ['Manual', 'Manual'], ['Mecânico', 'Manual'], ['AT', 'Automático'], ['MT', 'Manual']]) {
  test(`explicit transmission ${label}`, () => assert.equal(extractTargetVehicle(page('', label), url).vehicle.transmission, expected));
}

test('no related vehicles, related prices above/below and larger mileage do not change the target', () => {
  const original = extractTargetVehicle(page(), url);
  for (const price of [5000, 89900, 1999999]) {
    const related = `<h3>Veículos <span>Relacionados</span></h3><section><h2>Strada</h2><p>R$ ${price}</p><p>999.999 km</p><img src="https://example.invalid/other.jpg"></section>`;
    const result = extractTargetVehicle(page(related), url);
    assert.equal(result.price, original.price);
    assert.equal(result.vehicle.mileage, original.vehicle.mileage);
    assert.equal(result.evidence.content_hash, original.evidence.content_hash);
  }
});

test('financing installments and down payments cannot become a price', () => {
  const financial = '<div class="financing"><b>R$ 50.000</b></div><p>Entrada R$ 20.000</p><div><span>Entrada</span><b>R$ 30.000</b></div>';
  assert.equal(extractTargetVehicle(page(financial), url).price, 106900);
});

test('long descriptions are complete, and an absent transmission stays absent', () => {
  const description = 'Line with source details<br>'.repeat(800) + 'Câmbio CVT<br>Final source marker';
  const result = extractTargetVehicle(`<article><h1>TOYOTA YARIS</h1><p>Km<br>33.444</p><h3>Detalhes do Veículo</h3><div>${description}</div></article>`, url);
  assert.ok(result.source_description.length > 12000);
  assert.match(result.source_description, /Final source marker$/);
  assert.equal(result.vehicle.transmission, 'CVT');
  assert.equal(extractTargetVehicle(page('', 'não informado'), url).vehicle.transmission, '');
});

const entity = (source = url, price = 106900) => ({ '@type': 'Vehicle', url: source, name: 'TOYOTA YARIS', brand: 'TOYOTA', model: 'YARIS', mileageFromOdometer: { value: 33444 }, offers: { '@type': 'Offer', price }, vehicleTransmission: 'CVT', description: 'Original description' });
const json = (value: unknown, type = 'application/ld+json') => `<script type="${type}">${JSON.stringify(value)}</script>`;

test('ItemList and graph isolate objects by their own identity, not their parent page', () => {
  const other = { ...entity('https://example.invalid/strada', 89900), name: 'FIAT STRADA', mileageFromOdometer: { value: 242145 } };
  const r = extractTargetVehicle(json({ '@type': 'ItemList', itemListElement: [other, entity()] }), url);
  assert.equal(r.price, 106900);
  assert.equal(r.vehicle.mileage, '33.444 Km');
  assert.ok(r.evidence.rejected.some(x => x.reason === 'entity_url_mismatch_or_missing'));
  assert.equal(extractTargetVehicle(json({ '@graph': [other] }), url).price, 0);
});

test('mislabelled related URL and fragment @id are not sufficient identity', () => {
  const other = { ...entity(), name: 'FIAT STRADA', offers: { price: 89900 } };
  assert.equal(extractTargetVehicle(json(other), url).price, 0);
  const fragment = { ...entity(), url: undefined, '@id': url + '#strada' };
  assert.equal(extractTargetVehicle(json(fragment), url).price, 0);
});

test('foreign offers and unverified itemOffered cannot supply a price', () => {
  for (const offer of [{ price: 89900, url: 'https://example.invalid/strada' }, { price: 89900, itemOffered: { name: 'Strada' } }]) {
    assert.equal(extractTargetVehicle(json({ ...entity(), offers: offer }), url).price, 0);
  }
});

test('hydration JSON is inspected as data; executable scripts are never evaluated', () => {
  const hydration = { data: { name: 'TOYOTA YARIS', brand: 'TOYOTA', model: 'YARIS', url, price: 106900, mileage: 33444 } };
  const r = extractTargetVehicle(json(hydration, 'application/json') + '<script>throw new Error("MUST NEVER EXECUTE")</script>', url);
  assert.equal(r.price, 106900);
  assert.equal(r.vehicle.mileage, '33.444 Km');
});

test('ambiguous DOM fails closed and an unscoped meta price cannot fill an absent target price', () => {
  assert.equal(extractTargetVehicle(page() + page('', 'Manual'), url).evidence.target.matched, false);
  const r = extractTargetVehicle('<meta name="price" content="89900">' + page('', 'CVT', ''), url);
  assert.equal(r.price, 0);
});

test('source evidence corrects stale draft numbers and unsupported AI numbers are rejected', () => {
  const r = extractTargetVehicle(fixture, url);
  const stale = { ...r.vehicle, price: 89900, mileage: '242.145 Km' };
  const merged = mergeImportedVehicle(stale, { price: 1, mileage: '999.999 Km' }, r.evidence);
  assert.equal(merged.price, 106900);
  assert.equal(merged.mileage, '33.444 Km');
  const absent = extractTargetVehicle(page('', 'CVT', '').replace('<p>Km<br>33.444</p>', '<p>Ano Mod.<br>2025</p>'), url);
  const rejected = mergeImportedVehicle({ ...absent.vehicle, price: 0 }, { price: 89900, mileage: '242.145 Km' }, absent.evidence);
  assert.equal(rejected.price, 0);
  assert.equal(rejected.mileage, '');
  assert.equal(resolveEvidenceValues({ source_url: 'https://example.invalid/other', price: 89900 }, r.evidence).price, 0);
});

test('confirmed fields, including deliberately cleared fields, survive reimport', () => {
  const metadata = { manual_confirmed_fields: confirmedFields({}, { price: 105000, transmission: '', description: 'Manually confirmed' }) };
  const result = preserveConfirmedFields({ price: 106900, transmission: 'CVT', description: 'New text' }, metadata);
  assert.equal(result.price, 105000);
  assert.equal(result.transmission, '');
  assert.equal(result.description, 'Manually confirmed');
  assert.equal(preserveConfirmedFields({ price: 106900 }, { draft_saved_at: 'old', imported_preview: { price: 105000 } }).price, 105000);
});

test('same source content is reusable and diagnostics do not contain source text or credentials', () => {
  const r = extractTargetVehicle(fixture, url);
  assert.equal(canReuseImport({ imported_preview: r.vehicle, import_evidence: r.evidence }, extractTargetVehicle(fixture, url).evidence), true);
  const diagnostic = JSON.stringify(importDiagnostic(r.evidence, { price: 89900 }, { price: 106900 }));
  assert.doesNotMatch(diagnostic, /Authorization|cookie|service_role|OPENAI_API_KEY|Nossos números|SCIA|g3premium/i);
});

test('foreign unlabeled sub-entity headings are not absorbed into a target with missing price', () => {
  const foreign = '<section><h2>FIAT STRADA</h2><p>R$ 89.900</p><p>242.145 km</p></section>';
  const r = extractTargetVehicle(page(foreign, 'CVT', ''), url);
  assert.equal(r.price, 0);
  assert.equal(r.evidence.target.matched, false);
});
