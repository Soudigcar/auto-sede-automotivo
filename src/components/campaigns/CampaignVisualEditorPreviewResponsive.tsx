'use client';

import { useEffect, useMemo, useState, type MutableRefObject, type PointerEvent, type WheelEvent } from 'react';
import { createPortal } from 'react-dom';
import { LayoutTemplate, Layers3, Menu, MoveVertical, X } from 'lucide-react';
import { CampaignLandingNavigation } from './CampaignLandingNavigation';
import { CampaignLandingNavigationInspector } from './CampaignLandingNavigationInspector';
import { CampaignLandingPageStructureInspector } from './CampaignLandingPageStructureInspector';
import { CampaignLandingSectionInspector } from './CampaignLandingSectionInspector';
import { CampaignLandingSectionsRenderer } from './CampaignLandingSectionsRenderer';
import { commitLandingDraft } from './CampaignLandingEditorBridge';
import { upgradeLandingDraft, type LandingDraftV3, type LandingView } from './CampaignLandingSectionModel';
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
  const draftV3 = useMemo(() => upgradeLandingDraft(props.draft, props.campaign), [props.draft, props.campaign]);
  const [activeView, setActiveView] = useState<LandingView>('home');
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelMode, setPanelMode] = useState<'structure' | 'menu' | 'sections'>('structure');
  const [selectedSectionId, setSelectedSectionId] = useState(draftV3.sections[0]?.id || '');
  const selectedSection = draftV3.sections.find((item) => item.id === selectedSectionId) || draftV3.sections[0];
  const [selectedBlockId, setSelectedBlockId] = useState(selectedSection?.blocks[0]?.id || '');

  useEffect(() => {
    const raw = props.draft as any;
    if (!Array.isArray(raw.sections) || !raw.navigation) commitLandingDraft(draftV3);
  }, [props.draft, draftV3]);

  useEffect(() => {
    if (!draftV3.sections.some((item) => item.id === selectedSectionId)) {
      const first = draftV3.sections[0];
      setSelectedSectionId(first?.id || '');
      setSelectedBlockId(first?.blocks[0]?.id || '');
    }
  }, [draftV3.sections, selectedSectionId]);

  function chooseSection(id: string) {
    const section = draftV3.sections.find((item) => item.id === id);
    setSelectedSectionId(id);
    setSelectedBlockId(section?.blocks[0]?.id || '');
    setPanelOpen(true);
  }

  function changeDraft(next: LandingDraftV3) {
    commitLandingDraft(next);
  }

  function startHeroResize(event: React.PointerEvent<HTMLButtonElement>) {
    if (props.clientView) return;
    event.preventDefault();
    event.stopPropagation();
    const startY = event.clientY;
    const startHeight = draftV3.devices[props.device].heroHeight;
    const move = (moveEvent: globalThis.PointerEvent) => {
      const nextHeight = Math.max(420, Math.min(2200, Math.round(startHeight + (moveEvent.clientY - startY))));
      const layout = draftV3.devices[props.device];
      changeDraft({ ...draftV3, devices: { ...draftV3.devices, [props.device]: { ...layout, heroHeight: nextHeight } } });
    };
    const finish = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', finish);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', finish);
  }

  const editorPanel = !props.clientView && panelOpen && typeof document !== 'undefined' ? createPortal(
    <div className="fixed bottom-0 right-0 top-[76px] z-[180] flex w-[400px] flex-col border-l bg-white shadow-2xl">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2"><LayoutTemplate size={17}/><div><strong className="text-sm">Construtor da landing</strong><p className="text-[9px] font-bold uppercase tracking-[.12em] text-fuchsia-600">Page Builder estruturado</p></div></div>
        <button type="button" onClick={() => setPanelOpen(false)} className="flex h-9 w-9 items-center justify-center rounded-xl bg-zinc-100" aria-label="Fechar construtor"><X size={17}/></button>
      </div>
      <div className="grid grid-cols-3 gap-2 border-b p-3">
        <button type="button" onClick={() => setPanelMode('structure')} className={`rounded-xl px-2 py-2 text-[9px] font-black ${panelMode === 'structure' ? 'bg-zinc-950 text-white' : 'bg-zinc-100 text-zinc-700'}`}><LayoutTemplate size={13} className="inline"/> PÁGINA</button>
        <button type="button" onClick={() => setPanelMode('menu')} className={`rounded-xl px-2 py-2 text-[9px] font-black ${panelMode === 'menu' ? 'bg-indigo-600 text-white' : 'bg-zinc-100 text-zinc-700'}`}><Menu size={13} className="inline"/> MENU</button>
        <button type="button" onClick={() => setPanelMode('sections')} className={`rounded-xl px-2 py-2 text-[9px] font-black ${panelMode === 'sections' ? 'bg-fuchsia-600 text-white' : 'bg-zinc-100 text-zinc-700'}`}><Layers3 size={13} className="inline"/> CONTEÚDO</button>
      </div>
      {panelMode === 'sections' ? <div className="border-b p-3"><p className="mb-2 text-[10px] font-black uppercase text-zinc-400">Seções da landing</p><div className="flex flex-wrap gap-2">{draftV3.sections.map((section) => <button key={section.id} type="button" onClick={() => chooseSection(section.id)} className={`rounded-xl px-3 py-2 text-[10px] font-black ${selectedSectionId === section.id ? 'bg-fuchsia-600 text-white' : 'border bg-white text-zinc-700'}`}>{section.name}</button>)}</div></div> : null}
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {panelMode === 'structure'
          ? <CampaignLandingPageStructureInspector draft={draftV3} device={props.device} selectedSectionId={selectedSectionId} heroRef={props.heroRef} onSelectSection={chooseSection} onChange={changeDraft}/>
          : panelMode === 'menu'
            ? <CampaignLandingNavigationInspector draft={draftV3} onChange={changeDraft} />
            : <CampaignLandingSectionInspector draft={draftV3} selectedSectionId={selectedSectionId} selectedBlockId={selectedBlockId} onSelectSection={setSelectedSectionId} onSelectBlock={setSelectedBlockId} onChange={changeDraft}/>} 
      </div>
      <div className="border-t bg-emerald-50 p-3 text-[10px] font-bold text-emerald-800">Preview isolado. “Salvar rascunho” e “Publicar” continuam sob seu controle.</div>
    </div>, document.body
  ) : null;

  return <div id="editor-inicio" className="relative min-w-0 overflow-hidden bg-slate-50">
    <CampaignLandingNavigation settings={draftV3.navigation} active={activeView} onNavigate={setActiveView} preview device={props.device} />

    {!props.clientView ? <div className="flex min-w-0 items-center justify-between gap-3 border-b border-indigo-200 bg-indigo-50 px-4 py-2.5">
      <div className="min-w-0"><p className="text-[10px] font-black text-indigo-900">Landing estruturada por componentes</p><p className="truncate text-[9px] font-semibold text-indigo-700">Hero compacto, seções independentes e dimensões controladas por dispositivo.</p></div>
      <div className="flex shrink-0 gap-2"><button type="button" onClick={() => { setPanelMode('structure'); setPanelOpen(true); }} className="rounded-xl bg-zinc-950 px-3 py-2 text-[9px] font-black text-white"><LayoutTemplate size={13} className="inline"/> Estrutura</button><button type="button" onClick={() => { setPanelMode('sections'); setPanelOpen(true); }} className="rounded-xl bg-fuchsia-600 px-3 py-2 text-[9px] font-black text-white"><Layers3 size={13} className="inline"/> Conteúdo</button></div>
    </div> : null}

    {activeView === 'home' ? <>
      <div className="campaign-v3-hero-only relative min-w-0">
        <CampaignVisualEditorPreviewFlow {...props} draft={draftV3} onFlowMeasurement={(target: ResponsiveTarget, measurement: FlowMeasurement) => cacheFlowMeasurement(target, measurement)} showInlineSimulator={false} />
        {!props.clientView ? <button type="button" onPointerDown={startHeroResize} onClick={(event) => event.stopPropagation()} className="absolute bottom-0 left-1/2 z-[70] flex h-7 w-28 -translate-x-1/2 translate-y-1/2 cursor-ns-resize items-center justify-center gap-1 rounded-full border border-white/30 bg-zinc-950 text-[8px] font-black text-white shadow-xl"><MoveVertical size={12}/> ALTURA HERO</button> : null}
      </div>
      <CampaignLandingSectionsRenderer draft={draftV3} vehicles={props.vehicles} campaign={props.campaign} eventInfo={props.eventInfo} editor={!props.clientView} previewDevice={props.device} selectedSectionId={selectedSectionId} onSelectSection={chooseSection} onOpenSimulator={() => setActiveView('simulation')} view="home" />
    </> : null}

    {activeView === 'vehicles' ? <CampaignLandingSectionsRenderer draft={draftV3} vehicles={props.vehicles} campaign={props.campaign} eventInfo={props.eventInfo} editor={!props.clientView} previewDevice={props.device} selectedSectionId={selectedSectionId} onSelectSection={chooseSection} onOpenSimulator={() => setActiveView('simulation')} view="vehicles" /> : null}

    {activeView === 'simulation' ? <CampaignLandingSectionsRenderer draft={draftV3} vehicles={props.vehicles} campaign={props.campaign} eventInfo={props.eventInfo} editor={!props.clientView} previewDevice={props.device} selectedSectionId={selectedSectionId} onSelectSection={chooseSection} onOpenSimulator={() => undefined} view="simulation" /> : null}

    {draftV3.footer.visible ? <footer style={{ backgroundColor: draftV3.footer.backgroundColor, color: draftV3.footer.textColor, textAlign: draftV3.footer.align, padding: `${draftV3.footer.paddingY}px 24px`, fontSize: draftV3.footer.fontSize }}><div className="mx-auto" style={{ maxWidth: draftV3.footer.maxWidth }}><p>{draftV3.footer.notice.replace('{ANO}', String(new Date().getFullYear()))}</p>{draftV3.footer.showTerms && (draftV3.footer.termsOverride || props.campaign?.terms_text) ? <p className="mt-3 opacity-70">{draftV3.footer.termsOverride || props.campaign?.terms_text}</p> : null}</div></footer> : null}
    {editorPanel}
    <style jsx global>{`
      .campaign-v3-hero-only > div > section:nth-of-type(n+2),
      .campaign-v3-hero-only > div > footer{display:none!important}
    `}</style>
  </div>;
}
