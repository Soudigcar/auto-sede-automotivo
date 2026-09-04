import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const adminRoute = fs.readFileSync('src/app/api/master/campaigns/admin/route.ts', 'utf8');
const campaignsRoute = fs.readFileSync('src/app/api/master/campaigns/route.ts', 'utf8');
const publicRoute = fs.readFileSync('src/app/api/site-vehicles/route.ts', 'utf8');
const layoutRoute = fs.readFileSync('src/app/api/master/campaigns/layout/route.ts', 'utf8');
const adminForm = fs.readFileSync('src/components/campaigns/CampaignLandingAdminForm.tsx', 'utf8');
const visualEditor = fs.readFileSync('src/components/campaigns/CampaignVisualEditorNativeV6.tsx', 'utf8');

test('landing publicada protege o evento tanto na API administrativa quanto na API legada', () => {
  for (const source of [adminRoute, campaignsRoute]) {
    assert.match(source, /currentCampaign.*event_id|currentResult\.data\?\.event_id/s);
    assert.match(source, /não pode ser vinculada a outro evento/);
    assert.match(source, /event_protected/);
  }
});

test('editor administrativo mostra preflight de publicação e bloqueia troca do evento publicado', () => {
  assert.match(adminForm, /Prontidão para publicar/);
  assert.match(adminForm, /Evento .*ativo/);
  assert.match(adminForm, /loja\(s\) ativa\(s\)/);
  assert.match(adminForm, /veículo\(s\) visível\(is\)/);
  assert.match(adminForm, /disabled=\{published\}/);
  assert.match(adminForm, /Para outro evento, use “Nova landing”/);
});

test('slug do evento vira endereço canônico sem quebrar slug histórico da campanha', () => {
  assert.match(publicRoute, /\.from\('events'\)[\s\S]*\.eq\('slug', slug\)/);
  assert.match(publicRoute, /\.eq\('event_id', eventAlias\.id\)/);
  assert.match(publicRoute, /const canonicalSlug = linkedEvent\?\.slug \|\| campaignRecord\.slug/);
  assert.match(publicRoute, /legacy_slug: canonicalSlug !== campaignRecord\.slug/);
  assert.match(campaignsRoute, /public_slug: publicSlug/);
  assert.match(layoutRoute, /public_path: `\/campanha\/simulador\?campanha=\$\{encodeURIComponent\(publicSlug\)\}`/);
});

test('URL genérica prioriza evento acontecendo hoje e depois o futuro mais próximo', () => {
  assert.match(publicRoute, /function todayInBrazil\(\)/);
  assert.match(publicRoute, /function isCurrentEvent\(event: any, today = todayInBrazil\(\)\)/);
  assert.match(publicRoute, /function isFutureEvent\(event: any, today = todayInBrazil\(\)\)/);
  assert.match(publicRoute, /function selectDefaultCampaign/);
  assert.match(publicRoute, /if \(ongoing\.length\) return ongoing\[0\]/);
  assert.match(publicRoute, /if \(upcoming\.length\) return upcoming\[0\]/);
  assert.match(publicRoute, /hasExplicitCampaign[\s\S]*selectDefaultCampaign\(campaignCandidates, eventMap, today\)/);
});

test('editor visual bloqueia Publicar até cumprir o mesmo preflight do backend', () => {
  assert.match(visualEditor, /const requiresEventReadiness = Boolean\(campaign\?\.event_id\)/);
  assert.match(visualEditor, /const publicationReady = Boolean\(campaign && eventReady && storesReady && vehiclesReady\)/);
  assert.match(visualEditor, /action === 'publish' && !publicationReady/);
  assert.match(visualEditor, /disabled=\{Boolean\(busyAction\) \|\| !publicationReady\}/);
  assert.match(visualEditor, /Prontidão para publicar/);
  assert.match(visualEditor, /Vincule ao menos uma loja ativa/);
  assert.match(visualEditor, /Vincule ao menos um veículo ativo e visível/);
});
