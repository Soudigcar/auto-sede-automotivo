'use client';

import { useCallback, useLayoutEffect, useMemo, useRef } from 'react';
import { Crop, Grip, Move, RotateCw } from 'lucide-react';
import { CampaignFinanceSimulatorInline } from '@/components/campaigns/CampaignFinanceSimulatorInline';
import type { Box, ContentKey, Device, DeviceLayout, Draft, Layer } from './CampaignVisualEditorModel';
import { clamp, contentKeys, defaultHeader, textFor } from './CampaignVisualEditorModel';
import {
  ensureFlowResponsive,
  flowResponsiveSettings,
  isFlowAuto,
  responsiveFontSize,
  type FlowMeasurement,
  type ResponsiveTarget
} from './CampaignVisualEditorFlow';

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
  heroRef: React.MutableRefObject<HTMLElement | null>;
  heroSource: string;
  onSelect: (layer: Layer) => void;
  onSelectContent: (key: ContentKey) => void;
  onStartBox: (event: React.PointerEvent<HTMLElement>, kind: 'box' | 'resize', key: 'header' | 'logo' | 'simulator') => void;
  onStartContent: (event: React.PointerEvent<HTMLElement>, kind: 'content' | 'contentResize', key: ContentKey) => void;
  onStartBackground: (event: React.PointerEvent<HTMLElement>) => void;
  onWheel: (event: React.WheelEvent<HTMLElement>) => void;
  onBackgroundDoubleClick: () => void;
  onSelectVehicle: (id: string) => void;
  onFlowMeasurement: (target: ResponsiveTarget, measurement: FlowMeasurement) => void;
  onOpenSimulator?: () => void;
  showInlineSimulator?: boolean;
};

function rectBox(element: HTMLElement, heroRect: DOMRect, fallback: Box): Box {
  const rect = element.getBoundingClientRect();
  const width = clamp((rect.width / heroRect.width) * 100, 4, 100);
  return {
    x: clamp(((rect.left - heroRect.left) / heroRect.width) * 100, 0, Math.max(0, 100 - width)),
    y: clamp(((rect.top - heroRect.top) / heroRect.height) * 100, 0, 98),
    width,
    visible: fallback.visible,
    locked: fallback.locked
  };
}

function cropClip(layout: DeviceLayout) {
  const right = Math.max(0, 100 - layout.cropX - layout.cropWidth);
  const bottom = Math.max(0, 100 - layout.cropY - layout.cropHeight);
  return `inset(${layout.cropY}% ${right}% ${bottom}% ${layout.cropX}%)`;
}

function imageTransform(layout: DeviceLayout) {
  return `translate(-50%, -50%) rotate(${layout.backgroundRotation}deg) scaleX(${layout.backgroundFlipX ? -1 : 1}) scaleY(${layout.backgroundFlipY ? -1 : 1})`;
}

function BackgroundMedia({ source, layout, contained = false }: { source: string; layout: DeviceLayout; contained?: boolean }) {
  if (!source) return null;
  return <div className="pointer-events-none absolute inset-0 overflow-hidden" style={{ clipPath: cropClip(layout) }}>
    <img
      src={source}
      alt="Capa"
      draggable={false}
      className={`absolute h-auto max-w-none select-none ${contained ? 'max-h-none' : ''}`}
      style={{
        left: `${layout.backgroundX}%`,
        top: `${layout.backgroundY}%`,
        width: `${layout.backgroundScale}%`,
        transform: imageTransform(layout),
        transformOrigin: 'center center'
      }}
    />
  </div>;
}

export function CampaignVisualEditorPreviewFlow(props: Props) {
  const draft = ensureFlowResponsive(props.draft);
  const layout = draft.devices[props.device];
  const autoFlow = isFlowAuto(draft, props.device);
  const flowRootRef = useRef<HTMLElement | null>(null);
  const settings = flowResponsiveSettings(draft);
  const target = props.device === 'desktop' ? null : props.device as ResponsiveTarget;
  const linkedBackground = target ? settings.syncBackground[target] : false;
  const showInlineSimulator = props.showInlineSimulator !== false;

  const setHeroRef = useCallback((node: HTMLElement | null) => {
    props.heroRef.current = node;
    flowRootRef.current = node;
  }, [props.heroRef]);

  useLayoutEffect(() => {
    if (!autoFlow || !target || !flowRootRef.current) return;
    const hero = flowRootRef.current;
    let frame = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const heroRect = hero.getBoundingClientRect();
        if (!heroRect.width || !heroRect.height) return;
        const measurement: FlowMeasurement = { heroHeight: hero.scrollHeight, content: {} };
        const header = hero.querySelector<HTMLElement>('[data-flow-box="header"]');
        const logo = hero.querySelector<HTMLElement>('[data-flow-box="logo"]');
        const simulator = hero.querySelector<HTMLElement>('[data-flow-box="simulator"]');
        if (header) measurement.header = rectBox(header, heroRect, layout.header);
        if (logo) measurement.logo = rectBox(logo, heroRect, layout.logo);
        if (simulator) measurement.simulator = rectBox(simulator, heroRect, layout.simulator);
        for (const key of contentKeys) {
          const element = hero.querySelector<HTMLElement>(`[data-flow-box="content-${key}"]`);
          if (element) measurement.content[key] = rectBox(element, heroRect, layout.content[key]);
        }
        props.onFlowMeasurement(target, measurement);
      });
    };
    const observer = new ResizeObserver(measure);
    observer.observe(hero);
    hero.querySelectorAll<HTMLElement>('[data-flow-box]').forEach((element) => observer.observe(element));
    measure();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [autoFlow, target, props.onFlowMeasurement, layout]);

  function runButtonAction(key: ContentKey) {
    const visual = draft.content[key];
    if (visual.action === 'simulator') {
      if (props.onOpenSimulator) props.onOpenSimulator();
      else document.getElementById('editor-inline-simulator')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    if (visual.action === 'vehicles') document.getElementById('editor-vehicles')?.scrollIntoView({ behavior: 'smooth' });
    if (visual.action === 'whatsapp' && props.campaign?.whatsapp_number) window.open(`https://wa.me/${String(props.campaign.whatsapp_number).replace(/\D/g, '')}`, '_blank');
  }

  function visualStyle(key: ContentKey, flowTarget?: ResponsiveTarget): React.CSSProperties {
    const visual = draft.content[key];
    const isButton = key === 'primaryButton' || key === 'secondaryButton';
    const fontSize = flowTarget ? responsiveFontSize(draft, key, flowTarget) : Math.max(7, visual.fontSize * (layout.textScale ?? 1));
    const scale = flowTarget === 'mobile' ? 0.78 : flowTarget === 'tablet' ? 0.9 : (layout.textScale ?? 1);
    return {
      display: 'block', width: '100%', color: visual.color, background: visual.background,
      border: `1px solid ${visual.borderColor}`, opacity: visual.opacity / 100, fontSize,
      fontWeight: visual.weight, textAlign: visual.align, lineHeight: visual.lineHeight,
      letterSpacing: visual.letterSpacing * scale, borderRadius: visual.radius,
      padding: `${visual.paddingY * scale}px ${visual.paddingX * scale}px`, overflowWrap: 'anywhere',
      boxShadow: isButton ? '0 12px 28px rgba(15,23,42,.18)' : undefined
    };
  }

  function renderTextElement(key: ContentKey, style: React.CSSProperties) {
    const text = textFor(key, draft, props.campaign, props.eventInfo, props.stores);
    if (key === 'primaryButton' || key === 'secondaryButton') return <button type="button" tabIndex={-1} style={style} onClick={() => props.clientView && runButtonAction(key)}>{text}</button>;
    if (key === 'title') return <h1 style={style}>{text}</h1>;
    if (key === 'description') return <p style={style}>{text}</p>;
    return <span style={style}>{text}</span>;
  }

  function flowSelectionControls(kind: 'box' | 'content', key: 'header' | 'logo' | 'simulator' | ContentKey, locked: boolean) {
    if (props.clientView || locked) return null;
    const active = kind === 'content' ? props.layer === 'content' && props.selectedContent === key : props.layer === key;
    if (!active) return null;
    return <>
      <button type="button" className="absolute -top-10 left-0 z-50 rounded-xl bg-indigo-600 px-3 py-2 text-[9px] font-black text-white shadow-xl" onPointerDown={(event) => kind === 'content' ? props.onStartContent(event, 'content', key as ContentKey) : props.onStartBox(event, 'box', key as 'header' | 'logo' | 'simulator')}><Move size={12} className="inline" /> Ajustar manualmente</button>
      <button type="button" className="absolute -bottom-4 -right-4 z-50 flex h-9 w-9 items-center justify-center rounded-full bg-fuchsia-600 text-white shadow-xl" onPointerDown={(event) => kind === 'content' ? props.onStartContent(event, 'contentResize', key as ContentKey) : props.onStartBox(event, 'resize', key as 'header' | 'logo' | 'simulator')}><Grip size={15} /></button>
    </>;
  }

  function flowContent(key: ContentKey, targetDevice: ResponsiveTarget) {
    const box = layout.content[key];
    if (!box.visible) return null;
    const active = !props.clientView && props.layer === 'content' && props.selectedContent === key;
    return <div data-editor-element={`content-${key}`} data-flow-box={`content-${key}`} className={`relative ${active ? 'z-40 outline outline-2 outline-fuchsia-400 outline-offset-4' : ''}`} onClick={(event) => { if (!props.clientView) { event.stopPropagation(); props.onSelectContent(key); } }} onDoubleClick={(event) => { if (!props.clientView) { event.stopPropagation(); props.onSelectContent(key); window.setTimeout(() => document.getElementById(`text-${key}`)?.focus(), 20); } }}>
      {renderTextElement(key, visualStyle(key, targetDevice))}{flowSelectionControls('content', key, box.locked)}
    </div>;
  }

  function backgroundHint() {
    if (props.clientView || props.layer !== 'background' || !props.heroSource) return null;
    return <div className="absolute right-3 top-3 z-50 flex items-center gap-2 rounded-xl bg-black/75 px-3 py-2 text-[9px] font-black text-white shadow-xl"><Crop size={13} /> Recorte, giro e espelhamento no painel</div>;
  }

  function renderAutoFlow(targetDevice: ResponsiveTarget) {
    const activeHeader = !props.clientView && props.layer === 'header';
    const activeLogo = !props.clientView && props.layer === 'logo';
    const activeSimulator = !props.clientView && props.layer === 'simulator';
    const visibleMeta = (['date', 'location', 'stores'] as ContentKey[]).filter((key) => layout.content[key].visible);
    const visibleButtons = (['primaryButton', 'secondaryButton'] as ContentKey[]).filter((key) => layout.content[key].visible);
    return <section ref={setHeroRef} className={`relative overflow-hidden ${!props.clientView && props.layer === 'background' ? 'outline outline-2 outline-cyan-400' : ''}`} style={{ backgroundColor: draft.secondaryColor }} onClick={(event) => { if (!props.clientView && !(event.target as HTMLElement).closest('[data-editor-element]')) props.onSelect('background'); }} onDoubleClick={(event) => { if (!props.clientView && !(event.target as HTMLElement).closest('[data-editor-element]')) props.onBackgroundDoubleClick(); }}>
      <div className={`relative z-10 mx-auto flex w-full flex-col ${targetDevice === 'mobile' ? 'gap-5 px-5 py-7' : 'gap-7 px-8 py-9'}`} style={{ maxWidth: targetDevice === 'mobile' ? 520 : 900 }}>
        {layout.header.visible ? <div data-editor-element="header" data-flow-box="header" className={`relative self-start ${activeHeader ? 'outline outline-2 outline-indigo-400 outline-offset-4' : ''}`} style={{ width: targetDevice === 'mobile' ? `${clamp(layout.header.width, 38, 68)}%` : `${clamp(layout.header.width, 22, 42)}%` }} onClick={(event) => { if (!props.clientView) { event.stopPropagation(); props.onSelect('header'); } }}><div className="flex items-center gap-2" style={{ color: draft.content.title.color }}>{draft.showHeaderLabel ? <strong className="shrink-0 text-[10px] font-black uppercase tracking-[0.18em]">{draft.headerLabel}</strong> : null}<img src={draft.headerLogo || defaultHeader} alt="Apoio" draggable={false} className="pointer-events-none min-w-0 flex-1 object-contain" /></div>{flowSelectionControls('box', 'header', layout.header.locked)}</div> : null}
        {layout.logo.visible && (draft.eventLogo || props.campaign?.logo_url) ? <div data-editor-element="logo" data-flow-box="logo" className={`relative self-start ${activeLogo ? 'outline outline-2 outline-indigo-400 outline-offset-4' : ''}`} style={{ width: targetDevice === 'mobile' ? `${clamp(layout.logo.width, 42, 76)}%` : `${clamp(layout.logo.width, 28, 50)}%` }} onClick={(event) => { if (!props.clientView) { event.stopPropagation(); props.onSelect('logo'); } }}><img src={draft.eventLogo || props.campaign?.logo_url} alt="Logo" draggable={false} className="pointer-events-none w-full object-contain" />{flowSelectionControls('box', 'logo', layout.logo.locked)}</div> : null}
        {props.heroSource ? <div className="relative min-h-52 w-full overflow-hidden rounded-[28px]" style={{ background: `${draft.secondaryColor}22` }}><BackgroundMedia source={props.heroSource} layout={layout} contained />{draft.overlay > 0 ? <div className="pointer-events-none absolute inset-0" style={{ background: `rgba(7,16,32,${draft.overlay / 100})` }} /> : null}{linkedBackground && !props.clientView ? <span className="absolute bottom-3 right-3 rounded-full bg-black/70 px-3 py-1.5 text-[9px] font-black text-white">FUNDO DO DESKTOP</span> : null}{backgroundHint()}</div> : null}
        <div className="flex flex-col gap-4">{layout.content.eyebrow.visible ? flowContent('eyebrow', targetDevice) : null}{layout.content.title.visible ? flowContent('title', targetDevice) : null}{layout.content.description.visible ? flowContent('description', targetDevice) : null}{visibleMeta.length ? <div className={`grid gap-3 ${targetDevice === 'tablet' ? 'grid-cols-3' : 'grid-cols-1'}`}>{visibleMeta.map((key) => <div key={key}>{flowContent(key, targetDevice)}</div>)}</div> : null}{visibleButtons.length ? <div className={`grid gap-3 ${targetDevice === 'tablet' ? 'grid-cols-2' : 'grid-cols-1'}`}>{visibleButtons.map((key) => <div key={key}>{flowContent(key, targetDevice)}</div>)}</div> : null}</div>
        {showInlineSimulator && layout.simulator.visible ? <div id="editor-inline-simulator" data-editor-element="simulator" data-flow-box="simulator" className={`relative mt-2 ${activeSimulator ? 'outline outline-2 outline-indigo-400 outline-offset-4' : ''}`} onClick={(event) => { if (!props.clientView) { event.stopPropagation(); props.onSelect('simulator'); } }}><CampaignFinanceSimulatorInline campaign={props.campaign} eventInfo={props.eventInfo} vehicles={props.vehicles} primaryColor={draft.primaryColor} cardRadius={draft.cardRadius} stacked />{flowSelectionControls('box', 'simulator', layout.simulator.locked)}</div> : null}
      </div>
    </section>;
  }

  function absoluteBox(key: 'header' | 'logo' | 'simulator', children: React.ReactNode, handleOnly = false) {
    const box = layout[key];
    if (!box.visible) return null;
    const active = !props.clientView && props.layer === key;
    return <div id={key === 'simulator' ? 'editor-inline-simulator' : undefined} data-editor-element={key} className={`absolute ${active ? 'z-50' : 'z-30'}`} style={{ left: `${box.x}%`, top: `${box.y}%`, width: `${box.width}%`, touchAction: 'none' }} onClick={(event) => { if (!props.clientView) { event.stopPropagation(); props.onSelect(key); } }} onPointerDown={handleOnly ? undefined : (event) => props.onStartBox(event, 'box', key)}><div className={`relative ${active ? 'outline outline-2 outline-indigo-400 outline-offset-4' : ''}`}>{children}{active && !box.locked ? <><button type="button" className="absolute -top-11 left-0 z-50 rounded-xl bg-indigo-600 px-3 py-2 text-[10px] font-black text-white shadow-xl" onPointerDown={(event) => props.onStartBox(event, 'box', key)}><Move size={12} className="inline" /> Mover</button><button type="button" className="absolute -bottom-4 -right-4 z-50 flex h-9 w-9 items-center justify-center rounded-full bg-indigo-600 text-white shadow-xl" onPointerDown={(event) => props.onStartBox(event, 'resize', key)}><Grip size={15} /></button></> : null}</div></div>;
  }

  function absoluteContent(key: ContentKey) {
    const box = layout.content[key];
    if (!box.visible) return null;
    const active = !props.clientView && props.layer === 'content' && props.selectedContent === key;
    return <div data-editor-element={`content-${key}`} className={`absolute ${active ? 'z-50' : 'z-[35]'}`} style={{ left: `${box.x}%`, top: `${box.y}%`, width: `${box.width}%`, touchAction: 'none' }} onClick={(event) => { if (props.clientView) { if (key === 'primaryButton' || key === 'secondaryButton') runButtonAction(key); return; } event.stopPropagation(); props.onSelectContent(key); }} onDoubleClick={(event) => { if (!props.clientView) { event.stopPropagation(); props.onSelectContent(key); window.setTimeout(() => document.getElementById(`text-${key}`)?.focus(), 20); } }} onPointerDown={props.clientView ? undefined : (event) => props.onStartContent(event, 'content', key)}><div className={`relative ${active ? 'outline outline-2 outline-fuchsia-400 outline-offset-4' : ''}`}>{renderTextElement(key, visualStyle(key))}{active && !box.locked ? <button type="button" className="absolute -bottom-4 -right-4 z-50 flex h-9 w-9 items-center justify-center rounded-full bg-fuchsia-600 text-white shadow-xl" onPointerDown={(event) => props.onStartContent(event, 'contentResize', key)}><Grip size={15} /></button> : null}</div></div>;
  }

  const manualHero = <section ref={setHeroRef} className={`relative overflow-hidden ${!props.clientView && props.layer === 'background' ? 'outline outline-2 outline-cyan-400' : ''}`} style={{ minHeight: layout.heroHeight, backgroundColor: draft.secondaryColor, touchAction: 'none' }} onClick={(event) => { if (!props.clientView && !(event.target as HTMLElement).closest('[data-editor-element]')) props.onSelect('background'); }} onPointerDown={props.onStartBackground} onWheel={props.onWheel} onDoubleClick={(event) => { if (!props.clientView && !(event.target as HTMLElement).closest('[data-editor-element]')) props.onBackgroundDoubleClick(); }}>
    <BackgroundMedia source={props.heroSource} layout={layout} />{props.heroSource && draft.overlay > 0 ? <div className="pointer-events-none absolute inset-0" style={{ background: `rgba(7,16,32,${draft.overlay / 100})` }} /> : null}{backgroundHint()}
    {absoluteBox('header', <div className="flex items-center gap-3" style={{ color: draft.content.title.color }}>{draft.showHeaderLabel ? <strong>{draft.headerLabel}</strong> : null}<img src={draft.headerLogo || defaultHeader} alt="Apoio" draggable={false} className="pointer-events-none w-full object-contain" /></div>)}
    {absoluteBox('logo', draft.eventLogo || props.campaign?.logo_url ? <img src={draft.eventLogo || props.campaign?.logo_url} alt="Logo" draggable={false} className="pointer-events-none w-full object-contain" /> : <div className="rounded-xl border border-dashed border-white/50 p-4 text-white">Adicionar logo</div>)}
    {contentKeys.map((key) => <span key={key}>{absoluteContent(key)}</span>)}
    {showInlineSimulator ? absoluteBox('simulator', <CampaignFinanceSimulatorInline campaign={props.campaign} eventInfo={props.eventInfo} vehicles={props.vehicles} primaryColor={draft.primaryColor} cardRadius={draft.cardRadius} stacked={props.device !== 'desktop'} />, true) : null}
  </section>;

  const hero = autoFlow && target ? renderAutoFlow(target) : manualHero;
  const fallbackVehicles = useMemo(() => Array.from({ length: props.device === 'mobile' ? 3 : props.device === 'tablet' ? 4 : 8 }).map((_, index) => ({ id: `preview-${index}`, brand: 'Veículo', model: `disponível ${index + 1}`, store_name: 'Loja participante' })), [props.device]);
  const vehicles = (props.vehicles.length ? props.vehicles : fallbackVehicles).slice(0, props.device === 'mobile' ? 3 : props.device === 'tablet' ? 4 : 8);

  return <div className="bg-slate-50 text-slate-950">{hero}<section className="bg-white px-6 py-16"><div className="mx-auto max-w-6xl"><h2 className="text-4xl font-black">Vantagens do evento</h2><div className={`mt-8 grid gap-4 ${props.device === 'mobile' ? 'grid-cols-1' : 'md:grid-cols-3'}`}>{['Simulação rápida', 'Estoque conectado', 'Atendimento responsável'].map((item) => <article key={item} className="rounded-3xl border p-6"><h3 className="text-xl font-black">{item}</h3></article>)}</div></div></section><section id="editor-vehicles" className="bg-slate-100 px-6 py-16"><div className="mx-auto max-w-6xl"><h2 className="text-4xl font-black">Veículos disponíveis</h2><div className={`mt-8 grid gap-4 ${props.device === 'mobile' ? 'grid-cols-1' : props.device === 'tablet' ? 'grid-cols-2' : 'grid-cols-4'}`}>{vehicles.map((vehicle: any) => <article key={vehicle.id} className="rounded-3xl bg-white p-5"><p className="text-xs font-black text-slate-400">{vehicle.store_name}</p><h3 className="mt-2 text-lg font-black">{vehicle.brand} {vehicle.model}</h3><button type="button" onClick={() => props.onSelectVehicle(vehicle.id)} className="mt-4 w-full rounded-xl p-3 text-xs font-black text-white" style={{ background: draft.primaryColor }}>Simular este veículo</button></article>)}</div></div></section>{draft.footer.visible ? <footer data-editor-element="footer" onClick={(event) => { if (!props.clientView) { event.stopPropagation(); props.onSelect('footer'); } }} className={!props.clientView && props.layer === 'footer' ? 'outline outline-2 outline-amber-400' : ''} style={{ backgroundColor: draft.footer.backgroundColor, color: draft.footer.textColor, textAlign: draft.footer.align, padding: `${draft.footer.paddingY}px 24px`, fontSize: draft.footer.fontSize }}><div className="mx-auto" style={{ maxWidth: draft.footer.maxWidth }}><p>{draft.footer.notice.replace('{ANO}', String(new Date().getFullYear()))}</p>{draft.footer.showTerms && (draft.footer.termsOverride || props.campaign?.terms_text) ? <p className="mt-3 opacity-70">{draft.footer.termsOverride || props.campaign?.terms_text}</p> : null}{!props.clientView ? <p className="mt-3 text-[10px] opacity-40"><RotateCw size={11} className="inline" /> Preview visual local — não publicado.</p> : null}</div></footer> : null}</div>;
}
