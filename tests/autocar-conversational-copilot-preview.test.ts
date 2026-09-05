import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const layout = readFileSync('src/app/loja/[slug]/whatsapp/layout.tsx', 'utf8');
const component = readFileSync('src/components/AutocarConversationalCopilot.tsx', 'utf8');
const route = readFileSync('src/app/api/store/portal/autocar/copilot/chat/route.ts', 'utf8');

test('Copilot conversacional é montado somente no Inbox da loja', () => {
  assert.match(layout, /AutocarConversationalCopilot/);
  assert.match(layout, /<AutocarConversationalCopilot\s*\/>/);
});

test('cliente detecta conversa ativa sem alterar o fetch do Inbox', () => {
  assert.match(component, /performance\.getEntriesByType\('resource'\)/);
  assert.match(component, /PerformanceObserver/);
  assert.match(component, /\/api\/store-whatsapp/);
  assert.doesNotMatch(component, /window\.fetch\s*=/);
});

test('painel chama somente endpoint consultivo e exige garantia de não execução', () => {
  assert.match(component, /\/api\/store\/portal\/autocar\/copilot\/chat/);
  assert.match(component, /result\.no_external_execution !== true/);
  assert.match(component, /navigator\.clipboard\.writeText/);
  assert.doesNotMatch(component, /sendEvolutionText/);
  assert.doesNotMatch(component, /\/api\/store-whatsapp\/send/);
});

test('endpoint é fail-closed fora de COPILOT', () => {
  assert.match(route, /effectiveMode !== 'copilot' && !previewHomologationActive/);
  assert.match(route, /status: 409/);
  assert.match(route, /no_external_execution: true/);
});

test('homologação COPILOT só pode existir em Preview da branch autorizada', () => {
  assert.match(route, /process\.env\.VERCEL_ENV === 'preview'/);
  assert.match(route, /process\.env\.VERCEL_GIT_COMMIT_REF === PREVIEW_HOMOLOGATION_BRANCH/);
  assert.match(route, /feature\/autocar-copilot-conversational-preview/);
  assert.match(route, /preview_homologation_available/);
  assert.match(route, /previewHomologationRequested && !previewAllowed/);
  assert.match(route, /status: 403/);
  assert.match(component, /preview_homologation: previewHomologation/);
  assert.match(component, /copilot · homologação preview/);
});

test('homologação não altera runtime e mantém análise consultiva em copilot', () => {
  assert.match(route, /runtime_lido/);
  assert.match(route, /modo_de_analise: 'copilot'/);
  assert.match(route, /HOMOLOGAÇÃO PREVIEW ISOLADA/);
  assert.doesNotMatch(route, /setAutocarStoreSelectedMode/);
  assert.doesNotMatch(route, /setAutocarStoreMode/);
  assert.doesNotMatch(route, /\.update\(/);
  assert.doesNotMatch(route, /\.upsert\(/);
});

test('endpoint preserva isolamento por loja, carteira e permissões', () => {
  assert.match(route, /\.eq\('store_id', context\.store\.id\)/);
  assert.match(route, /canAccessStoreLead/);
  assert.match(route, /view_whatsapp/);
  assert.match(route, /view_autocar/);
});

test('resposta vem da OpenAI com inteligência da loja e hard policies', () => {
  assert.match(route, /https:\/\/api\.openai\.com\/v1\/responses/);
  assert.match(route, /buildAutocarIntelligenceContext/);
  assert.match(route, /serializeAutocarIntelligenceContext/);
  assert.match(route, /hardPolicyInstructions/);
  assert.match(route, /mode: 'copilot'/);
});

test('histórico conversacional é temporário e limitado', () => {
  assert.match(route, /value\.slice\(-8\)/);
  assert.match(component, /turns\.slice\(-8\)/);
  assert.doesNotMatch(route, /\.insert\(/);
  assert.doesNotMatch(route, /\.update\(/);
  assert.doesNotMatch(route, /\.delete\(/);
});

test('endpoint não possui caminho de execução externa', () => {
  assert.doesNotMatch(route, /sendEvolutionText/);
  assert.doesNotMatch(route, /create_follow_up/);
  assert.doesNotMatch(route, /alter_pipeline/);
  assert.doesNotMatch(route, /markAutocarHumanActive/);
  assert.match(route, /advisory_only: true/);
  assert.match(route, /no_external_execution: true/);
});
