'use client';

import type { CSSProperties } from 'react';
import { CampaignFinanceSimulatorInline } from '@/components/campaigns/CampaignFinanceSimulatorInline';
import { CampaignVehicleDiscovery } from './CampaignVehicleDiscovery';
import type { LandingDraftV3, LandingSection, LandingSectionBlock, LandingView } from './CampaignLandingSectionModel';
import type { Device } from './CampaignVisualEditorModel';

type Props = { draft: LandingDraftV3; vehicles: any[]; campaign: any; eventInfo?: any; editor?: boolean; previewDevice?: Device; selectedSectionId?: string; onSelectSection?: (id: string) => void; onOpenSimulator: (vehicleId?: string) => void; view?: LandingView };

function runAction(block: LandingSectionBlock, props: Props) {
  if (props.editor) return;
  if (block.action === 'simulator') props.onOpenSimulator();
  if (block.action === 'vehicles') props.onOpenSimulator('__OPEN_VEHICLES__');
  if (block.action === 'whatsapp' && props.campaign?.whatsapp_number) {
    const phone = String(props.campaign.whatsapp_number).replace(/\D/g, '');
    if (phone) window.open(`https://wa.me/${phone}`, '_blank', 'noopener,noreferrer');
  }
}

function blockStyle(block: LandingSectionBlock): CSSProperties {
  return { color: block.color, backgroundColor: block.backgroundColor, borderColor: block.borderColor, textAlign: block.align, borderRadius: block.radius };
}

function BlockImage({ block, compact = false }: { block: LandingSectionBlock; compact?: boolean }) {
  if (!block.image) return null;
  const height = compact ? Math.min(block.imageHeight, 110) : block.imageHeight;
  return <img src={block.image} alt={block.alt || ''} className="w-full object-cover" style={{ height, borderRadius: Math.max(0, block.radius - 6) }} />;
}

function renderBlock(block: LandingSectionBlock, props: Props) {
  if (!block.visible) return null;
  if (block.type === 'title') return <h2 className="break-words text-3xl font-black tracking-[-0.04em] sm:text-4xl" style={blockStyle(block)}>{block.title}</h2>;
  if (block.type === 'text') return <p className="break-words text-base font-medium leading-7" style={blockStyle(block)}>{block.text}</p>;
  if (block.type === 'image') return <div className="overflow-hidden border" style={blockStyle(block)}>{block.image ? <BlockImage block={block} /> : <div className="flex min-h-40 items-center justify-center p-6 text-sm font-bold opacity-50">Adicione uma imagem</div>}</div>;
  if (block.type === 'icon') return <article className="min-w-0 overflow-hidden border p-5" style={blockStyle(block)}><BlockImage block={block} compact />{!block.image ? <div className="text-3xl" aria-hidden>{block.icon || '★'}</div> : null}{block.title ? <h3 className="mt-3 break-words text-xl font-black">{block.title}</h3> : null}{block.text ? <p className="mt-2 break-words text-sm leading-6 opacity-70">{block.text}</p> : null}</article>;
  if (block.type === 'button') return <button type="button" onClick={() => runAction(block, props)} className="min-h-12 max-w-full break-words border px-6 py-3 text-sm font-black shadow-sm" style={blockStyle(block)}>{block.label || 'Saiba mais'}</button>;
  return <article className="min-w-0 overflow-hidden border p-5" style={blockStyle(block)}><BlockImage block={block} />{block.title ? <h3 className={`${block.image ? 'mt-4' : ''} break-words text-xl font-black`}>{block.title}</h3> : null}{block.text ? <p className="mt-2 break-words text-sm leading-6 opacity-70">{block.text}</p> : null}</article>;
}

function gridClass(columns: number, previewDevice?: Device) {
  if (previewDevice === 'mobile') return 'grid-cols-1';
  if (previewDevice === 'tablet') return columns <= 1 ? 'grid-cols-1' : 'grid-cols-2';
  if (columns <= 1) return 'grid-cols-1';
  if (columns === 2) return 'grid-cols-1 sm:grid-cols-2';
  if (columns === 3) return 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3';
  if (columns === 4) return 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4';
  if (columns === 5) return 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-5';
  return 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-6';
}

function ContentSection({ section, props }: { section: LandingSection; props: Props }) {
  const visibleBlocks = section.blocks.filter((block) => block.visible);
  const full = visibleBlocks.filter((block) => block.fullWidth || block.type === 'title' || block.type === 'text');
  const grid = visibleBlocks.filter((block) => !full.includes(block));
  const horizontalPadding = props.previewDevice === 'mobile' ? 'px-4' : 'px-6';
  return <div className={`mx-auto min-w-0 max-w-[1480px] ${horizontalPadding}`} style={{ color: section.textColor }}>
    <div className="min-w-0 space-y-5">{full.map((block) => <div className="min-w-0" key={block.id}>{renderBlock(block, props)}</div>)}</div>
    {grid.length ? <div className={`mt-8 grid min-w-0 gap-4 ${gridClass(section.columns || 3, props.previewDevice)}`}>{grid.map((block) => <div className="min-w-0" key={block.id}>{renderBlock(block, props)}</div>)}</div> : null}
  </div>;
}

export function CampaignLandingSectionsRenderer(props: Props) {
  const view = props.view || 'home';
  const vehicleLayout = props.previewDevice === 'mobile' ? 'mobile' : props.previewDevice === 'tablet' ? 'tablet' : 'auto';
  const sections = props.draft.sections.filter((section) => view === 'vehicles' ? section.type === 'vehicles' : true);

  return <>{sections.map((section) => {
    if (!section.visible) return null;
    const active = Boolean(props.editor && props.selectedSectionId === section.id);
    const common = { backgroundColor: section.backgroundColor, paddingTop: section.paddingY, paddingBottom: section.paddingY };
    const selectSection = (event: React.MouseEvent<HTMLElement>) => { if (props.editor) { event.stopPropagation(); props.onSelectSection?.(section.id); } };

    if (section.type === 'vehicles') return <section key={section.id} data-section-id={section.id} className={`relative min-w-0 overflow-hidden ${active ? 'outline outline-2 outline-fuchsia-500 outline-offset-[-2px]' : ''}`} style={common} onClick={selectSection}>
      {props.editor ? <div className="pointer-events-none absolute right-3 top-3 z-30 rounded-full bg-fuchsia-600 px-3 py-1.5 text-[10px] font-black text-white">EDITAR ESTOQUE</div> : null}
      <CampaignVehicleDiscovery vehicles={props.vehicles} primaryColor={props.draft.primaryColor} onOpenSimulator={(vehicleId) => props.onOpenSimulator(vehicleId)} settings={section.vehicleSettings} embedded layoutMode={vehicleLayout} />
    </section>;

    if (section.type === 'simulation') return <section key={section.id} data-section-id={section.id} className={`relative min-w-0 overflow-hidden px-4 sm:px-6 ${active ? 'outline outline-2 outline-fuchsia-500 outline-offset-[-2px]' : ''}`} style={common} onClick={selectSection}>
      {props.editor ? <div className="pointer-events-none absolute right-3 top-3 z-30 rounded-full bg-fuchsia-600 px-3 py-1.5 text-[10px] font-black text-white">EDITAR SIMULAÇÃO</div> : null}
      <div className="mx-auto max-w-6xl"><CampaignFinanceSimulatorInline campaign={props.campaign} eventInfo={props.eventInfo} vehicles={props.vehicles} primaryColor={props.draft.primaryColor} cardRadius={props.draft.cardRadius} backgroundColor={props.draft.simulatorBackground} summaryBackgroundColor={props.draft.simulatorSummaryBackground} mode={props.editor ? 'preview' : 'live'} slug={String(props.campaign?.slug || '')} /></div>
    </section>;

    return <section key={section.id} data-section-id={section.id} className={`relative min-w-0 overflow-hidden ${active ? 'outline outline-2 outline-fuchsia-500 outline-offset-[-2px]' : ''}`} style={common} onClick={selectSection}>
      {props.editor ? <div className="pointer-events-none absolute right-3 top-3 z-30 rounded-full bg-fuchsia-600 px-3 py-1.5 text-[10px] font-black text-white">EDITAR SEÇÃO</div> : null}
      <ContentSection section={section} props={props}/>
    </section>;
  })}</>;
}
