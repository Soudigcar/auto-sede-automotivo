'use client';

import type { MutableRefObject, PointerEvent, WheelEvent } from 'react';
import { CampaignLandingNavigation } from './CampaignLandingNavigation';
import { CampaignLandingSectionsRenderer } from './CampaignLandingSectionsRenderer';
import { upgradeLandingDraft } from './CampaignLandingSectionModel';
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
  selectedSectionId?: string;
  onSelectSection?: (id: string) => void;
};

export function CampaignVisualEditorPreviewResponsive(props: Props) {
  const draftV3 = upgradeLandingDraft(props.draft, props.campaign);
  return (
    <div id="editor-inicio">
      <CampaignLandingNavigation
        primaryColor={draftV3.primaryColor}
        homeSelector="#editor-inicio"
        vehiclesSelector="#landing-vehicles"
        simulationSelector="#editor-inline-simulator"
        preview
      />
      <div className="campaign-v3-hero-only">
        <CampaignVisualEditorPreviewFlow
          {...props}
          draft={draftV3}
          onFlowMeasurement={(target: ResponsiveTarget, measurement: FlowMeasurement) => cacheFlowMeasurement(target, measurement)}
        />
      </div>
      <CampaignLandingSectionsRenderer
        draft={draftV3}
        vehicles={props.vehicles}
        campaign={props.campaign}
        editor={!props.clientView}
        selectedSectionId={props.selectedSectionId}
        onSelectSection={props.onSelectSection}
        onOpenSimulator={() => props.onSelect('simulator')}
      />
      {draftV3.footer.visible ? <footer data-editor-element="footer" onClick={(event) => { if (!props.clientView) { event.stopPropagation(); props.onSelect('footer'); } }} className={!props.clientView && props.layer === 'footer' ? 'outline outline-2 outline-amber-400' : ''} style={{ backgroundColor: draftV3.footer.backgroundColor, color: draftV3.footer.textColor, textAlign: draftV3.footer.align, padding: `${draftV3.footer.paddingY}px 24px`, fontSize: draftV3.footer.fontSize }}><div className="mx-auto" style={{ maxWidth: draftV3.footer.maxWidth }}><p>{draftV3.footer.notice.replace('{ANO}', String(new Date().getFullYear()))}</p>{draftV3.footer.showTerms && (draftV3.footer.termsOverride || props.campaign?.terms_text) ? <p className="mt-3 opacity-70">{draftV3.footer.termsOverride || props.campaign?.terms_text}</p> : null}</div></footer> : null}
      <style jsx global>{`
        .campaign-v3-hero-only > div > section:nth-of-type(n+2),
        .campaign-v3-hero-only > div > footer { display: none !important; }
        #editor-inicio #editor-inline-simulator > div > section,
        #editor-inicio #editor-inline-simulator > section { background-color: ${draftV3.simulatorBackground} !important; }
        #editor-inicio #editor-inline-simulator aside { background-color: ${draftV3.simulatorSummaryBackground} !important; }
      `}</style>
    </div>
  );
}
