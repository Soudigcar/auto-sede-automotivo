import { runControlledA4FollowUpV2 } from './followUpV2Data';
export { contextualAutopilotQuality, hasFollowUpOptOut } from './followUpV2Quality';
export { FOLLOW_UP_V2_CANARY as FOLLOW_UP_AUTOPILOT_CANARY_STORE_ID } from './followUpV2Execution';
export const FOLLOW_UP_AUTOPILOT_VERSION = 'autocar-follow-up-v2-controlled';
export const FOLLOW_UP_AUTOPILOT_MAX_SENDS_PER_RUN = 3;

export async function runA4FollowUpAutopilot(input: { productionSupabase: any; now?: Date; maxSends?: number }) {
  return runControlledA4FollowUpV2(input);
}
