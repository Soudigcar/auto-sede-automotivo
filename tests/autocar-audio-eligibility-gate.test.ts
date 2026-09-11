import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

function source(path: string) {
  return readFileSync(path, 'utf8');
}

test('inbound audio checks AUTOPILOT and human takeover before media download or OpenAI transcription', () => {
  const audio = source('src/lib/server/autocar/audioPipeline.ts');

  assert.match(audio, /async function audioRuntimeEligibility/);
  assert.match(audio, /master_autopilot_allowed/);
  assert.match(audio, /store_selected_mode === 'autopilot'/);
  assert.match(audio, /runtime\.human_state !== 'autocar_active'/);

  const eligibilityCall = audio.indexOf('await audioRuntimeEligibility(input.storeId, input.conversationId)');
  const mediaDownload = audio.indexOf('await getEvolutionAudioBase64(');
  const transcription = audio.indexOf('await transcribe(bytes, mime)');

  assert.ok(eligibilityCall >= 0, 'audio eligibility call must exist');
  assert.ok(mediaDownload > eligibilityCall, 'media download must occur only after eligibility');
  assert.ok(transcription > mediaDownload, 'OpenAI transcription must occur only after gated media retrieval');
});

test('blocked inbound audio returns without transcript generation while preserving later runtime audit path', () => {
  const audio = source('src/lib/server/autocar/audioPipeline.ts');
  const safeRuntime = source('src/lib/server/autocar/safeRuntime.ts');

  assert.match(audio, /if \(!eligibility\.allowed\)[\s\S]*gated: true[\s\S]*model: null[\s\S]*transcript: ''/);
  assert.match(safeRuntime, /audioPreparation = await prepareAutocarInboundAudio/);
  assert.match(safeRuntime, /const blockedByHuman = runtime\.human_state === 'human_active' \|\| runtime\.human_state === 'paused'/);
  assert.match(safeRuntime, /const ready = effectiveMode === 'autopilot' && !blockedByHuman/);
});

test('live audio revalidates runtime both before TTS and immediately before Evolution send', () => {
  const liveAudio = source('src/lib/server/autocar/liveAudioPilot.ts');

  const firstEligibility = liveAudio.indexOf('const eligibility = await currentLiveEligibility(input.storeId, input.conversationId)');
  const synthesize = liveAudio.indexOf('const speech = await synthesizeAutocarSpeech(response)');
  const sendEligibility = liveAudio.indexOf('const sendEligibility = await currentLiveEligibility(input.storeId, input.conversationId)');
  const evolutionSend = liveAudio.indexOf('const evolutionResult = await sendEvolutionAudio({');

  assert.ok(firstEligibility >= 0, 'pre-TTS eligibility check must exist');
  assert.ok(synthesize > firstEligibility, 'TTS must occur only after eligibility');
  assert.ok(sendEligibility > synthesize, 'runtime must be revalidated after TTS');
  assert.ok(evolutionSend > sendEligibility, 'Evolution send must occur only after final revalidation');
  assert.match(liveAudio, /send_revalidation_blocked: true/);
});

test('vision and document pipelines keep their existing pre-model takeover gates', () => {
  const vision = source('src/lib/server/autocar/visionPipeline.ts');
  const documents = source('src/lib/server/autocar/documentPipeline.ts');

  assert.match(vision, /visionRuntimeEligibility/);
  assert.match(vision, /runtime && runtime\.human_state !== 'autocar_active'/);
  assert.match(documents, /documentRuntimeEligibility/);
  assert.match(documents, /runtime && runtime\.human_state !== 'autocar_active'/);
});
