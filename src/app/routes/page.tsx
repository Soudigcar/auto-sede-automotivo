import Link from 'next/link';

const routes = [
  { label: 'Login', href: '/login' },
  { label: 'Lojas', href: '/master/stores' },
  { label: 'Prospector', href: '/prospector/live' },
  { label: 'Pipeline', href: '/store/live' },
  { label: 'Operacao da Loja', href: '/store/operation' },
  { label: 'Dashboard', href: '/master/dashboard/live' }
];

export default function RoutesPage() {
  return (
    <main className="min-h-screen bg-brand-black px-6 py-8 text-white">
      <section className="mx-auto max-w-5xl">
        <p className="text-sm font-semibold uppercase tracking-[0.25em] text-brand-red">MVP</p>
        <h1 className="mt-2 text-4xl font-black">Rotas do sistema</h1>
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          {routes.map((route) => (
            <Link key={route.href} href={route.href} className="card p-5 transition hover:border-brand-red/60">
              <h2 className="text-xl font-bold">{route.label}</h2>
              <span className="mt-3 block text-sm text-zinc-400">{route.href}</span>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
