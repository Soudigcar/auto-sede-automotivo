'use client';

import type { LandingDraftV3 } from './CampaignLandingSectionModel';

type CommitHandler = (draft: LandingDraftV3) => void;

let commitHandler: CommitHandler | null = null;

export function registerLandingDraftCommit(handler: CommitHandler | null) {
  commitHandler = handler;
  return () => {
    if (commitHandler === handler) commitHandler = null;
  };
}

export function commitLandingDraft(draft: LandingDraftV3) {
  if (!commitHandler) return false;
  commitHandler(draft);
  return true;
}
