'use client';

import type { CSSProperties } from 'react';
import { CampaignVehicleDiscovery } from './CampaignVehicleDiscovery';
import type { LandingDraftV3, LandingSection, LandingSectionBlock } from './CampaignLandingSectionModel';

type Props = { draft: LandingDraftV3; vehicles: any[]; campaign: any; editor?: boolean; selectedSectionId?: string; onSelectSection?: (id: string) => void; onOpenSimulator: (vehicleId?: string) => void };

function runAction(block: LandingSectionBlock, props: Props) {
  if (props.editor) return;
  if (block.action === 'simulator') props.onOpenSimulator();
  if (block.action === 'vehicles') document.getElementById('landing-vehicles')?.scrollIntoView({ behavior: 'smooth' });
  if (block.action === 'whatsapp' && props.campaign?.whatsapp_number) { const phone = String(props.campaign.whatsapp_number).replace(/\D/g, ''); if (phone) window.open(`https://wa.me/${phone}`, '_blank', 'noopener,noreferrer'); }
}
function blockStyle(block: LandingSectionBlock): CSSProperties { return { color:block.color, backgroundColor:block.backgroundColor, borderColor:block.borderColor, textAlign:block.align, borderRadius:block.radius }; }
function renderBlock(block: LandingSectionBlock, props: Props) {
  if (!block.visible) return null;
  if (block.type === 'title') return <h2 className="text-3xl font-black tracking-[-0.04em] sm:text-4xl" style={blockStyle(block)}>{block.title}</h2>;
  if (block.type === 'text') return <p className="text-base font-medium leading-7" style={blockStyle(block)}>{block.text}</p>;
  if (block.type === 'image') return <div className="overflow-hidden border" style={blockStyle(block)}>{block.image ? <img src={block.image} alt={block.alt || ''} className="h-auto w-full object-cover" /> : <div className="flex min-h-40 items-center justify-center p-6 text-sm font-bold opacity-50">Adicione uma imagem</div>}</div>;
  if (block.type === 'icon') return <article className="border p-6" style={blockStyle(block)}>{block.image ? <img src={block.image} alt={block.alt || ''} className="h-14 w-14 rounded-xl object-cover" /> : <div className="text-3xl" aria-hidden>{block.icon || '★'}</div>}<h3 className="mt-3 text-xl font-black">{block.title}</h3>{block.text ? <p className="mt-2 text-sm leading-6 opacity-70">{block.text}</p> : null}</article>;
  if (block.type === 'button') return <button type="button" onClick={() => runAction(block, props)} className="min-h-12 px-6 py-3 text-sm font-black shadow-sm" style={blockStyle(block)}>{block.label || 'Saiba mais'}</button>;
  return <article className="border p-6" style={blockStyle(block)}><h3 className="text-xl font-black">{block.title}</h3>{block.text ? <p className="mt-2 text-sm leading-6 opacity-70">{block.text}</p> : null}</article>;
}
function gridClass(columns:number) { if(columns<=1)return 'grid-cols-1'; if(columns===2)return 'grid-cols-1 sm:grid-cols-2'; if(columns===3)return 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'; return 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4'; }
function ContentSection({ section, props }: { section: LandingSection; props: Props }) {
  const visibleBlocks=section.blocks.filter((block)=>block.visible); const full=visibleBlocks.filter((block)=>block.fullWidth||block.type==='title'||block.type==='text'); const grid=visibleBlocks.filter((block)=>!full.includes(block));
  return <div className="mx-auto max-w-6xl px-6" style={{color:section.textColor}}><div className="space-y-5">{full.map((block)=><div key={block.id}>{renderBlock(block,props)}</div>)}</div>{grid.length?<div className={`mt-8 grid gap-4 ${gridClass(section.columns||3)}`}>{grid.map((block)=><div key={block.id}>{renderBlock(block,props)}</div>)}</div>:null}</div>;
}
export function CampaignLandingSectionsRenderer(props:Props) {
  return <>{props.draft.sections.map((section)=>{ if(!section.visible)return null; const active=Boolean(props.editor&&props.selectedSectionId===section.id); const common={backgroundColor:section.backgroundColor,paddingTop:section.paddingY,paddingBottom:section.paddingY}; if(section.type==='vehicles')return <section key={section.id} id="landing-vehicles" data-section-id={section.id} className={`relative ${active?'outline outline-2 outline-fuchsia-500 outline-offset-[-2px]':''}`} style={common} onClick={(event)=>{if(props.editor){event.stopPropagation();props.onSelectSection?.(section.id);}}}>{props.editor?<div className="pointer-events-none absolute right-4 top-4 z-30 rounded-full bg-fuchsia-600 px-3 py-1.5 text-[10px] font-black text-white">EDITAR SEÇÃO</div>:null}<CampaignVehicleDiscovery vehicles={props.vehicles} primaryColor={props.draft.primaryColor} onOpenSimulator={(vehicleId)=>props.onOpenSimulator(vehicleId)} settings={section.vehicleSettings} embedded /></section>; return <section key={section.id} data-section-id={section.id} className={`relative ${active?'outline outline-2 outline-fuchsia-500 outline-offset-[-2px]':''}`} style={common} onClick={(event)=>{if(props.editor){event.stopPropagation();props.onSelectSection?.(section.id);}}}>{props.editor?<div className="pointer-events-none absolute right-4 top-4 z-30 rounded-full bg-fuchsia-600 px-3 py-1.5 text-[10px] font-black text-white">EDITAR SEÇÃO</div>:null}<ContentSection section={section} props={props}/></section>;})}</>;
}
