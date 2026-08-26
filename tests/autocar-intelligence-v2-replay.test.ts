import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { evaluateAutocarReplayV2 } from '../src/lib/server/autocar/intelligenceReplayV2';

const classifierSource = fs.readFileSync(path.join(process.cwd(), 'src/lib/server/autocar/humanRequestClassifierV2.ts'), 'utf8');
const routeSource = fs.readFileSync(path.join(process.cwd(), 'src/app/api/master/autocar/replay-v2/route.ts'), 'utf8');
const policySource = fs.readFileSync(path.join(process.cwd(), 'src/lib/server/autocar/policyEngine.ts'), 'utf8');

describe('AUTOCAR Intelligence V2 replay', () => {
  it('mantém a conversa com IA quando ação protegida existe sem pedido de humano', () => {
    const result = evaluateAutocarReplayV2({
      customerRequestedHuman: false,
      shadow: {
        response: 'Posso entender sua proposta e seguir com você por aqui; o desconto precisa de validação antes de ser confirmado.',
        proposed_actions: [{ capability: 'negotiate_price', decision: { effect: 'handoff' }, reason: 'Validação de preço.' }]
      }
    });
    assert.equal(result.pass, true);
    assert.equal(result.handoff.should_handoff, false);
    assert.equal(result.handoff.continue_ai_conversation, true);
  });

  it('marca regressão quando Shadow propõe transfer_lead sem pedido do cliente', () => {
    const result = evaluateAutocarReplayV2({
      customerRequestedHuman: false,
      shadow: {
        response: 'Preciso confirmar o histórico de revisões.',
        proposed_actions: [{ capability: 'transfer_lead', decision: { effect: 'handoff' }, reason: 'Informação ausente.' }]
      }
    });
    assert.equal(result.pass, false);
    assert.equal(result.regression_flags.transfer_action_without_customer_request, true);
    assert.equal(result.effective_actions.some((action: any) => action.capability === 'transfer_lead'), false);
  });

  it('marca regressão quando texto promete transferência sem pedido humano', () => {
    const result = evaluateAutocarReplayV2({
      customerRequestedHuman: false,
      shadow: { response: 'Vou te encaminhar para um vendedor confirmar essa informação.', proposed_actions: [] }
    });
    assert.equal(result.pass, false);
    assert.equal(result.regression_flags.transfer_language_without_customer_request, true);
  });

  it('permite transferência quando classificador semântico confirmou pedido de humano', () => {
    const result = evaluateAutocarReplayV2({
      customerRequestedHuman: true,
      shadow: {
        response: 'Claro, vou encaminhar seu atendimento para um vendedor.',
        proposed_actions: [{ capability: 'transfer_lead', decision: { effect: 'handoff' }, reason: 'Cliente pediu vendedor.' }]
      }
    });
    assert.equal(result.pass, true);
    assert.equal(result.handoff.should_handoff, true);
  });

  it('classificador dá prioridade à mensagem atual e não confunde situações comerciais com pedido humano', () => {
    for (const phrase of [
      'mensagem atual tem prioridade absoluta',
      'preço, desconto, parcela, financiamento, troca, estoque, revisões, garantia, documentos, localização, fotos, agendamento ou faz uma saudação',
      'Perguntar se existe vendedor disponível não é por si só pedir transferência',
      'não infira pedido humano apenas porque'
    ]) assert.equal(classifierSource.toLowerCase().includes(phrase.toLowerCase()), true);
  });

  it('rota de replay é Master-only, Preview-only, branch-only, A4-only e não chama operações de escrita', () => {
    assert.equal(routeSource.includes("env !== 'preview'"), true);
    assert.equal(routeSource.includes("branch !== ALLOWED_BRANCH"), true);
    assert.equal(routeSource.includes("const PILOT_STORE_ID = '239755c3-a2d4-4cdd-9502-f1595031c924'"), true);
    assert.equal(routeSource.includes('requireMaster(request, production)'), true);
    assert.equal(routeSource.includes('ensureAutocarDevStore'), false);
    assert.equal(routeSource.includes('.insert('), false);
    assert.equal(routeSource.includes('.update('), false);
    assert.equal(routeSource.includes('.upsert('), false);
    assert.equal(routeSource.includes('sendEvolution'), false);
    assert.equal(routeSource.includes('external_execution: false'), true);
  });

  it('hard policies preservam a consequência protegida sem obrigar transferência da conversa', () => {
    assert.equal(policySource.includes("transfer_lead: { effect: 'handoff'"), true);
    assert.equal(policySource.includes('bloqueie a consequência protegida e continue o atendimento comercial'), true);
    assert.equal(policySource.includes('não significa, por si só, transferir a conversa'), true);
  });
});
