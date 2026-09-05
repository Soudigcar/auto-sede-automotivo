import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const autoShadow = readFileSync('src/lib/server/autocar/autoShadow.ts', 'utf8');
const liveVisit = readFileSync('src/lib/server/autocar/liveVisitPilot.ts', 'utf8');
const continuity = readFileSync('src/lib/server/autocar/conversationContinuity.ts', 'utf8');

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
  assert.match(autoShadow, /continuity\?\.execution_ready === true/);
  assert.match(autoShadow, /continuity\?\.fail_closed !== true/);
  assert.match(autoShadow, /secondaryOperationAllowed && continuityExecutionSafe/);
});
