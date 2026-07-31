'use client';

import { Grip, Move } from 'lucide-react';
import { CampaignFinanceSimulatorInline } from '@/components/campaigns/CampaignFinanceSimulatorInline';
import type { ContentKey, Device, Draft, Layer } from './CampaignVisualEditorModel';
import { contentKeys, defaultHeader, textFor } from './CampaignVisualEditorModel';
import type { ResponsiveDeviceLayout, ResponsiveDraft } from './CampaignVisualEditorResponsive';

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
};

export function CampaignVisualEditorPreviewResponsive(props: Props) {
  const draft = props.draft as ResponsiveDraft;
  const layout = draft.devices[props.device] as ResponsiveDeviceLayout;
  const textScale = layout.textScale ?? (props.device === 'desktop' ? 1 : props.device === 'tablet' ? 0.78 : 0.52);

  function boxFrame(key: 'header' | 'logo' | 'simulator', children: React.ReactNode, handleOnly = false) {
    const box = layout[key];
    if (!box.visible) return null;
    const active = !props.clientView && props.layer === key;

    return (
      <div
        id={key === 'simulator' ? 'editor-inline-simulator' : undefined}
        data-editor-element={key}
        className={`absolute ${active ? 'z-50' : 'z-30'}`}
        style={{ left: `${box.x}%`, top: `${box.y}%`, width: `${box.width}%`, touchAction: 'none' }}
        onClick={(event: React.MouseEvent<HTMLElement>) => {
          if (props.clientView) return;
          event.stopPropagation();
          props.onSelect(key);
        }}
        onPointerDown={handleOnly ? undefined : (event: React.PointerEvent<HTMLElement>) => props.onStartBox(event, 'box', key)}
      >
        <div className={`relative ${active ? 'outline outline-2 outline-indigo-400 outline-offset-4' : ''}`}>
          {children}
          {active && !box.locked ? (
            <>
              <button type="button" className="absolute -top-11 left-0 z-50 rounded-xl bg-indigo-600 px-3 py-2 text-[10px] font-black text-white shadow-xl" onPointerDown={(event: React.PointerEvent<HTMLElement>) => props.onStartBox(event, 'box', key)}>
                <Move size={12} className="inline" /> Mover
              </button>
              <button type="button" className="absolute -bottom-4 -right-4 z-50 flex h-9 w-9 items-center justify-center rounded-full bg-indigo-600 text-white shadow-xl" onPointerDown={(event: React.PointerEvent<HTMLElement>) => props.onStartBox(event, 'resize', key)} aria-label={`Redimensionar ${key}`}>
                <Grip size={15} />
              </button>
            </>
          ) : null}
        </div>
      </div>
    );
  }

  function runButtonAction(key: ContentKey) {
    const visual = draft.content[key];
    if (visual.action === 'simulator') {
      document.getElementById('editor-inline-simulator')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    if (visual.action === 'vehicles') {
      document.getElementById('editor-vehicles')?.scrollIntoView({ behavior: 'smooth' });
      return;
    }
    if (visual.action === 'whatsapp' && props.campaign?.whatsapp_number) {
      window.open(`https://wa.me/${String(props.campaign.whatsapp_number).replace(/\D/g, '')}`, '_blank');
    }
  }

  function contentFrame(key: ContentKey) {
    const box = layout.content[key];
    const visual = draft.content[key];
    if (!box.visible) return null;
    const active = !props.clientView && props.layer === 'content' && props.selectedContent === key;
    const isButton = key === 'primaryButton' || key === 'secondaryButton';
    const scaledFont = Math.max(7, visual.fontSize * textScale);
    const scaledPaddingX = visual.paddingX * Math.max(0.62, textScale);
    const scaledPaddingY = visual.paddingY * Math.max(0.62, textScale);
    const style: React.CSSProperties = {
      display: 'block',
      width: '100%',
      color: visual.color,
      background: visual.background,
      border: `1px solid ${visual.borderColor}`,
      opacity: visual.opacity / 100,
      fontSize: scaledFont,
      fontWeight: visual.weight,
      textAlign: visual.align,
      lineHeight: visual.lineHeight,
      letterSpacing: visual.letterSpacing * textScale,
      borderRadius: visual.radius,
      padding: `${scaledPaddingY}px ${scaledPaddingX}px`,
      overflowWrap: 'anywhere',
      boxShadow: isButton ? '0 12px 28px rgba(15,23,42,.18)' : undefined
    };
    const text = textFor(key, draft, props.campaign, props.eventInfo, props.stores);

    return (
      <div
        data-editor-element={`content-${key}`}
        className={`absolute ${active ? 'z-50' : 'z-[35]'}`}
        style={{ left: `${box.x}%`, top: `${box.y}%`, width: `${box.width}%`, touchAction: 'none' }}
        onClick={(event: React.MouseEvent<HTMLElement>) => {
          if (props.clientView) {
            if (isButton) runButtonAction(key);
            return;
          }
          event.stopPropagation();
          props.onSelectContent(key);
        }}
        onDoubleClick={(event: React.MouseEvent<HTMLElement>) => {
          if (props.clientView) return;
          event.stopPropagation();
          props.onSelectContent(key);
          window.setTimeout(() => document.getElementById(`text-${key}`)?.focus(), 20);
        }}
        onPointerDown={props.clientView ? undefined : (event: React.PointerEvent<HTMLElement>) => props.onStartContent(event, 'content', key)}
      >
        <div className={`relative ${active ? 'outline outline-2 outline-fuchsia-400 outline-offset-4' : ''}`}>
          {isButton ? <button type="button" tabIndex={-1} style={style}>{text}</button> : key === 'title' ? <h1 style={style}>{text}</h1> : key === 'description' ? <p style={style}>{text}</p> : <span style={style}>{text}</span>}
          {active && !box.locked ? (
            <button type="button" className="absolute -bottom-4 -right-4 z-50 flex h-9 w-9 items-center justify-center rounded-full bg-fuchsia-600 text-white shadow-xl" onPointerDown={(event: React.PointerEvent<HTMLElement>) => props.onStartContent(event, 'contentResize', key)} aria-label={`Redimensionar ${key}`}>
              <Grip size={15} />
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  const fallbackVehicles = Array.from({ length: props.device === 'mobile' ? 3 : props.device === 'tablet' ? 4 : 8 }).map((_, index) => ({ id: `preview-${index}`, brand: 'Veículo', model: `disponível ${index + 1}`, version: 'Consulte condições', store_name: 'Loja participante' }));
  const vehicles = (props.vehicles.length ? props.vehicles : fallbackVehicles).slice(0, props.device === 'mobile' ? 3 : props.device === 'tablet' ? 4 : 8);

  return (
    <div className="bg-slate-50 text-slate-950">
      <section
        ref={props.heroRef as React.RefObject<HTMLElement>}
        className={`relative overflow-hidden ${!props.clientView && props.layer === 'background' ? 'outline outline-2 outline-cyan-400' : ''}`}
        style={{ minHeight: layout.heroHeight, backgroundColor: draft.secondaryColor, touchAction: 'none' }}
        onClick={(event: React.MouseEvent<HTMLElement>) => {
          if (!props.clientView && !(event.target as HTMLElement).closest('[data-editor-element]')) props.onSelect('background');
        }}
        onPointerDown={props.onStartBackground}
        onWheel={props.onWheel}
        onDoubleClick={(event: React.MouseEvent<HTMLElement>) => {
          if (!props.clientView && !(event.target as HTMLElement).closest('[data-editor-element]')) props.onBackgroundDoubleClick();
        }}
      >
        {props.heroSource ? <img src={props.heroSource} alt="Capa" draggable={false} className="pointer-events-none absolute h-auto max-w-none select-none" style={{ left: `${layout.backgroundX}%`, top: `${layout.backgroundY}%`, width: `${layout.backgroundScale}%`, transform: 'translate(-50%, -50%)' }} /> : null}
        {props.heroSource && draft.overlay > 0 ? <div className="pointer-events-none absolute inset-0" style={{ background: `rgba(7,16,32,${draft.overlay / 100})` }} /> : null}

        {boxFrame('header', <div className="flex items-center gap-3 text-white">{draft.showHeaderLabel ? <strong>{draft.headerLabel}</strong> : null}<img src={draft.headerLogo || defaultHeader} alt="Apoio" draggable={false} className="pointer-events-none w-full object-contain" /></div>)}
        {boxFrame('logo', draft.eventLogo || props.campaign?.logo_url ? <img src={draft.eventLogo || props.campaign?.logo_url} alt="Logo" draggable={false} className="pointer-events-none w-full object-contain" /> : <div className="rounded-xl border border-dashed border-white/50 p-4 text-white">Adicionar logo</div>)}
        {contentKeys.map((key) => <span key={key}>{contentFrame(key)}</span>)}
        {boxFrame('simulator', <CampaignFinanceSimulatorInline campaign={props.campaign} eventInfo={props.eventInfo} vehicles={props.vehicles} primaryColor={draft.primaryColor} cardRadius={draft.cardRadius} stacked={props.device !== 'desktop'} />, true)}
      </section>

      <section className="bg-white px-6 py-16"><div className="mx-auto max-w-6xl"><h2 className="text-4xl font-black">Vantagens do evento</h2><div className={`mt-8 grid gap-4 ${props.device === 'mobile' ? 'grid-cols-1' : 'md:grid-cols-3'}`}>{['Simulação rápida', 'Estoque conectado', 'Atendimento responsável'].map((item) => <article key={item} className="rounded-3xl border p-6"><h3 className="text-xl font-black">{item}</h3></article>)}</div></div></section>

      <section id="editor-vehicles" className="bg-slate-100 px-6 py-16"><div className="mx-auto max-w-6xl"><h2 className="text-4xl font-black">Veículos disponíveis</h2><div className={`mt-8 grid gap-4 ${props.device === 'mobile' ? 'grid-cols-1' : props.device === 'tablet' ? 'grid-cols-2' : 'grid-cols-4'}`}>{vehicles.map((vehicle: any) => <article key={vehicle.id} className="rounded-3xl bg-white p-5"><p className="text-xs font-black text-slate-400">{vehicle.store_name}</p><h3 className="mt-2 text-lg font-black">{vehicle.brand} {vehicle.model}</h3><button type="button" onClick={() => props.onSelectVehicle(vehicle.id)} className="mt-4 w-full rounded-xl p-3 text-xs font-black text-white" style={{ background: draft.primaryColor }}>Simular este veículo</button></article>)}</div></div></section>

      {draft.footer.visible ? <footer data-editor-element="footer" onClick={(event: React.MouseEvent<HTMLElement>) => { if (!props.clientView) { event.stopPropagation(); props.onSelect('footer'); } }} className={!props.clientView && props.layer === 'footer' ? 'outline outline-2 outline-amber-400' : ''} style={{ backgroundColor: draft.footer.backgroundColor, color: draft.footer.textColor, textAlign: draft.footer.align, padding: `${draft.footer.paddingY}px 24px`, fontSize: draft.footer.fontSize }}><div className="mx-auto" style={{ maxWidth: draft.footer.maxWidth }}><p>{draft.footer.notice.replace('{ANO}', String(new Date().getFullYear()))}</p>{draft.footer.showTerms && (draft.footer.termsOverride || props.campaign?.terms_text) ? <p className="mt-3 opacity-70">{draft.footer.termsOverride || props.campaign?.terms_text}</p> : null}{!props.clientView ? <p className="mt-3 text-[10px] opacity-40">Preview visual local — não publicado.</p> : null}</div></footer> : null}
    </div>
  );
}
