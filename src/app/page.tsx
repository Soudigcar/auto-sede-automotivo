import Link from 'next/link';
import { appName } from '@/lib/constants';

const modules = [
  { title: 'Gestão Master', href: '/master/dashboard', description: 'Dashboard geral, lojas, prospectores, vendas e perdas.' },
  { title: 'Prospector', href: '/prospector', description: 'Pesquisa de rua e cadastro rápido de leads.' },
  { title: 'Loja Participante', href: '/store', description: 'Pipeline, estoque, venda e perda.' },
  { title: 'Pré-vendas', href: '/pre-sales', description: 'Mensagens, ligações, agendamentos e comparecimentos.' }
];

export default function HomePage() {
  return (
    <main className="min-h-screen bg-brand-black px-6 py-10 text-white">
      <section className="mx-auto max-w-6xl">
        <div className="mb-10 rounded-3xl border border-white/10 bg-white/5 p-8">
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-brand-red">Sistema de Evento Automotivo</p>
          <h1 className="mt-4 text-4xl font-black md:text-6xl">{appName}</h1>
          <p className="mt-4 max-w-3xl text-zinc-300">Controle de captação, leads, lojas, estoque, vendas, perdas e dashboards para eventos de revenda de veículos.</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link className="btn-primary" href="/login">Entrar no sistema</Link>
            <Link className="btn-secondary" href="/master/dashboard">Ver dashboard demo</Link>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          {modules.map((item) => (
            <Link key={item.href} href={item.href} className="card p-5 transition hover:border-brand-red/60">
              <h2 className="text-lg font-bold">{item.title}</h2>
              <p className="mt-2 text-sm text-zinc-400">{item.description}</p>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
