import Link from 'next/link';
import { BarChart3, Car, Download, Store, Users } from 'lucide-react';
import { MasterSidebar } from '@/components/MasterSidebar';

const reports = [
  { title: 'Resumo executivo', description: 'Visão geral de leads, vendas, conversão, faturamento e estoque.', icon: BarChart3 },
  { title: 'Relatório por loja', description: 'Performance de cada loja participante, leads recebidos, vendas e perdas.', icon: Store },
  { title: 'Relatório por prospector', description: 'Abordagens, pesquisas, cadastros e leads direcionados por captador.', icon: Users },
  { title: 'Relatório de estoque', description: 'Veículos disponíveis, vendidos, reservados e valor movimentado.', icon: Car }
];

export default function MasterReportsPage() {
  return (
    <main className="premium-page">
      <section className="premium-shell flex min-h-screen">
        <MasterSidebar active="Relatórios" />
        <div className="premium-canvas min-w-0 flex-1 p-4 md:p-7">
          <header className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <p className="premium-eyebrow">Gestão Master</p>
              <h1 className="premium-title mt-2 text-4xl md:text-5xl">Relatórios</h1>
              <p className="premium-muted mt-3 max-w-3xl text-sm">Central de relatórios gerenciais do evento.</p>
            </div>
            <Link href="/master/dashboard/live" className="premium-button-secondary"><BarChart3 size={18} /> Voltar ao Dashboard</Link>
          </header>
          <section className="mt-7 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {reports.map((report) => {
              const Icon = report.icon;
              return (
                <div key={report.title} className="premium-card premium-card-hover p-5">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-red-50 text-red-600"><Icon size={22} /></div>
                  <h2 className="mt-5 text-xl font-black text-zinc-950">{report.title}</h2>
                  <p className="mt-2 text-sm text-zinc-500">{report.description}</p>
                  <button className="premium-button-primary mt-5 w-full"><Download size={16} /> Gerar relatório</button>
                </div>
              );
            })}
          </section>
        </div>
      </section>
    </main>
  );
}
