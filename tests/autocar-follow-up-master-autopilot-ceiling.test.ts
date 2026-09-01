import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import {
  clampFollowUpModeToMasterCeiling,
  masterAutopilotCeilingFromAgent
} from '../src/lib/server/autocar/followUpV2MasterCeiling';

const root = process.cwd();

describe('Smart Follow-up Master AUTOPILOT ceiling', () => {
  it('bloqueia AUTOPILOT quando o Master não permitiu e mantém COPILOT/OFF', () => {
    const ceiling = masterAutopilotCeilingFromAgent({
      status: 'active',
      master_enabled: true,
      master_autopilot_allowed: false
    });
    assert.equal(ceiling.allowed, false);
    assert.match(ceiling.reason, /Master não permitiu AUTOPILOT/);
    assert.equal(clampFollowUpModeToMasterCeiling('autopilot', ceiling), 'copilot');
    assert.equal(clampFollowUpModeToMasterCeiling('copilot', ceiling), 'copilot');
    assert.equal(clampFollowUpModeToMasterCeiling('off', ceiling), 'off');
  });

  it('só libera AUTOPILOT quando agente está ativo, Master habilitou e permitiu AUTOPILOT', () => {
    assert.equal(masterAutopilotCeilingFromAgent(null).allowed, false);
    assert.equal(masterAutopilotCeilingFromAgent({ status: 'inactive', master_enabled: true, master_autopilot_allowed: true }).allowed, false);
    assert.equal(masterAutopilotCeilingFromAgent({ status: 'active', master_enabled: false, master_autopilot_allowed: true }).allowed, false);
    const allowed = masterAutopilotCeilingFromAgent({ status: 'active', master_enabled: true, master_autopilot_allowed: true });
    assert.equal(allowed.allowed, true);
    assert.equal(clampFollowUpModeToMasterCeiling('autopilot', allowed), 'autopilot');
  });

  it('rotas Master e Loja usam leitura e gravação governadas server-side', () => {
    const masterApi = fs.readFileSync(path.join(root, 'src/app/api/master/autocar/follow-up-v2/route.ts'), 'utf8');
    const storeApi = fs.readFileSync(path.join(root, 'src/app/api/store/portal/autocar/follow-up-v2/route.ts'), 'utf8');
    for (const source of [masterApi, storeApi]) {
      assert.match(source, /readGovernedStoreFollowUpV2/);
      assert.match(source, /saveGovernedStoreFollowUpV2/);
      assert.match(source, /autopilot_ceiling/);
    }
    assert.doesNotMatch(storeApi, /saveStoreFollowUpV2\(/);
  });

  it('executor governado revalida o teto Master antes de chamar o executor A4', () => {
    const wrapper = fs.readFileSync(path.join(root, 'src/lib/server/autocar/followUpV2AutopilotGoverned.ts'), 'utf8');
    const cron = fs.readFileSync(path.join(root, 'src/app/api/cron/autocar-follow-up-v2/route.ts'), 'utf8');
    assert.match(wrapper, /readMasterAutopilotCeiling/);
    assert.match(wrapper, /if \(!ceiling\.allowed\)/);
    assert.match(wrapper, /runA4FollowUpAutopilot\(input\)/);
    assert.match(cron, /readMasterAutopilotCeiling/);
    assert.match(cron, /runGovernedA4FollowUpAutopilot/);
    assert.doesNotMatch(cron, /runA4FollowUpAutopilot\(/);
  });

  it('não adiciona migration para o teto Master', () => {
    const helper = fs.readFileSync(path.join(root, 'src/lib/server/autocar/followUpV2MasterCeiling.ts'), 'utf8');
    assert.match(helper, /master_autopilot_allowed/);
    assert.match(helper, /mode === 'autopilot'/);
    assert.match(helper, /effective/);
    assert.match(helper, /saveGovernedStoreFollowUpV2/);
  });
});
