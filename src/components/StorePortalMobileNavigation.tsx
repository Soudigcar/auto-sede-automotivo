'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';
import {
  BarChart3,
  CalendarDays,
  Car,
  ClipboardList,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageCircle,
  Moon,
  MoreHorizontal,
  Package,
  PlugZap,
  Store,
  Sun,
  UsersRound,
  X,
  type LucideIcon
} from 'lucide-react';
import { getStorePortalContext } from '@/lib/storePortalClient';
import type { StorePortalClientContext } from '@/components/StorePortalShell';

const menuIcons: Record<string, LucideIcon> = {
  dashboard: LayoutDashboard,
  store: Store,
  pipeline: BarChart3,
  whatsapp: MessageCircle,
  integrations: PlugZap,
  calendar: CalendarDays,
  stock: Package,
  operation: ClipboardList,
  team: UsersRound
};

const bottomPriority = ['dashboard', 'pipeline', 'whatsapp'];

function routeSlug(pathname: string) {
  return pathname.match(/^\/loja\/([^/]+)(?:\/|$)/)?.[1] || '';
}

function currentSegment(pathname: string, slug: string) {
  const base = `/loja/${slug}`;
  const rest = pathname.startsWith(base) ? pathname.slice(base.length).replace(/^\//, '') : '';
  return rest.split('/')[0] || '';
}

function initials(value: string) {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'US';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ''}${parts[parts.length - 1][0] || ''}`.toUpperCase();
}

export function StorePortalMobileNavigation() {
  const pathname = usePathname() || '';
  const slug = routeSlug(pathname);
  const [mobile, setMobile] = useState(false);
  const [context, setContext] = useState<StorePortalClientContext | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    const media = window.matchMedia('(max-width: 1023px)');
    const sync = () => setMobile(media.matches);
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    if (!mobile || !slug) {
      setContext(null);
      return;
    }

    let cancelled = false;
    void getStorePortalContext(slug).then((result) => {
      if (cancelled) return;
      if (result.status === 'ok') setContext(result as StorePortalClientContext);
      else setContext(null);
    });
    return () => {
      cancelled = true;
    };
  }, [mobile, slug]);

  useEffect(() => {
    if (!mobile) return;
    const stored = window.localStorage.getItem('auto-controle-store-portal-theme');
    setTheme(stored === 'dark' ? 'dark' : 'light');
  }, [mobile]);

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

  const segment = useMemo(() => currentSegment(pathname, slug), [pathname, slug]);
  const bottomItems = useMemo(() => {
    if (!context) return [];
    return bottomPriority.flatMap((key) => {
      const item = context.menu.find((candidate) => candidate.key === key);
      return item ? [item] : [];
    });
  }, [context]);

  if (!mobile || !slug || !context) return null;

  const dark = theme === 'dark';
  const ThemeIcon = dark ? Sun : Moon;
  const themeLabel = dark ? 'Usar tema claro' : 'Usar tema escuro';

  function toggleTheme() {
    const next = dark ? 'light' : 'dark';
    setTheme(next);
    window.localStorage.setItem('auto-controle-store-portal-theme', next);
    window.location.reload();
  }

  return (
    <>
      <header className={`fixed inset-x-0 top-0 z-[230] border-b px-4 backdrop-blur-xl lg:hidden ${dark ? 'border-white/10 bg-[#071020]/95 text-white' : 'border-zinc-200 bg-white/95 text-zinc-950'}`} style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}>
        <div className="flex h-14 items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border ${dark ? 'border-white/10 bg-white/5 text-white' : 'border-zinc-200 bg-zinc-50 text-zinc-900'}`}
            aria-label="Abrir menu de navegação"
            aria-expanded={drawerOpen}
            aria-controls="store-mobile-navigation-drawer"
          >
            <Menu size={21} />
          </button>

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-black">{context.store.store_name}</p>
            <p className="truncate text-[10px] font-bold uppercase tracking-[0.12em] text-red-500">Auto Controle</p>
          </div>

          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-600/10 text-xs font-black text-red-500">
            {initials(context.profile.full_name)}
          </div>
        </div>
      </header>

      <nav
        className={`fixed inset-x-0 bottom-0 z-[225] border-t px-2 pt-2 backdrop-blur-xl lg:hidden ${dark ? 'border-white/10 bg-[#071020]/95 text-zinc-300' : 'border-zinc-200 bg-white/95 text-zinc-600'}`}
        style={{ paddingBottom: 'calc(0.5rem + env(safe-area-inset-bottom))' }}
        aria-label="Navegação principal mobile"
      >
        <div className="mx-auto flex max-w-lg items-stretch justify-around gap-1">
          {bottomItems.map((item) => {
            const Icon = menuIcons[item.key] || LayoutDashboard;
            const active = segment === item.segment;
            return (
              <Link
                key={item.key}
                href={item.href}
                className={`flex min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-xl px-2 py-2 text-[10px] font-black ${active ? 'bg-red-600/10 text-red-500' : dark ? 'text-zinc-400' : 'text-zinc-600'}`}
              >
                <Icon size={19} />
                <span className="max-w-full truncate">{item.label}</span>
              </Link>
            );
          })}
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className={`flex min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-xl px-2 py-2 text-[10px] font-black ${dark ? 'text-zinc-400' : 'text-zinc-600'}`}
            aria-label="Abrir mais opções"
          >
            <MoreHorizontal size={20} />
            <span>Mais</span>
          </button>
        </div>
      </nav>

      {drawerOpen ? (
        <div className="fixed inset-0 z-[250] lg:hidden" role="presentation">
          <button
            type="button"
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setDrawerOpen(false)}
            aria-label="Fechar menu"
          />
          <aside
            id="store-mobile-navigation-drawer"
            className="absolute inset-y-0 left-0 flex w-[min(86vw,360px)] flex-col bg-[#071020] text-white shadow-2xl"
            style={{ paddingTop: 'max(1rem, env(safe-area-inset-top))', paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
            aria-label="Menu do Auto Controle"
          >
            <div className="flex items-center justify-between gap-3 px-4 pb-4">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-red-600/10 text-red-500"><Car size={21} /></div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-black">AUTO CONTROLE</p>
                  <p className="truncate text-[9px] uppercase tracking-[0.25em] text-zinc-500">Automotivo</p>
                </div>
              </div>
              <button type="button" onClick={() => setDrawerOpen(false)} className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-zinc-300" aria-label="Fechar menu"><X size={19} /></button>
            </div>

            <div className="mx-4 rounded-2xl border border-white/10 bg-white/[0.04] p-3">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-red-600/20 text-xs font-black text-red-400">{initials(context.profile.full_name)}</div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-black">{context.profile.full_name}</p>
                  <p className="truncate text-[11px] font-bold text-red-400">{context.profile.role_label}</p>
                  <p className="mt-0.5 truncate text-[10px] text-zinc-500">{context.store.store_name}</p>
                </div>
              </div>
            </div>

            <nav className="mt-4 flex-1 space-y-1 overflow-y-auto px-3 pb-4" aria-label="Todas as áreas liberadas">
              {context.menu.map((item) => {
                const Icon = menuIcons[item.key] || LayoutDashboard;
                const active = segment === item.segment;
                return (
                  <Link
                    key={item.key}
                    href={item.href}
                    onClick={() => setDrawerOpen(false)}
                    className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-bold ${active ? 'bg-red-600 text-white shadow-lg shadow-red-600/20' : 'text-zinc-300 hover:bg-white/5 hover:text-white'}`}
                  >
                    <Icon size={18} />
                    <span className="truncate">{item.label}</span>
                  </Link>
                );
              })}
            </nav>

            <div className="space-y-1 border-t border-white/10 px-3 pt-3">
              <button type="button" onClick={toggleTheme} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-bold text-zinc-300 hover:bg-white/5 hover:text-white"><ThemeIcon size={18} /> {themeLabel}</button>
              <Link href="/logout" className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-bold text-zinc-300 hover:bg-white/5 hover:text-white"><LogOut size={18} /> Sair</Link>
            </div>
          </aside>
        </div>
      ) : null}

      <style jsx global>{`
        @media (max-width: 1023px) {
          .store-mobile-header {
            display: none !important;
          }
          .premium-canvas > .store-portal-child {
            padding-top: calc(4.25rem + env(safe-area-inset-top)) !important;
            padding-bottom: calc(6.25rem + env(safe-area-inset-bottom)) !important;
          }
        }
      `}</style>
    </>
  );
}
