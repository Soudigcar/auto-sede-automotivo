'use client';

import { useEffect } from 'react';
import { CampaignVisualEditorInspector as LegacyCampaignVisualEditorInspector } from './CampaignVisualEditorInspectorLegacy';
import { registerLandingDraftCommit } from './CampaignLandingEditorBridge';
import type { LandingDraftV3 } from './CampaignLandingSectionModel';

export function CampaignVisualEditorInspector(props: any) {
  useEffect(() => registerLandingDraftCommit((next: LandingDraftV3) => {
    props.commit(next);
  }), [props.commit]);

  return <LegacyCampaignVisualEditorInspector {...props} />;
}
