import Link from 'next/link';
import { BarChart3, Landmark, Wallet, CreditCard, TrendingUp } from 'lucide-react';
import { MasterSidebar } from '@/components/MasterSidebar';

const items = [
  { title: 'Faturamento Total', value: 'R$ 0', helper: 'Valor dos veículos vendidos', icon: Wallet },
  { title: 'Ticket Médio', value: 'R$ 0', helper: 'Faturamento / vendas', icon: TrendingUp },
  { title: 'Bancos Financiados', value: '0', helper: 'Bancos usados em vendas', icon: Landmark },
  { title: 'Formas de Pagamento', value: '0', helper: 'Financiamento, à vista e consórcio', icon: CreditCard }
];

export default function MasterFinancePage() {
  return (
    <main className="premium-page">
      <section className="premium-shell flex min-h-screen">
        <MasterSidebar active="Financeiro" />
        <div className="premium-canvas min-w-0 flex-1 p-4 md:p-7">
          <header className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <p className="premium-eyebrow">Gestão Master</p>
              <h1 className="premium-title mt-2 text-4xl md:text-5xl">Financeiro</h1>
              <p className="premium-muted mt-3 max-w-3xl text-sm">Controle financeiro do evento: faturamento, bancos, formas de pagamento, ticket médio e valores vendidos.</p>
            </div>
            <Link href="/master/dashboard/live" className="premium-button-secondary"><BarChart3 size={18} /> Voltar ao Dashboard</Link>
          </header>

          <section className="mt-7 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {items.map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.title} className="premium-card premium-card-hover p-5">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-red-50 text-red-600"><Icon size={22} /></div>
                  <p className="mt-5 text-sm font-bold text-zinc-500">{item.title}</p>
                  <strong className="mt-2 block text-3xl font-black text-zinc-950">{item.value}</strong>
                  <p className="mt-2 text-xs text-zinc-400">{item.helper}</p>
                </div>
              );
            })}
          </section>

          <section className="premium-card mt-6 p-6">
            <h2 className="text-2xl font-black text-zinc-950">Próxima conexão</h2>
            <p className="premium-muted mt-2 text-sm">Esta área será conectada aos registros de vendas, estoque e bancos para consolidar faturamento por loja, por banco financiador e por período.</p>
          </section>
        </div>
      </section>
    </main>
  );
}
