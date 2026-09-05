'use client';

import { useEffect } from 'react';
import { CampaignSimulatorAppearanceInspector } from './CampaignSimulatorAppearanceInspector';
import { CampaignVisualEditorInspector as LegacyCampaignVisualEditorInspector } from './CampaignVisualEditorInspectorLegacy';
import { registerLandingDraftCommit } from './CampaignLandingEditorBridge';
import type { LandingDraftV3 } from './CampaignLandingSectionModel';

export function CampaignVisualEditorInspector(props: any) {
  useEffect(() => registerLandingDraftCommit((next: LandingDraftV3) => {
    props.commit(next);
  }), [props.commit]);

  if (props.layer === 'simulator') return <CampaignSimulatorAppearanceInspector {...props} />;
  return <LegacyCampaignVisualEditorInspector {...props} />;
}
