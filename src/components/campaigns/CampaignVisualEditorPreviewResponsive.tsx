'use client';

import { useState, type MutableRefObject, type PointerEvent, type WheelEvent } from 'react';
import { createPortal } from 'react-dom';
import { Layers3, X } from 'lucide-react';
import { CampaignLandingNavigation } from './CampaignLandingNavigation';
import { CampaignLandingSectionInspector } from './CampaignLandingSectionInspector';
import { CampaignLandingSectionsRenderer } from './CampaignLandingSectionsRenderer';
import { upgradeLandingDraft, type LandingDraftV3 } from './CampaignLandingSectionModel';
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
  const [, forceRender] = useState(0);
  const draftV3 = upgradeLandingDraft(props.draft, props.campaign);
  const [sectionPanelOpen, setSectionPanelOpen] = useState(false);
  const [selectedSectionId, setSelectedSectionId] = useState(draftV3.sections[0]?.id || '');
  const selectedSection = draftV3.sections.find((item) => item.id === selectedSectionId) || draftV3.sections[0];
  const [selectedBlockId, setSelectedBlockId] = useState(selectedSection?.blocks[0]?.id || '');

  function chooseSection(id: string) {
    const section = draftV3.sections.find((item) => item.id === id);
    setSelectedSectionId(id);
    setSelectedBlockId(section?.blocks[0]?.id || '');
    setSectionPanelOpen(true);
  }

  function changeSections(next: LandingDraftV3) {
    Object.assign(props.draft as any, next);
    forceRender((value) => value + 1);
  }

  const sectionPanel = !props.clientView && sectionPanelOpen && typeof document !== 'undefined' ? createPortal(
    <div className="fixed bottom-0 right-0 top-[76px] z-[180] flex w-[360px] flex-col border-l bg-white shadow-2xl">
      <div className="flex items-center justify-between border-b px-4 py-3"><div className="flex items-center gap-2"><Layers3 size={17}/><div><strong className="text-sm">Construtor de seções</strong><p className="text-[9px] font-bold uppercase tracking-[.12em] text-fuchsia-600">Layout v3</p></div></div><button type="button" onClick={() => setSectionPanelOpen(false)} className="flex h-9 w-9 items-center justify-center rounded-xl bg-zinc-100" aria-label="Fechar construtor"><X size={17}/></button></div>
      <div className="border-b p-3"><p className="mb-2 text-[10px] font-black uppercase text-zinc-400">Seções da landing</p><div className="flex flex-wrap gap-2">{draftV3.sections.map((section) => <button key={section.id} type="button" onClick={() => chooseSection(section.id)} className={`rounded-xl px-3 py-2 text-[10px] font-black ${selectedSectionId === section.id ? 'bg-fuchsia-600 text-white' : 'border bg-white text-zinc-700'}`}>{section.name}</button>)}</div></div>
      <div className="min-h-0 flex-1 overflow-y-auto p-4"><CampaignLandingSectionInspector draft={draftV3} selectedSectionId={selectedSectionId} selectedBlockId={selectedBlockId} onSelectSection={setSelectedSectionId} onSelectBlock={setSelectedBlockId} onChange={changeSections}/></div>
      <div className="border-t bg-amber-50 p-3 text-[10px] font-bold text-amber-800">As alterações ficam no rascunho atual. Use “Salvar rascunho” no topo do editor para persistir.</div>
    </div>, document.body
  ) : null;

  return (
    <div id="editor-inicio">
      <CampaignLandingNavigation primaryColor={draftV3.primaryColor} homeSelector="#editor-inicio" vehiclesSelector="#landing-vehicles" simulationSelector="#editor-inline-simulator" preview />
      <div className="campaign-v3-hero-only"><CampaignVisualEditorPreviewFlow {...props} draft={draftV3} onFlowMeasurement={(target: ResponsiveTarget, measurement: FlowMeasurement) => cacheFlowMeasurement(target, measurement)} /></div>
      {!props.clientView ? <div className="flex items-center justify-between border-y border-fuchsia-200 bg-fuchsia-50 px-5 py-3"><div><p className="text-xs font-black text-fuchsia-900">Seções editáveis da landing</p><p className="text-[10px] font-semibold text-fuchsia-700">Clique numa seção abaixo ou diretamente nela para editar conteúdo, imagens e filtros.</p></div><button type="button" onClick={() => { if (!selectedSectionId && draftV3.sections[0]) chooseSection(draftV3.sections[0].id); else setSectionPanelOpen(true); }} className="rounded-xl bg-fuchsia-600 px-4 py-2 text-[10px] font-black text-white"><Layers3 size={14} className="inline"/> Editar seções</button></div> : null}
      <CampaignLandingSectionsRenderer draft={draftV3} vehicles={props.vehicles} campaign={props.campaign} editor={!props.clientView} selectedSectionId={selectedSectionId} onSelectSection={chooseSection} onOpenSimulator={() => props.onSelect('simulator')} />
      {draftV3.footer.visible ? <footer data-editor-element="footer" onClick={(event) => { if (!props.clientView) { event.stopPropagation(); props.onSelect('footer'); } }} className={!props.clientView && props.layer === 'footer' ? 'outline outline-2 outline-amber-400' : ''} style={{ backgroundColor: draftV3.footer.backgroundColor, color: draftV3.footer.textColor, textAlign: draftV3.footer.align, padding: `${draftV3.footer.paddingY}px 24px`, fontSize: draftV3.footer.fontSize }}><div className="mx-auto" style={{ maxWidth: draftV3.footer.maxWidth }}><p>{draftV3.footer.notice.replace('{ANO}', String(new Date().getFullYear()))}</p>{draftV3.footer.showTerms && (draftV3.footer.termsOverride || props.campaign?.terms_text) ? <p className="mt-3 opacity-70">{draftV3.footer.termsOverride || props.campaign?.terms_text}</p> : null}</div></footer> : null}
      {sectionPanel}
      <style jsx global>{`.campaign-v3-hero-only > div > section:nth-of-type(n+2),.campaign-v3-hero-only > div > footer{display:none!important}#editor-inicio #editor-inline-simulator > div > section,#editor-inicio #editor-inline-simulator > section{background-color:${draftV3.simulatorBackground}!important}#editor-inicio #editor-inline-simulator aside{background-color:${draftV3.simulatorSummaryBackground}!important}`}</style>
    </div>
  );
}
