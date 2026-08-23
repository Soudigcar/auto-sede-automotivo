'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BarChart3, CalendarDays, Car, FileText, PackageSearch, Settings2, Store, UserCog } from 'lucide-react';

function navClass(active: boolean) {
  return active
    ? 'flex items-center gap-3 rounded-2xl bg-red-600 px-4 py-4 font-bold text-white shadow-lg shadow-red-600/20'
    : 'flex items-center gap-3 rounded-2xl px-4 py-4 text-zinc-400 transition hover:bg-white/5 hover:text-white';
}

export default function MasterStoresLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const stockActive = pathname?.startsWith('/master/stores/stock') === true;
  const adminActive = pathname === '/master/stores' || pathname?.startsWith('/master/stores/manage') === true;

  return (
    <main className="premium-page">
      <section className="premium-shell flex min-h-screen min-w-0 overflow-x-hidden">
        <aside className="hidden w-72 shrink-0 bg-[#071020] px-6 py-7 text-white lg:block">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-red-600/15 text-red-500"><Car size={22} /></div>
            <div><p className="text-sm font-black tracking-wide">AUTO CONTROLE</p><p className="text-[10px] uppercase tracking-[0.35em] text-zinc-500">Automotivo</p></div>
          </div>

          <div className="mt-10 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <p className="text-xs text-zinc-500">Gestão Master</p>
            <p className="mt-1 font-bold">{stockActive ? 'Lojas & Estoque' : 'Administração de lojas'}</p>
            <span className="mt-2 inline-flex rounded-lg bg-white/10 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-zinc-300">Master</span>
          </div>

          <nav className="mt-8 space-y-3 text-sm">
            <Link href="/master/dashboard/live" className={navClass(false)}><BarChart3 size={18} /> Dashboard</Link>
            <Link href="/master/events" className={navClass(false)}><CalendarDays size={18} /> Eventos</Link>
            <Link href="/master/stores/stock" className={navClass(stockActive)}><Store size={18} /> Lojas & Estoque</Link>
            <Link href="/master/stores" className={navClass(adminActive)}><Settings2 size={18} /> Administrar lojas</Link>
            <Link href="/master/users" className={navClass(false)}><UserCog size={18} /> Equipe</Link>
            <Link href="/master/reports" className={navClass(false)}><FileText size={18} /> Relatórios</Link>
          </nav>

          <div className="mt-8 rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-xs text-zinc-400">
            <div className="flex items-center gap-2 font-bold text-zinc-200"><PackageSearch size={15} /> Gestão segura de estoque</div>
            <p className="mt-2 leading-relaxed">A loja selecionada permanece isolada por tenant e todas as ações Master passam pela validação do servidor.</p>
          </div>
        </aside>

        <div data-master-stores-content className="min-w-0 flex-1 overflow-x-hidden">
          {children}
        </div>
      </section>

      <style jsx global>{`
        [data-master-stores-content] > main > section > aside {
          display: none !important;
        }
        [data-master-stores-content] > main > section > div {
          width: 100% !important;
          max-width: none !important;
        }
      `}</style>
    </main>
  );
}
