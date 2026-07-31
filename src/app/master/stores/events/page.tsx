'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { BarChart3, Link2, UserPlus } from 'lucide-react';
import { MasterSidebar } from '@/components/MasterSidebar';
import { StoreEventCreateForm } from '@/components/StoreEventCreateForm';
import { StoresByEventList } from '@/components/StoresByEventList';

type StoreActionPanel = 'link' | 'manual';

export default function EventStoresPage() {
  const [refresh, setRefresh] = useState(0);
  const [eventId, setEventId] = useState('');
  const [panel, setPanel] = useState<StoreActionPanel>('link');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const eventParam = params.get('event');
    const panelParam = params.get('panel');

    if (eventParam) setEventId(eventParam);
    if (panelParam === 'manual' || panelParam === 'link') setPanel(panelParam);
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
              <p className="premium-muted mt-3 max-w-3xl text-sm">
                Cadastre novas lojas, filtre o histórico por evento e acompanhe estoque, vendas e participação.
              </p>
            </div>

            <Link href="/master/dashboard/live" className="premium-button-secondary">
              <BarChart3 size={18} /> Voltar ao Dashboard
            </Link>
          </header>

          <section className="premium-card mt-7 p-5 md:p-6">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.16em] text-red-600">Próxima ação</p>
                <h2 className="mt-1 text-2xl font-black text-zinc-950">Como a loja será cadastrada?</h2>
                <p className="mt-1 text-sm text-zinc-500">
                  Escolha entre enviar o link público para a loja ou preencher o cadastro manualmente.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  className={panel === 'link' ? 'premium-button-primary justify-center' : 'premium-button-secondary justify-center'}
                  type="button"
                  onClick={() => selectPanel('link')}
                >
                  <Link2 size={17} /> Link de cadastro para novas lojas
                </button>

                <button
                  className={panel === 'manual' ? 'premium-button-primary justify-center' : 'premium-button-secondary justify-center'}
                  type="button"
                  onClick={() => selectPanel('manual')}
                >
                  <UserPlus size={17} /> Cadastrar loja manualmente
                </button>
              </div>
            </div>
          </section>

          <div className="mt-5">
            <StoreEventCreateForm
              mode={panel}
              eventId={eventId}
              onEventChange={selectEvent}
              onSaved={() => setRefresh((current) => current + 1)}
            />
          </div>

          <div className="mt-5">
            <StoresByEventList
              refreshKey={refresh}
              eventId={eventId}
              onEventChange={selectEvent}
            />
          </div>
        </div>
      </section>
    </main>
  );
}
