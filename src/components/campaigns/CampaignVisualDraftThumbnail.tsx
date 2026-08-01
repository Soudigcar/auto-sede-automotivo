'use client';

import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { CampaignVisualEditorPreviewFlow } from './CampaignVisualEditorPreviewFlow';
import { defaults, safe, type Draft } from './CampaignVisualEditorModel';
import { ensureResponsive, forceResponsiveBoth, type ResponsiveDraft } from './CampaignVisualEditorResponsive';

const PREVIEW_WIDTH = 1280;

function normalizeLayout(raw: unknown, campaign: any): ResponsiveDraft {
  if (!raw) return forceResponsiveBoth(defaults(campaign));
  const migrated = ensureResponsive(safe(raw, campaign));
  return (raw as any)?.responsive ? migrated : forceResponsiveBoth(migrated);
}

function previewSource(draft: Draft, campaign: any) {
  const mode = draft.backgroundMode.desktop;
  if (mode === 'none') return '';
  if (mode === 'custom') return draft.backgroundData.desktop || '';
  return campaign?.hero_image_url || '';
}

type Props = {
  campaign: any;
  eventInfo: any;
  vehicles: any[];
  stores: any[];
};

export function CampaignVisualDraftThumbnail({ campaign, eventInfo, vehicles, stores }: Props) {
  const frameRef = useRef<HTMLDivElement | null>(null);
  const heroRef = useRef<HTMLElement | null>(null);
  const [scale, setScale] = useState(0.32);

  const sourceLayout = campaign?.editor_draft || campaign?.published_layout || null;
  const draft = useMemo(
    () => normalizeLayout(sourceLayout, campaign),
    [sourceLayout, campaign]
  );
  const heroSource = previewSource(draft, campaign);
  const layout = draft.devices.desktop;
  const status = campaign?.editor_draft
    ? 'Rascunho atual do editor'
    : campaign?.published_layout
      ? 'Layout publicado'
      : 'Layout inicial';

  useLayoutEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const measure = () => setScale(Math.min(0.65, Math.max(0.18, frame.clientWidth / PREVIEW_WIDTH)));
    const observer = new ResizeObserver(measure);
    observer.observe(frame);
    measure();
    return () => observer.disconnect();
  }, []);

  const scaledHeight = Math.min(430, Math.max(250, layout.heroHeight * scale));

  return (
    <section className="overflow-hidden rounded-[30px] border border-zinc-200 bg-white shadow-sm">
      <div ref={frameRef} className="relative overflow-hidden bg-zinc-950" style={{ height: scaledHeight }}>
        <div
          className="pointer-events-none absolute left-0 top-0"
          style={{ width: PREVIEW_WIDTH, transform: `scale(${scale})`, transformOrigin: 'top left' }}
        >
          <CampaignVisualEditorPreviewFlow
            draft={draft}
            device="desktop"
            campaign={campaign}
            eventInfo={eventInfo}
            vehicles={vehicles}
            stores={stores}
            layer="content"
            selectedContent="title"
            clientView
            heroRef={heroRef}
            heroSource={heroSource}
            onSelect={() => undefined}
            onSelectContent={() => undefined}
            onStartBox={() => undefined}
            onStartContent={() => undefined}
            onStartBackground={() => undefined}
            onWheel={() => undefined}
            onBackgroundDoubleClick={() => undefined}
            onSelectVehicle={() => undefined}
            onFlowMeasurement={() => undefined}
          />
        </div>
      </div>
      <div className="p-5">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-zinc-400">Prévia rápida</p>
          <span className="rounded-full bg-indigo-50 px-3 py-1 text-[10px] font-black text-indigo-700">{status}</span>
        </div>
        <p className="mt-2 text-sm font-semibold text-zinc-500">Esta prévia usa exatamente a configuração salva dentro do editor visual.</p>
      </div>
    </section>
  );
}
