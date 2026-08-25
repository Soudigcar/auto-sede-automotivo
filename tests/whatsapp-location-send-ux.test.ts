import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const route = readFileSync('src/app/api/whatsapp/messages/send-location/route.ts', 'utf8');
const button = readFileSync('src/components/WhatsappLocationButton.tsx', 'utf8');
const card = readFileSync('src/components/WhatsappLocationMessage.tsx', 'utf8');
const desktopActions = readFileSync('src/components/WhatsappAttachmentButton.tsx', 'utf8');
const mobileActions = readFileSync('src/components/WhatsappMobileInboxBridge.tsx', 'utf8');
const desktopMessages = readFileSync('src/components/WhatsappMediaMessage.tsx', 'utf8');
const mobileMessages = readFileSync('src/components/WhatsappMobileMediaMessage.tsx', 'utf8');
const evolution = readFileSync('src/lib/server/evolution.ts', 'utf8');
const autocarLiveLocation = readFileSync('src/lib/server/autocar/liveLocationPilot.ts', 'utf8');

test('location endpoint authorizes the conversation and uses native Evolution location sending', () => {
  assert.match(route, /canAccessStoreConversation/);
  assert.match(route, /readManagedEvolutionState/);
  assert.match(route, /availability\.connected/);
  assert.match(route, /markAutocarHumanActive/);
  assert.match(route, /sendEvolutionLocation\(integration\.instance_name, recipient/);
  assert.match(evolution, /\/message\/sendLocation\//);
  assert.match(evolution, /latitude: location\.latitude/);
  assert.match(evolution, /longitude: location\.longitude/);
  assert.match(route, /message_type: 'location'/);
});

test('AUTOCAR sends the official store position as a native location instead of a Maps text', () => {
  assert.match(autocarLiveLocation, /sendEvolutionLocation/);
  assert.doesNotMatch(autocarLiveLocation, /sendEvolutionText/);
  assert.match(autocarLiveLocation, /validCoordinate\(location\?\.latitude, -90, 90\)/);
  assert.match(autocarLiveLocation, /validCoordinate\(location\?\.longitude, -180, 180\)/);
  assert.match(autocarLiveLocation, /message_type: 'location'/);
  assert.match(autocarLiveLocation, /location: trustedLocation/);
  assert.match(autocarLiveLocation, /sent_location: trustedLocation/);
  assert.match(autocarLiveLocation, /autocar-live-location-v2/);
  assert.doesNotMatch(autocarLiveLocation, /Google Maps: \$\{mapsUrl\}/);
});

test('store location is trusted server-side while current coordinates are validated', () => {
  assert.match(route, /source === 'store' \? trustedStoreLocation\?\.latitude/);
  assert.match(route, /source === 'store' \? trustedStoreLocation\?\.longitude/);
  assert.match(route, /coordinate\(body\.latitude, -90, 90\)/);
  assert.match(route, /coordinate\(body\.longitude, -180, 180\)/);
  assert.match(route, /address_text, city, state, postal_code, location_label, latitude, longitude/);
});

test('location picker is icon-only and requires an explicit confirmed choice', () => {
  assert.match(button, /aria-label="Enviar localização"/);
  assert.match(button, /navigator\.geolocation\.getCurrentPosition/);
  assert.match(button, /Sua posição atual só será acessada com sua autorização/);
  assert.match(button, /Localização da loja/);
  assert.match(button, /Minha localização atual/);
  assert.match(button, /onClick=\{\(\) => void sendLocation\(\)\}/);
  assert.match(button, /Confirme com atenção/);
});

test('desktop and mobile surfaces expose the same location action', () => {
  assert.match(desktopActions, /<WhatsappLocationButton/);
  assert.match(mobileActions, /<WhatsappLocationButton/);
});

test('inbound and outbound locations render as map cards on desktop and mobile', () => {
  assert.match(card, /raw\.location/);
  assert.match(card, /locationMessage/);
  assert.match(card, /liveLocationMessage/);
  assert.match(card, /degreesLatitude/);
  assert.match(card, /degreesLongitude/);
  assert.match(card, /https:\/\/www\.google\.com\/maps\?q=/);
  assert.match(card, /aria-label="Abrir localização no mapa"/);
  assert.match(desktopMessages, /type === 'location'/);
  assert.match(mobileMessages, /type === 'location'/);
});
