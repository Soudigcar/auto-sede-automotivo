import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  isGoogleMapsHostname,
  parseGoogleMapsCoordinates,
  resolveGoogleMapsCoordinates
} from '../src/lib/server/googleMapsLocation.ts';
import { RequestSecurityError } from '../src/lib/server/requestSecurity.ts';

const expected = { latitude: -15.836271, longitude: -48.061928 };
const profileRoute = readFileSync('src/app/api/store/portal/autocar/operational-profile/route.ts', 'utf8');
const profileUi = readFileSync('src/components/AutocarOperationalProfile.tsx', 'utf8');

test('extrai coordenadas do caminho e da query oficial do Google Maps', () => {
  assert.deepEqual(
    parseGoogleMapsCoordinates('https://www.google.com/maps/@-15.836271,-48.061928,17z'),
    expected
  );
  assert.deepEqual(
    parseGoogleMapsCoordinates('https://www.google.com/maps/search/?api=1&query=-15.836271%2C-48.061928'),
    expected
  );
  assert.deepEqual(
    parseGoogleMapsCoordinates('https://maps.google.com/?q=loc%3A-15.836271%2C-48.061928'),
    expected
  );
});

test('extrai os dois formatos de coordenadas do bloco data do Maps', () => {
  assert.deepEqual(
    parseGoogleMapsCoordinates('https://www.google.com/maps/place/Loja/data=!3d-15.836271!4d-48.061928'),
    expected
  );
  assert.deepEqual(
    parseGoogleMapsCoordinates('https://www.google.com/maps/place/Loja/data=!2d-48.061928!3d-15.836271'),
    expected
  );
});

test('rejeita host parecido, consulta sem coordenadas e ponto 0,0', () => {
  assert.equal(isGoogleMapsHostname('maps.app.goo.gl'), true);
  assert.equal(isGoogleMapsHostname('maps.app.goo.gl.evil.example'), false);
  assert.equal(parseGoogleMapsCoordinates('https://maps.app.goo.gl.evil.example/@-15.8,-48.0,17z'), null);
  assert.equal(parseGoogleMapsCoordinates('https://www.google.com/maps/search/?api=1&query=loja'), null);
  assert.equal(parseGoogleMapsCoordinates('https://www.google.com/maps/@0,0,17z'), null);
});

test('resolve link curto somente dentro da allowlist e usa a URL final', async () => {
  const coordinates = await resolveGoogleMapsCoordinates(
    'https://maps.app.goo.gl/T5wF4bznkCoczMDH7',
    async (value, options) => {
      assert.equal(value, 'https://maps.app.goo.gl/T5wF4bznkCoczMDH7');
      assert.equal(options.requireHttps, true);
      assert.ok(options.allowedHostnames?.includes('maps.app.goo.gl'));
      assert.ok(options.allowedHostnames?.includes('www.google.com'));
      return {
        body: Buffer.alloc(0),
        contentType: 'text/html',
        finalUrl: 'https://www.google.com/maps/place/Loja/@-15.836271,-48.061928,17z'
      };
    }
  );
  assert.deepEqual(coordinates, expected);
});

test('não inventa coordenadas quando o link não contém um pin', async () => {
  await assert.rejects(
    () => resolveGoogleMapsCoordinates(
      'https://maps.app.goo.gl/sem-pin',
      async () => ({
        body: Buffer.alloc(0),
        contentType: 'text/html',
        finalUrl: 'https://www.google.com/maps/search/?api=1&query=loja'
      })
    ),
    (error: unknown) => {
      assert.ok(error instanceof RequestSecurityError);
      assert.equal(error.status, 400);
      assert.match(error.message, /não foi possível identificar um pin/i);
      return true;
    }
  );
});

test('resolver exige link HTTPS oficial do Google Maps', async () => {
  await assert.rejects(
    () => resolveGoogleMapsCoordinates('https://maps.app.goo.gl.evil.example/@-15.8,-48.0,17z'),
    (error: unknown) => {
      assert.ok(error instanceof RequestSecurityError);
      assert.equal(error.status, 400);
      return true;
    }
  );
});

test('perfil resolve o link ao colar e repete a resolução no servidor antes de salvar', () => {
  assert.match(profileUi, /onPaste=\{\(event\) => \{/);
  assert.match(profileUi, /onBlur=\{\(event\) => void resolveMapsLocation/);
  assert.match(profileUi, /Latitude automática/);
  assert.match(profileUi, /Longitude automática/);
  assert.match(profileRoute, /resolveGoogleMapsCoordinates\(mapsUrl\)/);
  assert.match(profileRoute, /payload\.latitude = coordinates\.latitude/);
  assert.match(profileRoute, /payload\.longitude = coordinates\.longitude/);
});
