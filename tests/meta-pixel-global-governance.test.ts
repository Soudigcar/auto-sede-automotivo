import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const pixelMaster = fs.readFileSync('src/app/api/master/integrations/meta-pixel/route.ts', 'utf8');
const pixelPublic = fs.readFileSync('src/app/api/public/integrations/meta-pixel/route.ts', 'utf8');
const tracker = fs.readFileSync('src/components/MetaPixelTracker.tsx', 'utf8');
const simulator = fs.readFileSync('src/components/campaigns/CampaignFinanceSimulator.tsx', 'utf8');
const integrations = fs.readFileSync('src/app/master/integrations/page.tsx', 'utf8');
const metaLeadsPage = fs.readFileSync('src/app/master/integrations/meta-leads/page.tsx', 'utf8');
const campaigns = fs.readFileSync('src/app/api/master/campaigns/route.ts', 'utf8');
const campaignsAdmin = fs.readFileSync('src/app/api/master/campaigns/admin/route.ts', 'utf8');
const campaignForm = fs.readFileSync('src/components/campaigns/CampaignLandingAdminForm.tsx', 'utf8');

test('Meta Pixel is global and landing selection is test-only', () => {
  assert.match(pixelMaster, /scope: 'global'/);
  assert.match(pixelMaster, /test_campaign_id/);
  assert.match(pixelPublic, /scope: 'global'/);
  assert.match(integrations, /Landing para teste \(não vincula o Pixel\)/);
  assert.match(integrations, /Pixel funciona globalmente em todas as landings/);
  assert.match(integrations, /campanha_id=\$\{encodeURIComponent\(selectedLanding\.id\)\}/);
  assert.match(integrations, /landing\.display_name \|\| landing\.event_name/);
  assert.match(pixelMaster, /\.eq\('status', 'active'\)/);
  assert.match(pixelMaster, /event\.end_date >= today/);
});

test('pixel events carry stable campaign and event context', () => {
  assert.match(tracker, /campaign_id: context\.campaignId/);
  assert.match(tracker, /event_id: context\.eventId/);
  assert.match(tracker, /campaign_slug: context\.campaignSlug/);
  assert.match(tracker, /eventID: options\.eventId/);
  assert.match(tracker, /ViewContent/);
});

test('simulator tracks the conversion journey without PII', () => {
  assert.match(simulator, /SimulatorOpened/);
  assert.match(simulator, /SimulationStarted/);
  assert.match(simulator, /tracking_event_id: trackingEventId/);
  assert.match(simulator, /track\('Lead'/);
  assert.match(simulator, /track\('Contact'/);
  assert.doesNotMatch(simulator, /track\([^\n]+form\.(?:name|phone|cpf|email)/);
});

test('Meta callback is canonical and never derived from Preview origin', () => {
  const canonical = /https:\/\/sistemaautomotivo\.autosede\.com\.br\/api\/webhooks\/meta-leads/;
  assert.match(integrations, canonical);
  assert.match(metaLeadsPage, canonical);
  assert.doesNotMatch(integrations, /window\.location\.origin/);
  assert.doesNotMatch(metaLeadsPage, /window\.location\.origin/);
});

test('published landing slug is immutable and Preview writes are closed', () => {
  assert.match(campaigns, /slugProtected/);
  assert.match(campaignsAdmin, /slugProtected/);
  assert.match(campaigns, /VERCEL_ENV === 'preview'/);
  assert.match(campaignsAdmin, /VERCEL_ENV === 'preview'/);
  assert.match(campaignForm, /Endereço protegido após a publicação/);
  assert.match(campaignForm, /const published = Boolean\(form\.published_at \|\| form\.published_layout\)/);
  assert.match(campaignForm, /disabled=\{published\}/);
});
