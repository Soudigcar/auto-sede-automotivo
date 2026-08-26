import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { autocarCommercialConstitutionV2 } from '../src/lib/server/autocar/commercialConstitutionV2';
import { buildAutocarVehiclePresentationV2 } from '../src/lib/server/autocar/vehiclePresentationV2';
import { hydrateAutocarVehicleRowsV2 } from '../src/lib/server/autocar/presentedVehicleHydrationV2';
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

function stockRow(id: string, storeId = 'store-a') {
  return {
    id,
    store_id: storeId,
    brand: id === 'hb20' ? 'HYUNDAI' : 'FIAT',
    model: id === 'hb20' ? 'HB20' : 'WEEKEND',
    version: 'Adventure',
    year: '2016/2017',
    manufacture_year: 2016,
    model_year: 2017,
    mileage: '100.000 Km',
    color: 'Prata',
    transmission: 'Manual',
    fuel: 'Flex',
    price: 42900,
    image_url: `https://example.com/${id}-1.jpg`,
    image_urls: [`https://example.com/${id}-1.jpg`, `https://example.com/${id}-2.jpg`],
    status: 'disponivel',
    sold_at: null
  };
}

describe('AUTOCAR Intelligence V2 vehicle options presentation', () => {
  it('constituição limita opções e mantém IA na condução comercial', () => {
    const constitution = autocarCommercialConstitutionV2().toLowerCase();
    assert.equal(constitution.includes('no máximo 3 veículos'), true);
    assert.equal(constitution.includes('presented_vehicle_ids'), true);
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
  });

  it('falha fechado se IA selecionar mais de 3 veículos apresentados', () => {
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
  });

  it('hidrata IDs apresentados com foto e dados completos sem depender do inventory_index resumido', () => {
    const hydration = hydrateAutocarVehicleRowsV2({
      storeId: 'store-a',
      requestedIds: ['hb20', 'weekend'],
      directRows: [stockRow('hb20'), stockRow('weekend')]
    });
    assert.equal(hydration.requested_count, 2);
    assert.equal(hydration.hydrated_count, 2);
    assert.deepEqual(hydration.missing_ids, []);
    assert.equal(hydration.vehicles[0].primary_photo, 'https://example.com/hb20-1.jpg');
    assert.equal(hydration.vehicles[0].photos.length, 2);
    assert.equal(hydration.source, 'store_inventory_revalidation_read_only');
  });

  it('reprova se um veículo apresentado não pertencer à loja ou não sobreviver à revalidação', () => {
    const hydration = hydrateAutocarVehicleRowsV2({
      storeId: 'store-a',
      requestedIds: ['hb20', 'weekend'],
      directRows: [stockRow('hb20'), stockRow('weekend', 'store-b')]
    });
    const presentation = buildAutocarVehiclePresentationV2({
      referencedVehicles: hydration.vehicles,
      aiResponse: 'Qual deles você quer conhecer melhor?'
    });
    const evaluation = evaluateAutocarReplayV2({
      customerRequestedHuman: false,
      shadow: { response: 'Qual deles você quer conhecer melhor?', next_best_action: 'Aguardar escolha.', proposed_actions: [] },
      vehiclePresentation: presentation,
      presentedVehicleHydration: hydration
    });
    assert.equal(hydration.hydrated_count, 1);
    assert.deepEqual(hydration.missing_ids, ['weekend']);
    assert.equal(evaluation.regression_flags.presented_vehicle_revalidation_failed, true);
    assert.equal(evaluation.pass, false);
  });

  it('caso “Chegou algum outro carro?” pode citar Logan como contexto e hidratar apenas HB20 e Weekend', () => {
    const hydration = hydrateAutocarVehicleRowsV2({
      storeId: 'store-a',
      requestedIds: ['hb20', 'weekend'],
      directRows: [stockRow('hb20'), stockRow('weekend')]
    });
    const presentation = buildAutocarVehiclePresentationV2({
      referencedVehicles: hydration.vehicles,
      aiResponse: 'Além do Logan, tenho HB20 e Weekend. Qual deles te interessou mais?'
    });
    const evaluation = evaluateAutocarReplayV2({
      customerRequestedHuman: false,
      shadow: {
        response: 'Além do Logan, tenho HB20 e Weekend. Qual deles te interessou mais?',
        next_best_action: 'Aguardar a escolha do cliente.',
        proposed_actions: []
      },
      vehiclePresentation: presentation,
      presentedVehicleHydration: hydration
    });
    assert.equal(presentation.option_count, 2);
    assert.equal(presentation.ready, true);
    assert.equal(evaluation.pass, true);
    assert.equal(evaluation.regression_flags.too_many_vehicle_options, false);
    assert.equal(evaluation.regression_flags.missing_primary_photo, false);
    assert.equal(evaluation.regression_flags.presented_vehicle_revalidation_failed, false);
  });
});
