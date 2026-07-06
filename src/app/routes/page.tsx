import Link from 'next/link';

const routes = [
  { label: 'Dashboard Master', href: '/master/dashboard/live', description: 'Indicadores principais do evento' },
  { label: 'Lojas', href: '/master/stores', description: 'Cadastro e gestao de lojas participantes' },
  { label: 'Equipe', href: '/master/users', description: 'Usuarios e perfis de acesso' },
  { label: 'Prospector', href: '/prospector/live', description: 'Pesquisa de rua e cadastro rapido' },
  { label: 'Pipeline da Loja', href: '/store/live', description: 'Leads recebidos pela loja' },
  { label: 'Operacao da Loja', href: '/store/operation', description: 'Fechamento, perda e estoque' },
  { label: 'Pre-vendas', href: '/pre-sales', description: 'Acompanhamento comercial' },
  { label: 'Sair', href: '/logout', description: 'Encerrar sessao atual' }
];

export default function RoutesPage() {
  return (
    <main className="min-h-screen bg-brand-black px-6 py-8 text-white">
      <section className="mx-auto max-w-5xl">
        <p className="text-sm font-semibold uppercase tracking-[0.25em] text-brand-red">MVP</p>
        <h1 className="mt-2 text-4xl font-black">Painel de navegacao</h1>
        <p className="mt-3 text-sm text-zinc-400">Use esta tela como ponto central para revisar a experiencia do usuario no sistema.</p>
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          {routes.map((route) => (
            <Link key={route.href} href={route.href} className="card p-5 transition hover:border-brand-red/60">
              <h2 className="text-xl font-bold">{route.label}</h2>
              <p className="mt-2 text-sm text-zinc-400">{route.description}</p>
              <span className="mt-3 block text-xs text-zinc-500">{route.href}</span>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
