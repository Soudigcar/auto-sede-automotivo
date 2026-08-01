'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { MetaPixelTracker } from '@/components/MetaPixelTracker';
import { CampaignFinanceSimulatorModal } from '@/components/campaigns/CampaignFinanceSimulator';
import { CampaignVisualEditorPreviewResponsive } from './CampaignVisualEditorPreviewResponsive';
import type { Device } from './CampaignVisualEditorModel';
import { safe } from './CampaignVisualEditorModel';
import { ensureResponsive } from './CampaignVisualEditorResponsive';

type Props = {
  campaign: any;
  eventInfo: any;
  vehicles: any[];
  stores: any[];
  slug: string;
};

function currentDevice(): Device {
  if (typeof window === 'undefined') return 'desktop';
  if (window.innerWidth <= 639) return 'mobile';
  if (window.innerWidth <= 1023) return 'tablet';
  return 'desktop';
}

export function PublishedCampaignVisualLanding({ campaign, eventInfo, vehicles, stores, slug }: Props) {
  const [device, setDevice] = useState<Device>(() => currentDevice());
  const [simulatorOpen, setSimulatorOpen] = useState(false);
  const [simulatorVehicleId, setSimulatorVehicleId] = useState('');
  const autoOpenedRef = useRef(false);
  const heroRef = useRef<HTMLElement | null>(null);

  const draft = useMemo(
    () => ensureResponsive(safe(campaign?.published_layout, campaign)),
    [campaign]
  );

  useEffect(() => {
    const update = () => setDevice(currentDevice());
    window.addEventListener('resize', update);
    update();
    return () => window.removeEventListener('resize', update);
  }, []);

  useEffect(() => {
    if (autoOpenedRef.current) return;
    autoOpenedRef.current = true;
    const timer = window.setTimeout(() => setSimulatorOpen(true), 250);
    return () => window.clearTimeout(timer);
  }, []);

  const layout = draft.devices[device];
  const mode = draft.backgroundMode[device];
  const original = device === 'mobile'
    ? campaign?.mobile_hero_image_url || campaign?.hero_image_url
    : campaign?.hero_image_url;
  const heroSource = mode === 'none'
    ? ''
    : mode === 'custom'
      ? draft.backgroundData[device]
      : original || '';

  function openSimulator(vehicleId = '') {
    setSimulatorVehicleId(vehicleId);
    setSimulatorOpen(true);
  }

  return (
    <main id="landing-inicio" className="min-h-screen bg-slate-50 text-slate-950">
      <MetaPixelTracker />
      <CampaignVisualEditorPreviewResponsive
        draft={draft}
        device={device}
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
        onSelectVehicle={(vehicleId) => openSimulator(vehicleId)}
      />
      <CampaignFinanceSimulatorModal
        campaign={campaign}
        eventInfo={eventInfo}
        vehicles={vehicles}
        open={simulatorOpen}
        onClose={() => setSimulatorOpen(false)}
        initialVehicleId={simulatorVehicleId}
        mode="live"
        primaryColor={draft.primaryColor}
        slug={slug}
      />
      <span className="sr-only">Layout publicado para {campaign?.name}. Altura do banner: {layout.heroHeight}px.</span>
    </main>
  );
}
