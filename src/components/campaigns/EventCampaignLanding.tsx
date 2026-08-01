'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { Building2, CalendarDays, CarFront, CheckCircle2, MapPin, Store } from 'lucide-react';
import { MetaPixelTracker } from '@/components/MetaPixelTracker';
import { CampaignFinanceSimulatorModal, CampaignSimulatorCard } from '@/components/campaigns/CampaignFinanceSimulator';
import { PublishedCampaignVisualLanding } from '@/components/campaigns/PublishedCampaignVisualLanding';

function money(value: number) {
  return `R$ ${Number(value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function dateLabel(start?: string, end?: string) {
  const format = (value?: string) => {
    if (!value) return '';
    const date = new Date(`${value}T12:00:00`);
    return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
  };
  const first = format(start);
  const last = format(end);
  return first && last && first !== last ? `${first} a ${last}` : first || last || 'Data a confirmar';
}

export function EventCampaignLanding() {
  const params = useParams();
  const slug = String(params?.slug || '');
  const [campaign, setCampaign] = useState<any>(null);
  const [eventInfo, setEventInfo] = useState<any>(null);
  const [stores, setStores] = useState<any[]>([]);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [simulatorOpen, setSimulatorOpen] = useState(false);
  const [simulatorVehicleId, setSimulatorVehicleId] = useState('');
  const autoOpenedSlugRef = useRef('');

  useEffect(() => {
    setLoading(true);
    setSimulatorOpen(false);
    fetch(`/api/site-vehicles?slug=${encodeURIComponent(slug)}`, { cache: 'no-store' })
      .then(async (response) => ({ response, result: await response.json() }))
      .then(({ response, result }) => {
        if (!response.ok) throw new Error(result.error || 'Campanha indisponível.');
        setCampaign(result.campaign);
        setEventInfo(result.event || null);
        setStores(result.stores || []);
        setVehicles(result.vehicles || []);
        setLoading(false);
      })
      .catch((error) => {
        setMessage(error?.message || 'Campanha indisponível.');
        setLoading(false);
      });
  }, [slug]);

  useEffect(() => {
    if (!campaign || campaign.published_layout || !slug || autoOpenedSlugRef.current === slug) return;

    autoOpenedSlugRef.current = slug;
    setSimulatorVehicleId('');
    const timer = window.setTimeout(() => setSimulatorOpen(true), 250);

    return () => window.clearTimeout(timer);
  }, [campaign, slug]);

  const primary = campaign?.primary_color || '#DC2626';
  const secondary = campaign?.secondary_color || '#071020';
  const benefits = Array.isArray(campaign?.benefits) ? campaign.benefits : [];
  const heroImage = campaign?.hero_image_url || '';
  const mobileHero = campaign?.mobile_hero_image_url || heroImage;
  const location = [eventInfo?.location, eventInfo?.city, eventInfo?.state].filter(Boolean).join(' • ');

  function openSimulator(vehicleId = '') {
    setSimulatorVehicleId(vehicleId);
    setSimulatorOpen(true);
  }

  if (loading) return <main className="flex min-h-screen items-center justify-center bg-slate-950 text-white">Carregando evento...</main>;
  if (!campaign) return <main className="flex min-h-screen items-center justify-center bg-slate-950 p-6 text-center text-white">{message || 'Evento indisponível.'}</main>;

  if (campaign.published_layout) {
    return <PublishedCampaignVisualLanding campaign={campaign} eventInfo={eventInfo} vehicles={vehicles} stores={stores} slug={slug} />;
  }

  return (
    <main id="landing-inicio" className="min-h-screen bg-slate-50 text-slate-950">
      <MetaPixelTracker />

      <section className="relative min-h-[760px] overflow-hidden px-4 pb-20 pt-5 text-white sm:px-6 lg:px-8" style={{ backgroundColor: secondary }}>
        {heroImage ? (
          <picture className="absolute inset-0">
            {mobileHero ? <source media="(max-width: 767px)" srcSet={mobileHero} /> : null}
            <img src={heroImage} alt={`Capa ${campaign.name}`} className="h-full w-full object-cover" />
          </picture>
        ) : null}
        <div className="absolute inset-0 bg-gradient-to-r from-slate-950 via-slate-950/85 to-slate-950/35" />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-transparent to-slate-950/40" />

        <div className="relative mx-auto max-w-[1480px]">
          <header className="flex items-center justify-between gap-4">
            <img src="/campaign-assets/auto-sede-logo-cropped.png" alt="Auto Sede" className="h-10 w-auto object-contain sm:h-14" />
            {campaign.logo_url ? <img src={campaign.logo_url} alt={campaign.name} className="max-h-20 max-w-[45vw] object-contain drop-shadow-xl" /> : <strong className="max-w-md text-right text-lg font-black sm:text-2xl">{campaign.name}</strong>}
          </header>

          <div className="grid min-h-[650px] items-center gap-10 py-12 lg:grid-cols-[1fr_430px]">
            <div className="max-w-4xl">
              <span className="inline-flex rounded-full border border-white/20 bg-white/10 px-4 py-2 text-xs font-black uppercase tracking-[0.22em] backdrop-blur">{campaign.hero_eyebrow || 'Evento automotivo'}</span>
              {campaign.logo_url ? <img src={campaign.logo_url} alt={campaign.name} className="mt-7 max-h-56 max-w-full object-contain object-left drop-shadow-2xl" /> : null}
              <h1 className="mt-7 text-4xl font-black leading-[0.98] tracking-[-0.04em] sm:text-6xl lg:text-7xl">{campaign.title}</h1>
              <p className="mt-6 max-w-3xl text-base font-medium leading-relaxed text-slate-200 sm:text-lg">{campaign.description}</p>

              <div className="mt-7 flex flex-wrap gap-3">
                <span className="inline-flex items-center gap-2 rounded-2xl border border-white/15 bg-black/25 px-4 py-3 text-sm font-black backdrop-blur"><CalendarDays size={18} /> {dateLabel(eventInfo?.start_date, eventInfo?.end_date)}</span>
                {location ? <span className="inline-flex items-center gap-2 rounded-2xl border border-white/15 bg-black/25 px-4 py-3 text-sm font-black backdrop-blur"><MapPin size={18} /> {location}</span> : null}
                <span className="inline-flex items-center gap-2 rounded-2xl border border-white/15 bg-black/25 px-4 py-3 text-sm font-black backdrop-blur"><Building2 size={18} /> {stores.length} loja(s) participante(s)</span>
              </div>

              <div className="mt-8 flex flex-wrap gap-3">
                <button type="button" onClick={() => openSimulator()} className="rounded-full px-8 py-4 text-sm font-black uppercase tracking-wide text-white shadow-2xl" style={{ backgroundColor: primary }}>{campaign.cta_label || 'Simular agora'}</button>
                <a href="#veiculos" className="rounded-full border border-white/25 bg-white/10 px-8 py-4 text-sm font-black uppercase tracking-wide backdrop-blur">Ver veículos</a>
              </div>
            </div>

            <div id="simulacao">
              <CampaignSimulatorCard campaign={campaign} vehicles={vehicles} primaryColor={primary} onOpen={() => openSimulator()} cardRadius={34} buttonRadius={16} />
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[1480px] px-4 py-16 sm:px-6 lg:px-8">
        <div className="grid gap-4 md:grid-cols-3">
          {(benefits.length ? benefits : [
            { title: 'Simulação rápida', description: 'Faça uma estimativa inicial antes do atendimento.' },
            { title: 'Lojas participantes', description: 'Estoque conectado ao evento em tempo real.' },
            { title: 'Atendimento responsável', description: 'O lead segue para a loja proprietária do veículo.' }
          ]).map((benefit: any, index: number) => (
            <article key={`${benefit.title}-${index}`} className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
              <CheckCircle2 size={24} style={{ color: primary }} />
              <h2 className="mt-4 text-xl font-black">{benefit.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-500">{benefit.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="veiculos" className="bg-slate-100 px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-[1480px]">
          <p className="text-xs font-black uppercase tracking-[0.22em]" style={{ color: primary }}>Estoque do evento</p>
          <h2 className="mt-3 text-4xl font-black tracking-[-0.04em] sm:text-5xl">Escolha seu próximo carro</h2>
          <p className="mt-4 max-w-3xl text-base text-slate-500">Os veículos abaixo pertencem às lojas participantes deste evento e são sincronizados automaticamente pelo sistema.</p>

          {vehicles.length ? (
            <div className="mt-9 grid gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {vehicles.map((vehicle) => (
                <article key={vehicle.id} className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
                  <div className="aspect-[16/10] bg-slate-200">
                    {vehicle.image_url ? <img src={vehicle.image_url} alt={`${vehicle.brand} ${vehicle.model}`} className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-slate-400"><CarFront size={54} /></div>}
                  </div>
                  <div className="p-5">
                    <p className="text-xs font-black uppercase tracking-[0.16em]" style={{ color: primary }}>{vehicle.store_name || 'Loja participante'}</p>
                    <h3 className="mt-2 text-xl font-black">{vehicle.brand} {vehicle.model}</h3>
                    <p className="mt-1 min-h-10 text-sm text-slate-500">{[vehicle.version, vehicle.year].filter(Boolean).join(' • ')}</p>
                    {vehicle.original_price ? <p className="mt-4 text-xs font-bold text-slate-400 line-through">{money(vehicle.original_price)}</p> : null}
                    <strong className="mt-1 block text-2xl font-black">{money(vehicle.price)}</strong>
                    <button type="button" onClick={() => openSimulator(vehicle.id)} className="mt-5 min-h-12 w-full rounded-2xl text-sm font-black text-white" style={{ backgroundColor: primary }}>Simular este veículo</button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="mt-9 rounded-[30px] border border-dashed border-slate-300 bg-white p-12 text-center">
              <CarFront size={44} className="mx-auto text-slate-300" />
              <h3 className="mt-4 text-2xl font-black">Estoque em preparação</h3>
              <p className="mt-2 text-sm text-slate-500">Os veículos aparecerão automaticamente após as lojas serem vinculadas e o estoque ser sincronizado.</p>
            </div>
          )}
        </div>
      </section>

      {stores.length ? (
        <section className="mx-auto max-w-[1480px] px-4 py-16 sm:px-6 lg:px-8">
          <p className="text-xs font-black uppercase tracking-[0.22em]" style={{ color: primary }}>Rede participante</p>
          <h2 className="mt-3 text-3xl font-black">Lojas deste evento</h2>
          <div className="mt-7 flex flex-wrap gap-3">
            {stores.map((store) => <span key={store.id} className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black shadow-sm"><Store size={17} /> {store.store_name}</span>)}
          </div>
          {Array.isArray(campaign.sponsor_logo_urls) && campaign.sponsor_logo_urls.length ? (
            <div className="mt-12 border-t border-slate-200 pt-8">
              <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">Apoio e realização</p>
              <div className="mt-5 flex flex-wrap items-center gap-6">{campaign.sponsor_logo_urls.map((url: string) => <img key={url} src={url} alt="Patrocinador do evento" className="h-16 max-w-48 object-contain" />)}</div>
            </div>
          ) : null}
        </section>
      ) : null}

      <footer className="px-4 py-8 text-center text-xs font-semibold text-slate-400" style={{ backgroundColor: secondary }}>
        <p className="text-slate-300">© {new Date().getFullYear()} Auto Sede. Condições sujeitas à análise e confirmação da loja responsável.</p>
        {campaign.terms_text ? <p className="mx-auto mt-3 max-w-4xl leading-relaxed">{campaign.terms_text}</p> : null}
      </footer>

      <CampaignFinanceSimulatorModal campaign={campaign} eventInfo={eventInfo} vehicles={vehicles} open={simulatorOpen} onClose={() => setSimulatorOpen(false)} initialVehicleId={simulatorVehicleId} mode="live" primaryColor={primary} slug={slug} />
    </main>
  );
}
