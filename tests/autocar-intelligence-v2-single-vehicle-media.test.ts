import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildAutocarSingleVehicleMediaV2 } from '../src/lib/server/autocar/singleVehicleMediaV2';
import { evaluateAutocarReplayV2 } from '../src/lib/server/autocar/intelligenceReplayV2';

const hb20 = {
  id: 'vehicle-hb20',
  brand: 'Hyundai',
  model: 'HB20',
  version: '1.0',
  year: '2015',
  mileage: '189.775 km',
  fuel: 'Flex',
  transmission: 'Manual',
  price: 41900,
  primary_photo: 'https://example.com/hb20-1.jpg',
  photos: [
    'https://example.com/hb20-1.jpg',
    'https://example.com/hb20-2.jpg',
    'https://example.com/hb20-3.jpg',
    'https://example.com/hb20-4.jpg'
  ]
};

describe('AUTOCAR V2 single vehicle grounded media', () => {
  it('seleciona no máximo 3 fotos reais para um único veículo quando send_photos é proposto', () => {
    const media = buildAutocarSingleVehicleMediaV2({
      referencedVehicles: [hb20],
      proposedActions: [{ capability: 'send_photos', reason: 'Cliente escolheu o HB20' }],
      aiResponse: 'Separei algumas fotos do HB20. Se gostar, prefere conhecer pela manhã ou à tarde?'
    });
    assert.equal(media.ready, true);
    assert.equal(media.mode, 'single_vehicle_media');
    assert.equal(media.photo_count, 3);
    assert.deepEqual(media.presentation_sequence, ['grounded_photos', 'ai_response']);
    assert.equal(media.source, 'grounded_inventory_only');
    assert.equal(media.external_execution, false);
  });

  it('falha fechado quando send_photos referencia mais de um veículo', () => {
    const media = buildAutocarSingleVehicleMediaV2({
      referencedVehicles: [hb20, { ...hb20, id: 'vehicle-2', model: 'Logan' }],
      proposedActions: [{ capability: 'send_photos', reason: 'Mostrar fotos' }],
      aiResponse: 'Separei as fotos.'
    });
    assert.equal(media.ready, false);
    assert.equal(media.regression_flags.invalid_vehicle_reference_count, true);
  });

  it('falha fechado quando o veículo não possui foto real', () => {
    const media = buildAutocarSingleVehicleMediaV2({
      referencedVehicles: [{ ...hb20, primary_photo: null, photos: [] }],
      proposedActions: [{ capability: 'send_photos', reason: 'Mostrar fotos' }],
      aiResponse: 'Separei algumas fotos.'
    });
    assert.equal(media.ready, false);
    assert.equal(media.regression_flags.missing_grounded_photos, true);
  });

  it('Replay reprova afirmação prematura de fotos já enviadas', () => {
    const media = buildAutocarSingleVehicleMediaV2({
      referencedVehicles: [hb20],
      proposedActions: [{ capability: 'send_photos', reason: 'Mostrar fotos' }],
      aiResponse: 'Já te enviei as fotos do HB20.'
    });
    const result = evaluateAutocarReplayV2({
      customerRequestedHuman: false,
      shadow: {
        response: 'Já te enviei as fotos do HB20.',
        next_best_action: 'Aguardar reação do cliente.',
        proposed_actions: [{ capability: 'send_photos', reason: 'Mostrar fotos' }]
      },
      singleVehicleMedia: media
    });
    assert.equal(result.pass, false);
    assert.equal(result.regression_flags.premature_photo_sent_claim, true);
  });

  it('Replay aceita fotos grounded seguidas por CTA leve sem execução externa', () => {
    const media = buildAutocarSingleVehicleMediaV2({
      referencedVehicles: [hb20],
      proposedActions: [{ capability: 'send_photos', reason: 'Mostrar fotos' }],
      aiResponse: 'Separei algumas fotos do HB20. Se fizer sentido, prefere conhecer pela manhã ou à tarde?'
    });
    const result = evaluateAutocarReplayV2({
      customerRequestedHuman: false,
      shadow: {
        response: 'Separei algumas fotos do HB20. Se fizer sentido, prefere conhecer pela manhã ou à tarde?',
        next_best_action: 'Aguardar preferência de período.',
        proposed_actions: [{ capability: 'send_photos', reason: 'Mostrar fotos' }]
      },
      singleVehicleMedia: media
    });
    assert.equal(result.pass, true);
    assert.equal(result.regression_flags.premature_photo_sent_claim, false);
    assert.equal(result.external_execution, false);
  });
});
