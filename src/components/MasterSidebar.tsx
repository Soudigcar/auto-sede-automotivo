import Link from 'next/link';
import { BarChart3, CalendarDays, Car, FileText, Landmark, Plug, Store, UserCog } from 'lucide-react';

const masterMenu = [
  { label: 'Dashboard', href: '/master/dashboard/live', icon: BarChart3 },
  { label: 'Eventos', href: '/master/events', icon: CalendarDays },
  { label: 'Lojas & Estoque', href: '/master/stores/events', icon: Store },
  { label: 'Equipe', href: '/master/users', icon: UserCog },
  { label: 'Relatórios', href: '/master/reports', icon: FileText },
  { label: 'Financeiro', href: '/master/finance', icon: Landmark },
  { label: 'Integração', href: '/master/integrations', icon: Plug }
];

export function MasterSidebar({ active }: { active: string }) {
  return (
    <aside className="hidden w-72 shrink-0 bg-[#071020] px-6 py-7 text-white lg:block">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-red-600/15 text-red-500"><Car size={22} /></div>
        <div><p className="text-sm font-black tracking-wide">AUTO CONTROLE</p><p className="text-[10px] uppercase tracking-[0.35em] text-zinc-500">Automotivo</p></div>
      </div>
      <div className="mt-10 rounded-2xl border border-white/10 bg-white/[0.03] p-4"><p className="text-xs text-zinc-500">Gestão Master</p><p className="mt-1 font-bold">Painel Administrativo</p><span className="mt-2 inline-flex rounded-lg bg-white/10 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-zinc-300">Master</span></div>
      <nav className="mt-8 space-y-3 text-sm">
        {masterMenu.map((item) => {
          const Icon = item.icon;
          const isActive = active === item.href || active === item.label;
          return <Link key={item.href} href={item.href} className={isActive ? 'flex items-center gap-3 rounded-2xl bg-red-600 px-4 py-4 font-bold shadow-lg shadow-red-600/20' : 'flex items-center gap-3 rounded-2xl px-4 py-4 text-zinc-400 hover:bg-white/5 hover:text-white'}><Icon size={18} /> {item.label}</Link>;
        })}
      </nav>
    </aside>
  );
}
