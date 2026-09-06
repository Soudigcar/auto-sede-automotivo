import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

const migration = fs.readFileSync(
  path.join(process.cwd(), 'supabase/migrations/20260906030000_autocar_store_mode_audit_hardening.sql'),
  'utf8'
);
const devAdmin = fs.readFileSync(
  path.join(process.cwd(), 'src/lib/server/autocar/devAdmin.ts'),
  'utf8'
);
const route = fs.readFileSync(
  path.join(process.cwd(), 'src/app/api/store/portal/autocar/foundation-status/route.ts'),
  'utf8'
);

describe('AUTOCAR store mode audit hardening', () => {
  it('mantém a migration versionada e transacional, sem enfraquecer auditorias existentes', () => {
    assert.match(migration, /^begin;/m);
    assert.match(migration, /commit;\s*$/m);
    assert.match(migration, /'global_policy', 'model_pricing', 'store_mode'/);
    assert.match(migration, /create or replace function public\.set_autocar_store_mode_audited/);
    assert.match(migration, /security definer/);
    assert.match(migration, /set search_path = public, private/);
  });

  it('preserva os gates Master e deixa o trigger atual calcular o modo efetivo', () => {
    assert.match(migration, /if not current_agent\.master_enabled then/);
    assert.match(migration, /p_requested_mode = 'autopilot' and not current_agent\.master_autopilot_allowed/);
    assert.match(migration, /store_selected_mode = p_requested_mode/);
    assert.equal(/set\s+mode\s*=/.test(migration), false);
    assert.match(migration, /existing ai_store_agents_dual_control BEFORE trigger computes the/);
  });

  it('grava ator, papel, origem, estados, request id e updated_by na mesma função', () => {
    for (const token of [
      'previous_payload',
      'requested_mode',
      'effective_mode',
      'actor_profile_id',
      'actor_role',
      "'store_portal'",
      'request_id',
      'updated_by_profile_id = p_actor_profile_id'
    ]) {
      assert.equal(migration.includes(token), true, `migration deve conter ${token}`);
    }
    assert.match(migration, /insert into public\.ai_master_control_plane_audit/);
    assert.match(migration, /'store_mode'/);
  });

  it('é idempotente por request id e bloqueia reuso com parâmetros diferentes', () => {
    assert.match(migration, /create unique index if not exists ai_master_control_plane_audit_store_mode_request_uidx/);
    assert.match(migration, /pg_advisory_xact_lock/);
    assert.match(migration, /request_id was already used with different store-mode parameters/);
    assert.match(migration, /'audit_replayed', true/);
  });

  it('expõe a RPC somente para service_role', () => {
    assert.match(migration, /revoke all on function public\.set_autocar_store_mode_audited[\s\S]*from public, anon, authenticated;/);
    assert.match(migration, /grant execute on function public\.set_autocar_store_mode_audited[\s\S]*to service_role;/);
  });

  it('não faz fallback para update direto quando a RPC auditada não existe', () => {
    assert.match(devAdmin, /\.rpc\('set_autocar_store_mode_audited'/);
    assert.match(devAdmin, /Auditoria obrigatória de modo AUTOCAR ainda não está provisionada neste ambiente/);

    const selectedModeFunction = devAdmin.slice(
      devAdmin.indexOf('export async function setAutocarStoreSelectedMode'),
      devAdmin.indexOf('export async function setAutocarStoreMode')
    );
    assert.equal(selectedModeFunction.includes(".from('ai_store_agents').update"), false);
  });

  it('o endpoint usa identidade real do portal e request id gerado no servidor', () => {
    assert.match(route, /randomUUID\(\)/);
    assert.match(route, /context\.profile\?\.id/);
    assert.match(route, /auditedActorRole\(context\.role\)/);
    assert.match(route, /source: 'store_portal'/);
    assert.match(route, /audit_request_id: requestId/);
  });
});
