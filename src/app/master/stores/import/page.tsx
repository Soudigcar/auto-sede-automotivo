import Link from 'next/link';
import { Store } from 'lucide-react';
import { MasterSidebar } from '@/components/MasterSidebar';

export default function StoreInventoryImportPage() {
  return (
    <main className="premium-page">
      <section className="premium-shell flex min-h-screen">
        <MasterSidebar active="Lojas & Estoque" />
        <div className="premium-canvas min-w-0 flex-1 p-4 md:p-7">
          <header>
            <p className="premium-eyebrow">Gestão Master</p>
            <h1 className="premium-title mt-2 text-4xl md:text-5xl">Importar Estoque</h1>
            <p className="premium-muted mt-3 max-w-3xl text-sm">Página reservada para importação de estoque no padrão Lotus.</p>
          </header>
          <section className="premium-card mt-7 p-6">
            <h2 className="text-2xl font-black text-zinc-950">Importação em implantação</h2>
            <p className="premium-muted mt-2 text-sm">A estrutura XLS/XLSX já foi preparada no parser e no banco. Falta apenas conectar o botão visual na tela principal.</p>
            <Link href="/master/stores" className="premium-button-secondary mt-5"><Store size={18} /> Voltar para lojas</Link>
          </section>
        </div>
      </section>
    </main>
  );
}
