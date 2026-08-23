'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { MetaPixelTracker } from '@/components/MetaPixelTracker';
import { CampaignFinanceSimulatorInline } from '@/components/campaigns/CampaignFinanceSimulatorInline';
import { CampaignFinanceSimulatorModal } from '@/components/campaigns/CampaignFinanceSimulator';
import { CampaignLandingNavigation } from './CampaignLandingNavigation';
import { CampaignLandingSectionsRenderer } from './CampaignLandingSectionsRenderer';
import { upgradeLandingDraft, type LandingView } from './CampaignLandingSectionModel';
import { CampaignVisualEditorPreviewFlow } from './CampaignVisualEditorPreviewFlow';
import type { Device } from './CampaignVisualEditorModel';
import { safe } from './CampaignVisualEditorModel';
import { ensureResponsive } from './CampaignVisualEditorResponsive';

type Props = { campaign: any; eventInfo: any; vehicles: any[]; stores: any[]; slug: string };

function currentDevice(): Device {
  if (typeof window === 'undefined') return 'desktop';
  if (window.innerWidth <= 639) return 'mobile';
  if (window.innerWidth <= 1023) return 'tablet';
  return 'desktop';
}

export function PublishedCampaignVisualLanding({ campaign, eventInfo, vehicles, stores, slug }: Props) {
  const [device, setDevice] = useState<Device>(() => currentDevice());
  const [activeView, setActiveView] = useState<LandingView>('home');
  const [simulatorOpen, setSimulatorOpen] = useState(false);
  const [simulatorVehicleId, setSimulatorVehicleId] = useState('');
  const autoOpenedRef = useRef(false);
  const heroRef = useRef<HTMLElement | null>(null);
  const draft = useMemo(() => upgradeLandingDraft(ensureResponsive(safe(campaign?.published_layout, campaign)), campaign), [campaign]);

  useEffect(() => { const update = () => setDevice(currentDevice()); window.addEventListener('resize', update); update(); return () => window.removeEventListener('resize', update); }, []);
  useEffect(() => { if (autoOpenedRef.current) return; autoOpenedRef.current = true; const timer = window.setTimeout(() => setSimulatorOpen(true), 250); return () => window.clearTimeout(timer); }, []);

  const mode = draft.backgroundMode[device];
  const original = device === 'mobile' ? campaign?.mobile_hero_image_url || campaign?.hero_image_url : campaign?.hero_image_url;
  const heroSource = mode === 'none' ? '' : mode === 'custom' ? draft.backgroundData[device] : original || '';

  function openSimulator(vehicleId = '') {
    if (vehicleId === '__OPEN_VEHICLES__') { setActiveView('vehicles'); return; }
    setSimulatorVehicleId(vehicleId);
    setSimulatorOpen(true);
  }

  return <main id="landing-inicio" className="min-h-screen bg-slate-50 text-slate-950">
    <MetaPixelTracker />
    <CampaignLandingNavigation settings={draft.navigation} active={activeView} onNavigate={setActiveView} />

    {activeView === 'home' ? <>
      <div className="published-campaign-v3-hero">
        <CampaignVisualEditorPreviewFlow draft={draft} device={device} campaign={campaign} eventInfo={eventInfo} vehicles={vehicles} stores={stores} layer="content" selectedContent="title" clientView heroRef={heroRef} heroSource={heroSource} onSelect={() => undefined} onSelectContent={() => undefined} onStartBox={() => undefined} onStartContent={() => undefined} onStartBackground={() => undefined} onWheel={() => undefined} onBackgroundDoubleClick={() => undefined} onSelectVehicle={(vehicleId) => openSimulator(vehicleId)} onFlowMeasurement={() => undefined} onOpenSimulator={() => openSimulator()} showInlineSimulator={device === 'desktop'} />
      </div>
      <CampaignLandingSectionsRenderer draft={draft} vehicles={vehicles} campaign={campaign} onOpenSimulator={openSimulator} view="home" />
    </> : null}

    {activeView === 'vehicles' ? <CampaignLandingSectionsRenderer draft={draft} vehicles={vehicles} campaign={campaign} onOpenSimulator={openSimulator} view="vehicles" /> : null}

    {activeView === 'simulation' ? <section className="min-h-[calc(100vh-72px)] bg-slate-100 px-4 py-10 sm:px-6"><div className="mx-auto max-w-6xl"><CampaignFinanceSimulatorInline campaign={campaign} eventInfo={eventInfo} vehicles={vehicles} primaryColor={draft.primaryColor} cardRadius={draft.cardRadius} backgroundColor={draft.simulatorBackground} summaryBackgroundColor={draft.simulatorSummaryBackground} /></div></section> : null}

    {draft.footer.visible ? <footer style={{ backgroundColor: draft.footer.backgroundColor, color: draft.footer.textColor, textAlign: draft.footer.align, padding: `${draft.footer.paddingY}px 24px`, fontSize: draft.footer.fontSize }}><div className="mx-auto" style={{ maxWidth: draft.footer.maxWidth }}><p>{draft.footer.notice.replace('{ANO}', String(new Date().getFullYear()))}</p>{draft.footer.showTerms && (draft.footer.termsOverride || campaign?.terms_text) ? <p className="mt-3 opacity-70">{draft.footer.termsOverride || campaign?.terms_text}</p> : null}</div></footer> : null}

    <CampaignFinanceSimulatorModal campaign={campaign} eventInfo={eventInfo} vehicles={vehicles} open={simulatorOpen} onClose={() => setSimulatorOpen(false)} initialVehicleId={simulatorVehicleId} mode="live" primaryColor={draft.primaryColor} slug={slug} />
    <style jsx global>{`
      .published-campaign-v3-hero > div > section:nth-of-type(n+2),
      .published-campaign-v3-hero > div > footer { display: none !important; }
    `}</style>
  </main>;
}
