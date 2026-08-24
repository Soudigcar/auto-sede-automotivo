import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const runtimeSource = fs.readFileSync(
  path.join(process.cwd(), 'src/lib/server/autocar/safeRuntime.ts'),
  'utf8'
);

test('claim skipped não define completed_at antes do INSERT', () => {
  const insertStart = runtimeSource.indexOf(".from('ai_runtime_message_claims').insert({");
  const insertEnd = runtimeSource.indexOf('}).select(\'*\').single();', insertStart);
  assert.ok(insertStart >= 0);
  assert.ok(insertEnd > insertStart);

  const insertBlock = runtimeSource.slice(insertStart, insertEnd);
  assert.equal(insertBlock.includes('completed_at:'), false);
  assert.equal(insertBlock.includes('updated_at: new Date().toISOString()'), false);
});

test('claim skipped usa created_at persistido pelo banco como completed_at', () => {
  assert.equal(runtimeSource.includes('if (!ready) {'), true);
  assert.equal(runtimeSource.includes('insertedClaim?.created_at'), true);
  assert.equal(
    runtimeSource.includes('.update({ completed_at: insertedClaim.created_at })'),
    true
  );
  assert.equal(runtimeSource.includes(".eq('status', 'skipped')"), true);
});

test('claim ready não é finalizado pelo caminho de skipped', () => {
  const skippedStart = runtimeSource.indexOf('if (!ready) {');
  const lastProcessedStart = runtimeSource.indexOf(
    'await upsertRuntimeConversation(autocar, ref, effectiveMode, {\n    last_processed_message_id',
    skippedStart
  );
  assert.ok(skippedStart >= 0);
  assert.ok(lastProcessedStart > skippedStart);

  const skippedBlock = runtimeSource.slice(skippedStart, lastProcessedStart);
  assert.equal(skippedBlock.includes(".eq('status', 'skipped')"), true);
  assert.equal(skippedBlock.includes("status: 'completed'"), false);
});
