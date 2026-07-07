import Link from 'next/link';
import { Store } from 'lucide-react';
import { MasterSidebar } from '@/components/MasterSidebar';
import { EventCreateForm } from '@/components/EventCreateForm';
import { EventGoalSelector } from '@/components/EventGoalSelector';

export default function EventManagePage() {
  return (
    <main className="premium-page">
      <section className="premium-shell flex min-h-screen">
        <MasterSidebar active="Eventos" />
        <div className="premium-canvas min-w-0 flex-1 p-4 md:p-7">
          <header className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <p className="premium-eyebrow">Gestão Master</p>
              <h1 className="premium-title mt-2 text-4xl md:text-5xl">Gestão de Eventos</h1>
              <p className="premium-muted mt-3 max-w-3xl text-sm">Cadastro de evento, meta por evento e acesso ao vídeo.</p>
            </div>
            <Link href="/master/stores" className="premium-button-primary"><Store size={18} /> Ver lojas</Link>
          </header>
          <div className="mt-7"><EventGoalSelector /></div>
          <div className="mt-6"><EventCreateForm /></div>
        </div>
      </section>
    </main>
  );
}
