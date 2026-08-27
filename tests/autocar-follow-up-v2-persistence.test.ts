import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { defaultFollowUpConfigV2 } from '../src/lib/server/autocar/smartFollowUpV2';
import { planAutocarFollowUpV2 } from '../src/lib/server/autocar/followUpV2Planner';
import { normalizeCommercialMemoryV2 } from '../src/lib/server/autocar/commercialMemoryV2';

const root = process.cwd();
const migration = fs.readFileSync(path.join(root, 'supabase/migrations/20260826201000_autocar_smart_follow_up_v2_persistence.sql'), 'utf8');
const canaryMigration = fs.readFileSync(path.join(root, 'supabase/migrations/20260827130000_autocar_follow_up_v2_autopilot_canary.sql'), 'utf8');
const storeSource = fs.readFileSync(path.join(root, 'src/lib/server/autocar/followUpV2ConfigStore.ts'), 'utf8');
const masterApi = fs.readFileSync(path.join(root, 'src/app/api/master/autocar/follow-up-v2/route.ts'), 'utf8');
const storeApi = fs.readFileSync(path.join(root, 'src/app/api/store/portal/autocar/follow-up-v2/route.ts'), 'utf8');

describe('Smart Follow-up V2 persistence rollout', () => {
  it('mantém baseline OFF/COPILOT e libera AUTOPILOT somente pelo canário A4', () => {
    assert.equal(migration.includes("mode in ('off','copilot')"), true);
    assert.equal(canaryMigration.includes("mode in ('off','copilot','autopilot')"), true);
    assert.equal(canaryMigration.includes("store_id = '239755c3-a2d4-4cdd-9502-f1595031c924'::uuid"), true);
    assert.equal(storeSource.includes('FOLLOW_UP_V2_AUTOPILOT_CANARY_STORE_ID'), true);
    assert.equal(storeSource.includes('AUTOPILOT do Smart Follow-up permanece restrito ao canário da A4 Multimarcas.'), true);
  });

  it('mantém as tabelas novas service-only para anon/authenticated', () => {
    for (const table of [
      'ai_follow_up_global_settings',
      'ai_follow_up_store_settings',
      'ai_follow_up_scenarios',
      'ai_follow_up_scenario_steps',
      'ai_follow_up_performance_events',
      'ai_follow_up_config_audit'
    ]) {
      assert.equal(migration.includes(`on public.${table}`), true);
    }
    assert.equal((migration.match(/service_only_deny_client_access/g) || []).length >= 12, true);
    assert.equal((migration.match(/using \(false\) with check \(false\)/g) || []).length, 6);
    assert.equal(canaryMigration.includes('ai_follow_up_autopilot_executions'), true);
    assert.equal(canaryMigration.includes('for all to anon, authenticated using (false) with check (false)'), true);
  });

  it('baseline não cria scheduler, sender ou habilitação de create_follow_up', () => {
    const executable = migration
      .split('\n')
      .filter((line) => !line.trim().startsWith('--'))
      .join('\n')
      .toLowerCase();
    assert.equal(executable.includes('cron.schedule'), false);
    assert.equal(executable.includes('pg_cron'), false);
    assert.equal(executable.includes('http_post'), false);
    assert.equal(executable.includes('net.http'), false);
    assert.equal(executable.includes('create_follow_up'), false);
    assert.equal(masterApi.includes('messages/send'), false);
    assert.equal(storeApi.includes('messages/send'), false);
  });

  it('permanece fail-closed sem configuração habilitada', () => {
    const memory = normalizeCommercialMemoryV2({
      rolling_summary: 'Cliente avaliando veículo.',
      human_state: 'autocar_active'
    });
    const result = planAutocarFollowUpV2({
      memory,
      lastCustomerMessageAt: '2026-08-26T10:00:00.000Z',
      lastAutocarMessageAt: '2026-08-26T10:05:00.000Z',
      leadStatus: 'in_service',
      humanState: 'autocar_active',
      effectiveConfig: defaultFollowUpConfigV2,
      now: new Date('2026-08-27T10:00:00.000Z')
    });
    assert.equal(result.decision, 'blocked');
    assert.equal(result.external_execution, false);
  });
});
