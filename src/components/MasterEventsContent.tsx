'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Store } from 'lucide-react';
import { EventCreateForm } from '@/components/EventCreateForm';

export function MasterEventsContent() {
  const [refresh, setRefresh] = useState(0);
  return (
    <div className="premium-canvas min-w-0 flex-1 p-4 md:p-7">
      <header className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <p className="premium-eyebrow">Gestão Master</p>
          <h1 className="premium-title mt-2 text-4xl md:text-5xl">Eventos</h1>
          <p className="premium-muted mt-3 max-w-3xl text-sm">Cadastro e controle de eventos.</p>
        </div>
        <Link href="/master/stores" className="premium-button-primary"><Store size={18} /> Ver lojas</Link>
      </header>
      <section className="mt-7 grid gap-4 md:grid-cols-3">
        <div className="premium-card premium-card-hover p-5"><p className="text-sm font-bold text-zinc-500">Evento</p><strong className="mt-3 block text-3xl font-black text-zinc-950">Cadastro</strong></div>
        <div className="premium-card premium-card-hover p-5"><p className="text-sm font-bold text-zinc-500">Status</p><strong className="mt-3 block text-3xl font-black text-emerald-600">Ativo</strong></div>
        <div className="premium-card premium-card-hover p-5"><p className="text-sm font-bold text-zinc-500">Regra</p><strong className="mt-3 block text-3xl font-black text-sky-600">10K = 1M</strong></div>
      </section>
      <div className="mt-6"><EventCreateForm onSaved={() => setRefresh(refresh + 1)} /></div>
    </div>
  );
}
