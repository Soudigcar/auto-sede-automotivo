import { getAutocarRuntimeClient } from '@/lib/server/autocar/runtimeEnvironment';
import {
  FOLLOW_UP_AUTOPILOT_CANARY_STORE_ID,
  runA4FollowUpAutopilot
} from '@/lib/server/autocar/followUpV2Autopilot';
import { readMasterAutopilotCeiling } from '@/lib/server/autocar/followUpV2MasterCeiling';

export async function runGovernedA4FollowUpAutopilot(input: {
  productionSupabase: any;
  now?: Date;
  maxSends?: number;
}) {
  const autocar = getAutocarRuntimeClient();
  const ceiling = await readMasterAutopilotCeiling(autocar, FOLLOW_UP_AUTOPILOT_CANARY_STORE_ID);
  if (!ceiling.allowed) {
    return {
      success: true,
      enabled: false,
      sent: 0,
      results: [],
      master_autopilot_ceiling: ceiling,
      reason: ceiling.reason
    };
  }

  const result = await runA4FollowUpAutopilot(input);
  return {
    ...result,
    master_autopilot_ceiling: ceiling
  };
}
