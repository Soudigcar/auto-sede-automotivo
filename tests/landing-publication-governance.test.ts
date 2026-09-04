import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const adminRoute = fs.readFileSync('src/app/api/master/campaigns/admin/route.ts', 'utf8');
const campaignsRoute = fs.readFileSync('src/app/api/master/campaigns/route.ts', 'utf8');
const publicRoute = fs.readFileSync('src/app/api/site-vehicles/route.ts', 'utf8');
const layoutRoute = fs.readFileSync('src/app/api/master/campaigns/layout/route.ts', 'utf8');
const adminForm = fs.readFileSync('src/components/campaigns/CampaignLandingAdminForm.tsx', 'utf8');

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
