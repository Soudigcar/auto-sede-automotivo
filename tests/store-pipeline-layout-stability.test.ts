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
const pipelineWhatsappRoute = readFileSync('src/app/api/store/portal/pipeline/whatsapp/route.ts', 'utf8');
const whatsappPage = readFileSync('src/app/loja/[slug]/whatsapp/page.tsx', 'utf8');
const profilePictureHook = readFileSync('src/hooks/useStoreWhatsappProfilePictures.ts', 'utf8');
const contactAvatar = readFileSync('src/components/WhatsappContactAvatar.tsx', 'utf8');
const domSync = readFileSync('src/components/StorePipelineDomSync.tsx', 'utf8');
const addLead = readFileSync('src/components/PipelineAddLeadWithStock.tsx', 'utf8');

test('direct pipeline load keeps DOM synchronization across the auth main replacement', () => {
  assert.match(domSync, /observer\.observe\(document\.body, \{ childList: true, subtree: true \}\)/);
  assert.doesNotMatch(domSync, /document\.querySelector\('main'\) \|\| document\.body/);
});

test('each user can switch between Kanban and List without changing pipeline data rules', () => {
  assert.match(cockpit, /pipeline-view-toggle/);
  assert.match(cockpit, /pipeline-view-mode-change/);
  assert.match(pipelinePage, /type PipelineViewMode = 'kanban' \| 'list'/);
  assert.match(pipelinePage, /auto-controle-pipeline-view:\$\{slug\}:\$\{profileId\}/);
  assert.match(pipelinePage, /viewMode === 'kanban'/);
  assert.match(pipelinePage, /<PipelineLeadList/);
});

test('list mode reuses scoped leads, protected stage transitions and the existing actions', () => {
  assert.match(pipelineRoute, /'assigned_user_id', 'seller_user_id', 'pre_sales_user_id', 'captured_by_user_id'/);
  assert.match(pipelinePage, /leads\.filter\(\(lead\) => leadResponsibleId\(lead\) === selectedResponsible\)/);
  assert.match(pipelinePage, /onStageChange=\{changeListStage\}/);
  assert.match(pipelinePage, /pipeline-assign-custom-stage/);
  assert.match(pipelinePage, /pipeline-clear-custom-assignment/);
  assert.match(pipelinePage, /onWhatsapp=\{\(lead\) => void openWhatsapp\(lead\)\}/);
  assert.match(pipelinePage, /onTask=\{openTask\}/);
  assert.match(pipelinePage, /onTransfer=\{\(lead\) => void openTransfer\(lead\)\}/);
  assert.match(auraTheme, /\[data-lead-id\], \[data-pipeline-list-row\]/);
});

test('native v2 cards keep their compact presentation after internal navigation', () => {
  assert.match(auraTheme, /\[data-lead-id\]:not\(\[data-pipeline-card-v2="true"\]\)/);
  assert.match(auraTheme, /card\.classList\.remove\('pipeline-aura-lead-card'\)/);
  assert.match(scheduleBridge, /card\.dataset\.pipelineCardV2 === 'true'/);
  assert.match(scheduleBridge, /classList\.remove\('pipeline-card-actions-uniform', 'pipeline-card-action-uniform'\)/);
});

test('pipeline DOM sync uses a valid escaped selector for scheduled-stage decoration', () => {
  assert.match(scheduleBridge, /closest<HTMLElement>\('\.min-h-\\\\\[520px\\\\\]'\)/);
  assert.doesNotMatch(scheduleBridge, /closest<HTMLElement>\('\.min-h-\\\[520px\\\]'\)/);
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
  assert.match(pipelinePage, /request\('\/api\/store\/portal\/pipeline\/whatsapp'/);
  assert.match(pipelinePage, /router\.push\(`\/loja\/\$\{encodeURIComponent\(slug\)\}\/whatsapp\?conversation_id=/);
  assert.match(pipelinePage, /disabled=\{!lead\.has_phone\}/);
  assert.doesNotMatch(pipelinePage, /disabled=\{!lead\.whatsapp_conversation_id\}/);
  assert.doesNotMatch(pipelinePage, /popup\.location\.href = `https:\/\/wa\.me/);
  assert.match(whatsappPage, /searchParams\.get\('conversation_id'\)/);
});

test('unlinked WhatsApp conversations are created only for an authorized lead and store channel', () => {
  assert.match(pipelineWhatsappRoute, /authorizeStorePortal\(request, slug\)/);
  assert.match(pipelineWhatsappRoute, /canAccessStoreLead\(context\.profile, context\.role, lead\)/);
  assert.match(pipelineWhatsappRoute, /\.eq\('assigned_store_id', context\.store\.id\)/);
  assert.match(pipelineWhatsappRoute, /\.eq\('scope', 'store'\)/);
  assert.match(pipelineWhatsappRoute, /\.eq\('lead_id', lead\.id\)/);
  assert.match(pipelineWhatsappRoute, /assigned_user_id: lead\.assigned_user_id \|\| null/);
  assert.match(pipelineWhatsappRoute, /Este telefone já está vinculado a outro lead da loja/);
});

test('Kanban and List reuse the authenticated durable profile-picture proxy for every authorized role', () => {
  assert.match(pipelineRoute, /\.from\('whatsapp_contacts'\)/);
  assert.match(pipelineRoute, /whatsapp_contact_id: contact\?\.id \|\| null/);
  assert.match(pipelineRoute, /whatsapp_provider: whatsappProvider\(contact\)/);
  assert.doesNotMatch(pipelineRoute, /profile_picture_url:/);
  assert.doesNotMatch(pipelineRoute, /getEvolutionProfilePictureUrl/);
  assert.match(pipelinePage, /useStoreWhatsappProfilePictures/);
  assert.match(pipelinePage, /<LeadCard[\s\S]*?profilePictures=\{profilePictures\}/);
  assert.match(pipelinePage, /<PipelineLeadList[\s\S]*?profilePictures=\{profilePictures\}/);
  assert.match(pipelinePage, /<PipelineLeadAvatar lead=\{lead\} profilePictures=\{profilePictures\} \/>/);
  assert.match(pipelinePage, /new IntersectionObserver/);
  assert.match(profilePictureHook, /ensureProfilePicture/);
  assert.match(contactAvatar, /alt=\{`Foto de \$\{name\}`\}/);
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

test('mobile add-lead action stays above the bottom navigation and iOS safe area', () => {
  assert.match(addLead, /bottom:calc\(112px \+ env\(safe-area-inset-bottom\)\)/);
  assert.doesNotMatch(addLead, /pipeline-stock-add-button\{top:auto;right:16px;bottom:82px\}/);
});
