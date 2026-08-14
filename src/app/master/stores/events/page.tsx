'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { BarChart3, CalendarPlus, Link2, Store, UserPlus } from 'lucide-react';
import { MasterSidebar } from '@/components/MasterSidebar';
import { PermanentStoresByEventList } from '@/components/PermanentStoresByEventList';
import { StoreEventCreateForm } from '@/components/StoreEventCreateForm';
import { StorePortalApplicationsManager } from '@/components/StorePortalApplicationsManager';

type StoreActionPanel = 'portal' | 'event' | 'link';

export default function EventStoresPage() {
  const [refresh, setRefresh] = useState(0);
  const [eventId, setEventId] = useState('');
  const [panel, setPanel] = useState<StoreActionPanel>('portal');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const eventParam = params.get('event');
    const panelParam = params.get('panel');

    if (eventParam) setEventId(eventParam);
    if (panelParam === 'portal' || panelParam === 'event' || panelParam === 'link') setPanel(panelParam);
  }, []);

  function updateUrl(nextEventId: string, nextPanel: StoreActionPanel) {
    const url = new URL(window.location.href);

    if (nextEventId) url.searchParams.set('event', nextEventId);
    else url.searchParams.delete('event');

    url.searchParams.set('panel', nextPanel);
    window.history.replaceState({}, '', url.toString());
  }

  function selectEvent(nextEventId: string) {
    setEventId(nextEventId);
    updateUrl(nextEventId, panel);
  }

  function selectPanel(nextPanel: StoreActionPanel) {
    setPanel(nextPanel);
    updateUrl(eventId, nextPanel);
  }

  return (
    <main className="premium-page">
      <section className="premium-shell flex min-h-screen">
        <MasterSidebar active="Lojas & Estoque" />

        <div className="premium-canvas min-w-0 flex-1 p-4 md:p-7">
          <header className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <p className="premium-eyebrow">Gestão Master</p>
              <h1 className="premium-title mt-2 text-4xl md:text-5xl">Lojas & Estoque</h1>
              <p className="premium-muted mt-3 max-w-3xl text-sm">A loja é permanente no Portal Auto Sede. Eventos são participações separadas no histórico da mesma revenda.</p>
            </div>

            <Link href="/master/dashboard/live" className="premium-button-secondary"><BarChart3 size={18} /> Voltar ao Dashboard</Link>
          </header>

          <section className="premium-card mt-7 p-5 md:p-6">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-red-600">Cadastro e participação</p>
              <h2 className="mt-1 text-2xl font-black text-zinc-950">O que deseja fazer?</h2>
              <p className="mt-1 text-sm text-zinc-500">Cadastre uma loja permanente sem evento, vincule uma loja existente a um evento ou gere um link para uma revenda entrar por um evento específico.</p>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-3">
              <button className={panel === 'portal' ? 'premium-button-primary justify-center' : 'premium-button-secondary justify-center'} type="button" onClick={() => selectPanel('portal')}><Store size={17} /> Cadastrar loja no Portal</button>
              <button className={panel === 'event' ? 'premium-button-primary justify-center' : 'premium-button-secondary justify-center'} type="button" onClick={() => selectPanel('event')}><CalendarPlus size={17} /> Vincular loja a evento</button>
              <button className={panel === 'link' ? 'premium-button-primary justify-center' : 'premium-button-secondary justify-center'} type="button" onClick={() => selectPanel('link')}><Link2 size={17} /> Link para cadastro no evento</button>
            </div>
          </section>

          <div className="mt-5"><StoreEventCreateForm mode={panel} eventId={eventId} onEventChange={selectEvent} onSaved={() => setRefresh((current) => current + 1)} /></div>
          <div className="mt-5"><PermanentStoresByEventList refreshKey={refresh} eventId={eventId} onEventChange={selectEvent} /></div>
          <div className="mt-5"><StorePortalApplicationsManager /></div>
        </div>
      </section>
    </main>
  );
}
