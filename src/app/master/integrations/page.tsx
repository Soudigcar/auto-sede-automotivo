import Link from 'next/link';
import { BarChart3, Database, Globe, Plug, UploadCloud } from 'lucide-react';
import { MasterSidebar } from '@/components/MasterSidebar';

const items = [
  { title: 'Supabase', status: 'Conectado', icon: Database },
  { title: 'Vercel', status: 'Configurar', icon: Globe },
  { title: 'Importação de Estoque', status: 'Em implantação', icon: UploadCloud },
  { title: 'APIs externas', status: 'Futuro', icon: Plug }
];

export default function MasterIntegrationsPage() {
  return (
    <main className="premium-page">
      <section className="premium-shell flex min-h-screen">
        <MasterSidebar active="Integração" />
        <div className="premium-canvas min-w-0 flex-1 p-4 md:p-7">
          <header className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <p className="premium-eyebrow">Gestão Master</p>
              <h1 className="premium-title mt-2 text-4xl md:text-5xl">Integração</h1>
              <p className="premium-muted mt-3 max-w-3xl text-sm">Central de conexões técnicas do sistema.</p>
            </div>
            <Link href="/master/dashboard/live" className="premium-button-secondary"><BarChart3 size={18} /> Voltar ao Dashboard</Link>
          </header>
          <section className="mt-7 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {items.map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.title} className="premium-card premium-card-hover p-5">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-red-50 text-red-600"><Icon size={22} /></div>
                  <h2 className="mt-5 text-xl font-black text-zinc-950">{item.title}</h2>
                  <p className="mt-2 text-sm font-bold text-zinc-500">{item.status}</p>
                </div>
              );
            })}
          </section>
        </div>
      </section>
    </main>
  );
}
