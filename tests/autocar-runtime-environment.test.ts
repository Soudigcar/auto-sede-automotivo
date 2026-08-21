import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AUTOCAR_DEV_REF,
  AUTOCAR_PRODUCTION_REF,
  autocarExternalReferenceColumns,
  autocarRuntimePublicDescriptor,
  getAutocarRuntimePublicStatus,
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

test('descritor público identifica Preview e AUTOCAR DEV sem expor credenciais', () => {
  const descriptor = autocarRuntimePublicDescriptor({
    VERCEL_ENV: 'preview',
    AUTOCAR_DEV_SUPABASE_URL: devUrl,
    AUTOCAR_DEV_SUPABASE_SERVICE_ROLE_KEY: key
  } as NodeJS.ProcessEnv);

  assert.deepEqual(descriptor, {
    vercel_environment: 'preview',
    runtime_environment: 'autocar-dev',
    database_state: 'autocar-dev-isolated',
    project_ref: AUTOCAR_DEV_REF,
    schema: 'dev_v1'
  });
  assert.equal(JSON.stringify(descriptor).includes(key), false);
});

test('descritor público identifica Vercel Production e AUTOCAR Production', () => {
  const descriptor = autocarRuntimePublicDescriptor({
    VERCEL_ENV: 'production',
    AUTOCAR_SUPABASE_URL: productionUrl,
    AUTOCAR_SUPABASE_SERVICE_ROLE_KEY: key
  } as NodeJS.ProcessEnv);

  assert.equal(descriptor.vercel_environment, 'production');
  assert.equal(descriptor.runtime_environment, 'autocar-production');
  assert.equal(descriptor.database_state, 'autocar-production-v2');
  assert.equal(descriptor.project_ref, AUTOCAR_PRODUCTION_REF);
  assert.equal(descriptor.schema, 'production_v2');
});

test('status público do Preview informa bloqueio real sem consultar Production', async () => {
  const status = await getAutocarRuntimePublicStatus({
    VERCEL_ENV: 'preview',
    AUTOCAR_DEV_SUPABASE_URL: devUrl,
    AUTOCAR_DEV_SUPABASE_SERVICE_ROLE_KEY: key,
    EVOLUTION_WEBHOOK_SECRET: 'preview-secret-that-must-not-enable-live'
  } as NodeJS.ProcessEnv);

  assert.equal(status.runtime_environment, 'autocar-dev');
  assert.equal(status.external_execution_allowed, false);
  assert.equal(status.automatic_replies_enabled, false);
  assert.equal(status.autopilot_preview_only, true);
  assert.equal(status.webhook_hooked, false);
  assert.equal(status.webhook_status, 'preview-disabled');
  assert.match(status.external_execution_reason, /somente Vercel Production/);
});
