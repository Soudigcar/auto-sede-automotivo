import assert from 'node:assert/strict';
import test from 'node:test';
import {
  normalizeAutocarOperationalProfilePayload,
  normalizeSpecialHours,
  normalizeWeeklyHours
} from '../src/lib/server/autocar/operationalProfileValidation.ts';

const actorProfileId = '5fcd7877-e018-4b24-a3d1-cab43f9834fe';
const fixedNow = new Date('2026-08-21T15:30:00.000Z');

function validPayload() {
  return {
    timezone: 'America/Sao_Paulo',
    address_text: ' Pistão\u0000 Sul ',
    city: ' Taguatinga ',
    state: ' DF ',
    postal_code: '',
    location_label: 'Loja principal',
    latitude: '-15.83627149',
    longitude: -48.06192751,
    maps_url: 'https://maps.app.goo.gl/T5wF4bznkCoczMDH7',
    waze_url: '',
    weekly_hours: {
      monday: [
        { open: '13:00', close: '18:00' },
        { open: '09:00', close: '12:00' }
      ],
      tuesday: [{ open: '09:00', close: '18:00' }],
      wednesday: [],
      thursday: [],
      friday: [],
      saturday: [],
      sunday: []
    },
    special_hours: [
      { date: '2026-12-31', closed: false, open: '09:00', close: '13:00', label: ' Véspera ' },
      { date: '2026-12-25', closed: true, label: ' Natal ' }
    ],
    default_visit_duration_minutes: '60'
  };
}

test('normaliza perfil operacional válido sem truncamento silencioso', () => {
  const normalized = normalizeAutocarOperationalProfilePayload(
    validPayload(),
    actorProfileId,
    fixedNow
  );

  assert.equal(normalized.timezone, 'America/Sao_Paulo');
  assert.equal(normalized.address_text, 'Pistão Sul');
  assert.equal(normalized.city, 'Taguatinga');
  assert.equal(normalized.state, 'DF');
  assert.equal(normalized.postal_code, null);
  assert.equal(normalized.latitude, -15.836271);
  assert.equal(normalized.longitude, -48.061928);
  assert.equal(normalized.maps_url, 'https://maps.app.goo.gl/T5wF4bznkCoczMDH7');
  assert.equal(normalized.waze_url, null);
  assert.equal(normalized.default_visit_duration_minutes, 60);
  assert.equal(normalized.operational_profile_updated_by, actorProfileId);
  assert.equal(normalized.operational_profile_updated_at, fixedNow.toISOString());
  assert.deepEqual(normalized.weekly_hours.monday, [
    { open: '09:00', close: '12:00' },
    { open: '13:00', close: '18:00' }
  ]);
  assert.deepEqual(normalized.special_hours.map((item) => item.date), [
    '2026-12-25',
    '2026-12-31'
  ]);
});

test('rejeita fuso horário que não é um identificador IANA válido', () => {
  assert.throws(() => normalizeAutocarOperationalProfilePayload(
    { ...validPayload(), timezone: 'Sao Paulo GMT-3' },
    actorProfileId,
    fixedNow
  ), /Fuso horário inválido/);
});

test('rejeita Maps ou Waze sem HTTPS e URLs com credenciais', () => {
  assert.throws(() => normalizeAutocarOperationalProfilePayload(
    { ...validPayload(), maps_url: 'http://maps.example.com/loja' },
    actorProfileId,
    fixedNow
  ), /URL HTTPS/);

  assert.throws(() => normalizeAutocarOperationalProfilePayload(
    { ...validPayload(), maps_url: 'https://usuario:senha@maps.example.com/loja' },
    actorProfileId,
    fixedNow
  ), /URL HTTPS sem credenciais/);
});

test('rejeita intervalos semanais sobrepostos e dias desconhecidos', () => {
  assert.throws(() => normalizeWeeklyHours({
    monday: [
      { open: '09:00', close: '13:00' },
      { open: '12:30', close: '18:00' }
    ]
  }), /intervalos sobrepostos/);

  assert.throws(() => normalizeWeeklyHours({
    feriado: [{ open: '09:00', close: '18:00' }]
  }), /dias não reconhecidos/);
});

test('rejeita datas especiais inexistentes, duplicadas ou fechamento com horário', () => {
  assert.throws(() => normalizeSpecialHours([
    { date: '2026-02-30', closed: true }
  ]), /data inválida/);

  assert.throws(() => normalizeSpecialHours([
    { date: '2026-12-25', closed: true },
    { date: '2026-12-25', closed: true }
  ]), /mais de um horário especial/);

  assert.throws(() => normalizeSpecialHours([
    { date: '2026-12-25', closed: true, open: '09:00', close: '12:00' }
  ]), /não pode ter abertura\/fechamento/);
});

test('rejeita duração não inteira, não finita ou fora dos limites', () => {
  for (const invalid of ['NaN', 14, 481, 60.5]) {
    assert.throws(() => normalizeAutocarOperationalProfilePayload(
      { ...validPayload(), default_visit_duration_minutes: invalid },
      actorProfileId,
      fixedNow
    ), /número inteiro entre 15 e 480/);
  }
});

test('rejeita coordenadas fora da faixa e textos acima do limite', () => {
  assert.throws(() => normalizeAutocarOperationalProfilePayload(
    { ...validPayload(), latitude: 91 },
    actorProfileId,
    fixedNow
  ), /Latitude inválida/);

  assert.throws(() => normalizeAutocarOperationalProfilePayload(
    { ...validPayload(), address_text: 'x'.repeat(501) },
    actorProfileId,
    fixedNow
  ), /Endereço excede o limite/);
});
