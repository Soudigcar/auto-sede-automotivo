import assert from 'node:assert/strict';
import test from 'node:test';
import {
  renderAutocarStoreKnowledgeContent,
  sanitizeAutocarStoreKnowledgeConfig
} from '../src/lib/autocar/storeKnowledgeConfig.ts';
import { autocarHumanHandoffScopeReason } from '../src/lib/server/autocar/liveHumanHandoffPilot.ts';

const A4_STORE_ID = '239755c3-a2d4-4cdd-9502-f1595031c924';

test('conhecimento da loja sanitiza somente os campos permitidos', () => {
  const config = sanitizeAutocarStoreKnowledgeConfig({
    differentiators: ' Revisão e procedência ',
    faq: 'Faz financiamento? Sim.',
    commercialNotes: 'Nunca inventar aprovação.',
    master_enabled: false
  });

  assert.deepEqual(config, {
    differentiators: 'Revisão e procedência',
    faq: 'Faz financiamento? Sim.',
    commercialNotes: 'Nunca inventar aprovação.'
  });
});

test('conhecimento renderizado mantém SAFE CORE acima da configuração da loja', () => {
  const content = renderAutocarStoreKnowledgeContent({
    differentiators: 'Procedência',
    faq: 'Pergunta e resposta',
    commercialNotes: 'Fluxo comercial'
  });

  assert.match(content, /nunca substitui Hard Policies, SAFE CORE/i);
  assert.match(content, /PERGUNTAS FREQUENTES E RESPOSTAS/);
  assert.match(content, /OBSERVAÇÕES COMERCIAIS ADICIONAIS/);
});

test('handoff LIVE permanece restrito à A4 e somente Preview ou Production', () => {
  assert.equal(autocarHumanHandoffScopeReason(A4_STORE_ID, 'preview'), '');
  assert.equal(autocarHumanHandoffScopeReason(A4_STORE_ID, 'production'), '');
  assert.match(autocarHumanHandoffScopeReason(A4_STORE_ID, 'development'), /bloqueado/i);
  assert.match(autocarHumanHandoffScopeReason('00000000-0000-0000-0000-000000000000', 'production'), /restrito à A4/i);
});
