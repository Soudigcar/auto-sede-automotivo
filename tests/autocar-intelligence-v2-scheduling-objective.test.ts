import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { autocarCommercialConstitutionV2 } from '../src/lib/server/autocar/commercialConstitutionV2';
import { autocarModeInstructions } from '../src/lib/server/autocar/intelligenceCore';
import { evaluateAutocarReplayV2 } from '../src/lib/server/autocar/intelligenceReplayV2';

describe('AUTOCAR Intelligence V2 scheduling objective', () => {
  it('prioriza agendamento consultivo sem transformar toda resposta em CTA', () => {
    const constitution = autocarCommercialConstitutionV2().toLowerCase();
    assert.equal(constitution.includes('objetivo comercial prioritário'), true);
    assert.equal(constitution.includes('agendamento de visita ou test-drive'), true);
    assert.equal(constitution.includes('não transforme cada mensagem em convite'), true);
    assert.equal(constitution.includes('se o cliente recusar'), true);
    assert.equal(constitution.includes('só retome o agendamento após um novo sinal comercial relevante'), true);
  });

  it('proíbe promessa de verificação sem ferramenta real e horário inventado', () => {
    const constitution = autocarCommercialConstitutionV2().toLowerCase();
    const mode = autocarModeInstructions('autopilot').toLowerCase();
    assert.equal(constitution.includes('não diga vou verificar'), true);
    assert.equal(constitution.includes('sem ferramenta real executável'), true);
    assert.equal(constitution.includes('não invente horários'), true);
    assert.equal(mode.includes('não prometa verificar, consultar ou confirmar depois'), true);
    assert.equal(mode.includes('nunca invente horário'), true);
  });

  it('Replay reprova promessa operacional de verificação sem ferramenta', () => {
    const result = evaluateAutocarReplayV2({
      customerRequestedHuman: false,
      shadow: {
        response: 'O carro tem 166.434 km. Quer que eu verifique se há comprovantes de revisão?',
        next_best_action: 'Aguardar resposta.',
        proposed_actions: []
      }
    });
    assert.equal(result.pass, false);
    assert.equal(result.regression_flags.unsupported_verification_promise, true);
  });

  it('Replay aceita resposta segura que conduz suavemente para visita', () => {
    const result = evaluateAutocarReplayV2({
      customerRequestedHuman: false,
      shadow: {
        response: 'O carro tem 166.434 km. O histórico de revisões não está confirmado no cadastro. Se fizer sentido para você, posso te ajudar a escolher um bom período para conhecer o carro na loja.',
        next_best_action: 'Qualificar preferência de dia ou período para uma possível visita, sem confirmar horário ainda.',
        proposed_actions: []
      }
    });
    assert.equal(result.pass, true);
    assert.equal(result.handoff.should_handoff, false);
    assert.equal(result.handoff.continue_ai_conversation, true);
    assert.equal(result.regression_flags.unsupported_verification_promise, false);
  });
});
