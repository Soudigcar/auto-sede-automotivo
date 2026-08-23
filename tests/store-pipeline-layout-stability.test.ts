import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const auraTheme = readFileSync('src/components/StorePipelineAuraTheme.tsx', 'utf8');
const cockpit = readFileSync('src/components/StorePipelineCockpitUx.tsx', 'utf8');
const scheduleBridge = readFileSync('src/components/StorePipelineScheduleUxBridge.tsx', 'utf8');
const newLeadBridge = readFileSync('src/components/StorePipelineNewLeadScheduleButton.tsx', 'utf8');
const saleBridge = readFileSync('src/components/StorePipelineSaleActionBridge.tsx', 'utf8');
const pipelinePage = readFileSync('src/app/loja/[slug]/pipeline/page.tsx', 'utf8');
const pipelineRoute = readFileSync('src/app/api/store/portal/pipeline/route.ts', 'utf8');
const whatsappPage = readFileSync('src/app/loja/[slug]/whatsapp/page.tsx', 'utf8');
const domSync = readFileSync('src/components/StorePipelineDomSync.tsx', 'utf8');

test('direct pipeline load keeps DOM synchronization across the auth main replacement', () => {
  assert.match(domSync, /observer\.observe\(document\.body, \{ childList: true, subtree: true \}\)/);
  assert.doesNotMatch(domSync, /document\.querySelector\('main'\) \|\| document\.body/);
});

test('native v2 cards keep their compact presentation after internal navigation', () => {
  assert.match(auraTheme, /\[data-lead-id\]:not\(\[data-pipeline-card-v2="true"\]\)/);
  assert.match(auraTheme, /card\.classList\.remove\('pipeline-aura-lead-card'\)/);
  assert.match(scheduleBridge, /card\.dataset\.pipelineCardV2 === 'true'/);
  assert.match(scheduleBridge, /classList\.remove\('pipeline-card-actions-uniform', 'pipeline-card-action-uniform'\)/);
});

test('legacy action bridges do not inject duplicate actions into native v2 cards', () => {
  assert.match(newLeadBridge, /card\.dataset\.pipelineCardV2 === 'true'/);
  assert.match(saleBridge, /card\.dataset\.pipelineCardV2 === 'true'/);
});

test('desktop metrics are never pulled beneath the fixed top bar', () => {
  assert.doesNotMatch(cockpit, /margin-top:-58px!important/);
  assert.match(cockpit, /\.pipeline-cockpit-host \{ margin-top:0!important; \}/);
});

test('the compact cockpit is the only metric strip above the pipeline board', () => {
  assert.match(cockpit, /className="pipeline-kpi-strip"/);
  assert.match(cockpit, /Personalizar pipeline/);
  assert.doesNotMatch(pipelinePage, /<Kpi label=/);
  assert.doesNotMatch(pipelinePage, /function Kpi\(/);
});

test('each desktop stage has a bounded independent lead scroller', () => {
  assert.match(pipelinePage, /data-pipeline-stage-cards="true"/);
  assert.match(cockpit, /height:calc\(100dvh - 176px\)!important/);
  assert.match(cockpit, /max-height:calc\(100dvh - 176px\)!important/);
  assert.match(cockpit, /overflow-y:auto!important/);
  assert.match(cockpit, /overscroll-behavior-y:contain/);
});

test('compact cards use the WhatsApp brand mark and open the linked CRM conversation', () => {
  assert.match(pipelinePage, /function WhatsappMark/);
  assert.match(pipelinePage, /whatsapp_conversation_id/);
  assert.match(pipelinePage, /router\.push\(`\/loja\/\$\{encodeURIComponent\(slug\)\}\/whatsapp\$\{query\}`\)/);
  assert.doesNotMatch(pipelinePage, /popup\.location\.href = `https:\/\/wa\.me/);
  assert.match(whatsappPage, /searchParams\.get\('conversation_id'\)/);
});

test('pipeline exposes cached contact photos without changing data or calling Evolution', () => {
  assert.match(pipelineRoute, /\.from\('whatsapp_contacts'\)/);
  assert.match(pipelineRoute, /profile_picture_url: profilePictureUrl\(contact\)/);
  assert.doesNotMatch(pipelineRoute, /getEvolutionProfilePictureUrl/);
  assert.match(pipelinePage, /alt=\{`Foto de \$\{name\}`\}/);
});

test('scheduled cards fit vehicle interest and appointment date in the existing metadata line', () => {
  assert.match(pipelinePage, /columnKey === 'scheduled'/);
  assert.match(pipelinePage, /lead\.interested_vehicle \|\| 'Veículo não informado'/);
  assert.match(pipelinePage, /compactSchedule\(lead\.scheduled_at\)/);
  assert.match(pipelinePage, /min-w-0 flex-1 truncate/);
});

test('pipeline keeps the Kanban free from redundant floating bottom overlays', () => {
  assert.doesNotMatch(auraTheme, /aura-bottom-dock/);
  assert.doesNotMatch(auraTheme, /Relatório do dia/);
  assert.doesNotMatch(auraTheme, /Sincronizado com o servidor/);
  assert.match(auraTheme, /padding: 104px 16px 16px !important/);
});
