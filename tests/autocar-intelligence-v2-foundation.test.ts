import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { autocarCommercialConstitutionV2 } from '../src/lib/server/autocar/commercialConstitutionV2';
import { selectRelevantKnowledge, selectRelevantTraining } from '../src/lib/server/autocar/contextEngineV2';
import { normalizeCommercialMemoryV2 } from '../src/lib/server/autocar/commercialMemoryV2';
import { resolveAutocarHandoffV2 } from '../src/lib/server/autocar/handoffSemanticsV2';
import { planAutocarFollowUpV2 } from '../src/lib/server/autocar/followUpV2Planner';
import { autocarModeInstructions } from '../src/lib/server/autocar/intelligenceCore';

const followUpSource = fs.readFileSync(path.join(process.cwd(), 'src/lib/server/autocar/followUpV2Planner.ts'), 'utf8');

describe('AUTOCAR Intelligence V2 foundation', () => {
  it('define missão comercial completa sem enfraquecer o SAFE CORE', () => {
    const constitution = autocarCommercialConstitutionV2();
    assert.equal(constitution.includes('conduzir o lead'), true);
    assert.equal(constitution.includes('SAFE CORE sempre prevalece'), true);
    assert.equal(constitution.includes('Só deve ser proposto quando o próprio cliente solicitar'), false);
    assert.equal(constitution.includes('atendimento humano automático só deve ser proposto quando o próprio cliente solicitar'), true);
  });

  it('remove treinamento irrelevante e limita o contexto recuperado', () => {
    const rows = [
      { id: 'a', similarity: 0.91 },
      { id: 'b', similarity: 0.75 },
      { id: 'c', similarity: 0.63 },
      { id: 'd', similarity: 0.57 },
      { id: 'e', similarity: 0.99 }
    ];
    const selected = selectRelevantTraining(rows as any);
    assert.deepEqual(selected.map((row: any) => row.id), ['e', 'a', 'b']);
    assert.equal(selected.some((row: any) => row.id === 'd'), false);
  });

  it('prioriza conhecimento relevante da loja e aplica orçamento de trechos', () => {
    const long = 'x'.repeat(3000);
    const selected = selectRelevantKnowledge([
      { id: 's1', scope: 'store', store_id: 'store-1', similarity: 0.91, content: long },
      { id: 's2', scope: 'store', store_id: 'store-2', similarity: 0.95, content: 'outra loja' },
      { id: 'm1', scope: 'method', store_id: null, similarity: 0.8, content: long },
      { id: 'm2', scope: 'method', store_id: null, similarity: 0.49, content: 'irrelevante' }
    ] as any, 'store-1');
    assert.equal(selected.store.length, 1);
    assert.equal(selected.method.length, 1);
    assert.equal(String((selected.store[0] as any).content).length <= 1601, true);
    assert.equal(selected.all.some((row: any) => row.id === 's2'), false);
    assert.equal(selected.all.some((row: any) => row.id === 'm2'), false);
  });

  it('normaliza memória comercial existente sem inventar dados', () => {
    const memory = normalizeCommercialMemoryV2({
      rolling_summary: 'Cliente quer financiar um HB20 e informou entrada.',
      temperature: 'quente',
      qualification_score: 72,
      score_breakdown: { active_vehicle: 'HB20 2015', down_payment: 'R$ 10.000', customer_requested_human: false },
      active_objections: ['parcela'],
      open_questions: ['prazo'],
      next_best_action: 'Confirmar prazo do financiamento',
      human_state: 'autocar_active'
    });
    assert.equal(memory.stage, 'financing_trade');
    assert.equal(memory.active_vehicle, 'HB20 2015');
    assert.equal(memory.customer_requested_human, false);
    assert.deepEqual(memory.objections, ['parcela']);
  });

  it('não confunde ação protegida com pedido de humano', () => {
    const decision = resolveAutocarHandoffV2({
      customerRequestedHuman: false,
      proposedActions: [{ capability: 'negotiate_price', decision: { effect: 'handoff' }, reason: 'Preço exige validação.' }]
    });
    assert.equal(decision.should_handoff, false);
    assert.equal(decision.continue_ai_conversation, true);
    assert.equal(decision.protected_actions.length, 1);
  });

  it('faz handoff quando a intenção semântica do cliente já foi classificada como pedido de humano', () => {
    const decision = resolveAutocarHandoffV2({ customerRequestedHuman: true, proposedActions: [] });
    assert.equal(decision.should_handoff, true);
    assert.equal(decision.continue_ai_conversation, false);
  });

  it('instrui o AUTOPILOT a continuar conversando diante de validação humana', () => {
    const instructions = autocarModeInstructions('autopilot');
    assert.equal(instructions.includes('não encerra a conversa por si só'), true);
    assert.equal(instructions.includes('Só proponha transfer_lead quando o cliente solicitar semanticamente'), true);
  });

  it('mantém Follow-up V2 estritamente dry-run e sem caminho de envio externo', () => {
    assert.equal(followUpSource.includes('sendEvolution'), false);
    assert.equal(followUpSource.includes('external_execution: false'), true);
  });

  it('planeja retomada contextual apenas após a janela da etapa', () => {
    const memory = normalizeCommercialMemoryV2({
      rolling_summary: 'Cliente avaliando HB20 disponível.',
      score_breakdown: { active_vehicle: 'HB20 2015' },
      next_best_action: 'Perguntar se deseja simulação',
      human_state: 'autocar_active'
    });
    const result = planAutocarFollowUpV2({
      memory,
      lastCustomerMessageAt: '2026-08-25T10:00:00.000Z',
      lastAutocarMessageAt: '2026-08-25T10:05:00.000Z',
      leadStatus: 'in_service',
      humanState: 'autocar_active',
      now: new Date('2026-08-25T17:00:00.000Z')
    });
    assert.equal(result.decision, 'would_plan');
    assert.equal(result.external_execution, false);
    assert.equal(result.suggested_objective, 'Perguntar se deseja simulação');
  });

  it('bloqueia follow-up quando humano assumiu, cliente pediu humano, houve opt-out ou venda', () => {
    const baseMemory = normalizeCommercialMemoryV2({ rolling_summary: 'Cliente interessado em veículo.', human_state: 'autocar_active' });
    const common = {
      lastCustomerMessageAt: '2026-08-25T10:00:00.000Z',
      lastAutocarMessageAt: '2026-08-25T10:05:00.000Z',
      now: new Date('2026-08-26T10:00:00.000Z')
    };
    assert.equal(planAutocarFollowUpV2({ ...common, memory: baseMemory, humanState: 'human_active' }).decision, 'blocked');
    assert.equal(planAutocarFollowUpV2({ ...common, memory: baseMemory, optOut: true }).decision, 'blocked');
    assert.equal(planAutocarFollowUpV2({ ...common, memory: baseMemory, leadStatus: 'sale_confirmed' }).decision, 'blocked');
    const humanMemory = { ...baseMemory, customer_requested_human: true };
    assert.equal(planAutocarFollowUpV2({ ...common, memory: humanMemory }).decision, 'blocked');
  });
});
