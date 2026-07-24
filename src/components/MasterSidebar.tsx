'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { BarChart3, CalendarDays, Car, ChevronLeft, ChevronRight, Database, FileText, Globe2, Inbox, Landmark, LogOut, MessageCircle, Plug, Store, UserCog } from 'lucide-react';

const masterMenu = [
  { label: 'Dashboard', href: '/master/dashboard/live', icon: BarChart3 },
  { label: 'Eventos', href: '/master/events', icon: CalendarDays },
  { label: 'Lojas & Estoque', href: '/master/stores/events', icon: Store },
  { label: 'Equipe', href: '/master/users', icon: UserCog },
  { label: 'Relatórios', href: '/master/reports', icon: FileText },
  { label: 'Financeiro', href: '/master/finance', icon: Landmark },
  { label: 'Site', href: '/master/site', icon: Globe2 },
  { label: 'Base', href: '/master/base', icon: Database },
  { label: 'Integração', href: '/master/integrations', icon: Plug },
  { label: 'Inbox WhatsApp', href: '/master/whatsapp/inbox', icon: Inbox },
  { label: 'WhatsApp Oficial', href: '/master/integrations/whatsapp', icon: MessageCircle },
  { label: 'Sair', href: '/logout', icon: LogOut }
];

export function MasterSidebar({ active }: { active: string }) {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    setCollapsed(localStorage.getItem('master-sidebar-collapsed') === 'true');
  }, []);

  function toggleSidebar() {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem('master-sidebar-collapsed', String(next));
  }

  return (
    <aside className={`hidden shrink-0 bg-[#071020] px-4 py-7 text-white transition-all duration-300 lg:block ${collapsed ? 'w-20' : 'w-72'}`}>
      <div className={`flex items-center ${collapsed ? 'justify-center' : 'justify-between'}`}>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-red-600/15 text-red-500">
            <Car size={22} />
          </div>

          {!collapsed ? (
            <div>
              <p className="text-sm font-black tracking-wide">AUTO CONTROLE</p>
              <p className="text-[10px] uppercase tracking-[0.35em] text-zinc-500">Automotivo</p>
            </div>
          ) : null}
        </div>

        {!collapsed ? (
          <button className="rounded-xl border border-white/10 bg-white/5 p-2 text-zinc-400 hover:bg-red-600 hover:text-white" type="button" onClick={toggleSidebar} title="Recolher menu">
            <ChevronLeft size={16} />
          </button>
        ) : null}
      </div>

      {collapsed ? (
        <button className="mx-auto mt-5 flex rounded-xl border border-white/10 bg-white/5 p-2 text-zinc-400 hover:bg-red-600 hover:text-white" type="button" onClick={toggleSidebar} title="Expandir menu">
          <ChevronRight size={16} />
        </button>
      ) : null}

      <div className={`mt-10 rounded-2xl border border-white/10 bg-white/[0.03] p-4 ${collapsed ? 'text-center' : ''}`}>
        {!collapsed ? (
          <>
            <p className="text-xs text-zinc-500">Gestão Master</p>
            <p className="mt-1 font-bold">Painel Administrativo</p>
          </>
        ) : null}

        <span className="mt-2 inline-flex rounded-lg bg-white/10 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-zinc-300">
          Master
        </span>
      </div>

      <nav className="mt-8 space-y-3 text-sm">
        {masterMenu.map((item) => {
          const Icon = item.icon;
          const isActive = active === item.href || active === item.label;
          const base = collapsed ? 'flex items-center justify-center rounded-2xl px-0 py-4' : 'flex items-center gap-3 rounded-2xl px-4 py-4';
          const state = isActive ? 'bg-red-600 font-bold shadow-lg shadow-red-600/20' : 'text-zinc-400 hover:bg-white/5 hover:text-white';

          return (
            <Link key={item.href} href={item.href} title={item.label} className={`${base} ${state}`}>
              <Icon size={18} />
              {!collapsed ? <span>{item.label}</span> : null}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
