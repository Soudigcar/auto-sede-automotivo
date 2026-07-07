'use client';

import Link from 'next/link';
import { useState } from 'react';
import { BarChart3 } from 'lucide-react';
import { MasterSidebar } from '@/components/MasterSidebar';
import { StoreEventCreateForm } from '@/components/StoreEventCreateForm';
import { StoresByEventList } from '@/components/StoresByEventList';

export default function EventStoresPage() {
  const [refresh, setRefresh] = useState(0);

  return (
    <main className="premium-page">
      <section className="premium-shell flex min-h-screen">
        <MasterSidebar active="Lojas & Estoque" />
        <div className="premium-canvas min-w-0 flex-1 p-4 md:p-7">
          <header className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <p className="premium-eyebrow">Gestão Master</p>
              <h1 className="premium-title mt-2 text-4xl md:text-5xl">Lojas por Evento</h1>
              <p className="premium-muted mt-3 max-w-3xl text-sm">Vincule lojas ao evento, acompanhe estoque, vendas e histórico de participação.</p>
            </div>
            <Link href="/master/dashboard/live" className="premium-button-secondary"><BarChart3 size={18} /> Voltar ao Dashboard</Link>
          </header>
          <section className="mt-7 grid gap-5 xl:grid-cols-[0.8fr_1.2fr]">
            <StoreEventCreateForm onSaved={() => setRefresh((current) => current + 1)} />
            <StoresByEventList refreshKey={refresh} />
          </section>
        </div>
      </section>
    </main>
  );
}
