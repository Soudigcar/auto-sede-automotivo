import assert from 'node:assert/strict';
import test from 'node:test';
import {
  normalizeAutocarOperationalProfileClient,
  safeClientTrim
} from '../src/lib/autocar/operationalProfileClient.ts';

test('normaliza campos textuais nulos do Perfil Operacional antes da renderização', () => {
  const normalized = normalizeAutocarOperationalProfileClient({
    timezone: 'America/Sao_Paulo',
    address_text: null,
    city: null,
    state: null,
    postal_code: null,
    location_label: null,
    maps_url: null,
    waze_url: null,
    latitude: null,
    longitude: null
  });

  assert.equal(normalized.timezone, 'America/Sao_Paulo');
  assert.equal(normalized.address_text, '');
  assert.equal(normalized.city, '');
  assert.equal(normalized.state, '');
  assert.equal(normalized.postal_code, '');
  assert.equal(normalized.location_label, '');
  assert.equal(normalized.maps_url, '');
  assert.equal(normalized.waze_url, '');
  assert.equal(normalized.latitude, null);
  assert.equal(normalized.longitude, null);
});

test('normalização também é segura quando o perfil inteiro está ausente', () => {
  const normalized = normalizeAutocarOperationalProfileClient(undefined);

  assert.equal(normalized.timezone, 'America/Sao_Paulo');
  assert.equal(normalized.address_text, '');
  assert.equal(normalized.maps_url, '');
  assert.equal(normalized.waze_url, '');
});

test('trim seguro nunca chama trim em null ou undefined', () => {
  assert.equal(safeClientTrim(null), '');
  assert.equal(safeClientTrim(undefined), '');
  assert.equal(safeClientTrim('  https://maps.example.com/loja  '), 'https://maps.example.com/loja');
});

test('trim seguro preserva coordenadas numéricas válidas', () => {
  assert.equal(safeClientTrim(-15.836271), '-15.836271');
  assert.equal(safeClientTrim(-48.061928), '-48.061928');
  assert.equal(safeClientTrim(0), '0');
});
