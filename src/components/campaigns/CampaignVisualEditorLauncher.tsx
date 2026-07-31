'use client';

import { CampaignVisualEditorLauncher as IntegratedCampaignVisualEditorLauncher } from './CampaignVisualEditorIntegrated';
import { BackgroundUploadCropBridge } from './BackgroundUploadCropBridge';

export function CampaignVisualEditorLauncher() {
  return (
    <>
      <IntegratedCampaignVisualEditorLauncher />
      <BackgroundUploadCropBridge />
    </>
  );
}
