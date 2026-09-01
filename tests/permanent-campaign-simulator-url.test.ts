import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const legacyRoute = fs.readFileSync('src/app/campanha/[slug]/page.tsx', 'utf8');
const permanentRoute = fs.readFileSync('src/app/campanha/simulador/page.tsx', 'utf8');
const publicCampaignApi = fs.readFileSync('src/app/api/site-vehicles/route.ts', 'utf8');
const landing = fs.readFileSync('src/components/campaigns/EventCampaignLanding.tsx', 'utf8');
const linkBuilder = fs.readFileSync('src/components/campaigns/CampaignVisualEditorPersistence.ts', 'utf8');

test('slugs antigos redirecionam permanentemente e preservam parametros de campanha', () => {
  assert.match(legacyRoute, /permanentRedirect/);
  assert.match(legacyRoute, /target\.set\('campanha', slug\)/);
  assert.match(legacyRoute, /Object\.entries\(currentSearchParams\)/);
  assert.match(legacyRoute, /target\.append\(key, item\)/);
  assert.match(legacyRoute, /\/campanha\/simulador\?\$\{target\.toString\(\)\}/);
});

test('rota permanente aceita campanha explicita e tambem um destino atual padrao', () => {
  assert.match(permanentRoute, /resolvedSearchParams\.campanha/);
  assert.match(permanentRoute, /campaignSlug=\{campaignSlug \|\| ''\}/);
  assert.match(landing, /slug \? `\?slug=\$\{encodeURIComponent\(slug\)\}` : '\?current=1'/);
  assert.match(publicCampaignApi, /order\('published_at', \{ ascending: false, nullsFirst: false \}\)\.limit\(1\)/);
});

test('pixel e leads usam o slug real resolvido, nunca o nome fixo simulador', () => {
  assert.match(landing, /const trackingSlug = String\(campaign\?\.slug \|\| slug\)/);
  assert.match(landing, /campaignSlug: trackingSlug/);
  assert.match(landing, /slug=\{trackingSlug\}/);
});

test('novos links publicos usam a URL permanente com identidade interna', () => {
  assert.match(linkBuilder, /\/campanha\/simulador\?campanha=\$\{encodeURIComponent\(slug\)\}/);
  assert.doesNotMatch(linkBuilder, /`\/campanha\/\$\{slug\}`/);
});
