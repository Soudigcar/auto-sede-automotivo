import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const autoShadow = readFileSync('src/lib/server/autocar/autoShadow.ts', 'utf8');
const liveVisit = readFileSync('src/lib/server/autocar/liveVisitPilot.ts', 'utf8');
const continuity = readFileSync('src/lib/server/autocar/conversationContinuity.ts', 'utf8');
const smartFollowUp = readFileSync('src/lib/server/autocar/smartFollowUp.ts', 'utf8');
const vehiclePresentation = readFileSync('src/lib/server/autocar/vehiclePresentationV2.ts', 'utf8');
const followUpCron = readFileSync('src/app/api/cron/autocar-follow-up/route.ts', 'utf8');

test('Booking mantém prioridade mesmo quando Vehicle State é concluído', () => {
  assert.match(autoShadow, /const bookingActive = bookingState !== 'NOT_APPLICABLE'/);
  assert.match(autoShadow, /vehicleStateHandled && !bookingActive/);
  assert.match(autoShadow, /if \(bookingActive\) \{\s*liveVisit = await attemptAutocarLiveVisitPilot/s);
  assert.doesNotMatch(autoShadow, /if \(!vehicleStateHandled && shadow\?\.booking_guard\?\.state !== 'NOT_APPLICABLE'\)/);
});

test('READY_TO_SCHEDULE não envia texto antes da transação de agenda', () => {
  assert.match(autoShadow, /bookingState === 'READY_TO_SCHEDULE'[\s\S]*Confirmação textual será gerada somente depois da transação real de agendamento/);
});

test('confirmação de visita é generativa e só ocorre depois da transação real', () => {
  assert.match(liveVisit, /createAutocarStructuredResponse/);
  assert.match(liveVisit, /schemaName: 'autocar_visit_confirmation_generative'/);
  assert.doesNotMatch(liveVisit, /function formatVisitConfirmation/);
  assert.doesNotMatch(liveVisit, /Pronto! Sua visita ficou agendada/);
  assert.match(liveVisit, /fixed_text_fallback_disabled: true/);

  const transactionIndex = liveVisit.indexOf("rpc('autocar_schedule_visit_transaction'");
  const generationIndex = liveVisit.indexOf('confirmation = await generateVisitConfirmation');
  assert.ok(transactionIndex >= 0, 'RPC transacional de visita precisa existir');
  assert.ok(generationIndex > transactionIndex, 'a confirmação generativa deve ocorrer somente após a transação');
});

test('próximo passo após visita é opcional, validado e nunca uma sequência fixa', () => {
  assert.match(liveVisit, /enum: \['none', 'offer_location', 'offer_photos'\]/);
  assert.match(liveVisit, /POD[Ee] oferecer no máximo UM próximo passo/i);
  assert.match(liveVisit, /Não existe ordem fixa entre elas/);
  assert.match(liveVisit, /location_available/);
  assert.match(liveVisit, /photos_available/);
});

test('continuidade resolve aceite semanticamente e falha fechada em ambiguidade', () => {
  assert.match(continuity, /task: 'semantic_extraction'/);
  assert.match(continuity, /Não use listas de palavras-chave nem correspondência literal/);
  assert.match(continuity, /use none\/unclear e não autorize execução/);
  assert.match(continuity, /pending_action/);
  assert.match(continuity, /send_location/);
  assert.match(continuity, /send_photos/);
  assert.match(continuity, /fail_closed/);
});

test('execução de continuidade exige geração íntegra antes de liberar operação', () => {
  assert.match(autoShadow, /const continuityExecutionSafe = isAutocarContinuityExecutionSafe\(continuity\)/);
  assert.match(autoShadow, /secondaryOperationAllowed && continuityExecutionSafe/);
});

test('Smart Follow-up V1 remove templates comerciais e gera copy contextual fail-closed', () => {
  assert.match(smartFollowUp, /createAutocarStructuredResponse/);
  assert.match(smartFollowUp, /schemaName: 'autocar_smart_follow_up_v1_generative'/);
  assert.match(smartFollowUp, /fixed_text_fallback_disabled: true/);
  assert.match(smartFollowUp, /generation_fail_closed/);
  assert.doesNotMatch(smartFollowUp, /function textFor/);
  assert.doesNotMatch(smartFollowUp, /Passando para confirmar sua visita conosco/);
  assert.doesNotMatch(smartFollowUp, /Queria saber se você foi bem atendido na visita/);
  assert.doesNotMatch(smartFollowUp, /Conseguiu passar na loja como combinado\?/);
  assert.doesNotMatch(smartFollowUp, /Você pediu para eu falar com você agora/);
  assert.match(followUpCron, /process\.env\.VERCEL_ENV !== 'preview'/);
  assert.match(followUpCron, /external_execution: false/);
});

test('Vehicle Presentation V2 usa somente abertura generativa e falha fechado sem ela', () => {
  assert.match(vehiclePresentation, /generatedOpening = clean\(input\.aiResponse/);
  assert.match(vehiclePresentation, /missing_generative_opening/);
  assert.match(vehiclePresentation, /fixed_text_fallback_disabled: true/);
  assert.match(vehiclePresentation, /opening_message: ready \? generatedOpening : ''/);
  assert.match(vehiclePresentation, /external_execution: false/);
  assert.doesNotMatch(vehiclePresentation, /Separei \$\{cards\.length\} opções para você comparar/);
});
