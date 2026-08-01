'use client';

import type { MutableRefObject, PointerEvent, WheelEvent } from 'react';
import { CampaignVisualEditorPreviewFlow } from './CampaignVisualEditorPreviewFlow';
import { cacheFlowMeasurement, type FlowMeasurement, type ResponsiveTarget } from './CampaignVisualEditorFlow';
import type { ContentKey, Device, Draft, Layer } from './CampaignVisualEditorModel';

type Props = {
  draft: Draft;
  device: Device;
  campaign: any;
  eventInfo: any;
  vehicles: any[];
  stores: any[];
  layer: Layer;
  selectedContent: ContentKey;
  clientView: boolean;
  heroRef: MutableRefObject<HTMLElement | null>;
  heroSource: string;
  onSelect: (layer: Layer) => void;
  onSelectContent: (key: ContentKey) => void;
  onStartBox: (event: PointerEvent<HTMLElement>, kind: 'box' | 'resize', key: 'header' | 'logo' | 'simulator') => void;
  onStartContent: (event: PointerEvent<HTMLElement>, kind: 'content' | 'contentResize', key: ContentKey) => void;
  onStartBackground: (event: PointerEvent<HTMLElement>) => void;
  onWheel: (event: WheelEvent<HTMLElement>) => void;
  onBackgroundDoubleClick: () => void;
  onSelectVehicle: (id: string) => void;
};

export function CampaignVisualEditorPreviewResponsive(props: Props) {
  return <CampaignVisualEditorPreviewFlow {...props} onFlowMeasurement={(target: ResponsiveTarget, measurement: FlowMeasurement) => cacheFlowMeasurement(target, measurement)} />;
}
