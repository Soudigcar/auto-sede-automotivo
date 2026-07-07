import Link from 'next/link';
import { BarChart3, CalendarDays, Car, FileText, Store } from 'lucide-react';

export default function MasterEventsPage() {
  return (
    <main className="premium-page">
      <section className="premium-shell flex min-h-screen">
        <aside className="hidden w-72 shrink-0 bg-[#071020] px-6 py-7 text-white lg:block">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-red-600/15 text-red-500"><Car size={22} /></div>
            <div><p className="text-sm font-black tracking-wide">AUTO CONTROLE</p><p className="text-[10px] uppercase tracking-[0.35em] text-zinc-500">Automotivo</p></div>
          </div>
          <div className="mt-10 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <p className="text-xs text-zinc-500">Gestao Master</p>
            <p className="mt-1 font-bold">Eventos</p>
            <span className="mt-2 inline-flex rounded-lg bg-white/10 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-zinc-300">Master</span>
          </div>
          <nav className="mt-8 space-y-3 text-sm">
            <Link href="/master/dashboard/live" className="flex items-center gap-3 rounded-2xl px-4 py-4 text-zinc-400 hover:bg-white/5 hover:text-white"><BarChart3 size={18} /> Dashboard</Link>
            <Link href="/master/events" className="flex items-center gap-3 rounded-2xl bg-red-600 px-4 py-4 font-bold shadow-lg shadow-red-600/20"><CalendarDays size={18} /> Eventos</Link>
            <Link href="/master/stores" className="flex items-center gap-3 rounded-2xl px-4 py-4 text-zinc-400 hover:bg-white/5 hover:text-white"><Store size={18} /> Lojas & Estoque</Link>
            <Link href="/master/reports" className="flex items-center gap-3 rounded-2xl px-4 py-4 text-zinc-400 hover:bg-white/5 hover:text-white"><FileText size={18} /> Relatorios</Link>
          </nav>
        </aside>
        <div className="premium-canvas min-w-0 flex-1 p-4 md:p-7">
          <header className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div><p className="premium-eyebrow">Gestao Master</p><h1 className="premium-title mt-2 text-4xl md:text-5xl">Eventos</h1><p className="premium-muted mt-3 max-w-3xl text-sm">Central de eventos automotivos. Esta rota foi criada para separar Eventos de Lojas.</p></div>
            <Link href="/master/stores" className="premium-button-primary"><Store size={18} /> Ver lojas</Link>
          </header>
          <section className="mt-7 grid gap-4 md:grid-cols-3">
            <div className="premium-card premium-card-hover p-5"><p className="text-sm font-bold text-zinc-500">Evento ativo</p><strong className="mt-3 block text-3xl font-black text-zinc-950">Bradesco Auto Show</strong><p className="mt-2 text-xs text-zinc-400">Evento principal do MVP.</p></div>
            <div className="premium-card premium-card-hover p-5"><p className="text-sm font-bold text-zinc-500">Status</p><strong className="mt-3 block text-3xl font-black text-emerald-600">Ativo</strong><p className="mt-2 text-xs text-zinc-400">Captacao e vendas liberadas.</p></div>
            <div className="premium-card premium-card-hover p-5"><p className="text-sm font-bold text-zinc-500">Modo</p><strong className="mt-3 block text-3xl font-black text-sky-600">MVP</strong><p className="mt-2 text-xs text-zinc-400">Cadastro avancado entra em fase futura.</p></div>
          </section>
        </div>
      </section>
    </main>
  );
}
