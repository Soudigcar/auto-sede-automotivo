'use client';

import type { CSSProperties } from 'react';
import { MapPin, Navigation } from 'lucide-react';
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
  return <div className={`mx-auto min-w-0 ${horizontalPadding}`} style={{ color: section.textColor, maxWidth: section.maxWidth }}>
    <div className="min-w-0 space-y-5">{full.map((block) => <div className="min-w-0" key={block.id}>{renderBlock(block, props)}</div>)}</div>
    {grid.length ? <div className={`mt-8 grid min-w-0 gap-4 ${gridClass(section.columns || 3, props.previewDevice)}`}>{grid.map((block) => <div className="min-w-0" key={block.id}>{renderBlock(block, props)}</div>)}</div> : null}
  </div>;
}

function formatDate(value?: string | null) {
  if (!value) return '';
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('pt-BR');
}

function LocationSection({ section, props }: { section: LandingSection; props: Props }) {
  const event = props.eventInfo || props.campaign?.event || {};
  const addressParts = [event?.location, event?.address, event?.city, event?.state].filter(Boolean);
  const address = addressParts.join(' • ') || 'Local do evento a confirmar';
  const start = formatDate(event?.start_date);
  const end = formatDate(event?.end_date);
  const period = start && end ? `${start} a ${end}` : start || end || '';
  const mapsQuery = encodeURIComponent(addressParts.join(', '));
  const mapsUrl = mapsQuery ? `https://www.google.com/maps/search/?api=1&query=${mapsQuery}` : '';
  return <div className="mx-auto px-4 sm:px-6" style={{ maxWidth: section.maxWidth, color: section.textColor }}>
    <div className="grid gap-6 rounded-[28px] border border-white/10 bg-white/[0.06] p-5 shadow-2xl sm:p-7 lg:grid-cols-[1fr_auto] lg:items-center">
      <div className="min-w-0">
        <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em]"><MapPin size={14}/> Localização do evento</div>
        <h2 className="mt-4 break-words text-2xl font-black tracking-[-0.03em] sm:text-3xl">{event?.name || props.campaign?.name || 'Evento'}</h2>
        <p className="mt-2 break-words text-sm font-semibold leading-6 opacity-80">{address}</p>
        {period ? <p className="mt-1 text-sm font-black opacity-90">{period}</p> : null}
      </div>
      {mapsUrl ? <a href={mapsUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-white px-4 text-xs font-black text-slate-950 shadow-lg"><Navigation size={15}/> Como chegar</a> : null}
    </div>
  </div>;
}

export function CampaignLandingSectionsRenderer(props: Props) {
  const view = props.view || 'home';
  const vehicleLayout = props.previewDevice === 'mobile' ? 'mobile' : props.previewDevice === 'tablet' ? 'tablet' : 'auto';
  const simulatorLayout = props.previewDevice === 'mobile' ? 'mobile' : props.previewDevice === 'tablet' ? 'tablet' : props.previewDevice === 'desktop' ? 'desktop' : 'auto';
  const sections = props.draft.sections.filter((section) => view === 'vehicles' ? section.type === 'vehicles' : view === 'simulation' ? section.type === 'simulation' : true);

  return <>{sections.map((section) => {
    if (!section.visible) return null;
    const active = Boolean(props.editor && props.selectedSectionId === section.id);
    const common = { backgroundColor: section.backgroundColor, paddingTop: section.paddingY, paddingBottom: section.paddingY, minHeight: section.minHeight || undefined };
    const selectSection = (event: React.MouseEvent<HTMLElement>) => { if (props.editor) { event.stopPropagation(); props.onSelectSection?.(section.id); } };

    if (section.type === 'vehicles') return <section key={section.id} data-section-id={section.id} className={`relative min-w-0 overflow-hidden ${active ? 'outline outline-2 outline-fuchsia-500 outline-offset-[-2px]' : ''}`} style={common} onClick={selectSection}>
      {props.editor ? <div className="pointer-events-none absolute right-3 top-3 z-30 rounded-full bg-fuchsia-600 px-3 py-1.5 text-[10px] font-black text-white">EDITAR ESTOQUE</div> : null}
      <div className="mx-auto" style={{ maxWidth: section.maxWidth }}><CampaignVehicleDiscovery vehicles={props.vehicles} primaryColor={props.draft.primaryColor} onOpenSimulator={(vehicleId) => props.onOpenSimulator(vehicleId)} settings={section.vehicleSettings} embedded layoutMode={vehicleLayout} /></div>
    </section>;

    if (section.type === 'simulation') return <section key={section.id} data-section-id={section.id} className={`relative min-w-0 overflow-hidden px-3 sm:px-6 ${active ? 'outline outline-2 outline-fuchsia-500 outline-offset-[-2px]' : ''}`} style={common} onClick={selectSection}>
      {props.editor ? <div className="pointer-events-none absolute right-3 top-3 z-30 rounded-full bg-fuchsia-600 px-3 py-1.5 text-[10px] font-black text-white">EDITAR SIMULAÇÃO</div> : null}
      <div className="mx-auto w-full" style={{ maxWidth: section.maxWidth }}><CampaignFinanceSimulatorInline campaign={props.campaign} eventInfo={props.eventInfo} vehicles={props.vehicles} primaryColor={props.draft.primaryColor} cardRadius={props.draft.cardRadius} backgroundColor={props.draft.simulatorBackground} summaryBackgroundColor={props.draft.simulatorSummaryBackground} mode={props.editor ? 'preview' : 'live'} slug={String(props.campaign?.slug || '')} layoutMode={simulatorLayout} /></div>
    </section>;

    if (section.type === 'location') return <section key={section.id} data-section-id={section.id} className={`relative min-w-0 overflow-hidden ${active ? 'outline outline-2 outline-fuchsia-500 outline-offset-[-2px]' : ''}`} style={common} onClick={selectSection}>
      {props.editor ? <div className="pointer-events-none absolute right-3 top-3 z-30 rounded-full bg-fuchsia-600 px-3 py-1.5 text-[10px] font-black text-white">EDITAR LOCALIZAÇÃO</div> : null}
      <LocationSection section={section} props={props}/>
    </section>;

    return <section key={section.id} data-section-id={section.id} className={`relative min-w-0 overflow-hidden ${active ? 'outline outline-2 outline-fuchsia-500 outline-offset-[-2px]' : ''}`} style={common} onClick={selectSection}>
      {props.editor ? <div className="pointer-events-none absolute right-3 top-3 z-30 rounded-full bg-fuchsia-600 px-3 py-1.5 text-[10px] font-black text-white">EDITAR SEÇÃO</div> : null}
      <ContentSection section={section} props={props}/>
    </section>;
  })}</>;
}
