'use client';

import { CampaignVisualEditorPreviewFlow } from './CampaignVisualEditorPreviewFlow';
import { cacheFlowMeasurement, type FlowMeasurement, type ResponsiveTarget } from './CampaignVisualEditorFlow';

export function CampaignVisualEditorPreviewResponsive(props: any) {
  return <CampaignVisualEditorPreviewFlow {...props} onFlowMeasurement={(target: ResponsiveTarget, measurement: FlowMeasurement) => cacheFlowMeasurement(target, measurement)} />;
}
