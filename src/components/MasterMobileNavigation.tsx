'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';
import { BarChart3, Inbox, Menu, MoreHorizontal, Store, X } from 'lucide-react';
import { masterMenu } from '@/components/MasterSidebar';

const bottomPriority = ['/master/dashboard/live', '/master/stores/events', '/master/whatsapp/inbox'];

export function MasterMobileNavigation() {
  const pathname = usePathname() || '';
  const [mobile, setMobile] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    const media = window.matchMedia('(max-width: 1023px)');
    const sync = () => setMobile(media.matches);
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!drawerOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setDrawerOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [drawerOpen]);

  const activeItem = useMemo(() => {
    return masterMenu.find((item) => item.href !== '/logout' && (pathname === item.href || pathname.startsWith(`${item.href}/`))) || masterMenu[0];
  }, [pathname]);

  const bottomItems = useMemo(() => bottomPriority.flatMap((href) => {
    const item = masterMenu.find((candidate) => candidate.href === href);
    return item ? [item] : [];
  }), []);

  if (!mobile || !pathname.startsWith('/master')) return null;

  return (
    <>
      <header className="fixed inset-x-0 top-0 z-[240] border-b border-white/10 bg-[#071020]/95 px-4 text-white backdrop-blur-xl lg:hidden" style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}>
        <div className="flex h-14 items-center gap-3">
          <button type="button" onClick={() => setDrawerOpen(true)} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-white" aria-label="Abrir menu Master" aria-expanded={drawerOpen} aria-controls="master-mobile-navigation-drawer"><Menu size={21} /></button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-black">{activeItem.label}</p>
            <p className="truncate text-[10px] font-bold uppercase tracking-[0.14em] text-red-500">Gestão Master</p>
          </div>
          <div className="flex h-10 min-w-10 items-center justify-center rounded-xl bg-red-600/10 px-3 text-[10px] font-black uppercase tracking-wider text-red-400">Master</div>
        </div>
      </header>

      <nav className="fixed inset-x-0 bottom-0 z-[235] border-t border-white/10 bg-[#071020]/95 px-2 pt-2 text-zinc-300 backdrop-blur-xl lg:hidden" style={{ paddingBottom: 'calc(0.5rem + env(safe-area-inset-bottom))' }} aria-label="Navegação principal Master">
        <div className="mx-auto flex max-w-lg items-stretch justify-around gap-1">
          {bottomItems.map((item) => {
            const Icon = item.href === '/master/dashboard/live' ? BarChart3 : item.href === '/master/stores/events' ? Store : Inbox;
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return <Link key={item.href} href={item.href} className={`flex min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-xl px-2 py-2 text-[10px] font-black ${active ? 'bg-red-600/10 text-red-400' : 'text-zinc-400'}`}><Icon size={19} /><span className="max-w-full truncate">{item.label}</span></Link>;
          })}
          <button type="button" onClick={() => setDrawerOpen(true)} className="flex min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-xl px-2 py-2 text-[10px] font-black text-zinc-400" aria-label="Abrir mais opções"><MoreHorizontal size={20} /><span>Mais</span></button>
        </div>
      </nav>

      {drawerOpen ? (
        <div className="fixed inset-0 z-[260] lg:hidden" role="presentation">
          <button type="button" className="absolute inset-0 bg-black/65 backdrop-blur-sm" onClick={() => setDrawerOpen(false)} aria-label="Fechar menu" />
          <aside id="master-mobile-navigation-drawer" className="absolute inset-y-0 left-0 flex w-[min(88vw,380px)] flex-col bg-[#071020] text-white shadow-2xl" style={{ paddingTop: 'max(1rem, env(safe-area-inset-top))', paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }} aria-label="Menu Master do Auto Controle">
            <div className="flex items-center justify-between gap-3 px-4 pb-4">
              <div className="min-w-0">
                <p className="truncate text-sm font-black">AUTO CONTROLE</p>
                <p className="truncate text-[9px] uppercase tracking-[0.25em] text-zinc-500">Gestão Master</p>
              </div>
              <button type="button" onClick={() => setDrawerOpen(false)} className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-zinc-300" aria-label="Fechar menu"><X size={19} /></button>
            </div>

            <nav className="flex-1 space-y-1 overflow-y-auto px-3 pb-4" aria-label="Áreas do painel Master">
              {masterMenu.map((item) => {
                const Icon = item.icon;
                const active = item.href !== '/logout' && (pathname === item.href || pathname.startsWith(`${item.href}/`));
                return <Link key={item.href} href={item.href} onClick={() => setDrawerOpen(false)} className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-bold ${active ? 'bg-red-600 text-white shadow-lg shadow-red-600/20' : 'text-zinc-300 hover:bg-white/5 hover:text-white'}`}><Icon size={18} /><span className="truncate">{item.label}</span></Link>;
              })}
            </nav>
          </aside>
        </div>
      ) : null}

      <style jsx global>{`
        @media (max-width: 1023px) {
          body:has(.master-dashboard-filter-first),
          body:has(.master-mobile-navigation-anchor) {
            padding-top: calc(4.25rem + env(safe-area-inset-top));
            padding-bottom: calc(5.75rem + env(safe-area-inset-bottom));
          }
        }
      `}</style>
    </>
  );
}
