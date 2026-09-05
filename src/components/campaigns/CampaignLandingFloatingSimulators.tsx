'use client';

import { Maximize2, Move } from 'lucide-react';
import { CampaignFinanceSimulatorInline } from '@/components/campaigns/CampaignFinanceSimulatorInline';
import type { LandingDraftV3, LandingFreePlacement, LandingSection } from './CampaignLandingSectionModel';
import type { Device } from './CampaignVisualEditorModel';

type Props = {
  draft: LandingDraftV3;
  device: Device;
  vehicles: any[];
  campaign: any;
  eventInfo?: any;
  editor?: boolean;
  selectedSectionId?: string;
  onSelectSection?: (id: string) => void;
  onChange?: (draft: LandingDraftV3) => void;
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function translateForAlign(align: LandingFreePlacement['align']) {
  if (align === 'center') return 'translateX(-50%)';
  if (align === 'right') return 'translateX(-100%)';
  return undefined;
}

export function CampaignLandingFloatingSimulators(props: Props) {
  const sections = props.draft.sections.filter((section) => section.visible && section.type === 'simulation' && section.placementMode === 'free');
  if (!sections.length) return null;

  function patchPlacement(section: LandingSection, patch: Partial<LandingFreePlacement>) {
    if (!props.onChange) return;
    const index = props.draft.sections.findIndex((item) => item.id === section.id);
    if (index < 0) return;
    const current = section.freePlacement[props.device];
    const sectionsNext = [...props.draft.sections];
    sectionsNext[index] = {
      ...section,
      freePlacement: {
        ...section.freePlacement,
        [props.device]: { ...current, ...patch }
      }
    };
    props.onChange({ ...props.draft, sections: sectionsNext });
  }

  function canvasMetrics(target: HTMLElement) {
    const canvas = target.closest<HTMLElement>('[data-landing-canvas]');
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const scale = canvas.offsetWidth > 0 ? rect.width / canvas.offsetWidth : 1;
    return { canvas, rect, scale: scale || 1 };
  }

  function startMove(event: React.PointerEvent<HTMLButtonElement>, section: LandingSection) {
    if (!props.editor || !props.onChange) return;
    event.preventDefault();
    event.stopPropagation();
    const metrics = canvasMetrics(event.currentTarget);
    if (!metrics?.rect.width) return;
    const startX = event.clientX;
    const startY = event.clientY;
    const origin = { ...section.freePlacement[props.device] };

    const move = (moveEvent: globalThis.PointerEvent) => {
      moveEvent.preventDefault();
      const deltaX = ((moveEvent.clientX - startX) / metrics.rect.width) * 100;
      const deltaY = (moveEvent.clientY - startY) / metrics.scale;
      patchPlacement(section, {
        x: clamp(origin.x + deltaX, -20, 120),
        y: clamp(origin.y + deltaY, -400, 8000)
      });
    };
    const finish = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', finish);
    };
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', finish);
  }

  function startResize(event: React.PointerEvent<HTMLButtonElement>, section: LandingSection) {
    if (!props.editor || !props.onChange) return;
    event.preventDefault();
    event.stopPropagation();
    const metrics = canvasMetrics(event.currentTarget);
    if (!metrics?.rect.width) return;
    const startX = event.clientX;
    const origin = { ...section.freePlacement[props.device] };

    const move = (moveEvent: globalThis.PointerEvent) => {
      moveEvent.preventDefault();
      const delta = ((moveEvent.clientX - startX) / metrics.rect.width) * 100;
      patchPlacement(section, { width: clamp(origin.width + delta, 20, 100) });
    };
    const finish = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', finish);
    };
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', finish);
  }

  const simulatorLayout = props.device === 'mobile' ? 'mobile' : props.device === 'tablet' ? 'tablet' : 'desktop';

  return <>{sections.map((section) => {
    const placement = section.freePlacement[props.device];
    const active = Boolean(props.editor && props.selectedSectionId === section.id);
    return <div
      key={section.id}
      data-floating-simulator-id={section.id}
      className={`absolute z-[75] min-w-0 ${active ? 'outline outline-2 outline-fuchsia-500 outline-offset-4' : ''}`}
      style={{
        top: placement.y,
        left: `${placement.x}%`,
        width: `${placement.width}%`,
        maxWidth: section.maxWidth,
        transform: translateForAlign(placement.align)
      }}
      onClick={(event) => {
        if (!props.editor) return;
        event.stopPropagation();
        props.onSelectSection?.(section.id);
      }}
    >
      {props.editor ? <button
        type="button"
        onPointerDown={(event) => startMove(event, section)}
        onClick={(event) => event.stopPropagation()}
        className="absolute left-1/2 top-0 z-[95] flex h-8 -translate-x-1/2 -translate-y-1/2 cursor-grab items-center gap-2 rounded-full border border-white/20 bg-zinc-950 px-4 text-[9px] font-black text-white shadow-xl active:cursor-grabbing"
        title="Arrastar o simulador livremente pela Landing"
      ><Move size={13}/> ARRASTAR SIMULADOR</button> : null}

      <CampaignFinanceSimulatorInline
        campaign={props.campaign}
        eventInfo={props.eventInfo}
        vehicles={props.vehicles}
        primaryColor={props.draft.primaryColor}
        cardRadius={props.draft.cardRadius}
        backgroundColor={props.draft.simulatorBackground}
        summaryBackgroundColor={props.draft.simulatorSummaryBackground}
        mode={props.editor ? 'preview' : 'live'}
        slug={String(props.campaign?.slug || '')}
        layoutMode={simulatorLayout}
      />

      {props.editor ? <button
        type="button"
        onPointerDown={(event) => startResize(event, section)}
        onClick={(event) => event.stopPropagation()}
        className="absolute bottom-0 right-0 z-[95] flex h-8 w-8 translate-x-1/2 translate-y-1/2 cursor-ew-resize items-center justify-center rounded-full border border-white/20 bg-fuchsia-600 text-white shadow-xl"
        title="Redimensionar largura"
      ><Maximize2 size={13}/></button> : null}
    </div>;
  })}</>;
}
