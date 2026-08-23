import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const migration = readFileSync('supabase/migrations/20260823040800_autocar_master_control_plane_v2.sql', 'utf8');
const policy = readFileSync('src/lib/server/autocar/policyEngine.ts', 'utf8');
const control = readFileSync('src/lib/server/autocar/masterControlPlane.ts', 'utf8');
const route = readFileSync('src/app/api/master/autocar/route.ts', 'utf8');
const simulator = readFileSync('src/lib/server/autocar/modeSimulator.ts', 'utf8');
const lab = readFileSync('src/components/MasterAutocarTestLab.tsx', 'utf8');
const monitoring = readFileSync('src/components/MasterAutocarMonitoring.tsx', 'utf8');
const drawer = readFileSync('src/components/MasterAutocarAccessControl.tsx', 'utf8');

test('SAFE CORE permanece acima do teto global e handoff humano nao pode ser desabilitado', () => {
  assert.match(policy, /transfer_lead: \{ effect: 'handoff'/);
  assert.match(policy, /global_hard_policy/);
  assert.match(policy, /global_master_policy/);
  assert.match(migration, /policy_capability = 'transfer_lead' and new\.purpose = 'live_human_handoff'/);
});

test('migration cria governanca global, precos e auditoria append-only', () => {
  assert.match(migration, /create table if not exists public\.ai_global_capability_policies/);
  assert.match(migration, /create table if not exists public\.ai_model_pricing/);
  assert.match(migration, /create table if not exists public\.ai_master_control_plane_audit/);
  assert.match(migration, /ai_master_control_plane_audit_append_only/);
  assert.match(migration, /before insert or update of direction, status, policy_capability, purpose/);
});

test('writes Master usam versionamento otimista e hard policy nao pode ser alterada', () => {
  assert.match(control, /expectedVersion/);
  assert.match(control, /\.eq\('version', currentVersion\)/);
  assert.match(control, /SAFE CORE: esta capability é hard policy/);
  assert.match(route, /action === 'set-global-policy'/);
  assert.match(route, /action === 'set-model-pricing'/);
});

test('Preview sem migration nao quebra leitura do Control Plane', () => {
  assert.match(control, /schemaReady: false/);
  assert.match(control, /required_migration/);
  assert.match(control, /missingControlPlaneRelation/);
});

test('laboratorio usa simulador seguro e preserva ausencia de execucao externa', () => {
  assert.match(simulator, /globalMasterPolicyInstructions/);
  assert.match(simulator, /no_external_execution: true/);
  assert.match(lab, /Nenhuma ação externa foi executada/);
  assert.match(lab, /setStoreId\(\(current\) => current && rows\.some/);
});

test('custos sao reportados por periodo, loja e conversa sem conteudo', () => {
  assert.match(control, /'24h': aggregatePeriod/);
  assert.match(control, /'7d': aggregatePeriod/);
  assert.match(control, /'30d': aggregatePeriod/);
  assert.match(control, /conversations: conversationRows/);
  assert.doesNotMatch(control, /customer_input|body:|message_body/);
  assert.match(monitoring, /Consumo por loja/);
  assert.match(monitoring, /Conversas com consumo comprovado/);
});

test('painel Master Loja e recolhivel em vez de permanecer sobreposto', () => {
  assert.match(drawer, /const \[open, setOpen\] = useState\(false\)/);
  assert.match(drawer, /Master → Loja/);
  assert.match(drawer, /setOpen\(false\)/);
});
