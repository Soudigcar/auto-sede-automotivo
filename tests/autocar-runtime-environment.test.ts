import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AUTOCAR_DEV_REF,
  AUTOCAR_PRODUCTION_REF,
  AUTOCAR_RUNTIME_CUTOVER_CODE_ENABLED,
  autocarExternalReferenceColumns,
  autocarRuntimePublicDescriptor,
  evaluateAutocarExternalExecutionGate,
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

test('cutover definitivo permanece bloqueado por código nesta revisão', () => {
  assert.equal(AUTOCAR_RUNTIME_CUTOVER_CODE_ENABLED, false);
});

test('Preview usa exclusivamente autocar-dev e aceita nomes legados durante transição', () => {
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
  } as NodeJS.ProcessEnv, false), /deve usar exclusivamente autocar-dev/);
});

test('Production pré-cutover preserva explicitamente autocar-dev + Shadow Mirror', () => {
  const target = resolveAutocarRuntimeTargetForCutoverMode(devEnvironment('production'), false);

  assert.equal(target.projectRef, AUTOCAR_DEV_REF);
  assert.equal(target.schema, 'dev_v1');
  assert.equal(target.transitionMode, 'pre_cutover_dev_shadow');
});

test('Production pré-cutover não faz fallback silencioso para credenciais Production', () => {
  assert.throws(() => resolveAutocarRuntimeTargetForCutoverMode({
    ...productionEnvironment(),
    AUTOCAR_DEV_SUPABASE_URL: '',
    AUTOCAR_DEV_SUPABASE_SERVICE_ROLE_KEY: '',
    AUTOCAR_KNOWLEDGE_SUPABASE_URL: '',
    AUTOCAR_KNOWLEDGE_SUPABASE_SERVICE_ROLE_KEY: ''
  } as NodeJS.ProcessEnv, false), /não haverá fallback silencioso para AUTOCAR Production/);
});

test('cutover futuro exige exatamente AUTOCAR Production', () => {
  const target = resolveAutocarRuntimeTargetForCutoverMode(productionEnvironment(), true);

  assert.equal(target.projectRef, AUTOCAR_PRODUCTION_REF);
  assert.equal(target.schema, 'production_v2');
  assert.equal(target.transitionMode, 'cutover_production');
});

test('cutover futuro rejeita autocar-dev mesmo que credencial seja fornecida no slot Production', () => {
  assert.throws(() => resolveAutocarRuntimeTargetForCutoverMode({
    VERCEL_ENV: 'production',
    AUTOCAR_SUPABASE_URL: devUrl,
    AUTOCAR_SUPABASE_SERVICE_ROLE_KEY: key
  } as NodeJS.ProcessEnv, true), /cutover Production não pode executar AUTOCAR apontando para autocar-dev/);
});

test('cutover futuro não faz fallback de Production para credenciais DEV', () => {
  assert.throws(() => resolveAutocarRuntimeTargetForCutoverMode({
    VERCEL_ENV: 'production',
    AUTOCAR_DEV_SUPABASE_URL: devUrl,
    AUTOCAR_DEV_SUPABASE_SERVICE_ROLE_KEY: key
  } as NodeJS.ProcessEnv, true), /AUTOCAR Production não configurada/);
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
  const descriptor = autocarRuntimePublicDescriptor(devEnvironment('preview'));

  assert.equal(descriptor.vercel_environment, 'preview');
  assert.equal(descriptor.runtime_environment, 'autocar-dev');
  assert.equal(descriptor.database_state, 'autocar-dev-isolated');
  assert.equal(descriptor.project_ref, AUTOCAR_DEV_REF);
  assert.equal(descriptor.schema, 'dev_v1');
  assert.equal(descriptor.transition_mode, 'development_dev');
  assert.equal(descriptor.cutover_code_enabled, false);
  assert.equal(JSON.stringify(descriptor).includes(key), false);
});

test('descritor público de Production atual declara pré-cutover DEV de forma explícita', () => {
  const descriptor = autocarRuntimePublicDescriptor(devEnvironment('production'));

  assert.equal(descriptor.vercel_environment, 'production');
  assert.equal(descriptor.runtime_environment, 'autocar-dev');
  assert.equal(descriptor.database_state, 'autocar-dev-isolated');
  assert.equal(descriptor.project_ref, AUTOCAR_DEV_REF);
  assert.equal(descriptor.schema, 'dev_v1');
  assert.equal(descriptor.transition_mode, 'pre_cutover_dev_shadow');
  assert.equal(descriptor.cutover_code_enabled, false);
});

test('gate externo de Production pré-cutover preserva o LIVE atual sem consultar AUTOCAR Production', async () => {
  const gate = await evaluateAutocarExternalExecutionGate(devEnvironment('production'));

  assert.equal(gate.allowed, true);
  assert.equal(gate.project_ref, AUTOCAR_DEV_REF);
  assert.equal(gate.live_enabled, false);
  assert.equal(gate.transition_mode, 'pre_cutover_dev_shadow');
  assert.match(gate.reason, /Pré-cutover controlado/);
});

test('configuração Production definitiva bloqueia execução quando live_enabled=false', () => {
  const target = resolveAutocarRuntimeTargetForCutoverMode(productionEnvironment(), true);
  const gate = evaluateAutocarProductionRuntimeConfig({
    environment: 'production',
    schema_version: 2,
    live_enabled: false
  }, target);

  assert.equal(gate.allowed, false);
  assert.equal(gate.live_enabled, false);
  assert.match(gate.reason, /live_enabled=false/);
});

test('configuração Production definitiva libera somente env/schema/live corretos', () => {
  const target = resolveAutocarRuntimeTargetForCutoverMode(productionEnvironment(), true);
  const gate = evaluateAutocarProductionRuntimeConfig({
    environment: 'production',
    schema_version: 2,
    live_enabled: true
  }, target);

  assert.equal(gate.allowed, true);
  assert.equal(gate.project_ref, AUTOCAR_PRODUCTION_REF);
  assert.equal(gate.transition_mode, 'cutover_production');
});

test('status público do Preview informa bloqueio real sem consultar Production', async () => {
  const status = await getAutocarRuntimePublicStatus({
    ...devEnvironment('preview'),
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
