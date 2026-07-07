'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { BarChart3 } from 'lucide-react';
import { MasterSidebar } from '@/components/MasterSidebar';
import { getActiveEvent } from '@/lib/database';
import { EventSupportForm } from '@/components/EventSupportForm';
import { BradescoGoalTrack } from '@/components/BradescoGoalTrack';
import { FinanceEntryList } from '@/components/FinanceEntryList';

export default function MasterFinancePage() {
  const [eventId, setEventId] = useState('');
  const [eventName, setEventName] = useState('Bradesco Auto Show');
  const [refresh, setRefresh] = useState(0);
  const [message, setMessage] = useState('Carregando financeiro...');

  async function loadEvent() {
    const event = await getActiveEvent();
    setEventId(event.id);
    setEventName(event.event_name || 'Bradesco Auto Show');
    setMessage('');
  }

  useEffect(() => { loadEvent().catch(() => setMessage('Rode o seed do evento e o SQL financeiro no Supabase.')); }, []);

  function refreshData() {
    setRefresh((current) => current + 1);
  }

  return (
    <main className="premium-page">
      <section className="premium-shell flex min-h-screen">
        <MasterSidebar active="Financeiro" />
        <div className="premium-canvas min-w-0 flex-1 p-4 md:p-7">
          <header className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <p className="premium-eyebrow">Gestão Master</p>
              <h1 className="premium-title mt-2 text-4xl md:text-5xl">Financeiro</h1>
              <p className="premium-muted mt-3 max-w-3xl text-sm">Patrocínios, entradas, descontos, fornecedores, categorias e meta Bradesco.</p>
            </div>
            <Link href="/master/dashboard/live" className="premium-button-secondary"><BarChart3 size={18} /> Voltar ao Dashboard</Link>
          </header>
          {message ? <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-medium text-amber-800">{message}</div> : null}
          <section className="mt-7 grid gap-5 xl:grid-cols-[0.8fr_1.2fr]">
            {eventId ? <EventSupportForm eventId={eventId} defaultEventName={eventName} onSaved={refreshData} /> : null}
            <BradescoGoalTrack />
          </section>
          <div className="mt-6"><FinanceEntryList refreshKey={refresh} /></div>
        </div>
      </section>
    </main>
  );
}
