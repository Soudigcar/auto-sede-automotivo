import Link from 'next/link';
import { Store } from 'lucide-react';
import { MasterSidebar } from '@/components/MasterSidebar';

export default function MasterEventsPage() {
  return (
    <main className="premium-page">
      <section className="premium-shell flex min-h-screen">
        <MasterSidebar active="Eventos" />
        <div className="premium-canvas min-w-0 flex-1 p-4 md:p-7">
          <header className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <p className="premium-eyebrow">Gestão Master</p>
              <h1 className="premium-title mt-2 text-4xl md:text-5xl">Eventos</h1>
              <p className="premium-muted mt-3 max-w-3xl text-sm">Central de eventos automotivos. Esta rota separa eventos, lojas, equipe, relatórios, financeiro e integrações.</p>
            </div>
            <Link href="/master/stores" className="premium-button-primary"><Store size={18} /> Ver lojas</Link>
          </header>
          <section className="mt-7 grid gap-4 md:grid-cols-3">
            <div className="premium-card premium-card-hover p-5"><p className="text-sm font-bold text-zinc-500">Evento ativo</p><strong className="mt-3 block text-3xl font-black text-zinc-950">Bradesco Auto Show</strong><p className="mt-2 text-xs text-zinc-400">Evento principal do MVP.</p></div>
            <div className="premium-card premium-card-hover p-5"><p className="text-sm font-bold text-zinc-500">Status</p><strong className="mt-3 block text-3xl font-black text-emerald-600">Ativo</strong><p className="mt-2 text-xs text-zinc-400">Captação e vendas liberadas.</p></div>
            <div className="premium-card premium-card-hover p-5"><p className="text-sm font-bold text-zinc-500">Modo</p><strong className="mt-3 block text-3xl font-black text-sky-600">MVP</strong><p className="mt-2 text-xs text-zinc-400">Cadastro avançado entra em fase futura.</p></div>
          </section>
        </div>
      </section>
    </main>
  );
}
