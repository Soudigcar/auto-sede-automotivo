import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AUTOCAR_DEV_REF,
  AUTOCAR_PRODUCTION_REF,
  AUTOCAR_RUNTIME_CUTOVER_CODE_ENABLED,
  autocarExternalReferenceColumns,
  autocarRuntimePublicDescriptor,
  evaluateAutocarProductionRuntimeConfig,
  getAutocarRuntimePublicStatus,
  resolveAutocarRuntimeTarget,
  resolveAutocarRuntimeTargetForCutoverMode
} from '../src/lib/server/autocar/runtimeEnvironment.ts';

const devUrl = `https://${AUTOCAR_DEV_REF}.supabase.co`;
const productionUrl = `https://${AUTOCAR_PRODUCTION_REF}.supabase.co`;
const key = 'service-role-key-for-autocar-cutover-test';

function devEnvironment(vercelEnv: string) {
  return {
    VERCEL_ENV: vercelEnv,
    AUTOCAR_DEV_SUPABASE_URL: devUrl,
    AUTOCAR_DEV_SUPABASE_SERVICE_ROLE_KEY: key
  } as NodeJS.ProcessEnv;
}

function productionEnvironment() {
  return {
    VERCEL_ENV: 'production',
    AUTOCAR_SUPABASE_URL: productionUrl,
    AUTOCAR_SUPABASE_SERVICE_ROLE_KEY: key
  } as NodeJS.ProcessEnv;
}

test('cutover definitivo fica habilitado por código nesta revisão', () => {
  assert.equal(AUTOCAR_RUNTIME_CUTOVER_CODE_ENABLED, true);
});

test('Preview continua usando exclusivamente autocar-dev mesmo com cutover definitivo habilitado', () => {
  const target = resolveAutocarRuntimeTarget({
    VERCEL_ENV: 'preview',
    AUTOCAR_KNOWLEDGE_SUPABASE_URL: devUrl,
    AUTOCAR_KNOWLEDGE_SUPABASE_SERVICE_ROLE_KEY: key
  } as NodeJS.ProcessEnv);

  assert.equal(target.projectRef, AUTOCAR_DEV_REF);
  assert.equal(target.schema, 'dev_v1');
  assert.equal(target.transitionMode, 'development_dev');
});

test('Preview rejeita AUTOCAR Production para impedir credencial cruzada', () => {
  assert.throws(() => resolveAutocarRuntimeTargetForCutoverMode({
    VERCEL_ENV: 'preview',
    AUTOCAR_DEV_SUPABASE_URL: productionUrl,
    AUTOCAR_DEV_SUPABASE_SERVICE_ROLE_KEY: key
  } as NodeJS.ProcessEnv, true), /deve usar exclusivamente autocar-dev/);
});

test('helper preserva modo pré-cutover somente quando explicitamente solicitado', () => {
  const target = resolveAutocarRuntimeTargetForCutoverMode(devEnvironment('production'), false);

  assert.equal(target.projectRef, AUTOCAR_DEV_REF);
  assert.equal(target.schema, 'dev_v1');
  assert.equal(target.transitionMode, 'pre_cutover_dev_shadow');
});

test('Production definitiva seleciona exclusivamente AUTOCAR Production por padrão', () => {
  const target = resolveAutocarRuntimeTarget(productionEnvironment());

  assert.equal(target.projectRef, AUTOCAR_PRODUCTION_REF);
  assert.equal(target.schema, 'production_v2');
  assert.equal(target.transitionMode, 'cutover_production');
});

test('Production definitiva rejeita autocar-dev no slot Production', () => {
  assert.throws(() => resolveAutocarRuntimeTarget({
    VERCEL_ENV: 'production',
    AUTOCAR_SUPABASE_URL: devUrl,
    AUTOCAR_SUPABASE_SERVICE_ROLE_KEY: key
  } as NodeJS.ProcessEnv), /cutover Production não pode executar AUTOCAR apontando para autocar-dev/);
});

test('Production definitiva não faz fallback para credenciais DEV', () => {
  assert.throws(() => resolveAutocarRuntimeTarget({
    VERCEL_ENV: 'production',
    AUTOCAR_DEV_SUPABASE_URL: devUrl,
    AUTOCAR_DEV_SUPABASE_SERVICE_ROLE_KEY: key
  } as NodeJS.ProcessEnv), /AUTOCAR Production não configurada/);
});

test('Production definitiva rejeita qualquer projeto AUTOCAR diferente do Production autorizado', () => {
  assert.throws(() => resolveAutocarRuntimeTarget({
    VERCEL_ENV: 'production',
    AUTOCAR_SUPABASE_URL: 'https://aaaaaaaaaaaaaaaaaaaa.supabase.co',
    AUTOCAR_SUPABASE_SERVICE_ROLE_KEY: key
  } as NodeJS.ProcessEnv), /projeto AUTOCAR não autorizado/);
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

test('descritor público mantém Preview em AUTOCAR DEV sem expor credenciais', () => {
  const descriptor = autocarRuntimePublicDescriptor(devEnvironment('preview'));

  assert.equal(descriptor.vercel_environment, 'preview');
  assert.equal(descriptor.runtime_environment, 'autocar-dev');
  assert.equal(descriptor.database_state, 'autocar-dev-isolated');
  assert.equal(descriptor.project_ref, AUTOCAR_DEV_REF);
  assert.equal(descriptor.schema, 'dev_v1');
  assert.equal(descriptor.transition_mode, 'development_dev');
  assert.equal(descriptor.cutover_code_enabled, true);
  assert.equal(JSON.stringify(descriptor).includes(key), false);
});

test('descritor público de Production declara cutover definitivo para AUTOCAR Production', () => {
  const descriptor = autocarRuntimePublicDescriptor(productionEnvironment());

  assert.equal(descriptor.vercel_environment, 'production');
  assert.equal(descriptor.runtime_environment, 'autocar-production');
  assert.equal(descriptor.database_state, 'autocar-production-v2');
  assert.equal(descriptor.project_ref, AUTOCAR_PRODUCTION_REF);
  assert.equal(descriptor.schema, 'production_v2');
  assert.equal(descriptor.transition_mode, 'cutover_production');
  assert.equal(descriptor.cutover_code_enabled, true);
  assert.equal(JSON.stringify(descriptor).includes(key), false);
});

test('configuração Production definitiva bloqueia execução quando live_enabled=false', () => {
  const target = resolveAutocarRuntimeTarget(productionEnvironment());
  const gate = evaluateAutocarProductionRuntimeConfig({
    environment: 'production',
    schema_version: 2,
    live_enabled: false
  }, target);

  assert.equal(gate.allowed, false);
  assert.equal(gate.live_enabled, false);
  assert.equal(gate.transition_mode, 'cutover_production');
  assert.match(gate.reason, /live_enabled=false/);
});

test('configuração Production definitiva libera somente env/schema/live corretos', () => {
  const target = resolveAutocarRuntimeTarget(productionEnvironment());
  const gate = evaluateAutocarProductionRuntimeConfig({
    environment: 'production',
    schema_version: 2,
    live_enabled: true
  }, target);

  assert.equal(gate.allowed, true);
  assert.equal(gate.project_ref, AUTOCAR_PRODUCTION_REF);
  assert.equal(gate.transition_mode, 'cutover_production');
});

test('configuração Production definitiva falha fechado para environment incorreto', () => {
  const target = resolveAutocarRuntimeTarget(productionEnvironment());
  const gate = evaluateAutocarProductionRuntimeConfig({
    environment: 'development',
    schema_version: 2,
    live_enabled: true
  }, target);

  assert.equal(gate.allowed, false);
  assert.match(gate.reason, /não se identifica como production/);
});

test('configuração Production definitiva falha fechado para schema incorreto', () => {
  const target = resolveAutocarRuntimeTarget(productionEnvironment());
  const gate = evaluateAutocarProductionRuntimeConfig({
    environment: 'production',
    schema_version: 1,
    live_enabled: true
  }, target);

  assert.equal(gate.allowed, false);
  assert.match(gate.reason, /schema AUTOCAR incompatível/);
});

test('status público do Preview informa bloqueio real sem consultar Production', async () => {
  const status = await getAutocarRuntimePublicStatus({
    ...devEnvironment('preview'),
    EVOLUTION_WEBHOOK_SECRET: 'preview-secret-that-must-not-enable-live'
  } as NodeJS.ProcessEnv);

  assert.equal(status.runtime_environment, 'autocar-dev');
  assert.equal(status.transition_mode, 'development_dev');
  assert.equal(status.cutover_code_enabled, true);
  assert.equal(status.external_execution_allowed, false);
  assert.equal(status.automatic_replies_enabled, false);
  assert.equal(status.autopilot_preview_only, true);
  assert.equal(status.webhook_hooked, false);
  assert.equal(status.webhook_status, 'preview-disabled');
  assert.match(status.external_execution_reason, /somente Vercel Production/);
});
