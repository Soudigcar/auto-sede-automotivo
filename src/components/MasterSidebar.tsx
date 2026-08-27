'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Activity, ArrowRightLeft, BarChart3, Bot, BrainCircuit, CalendarDays, Car, ChevronLeft, ChevronRight, CreditCard, Database, FileText, FlaskConical, Gauge, Globe2, Inbox, Landmark, LogOut, Megaphone, Plug, Route, ShoppingBag, Store, UserCog, Workflow } from 'lucide-react';
import { MasterOlxImportBridge } from '@/components/marketplace/MasterOlxImportBridge';
import { MasterLeadStoreCoverage } from '@/components/MasterLeadStoreCoverage';

export const masterMenu = [
  { label: 'Dashboard', href: '/master/dashboard/live', icon: BarChart3 },
  { label: 'Monitoramento', href: '/master/lead-monitoring', icon: Activity },
  { label: 'Eventos', href: '/master/events', icon: CalendarDays },
  { label: 'Lojas & Estoque', href: '/master/stores/events', icon: Store },
  { label: 'Equipe', href: '/master/users', icon: UserCog },
  { label: 'Roteamento de Leads', href: '/master/lead-routing', icon: Route },
  { label: 'Relatórios', href: '/master/reports', icon: FileText },
  { label: 'Financeiro', href: '/master/finance', icon: Landmark },
  { label: 'Planos & Billing', href: '/master/billing', icon: CreditCard },
  { label: 'Portal Oficial', href: '/master/portal', icon: Globe2 },
  { label: 'Marketplace', href: '/master/marketplace', icon: ShoppingBag },
  { label: 'Campanhas e Landings', href: '/master/campaigns', icon: Megaphone },
  { label: 'Base', href: '/master/base', icon: Database },
  { label: 'Distribuir Leads', href: '/master/transferencia-leads', icon: ArrowRightLeft, child: true },
  { label: 'Integrações', href: '/master/integrations', icon: Plug },
  { label: 'Inbox WhatsApp', href: '/master/whatsapp/inbox', icon: Inbox },
  { label: 'I.A AUTOCAR', href: '/master/autocar', icon: Bot },
  { label: 'Follow-up AUTOCAR', href: '/master/autocar/follow-up-v2', icon: Workflow, child: true },
  { label: 'Treinar e Testar', href: '/master/autocar/training', icon: FlaskConical },
  { label: 'Simulador AUTOCAR', href: '/master/autocar/simulator', icon: Gauge },
  { label: 'Cérebro Automotivo', href: '/master/automotive-brain', icon: BrainCircuit },
  { label: 'Sair', href: '/logout', icon: LogOut }
];

export function MasterSidebar({ active }: { active: string }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    setCollapsed(localStorage.getItem('master-sidebar-collapsed') === 'true');
  }, []);

  function toggleSidebar() {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem('master-sidebar-collapsed', String(next));
  }

  return <>
    <aside className={`hidden shrink-0 bg-[#071020] px-4 py-7 text-white transition-all duration-300 lg:block ${collapsed ? 'w-20' : 'w-72'}`}>
      <div className={`flex items-center ${collapsed ? 'justify-center' : 'justify-between'}`}>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-red-600/15 text-red-500"><Car size={22} /></div>
          {!collapsed ? <div><p className="text-sm font-black tracking-wide">AUTO CONTROLE</p><p className="text-[10px] uppercase tracking-[0.35em] text-zinc-500">Automotivo</p></div> : null}
        </div>
        {!collapsed ? <button className="rounded-xl border border-white/10 bg-white/5 p-2 text-zinc-400 hover:bg-red-600 hover:text-white" type="button" onClick={toggleSidebar} title="Recolher menu"><ChevronLeft size={16} /></button> : null}
      </div>
      {collapsed ? <button className="mx-auto mt-5 flex rounded-xl border border-white/10 bg-white/5 p-2 text-zinc-400 hover:bg-red-600 hover:text-white" type="button" onClick={toggleSidebar} title="Expandir menu"><ChevronRight size={16} /></button> : null}
      <div className={`mt-10 rounded-2xl border border-white/10 bg-white/[0.03] p-4 ${collapsed ? 'text-center' : ''}`}>
        {!collapsed ? <><p className="text-xs text-zinc-500">Gestão Master</p><p className="mt-1 font-bold">Painel Administrativo</p></> : null}
        <span className="mt-2 inline-flex rounded-lg bg-white/10 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-zinc-300">Master</span>
        {!collapsed && pathname === '/master/base' ? <MasterLeadStoreCoverage /> : null}
      </div>
      <nav className="mt-8 space-y-3 text-sm">
        {masterMenu.map((item) => {
          const Icon = item.icon;
          const routeActive = pathname === item.href || (item.href === '/master/integrations' && pathname.startsWith('/master/integrations'));
          const legacyActive = active === item.href || active === item.label || (item.href === '/master/integrations' && active.startsWith('/master/integrations'));
          const isActive = pathname ? routeActive : legacyActive;
          const base = collapsed
            ? 'flex items-center justify-center rounded-2xl px-0 py-4'
            : `flex items-center gap-3 rounded-2xl py-4 ${item.child ? 'ml-5 px-3 text-xs' : 'px-4'}`;
          const state = isActive ? 'bg-red-600 font-bold shadow-lg shadow-red-600/20' : item.child ? 'text-zinc-500 hover:bg-white/5 hover:text-white' : 'text-zinc-400 hover:bg-white/5 hover:text-white';
          return <Link key={item.href} href={item.href} prefetch={false} title={item.label} className={`${base} ${state}`}><Icon size={item.child ? 16 : 18} />{!collapsed ? <span>{item.label}</span> : null}</Link>;
        })}
      </nav>
    </aside>
    <MasterOlxImportBridge />
  </>;
}
