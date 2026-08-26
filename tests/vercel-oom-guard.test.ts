import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  readResponseTextWithLimit,
  ResponseBodyTooLargeError
} from '../src/lib/server/boundedResponse';
import {
  decodedBase64ByteLength,
  MAX_EVOLUTION_MEDIA_RESPONSE_BYTES,
  MAX_INLINE_MEDIA_BYTES,
  mediaFileLengthBytes
} from '../src/lib/server/whatsappMediaSafety';

const mediaRoute = readFileSync('src/app/api/whatsapp/messages/media/route.ts', 'utf8');
const evolution = readFileSync('src/lib/server/evolution.ts', 'utf8');
const pipelineRoute = readFileSync('src/app/api/store/portal/pipeline/route.ts', 'utf8');
const desktopMedia = readFileSync('src/components/WhatsappMediaMessage.tsx', 'utf8');
const mobileMedia = readFileSync('src/components/WhatsappMobileMediaMessage.tsx', 'utf8');

test('protobuf Long and scalar file sizes are normalized without overflow', () => {
  assert.equal(mediaFileLengthBytes(4_194_304), 4_194_304);
  assert.equal(mediaFileLengthBytes('284274190'), 284_274_190);
  assert.equal(mediaFileLengthBytes({ low: 284_274_190, high: 0, unsigned: true }), 284_274_190);
  assert.equal(mediaFileLengthBytes({ low: 0, high: 1, unsigned: true }), 4_294_967_296);
  assert.equal(mediaFileLengthBytes({ low: 1, high: -1, unsigned: false }), null);
  assert.equal(mediaFileLengthBytes('invalid'), null);
});

test('base64 decoded size is checked before allocating a response buffer', () => {
  assert.equal(decodedBase64ByteLength('YQ=='), 1);
  assert.equal(decodedBase64ByteLength('YWI='), 2);
  assert.equal(decodedBase64ByteLength('YWJj'), 3);
  assert.equal(decodedBase64ByteLength('%%%'), null);
  assert.equal(MAX_INLINE_MEDIA_BYTES, 4 * 1024 * 1024);
  assert.ok(MAX_EVOLUTION_MEDIA_RESPONSE_BYTES > Math.ceil(MAX_INLINE_MEDIA_BYTES / 3) * 4);
});

test('bounded reader rejects an oversized declared response before buffering it', async () => {
  const response = new Response('oversized', { headers: { 'content-length': '999' } });
  await assert.rejects(
    readResponseTextWithLimit(response, 8),
    (error: unknown) => error instanceof ResponseBodyTooLargeError && error.limitBytes === 8
  );
});

test('bounded reader stops a chunked response as soon as it crosses the limit', async () => {
  const response = new Response(new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('1234'));
      controller.enqueue(new TextEncoder().encode('5678'));
      controller.close();
    }
  }));

  await assert.rejects(readResponseTextWithLimit(response, 6), ResponseBodyTooLargeError);
});

test('a simulated 271 MB response is cancelled after the 6 MB safety window', async () => {
  const chunk = new Uint8Array(1024 * 1024);
  let pulls = 0;
  const response = new Response(new ReadableStream<Uint8Array>({
    pull(controller) {
      pulls += 1;
      if (pulls > 271) return controller.close();
      controller.enqueue(chunk);
    }
  }));

  await assert.rejects(
    readResponseTextWithLimit(response, MAX_EVOLUTION_MEDIA_RESPONSE_BYTES),
    ResponseBodyTooLargeError
  );
  assert.ok(pulls <= 8, `reader consumed ${pulls} MB before cancellation`);
});

test('media route enforces both declared and streamed limits', () => {
  assert.match(mediaRoute, /declaredBytes > MAX_INLINE_MEDIA_BYTES/);
  assert.match(mediaRoute, /maxResponseBytes: MAX_EVOLUTION_MEDIA_RESPONSE_BYTES/);
  assert.match(mediaRoute, /decodedBytes > MAX_INLINE_MEDIA_BYTES/);
  assert.match(mediaRoute, /status: 413/);
  assert.match(evolution, /readResponseTextWithLimit\(response, maxResponseBytes\)/);
});

test('pipeline projects only metric keys instead of loading every raw payload', () => {
  assert.doesNotMatch(pipelineRoute, /\.select\('conversation_id,lead_id,direction,raw_payload,sent_at,created_at'\)/);
  assert.match(pipelineRoute, /metric_sender_type:raw_payload->>metric_sender_type/);
  assert.match(pipelineRoute, /autocar_human_handoff:raw_payload->>autocar_human_handoff/);
  assert.match(pipelineRoute, /metadata_profile_picture_url:metadata->>profile_picture_url/);
});

test('desktop and mobile load media only when it approaches the viewport', () => {
  for (const component of [desktopMedia, mobileMedia]) {
    assert.match(component, /new IntersectionObserver/);
    assert.match(component, /rootMargin: '240px'/);
    assert.match(component, /requestedMediaIdRef/);
    assert.doesNotMatch(component, /if \(!supported\) return;\s*void loadMedia\(\);/);
  }
});
