import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AUTOCAR_DEV_REF,
  AUTOCAR_PRODUCTION_REF,
  autocarExternalReferenceColumns,
  resolveAutocarRuntimeTarget
} from '../src/lib/server/autocar/runtimeEnvironment.ts';

const devUrl = `https://${AUTOCAR_DEV_REF}.supabase.co`;
const productionUrl = `https://${AUTOCAR_PRODUCTION_REF}.supabase.co`;
const key = 'service-role-key-for-autocar-cutover-test';

test('Preview usa exclusivamente autocar-dev e aceita nomes legados durante transição', () => {
  const target = resolveAutocarRuntimeTarget({
    VERCEL_ENV: 'preview',
    AUTOCAR_KNOWLEDGE_SUPABASE_URL: devUrl,
    AUTOCAR_KNOWLEDGE_SUPABASE_SERVICE_ROLE_KEY: key
  } as NodeJS.ProcessEnv);

  assert.equal(target.projectRef, AUTOCAR_DEV_REF);
  assert.equal(target.schema, 'dev_v1');
});

test('Preview rejeita AUTOCAR Production para impedir credencial cruzada', () => {
  assert.throws(() => resolveAutocarRuntimeTarget({
    VERCEL_ENV: 'preview',
    AUTOCAR_DEV_SUPABASE_URL: productionUrl,
    AUTOCAR_DEV_SUPABASE_SERVICE_ROLE_KEY: key
  } as NodeJS.ProcessEnv), /deve usar exclusivamente autocar-dev/);
});

test('Production rejeita autocar-dev mesmo com credenciais novas', () => {
  assert.throws(() => resolveAutocarRuntimeTarget({
    VERCEL_ENV: 'production',
    AUTOCAR_SUPABASE_URL: devUrl,
    AUTOCAR_SUPABASE_SERVICE_ROLE_KEY: key
  } as NodeJS.ProcessEnv), /Production não pode executar AUTOCAR apontando para autocar-dev/);
});

test('Production exige exatamente o projeto AUTOCAR Production', () => {
  const target = resolveAutocarRuntimeTarget({
    VERCEL_ENV: 'production',
    AUTOCAR_SUPABASE_URL: productionUrl,
    AUTOCAR_SUPABASE_SERVICE_ROLE_KEY: key
  } as NodeJS.ProcessEnv);

  assert.equal(target.projectRef, AUTOCAR_PRODUCTION_REF);
  assert.equal(target.schema, 'production_v2');
});

test('Production não faz fallback para variáveis legadas', () => {
  assert.throws(() => resolveAutocarRuntimeTarget({
    VERCEL_ENV: 'production',
    AUTOCAR_KNOWLEDGE_SUPABASE_URL: devUrl,
    AUTOCAR_KNOWLEDGE_SUPABASE_SERVICE_ROLE_KEY: key
  } as NodeJS.ProcessEnv), /AUTOCAR Production não configurada/);
});

test('mapeamento de referências externas preserva V1 e usa production_* no V2', () => {
  const dev = autocarExternalReferenceColumns('dev_v1');
  const production = autocarExternalReferenceColumns('production_v2');

  assert.equal(dev.memory.conversationId, 'conversation_id');
  assert.equal(dev.runs.triggerMessageId, 'trigger_message_id');
  assert.equal(production.memory.conversationId, 'production_conversation_id');
  assert.equal(production.memory.lastProcessedMessageId, 'last_processed_production_message_id');
  assert.equal(production.runs.triggerMessageId, 'production_trigger_message_id');
  assert.equal(production.approvals.resolvedBy, 'resolved_by_profile_id');
});
