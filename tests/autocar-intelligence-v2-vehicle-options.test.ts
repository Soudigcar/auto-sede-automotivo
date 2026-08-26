import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { autocarCommercialConstitutionV2 } from '../src/lib/server/autocar/commercialConstitutionV2';
import { buildAutocarVehiclePresentationV2 } from '../src/lib/server/autocar/vehiclePresentationV2';
import { evaluateAutocarReplayV2 } from '../src/lib/server/autocar/intelligenceReplayV2';

function vehicle(id: string, photo = `https://example.com/${id}.jpg`) {
  return {
    id,
    brand: 'FIAT',
    model: `Modelo ${id}`,
    version: '1.0',
    year: '2024/2025',
    mileage: '10.000 km',
    fuel: 'Flex',
    transmission: 'Manual',
    price: 49900,
    primary_photo: photo
  };
}

describe('AUTOCAR Intelligence V2 vehicle options presentation', () => {
  it('constituição limita opções e mantém IA na condução comercial', () => {
    const constitution = autocarCommercialConstitutionV2().toLowerCase();
    assert.equal(constitution.includes('no máximo 3 veículos'), true);
    assert.equal(constitution.includes('referenced_vehicle_ids'), true);
    assert.equal(constitution.includes('backend apresentará uma foto principal'), true);
    assert.equal(constitution.includes('cta leve de visita'), true);
  });

  it('monta 3 cards somente com dados grounded e uma foto principal por veículo', () => {
    const presentation = buildAutocarVehiclePresentationV2({
      referencedVehicles: [vehicle('1'), vehicle('2'), vehicle('3')],
      aiResponse: 'Qual dessas opções combina mais com você? Se quiser, posso te ajudar a organizar uma visita.'
    });
    assert.equal(presentation.ready, true);
    assert.equal(presentation.cards.length, 3);
    assert.equal(presentation.cards[0].photo_url, 'https://example.com/1.jpg');
    assert.equal(presentation.cards[0].facts.price_brl, 'R$ 49.900');
    assert.equal(presentation.source, 'grounded_inventory_only');
    assert.equal(presentation.external_execution, false);
    assert.match(presentation.closing_message, /organizar uma visita/i);
  });

  it('falha fechado se IA selecionar mais de 3 veículos', () => {
    const presentation = buildAutocarVehiclePresentationV2({
      referencedVehicles: [vehicle('1'), vehicle('2'), vehicle('3'), vehicle('4')],
      aiResponse: 'Veja as opções.'
    });
    const evaluation = evaluateAutocarReplayV2({
      customerRequestedHuman: false,
      shadow: { response: 'Veja as opções.', next_best_action: 'Escolher um veículo.', proposed_actions: [] },
      vehiclePresentation: presentation
    });
    assert.equal(presentation.ready, false);
    assert.equal(presentation.regression_flags.too_many_vehicle_options, true);
    assert.equal(evaluation.pass, false);
    assert.equal(evaluation.regression_flags.too_many_vehicle_options, true);
  });

  it('falha fechado se alguma opção não tiver foto principal real', () => {
    const presentation = buildAutocarVehiclePresentationV2({
      referencedVehicles: [vehicle('1'), vehicle('2', '')],
      aiResponse: 'Qual você prefere?'
    });
    const evaluation = evaluateAutocarReplayV2({
      customerRequestedHuman: false,
      shadow: { response: 'Qual você prefere?', next_best_action: 'Aguardar escolha.', proposed_actions: [] },
      vehiclePresentation: presentation
    });
    assert.equal(presentation.ready, false);
    assert.equal(presentation.regression_flags.missing_primary_photo, true);
    assert.equal(evaluation.pass, false);
  });

  it('não cria cards para apenas um veículo', () => {
    const presentation = buildAutocarVehiclePresentationV2({
      referencedVehicles: [vehicle('1')],
      aiResponse: 'Esse carro combina com o que você procura.'
    });
    assert.equal(presentation.mode, 'not_applicable');
    assert.equal(presentation.ready, false);
    assert.equal(presentation.regression_flags.missing_primary_photo, false);
  });
});
