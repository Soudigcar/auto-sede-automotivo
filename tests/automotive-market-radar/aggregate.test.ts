import test from 'node:test';
import assert from 'node:assert/strict';
import { aggregateMarketListings } from '../../src/lib/server/automotive-market-radar/aggregate';
import { normalizeAndDeduplicate } from '../../src/lib/server/automotive-market-radar/pipeline';
import type { RawMarketListing } from '../../src/lib/server/automotive-market-radar/types';

function listing(overrides: Partial<RawMarketListing> = {}): RawMarketListing {
  return {
    sourceName: 'Fonte pública',
    sourceUrl: `https://example.com/${Math.random()}`,
    externalId: null,
    municipality: 'Brasília',
    stateCode: 'DF',
    title: 'Chevrolet Onix LT 1.0 Manual',
    description: 'Veículo conservado',
    brand: 'Chevrolet',
    model: 'Onix',
    version: 'LT 1.0',
    manufactureYear: 2021,
    modelYear: 2022,
    fuel: 'Flex',
    transmission: 'Manual',
    mileage: 45000,
    price: 60000,
    fipePrice: 62000,
    collectedAt: '2026-08-03T12:00:00.000Z',
    ...overrides
  };
}

test('classifica anúncios inválidos e duplicados antes da agregação', () => {
  const url = 'https://example.com/anuncio-1';
  const normalized = normalizeAndDeduplicate([
    listing({ sourceUrl: url }),
    listing({ sourceUrl: url }),
    listing({ sourceUrl: 'https://example.com/leilao', description: 'Recuperado de leilão' }),
    listing({ sourceUrl: 'https://example.com/entrada', description: 'Entrada de R$ 8.000 e parcelas' }),
    listing({ sourceUrl: 'https://example.com/sp', stateCode: 'SP' }),
    listing({ sourceUrl: 'https://example.com/incompleto', version: null })
  ]);

  assert.deepEqual(normalized.map((item) => item.listing_status), [
    'valid', 'duplicate', 'auction', 'financing_entry', 'out_of_region', 'version_conflict'
  ]);
  assert.equal(normalized[4].state_code, null);
});

test('calcula mínimo, máximo, mediana, média e diferença FIPE', () => {
  const normalized = normalizeAndDeduplicate([
    listing({ sourceUrl: 'https://example.com/1', price: 50000 }),
    listing({ sourceUrl: 'https://example.com/2', price: 60000 }),
    listing({ sourceUrl: 'https://example.com/3', price: 80000 })
  ]);

  const { segments } = aggregateMarketListings(normalized);
  const df = segments.find((segment) => segment.state_code === 'DF');
  if (!df) throw new Error('Segmento DF não encontrado.');

  assert.equal(df.valid_listing_count, 3);
  assert.equal(df.minimum_price, 50000);
  assert.equal(df.maximum_price, 80000);
  assert.equal(df.median_price, 60000);
  assert.equal(df.average_price, 63333.33);
  assert.equal(df.fipe_price, 62000);
  assert.equal(df.difference_to_fipe_amount, -2000);
  assert.equal(df.difference_to_fipe_percent, -3.2258);
});

test('gera segmentos separados para DF e GO e um consolidado DF+GO', () => {
  const normalized = normalizeAndDeduplicate([
    listing({ sourceUrl: 'https://example.com/df', stateCode: 'DF', municipality: 'Brasília', price: 60000 }),
    listing({ sourceUrl: 'https://example.com/go', stateCode: 'GO', municipality: 'Goiânia', price: 64000 })
  ]);

  const { segments } = aggregateMarketListings(normalized);
  assert.deepEqual(segments.map((segment) => segment.state_code).sort(), ['DF', 'DF+GO', 'GO']);
  const consolidated = segments.find((segment) => segment.state_code === 'DF+GO');
  assert.equal(consolidated?.valid_listing_count, 2);
  assert.equal(consolidated?.median_price, 62000);
});

test('gera sugestões sem aplicar mudanças automáticas', () => {
  const normalized = normalizeAndDeduplicate([
    listing({ sourceUrl: 'https://example.com/a', price: 80000, fipePrice: 60000 }),
    listing({ sourceUrl: 'https://example.com/b', price: 82000, fipePrice: 60000 }),
    listing({ sourceUrl: 'https://example.com/c', price: 84000, fipePrice: 60000 })
  ]);

  const result = aggregateMarketListings(normalized);
  assert.ok(result.suggestions.some((item) => item.suggestion_type === 'price_review'));
  assert.ok(result.suggestions.every((item) => item.proposed_payload && item.source_evidence));
});
