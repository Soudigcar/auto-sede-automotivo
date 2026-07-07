import Link from 'next/link';
import { RefreshCcw } from 'lucide-react';
import { MasterSidebar } from '@/components/MasterSidebar';
import { EventDashboardSummary } from '@/components/EventDashboardSummary';

export default function EventDashboardPage() {
  return (
    <main className="premium-page">
      <section className="premium-shell flex min-h-screen">
        <MasterSidebar active="Dashboard" />
        <div className="premium-canvas min-w-0 flex-1 p-4 md:p-7">
          <header className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <p className="premium-eyebrow">Gestão Master</p>
              <h1 className="premium-title mt-2 text-4xl md:text-5xl">Dashboard por Evento</h1>
              <p className="premium-muted mt-3 max-w-3xl text-sm">Visualize todos os eventos juntos ou filtre por evento e loja participante.</p>
            </div>
            <Link href="/master/dashboard/live" className="premium-button-secondary"><RefreshCcw size={18} /> Dashboard executivo</Link>
          </header>
          <EventDashboardSummary />
        </div>
      </section>
    </main>
  );
}
