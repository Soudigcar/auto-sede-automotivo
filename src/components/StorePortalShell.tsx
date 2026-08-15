'use client';

import Link from 'next/link';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useParams, usePathname, useRouter } from 'next/navigation';
import {
  BarChart3,
  CalendarDays,
  Car,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  LayoutDashboard,
  LogOut,
  MessageCircle,
  Moon,
  Package,
  PlugZap,
  Store,
  Sun,
  UsersRound,
  type LucideIcon
} from 'lucide-react';
import { getStorePortalContext } from '@/lib/storePortalClient';

export type StorePortalClientContext = {
  status: 'ok';
  profile: {
    id: string;
    full_name: string;
    email: string;
    phone: string | null;
    role: string;
    role_label: string;
    store_id: string | null;
  };
  store: {
    id: string;
    store_name: string;
    slug: string;
    event_id: string | null;
    status: string;
    portal_enabled: boolean;
    responsible_name?: string | null;
    responsible_email?: string | null;
    responsible_phone?: string | null;
    website_url?: string | null;
  };
  permissions: string[];
  menu: Array<{
    key: string;
    label: string;
    segment: string;
    href: string;
    permission: string;
  }>;
  scope_label: string;
};

export type StorePortalTheme = 'light' | 'dark';

type StorePortalContextValue = StorePortalClientContext & {
  theme: StorePortalTheme;
  toggleTheme: () => void;
};

const PortalContext = createContext<StorePortalContextValue | null>(null);
const THEME_STORAGE_KEY = 'auto-controle-store-portal-theme';

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

function initials(value: string) {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'US';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ''}${parts[parts.length - 1][0] || ''}`.toUpperCase();
}

function currentSegment(pathname: string, slug: string) {
  const base = `/loja/${slug}`;
  const rest = pathname.startsWith(base) ? pathname.slice(base.length).replace(/^\//, '') : '';
  return rest.split('/')[0] || '';
}

function desktopMenuClass(active: boolean, collapsed = false) {
  const alignment = collapsed ? 'justify-center px-0' : 'gap-3 px-4';
  return active
    ? `flex w-full items-center ${alignment} rounded-2xl py-4 text-left font-bold text-white bg-red-600 shadow-lg shadow-red-600/20`
    : `flex w-full items-center ${alignment} rounded-2xl py-4 text-left font-bold text-zinc-400 transition hover:bg-white/5 hover:text-white`;
}

function mobileMenuClass(active: boolean, dark: boolean) {
  if (active) return 'inline-flex shrink-0 items-center gap-2 rounded-xl bg-red-600 px-3 py-2 text-xs font-black text-white';
  return dark
    ? 'inline-flex shrink-0 items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-black text-zinc-300'
    : 'inline-flex shrink-0 items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-black text-zinc-600';
}

export function useStorePortal() {
  const context = useContext(PortalContext);
  if (!context) throw new Error('StorePortalShell não foi inicializado.');
  return context;
}

export function StorePortalShell({ children }: { children: ReactNode }) {
  const params = useParams();
  const pathname = usePathname() || '';
  const router = useRouter();
  const slug = String(params?.slug || '');
  const [context, setContext] = useState<StorePortalClientContext | null>(null);
  const [message, setMessage] = useState('Validando acesso ao Portal da Loja...');
  const [theme, setTheme] = useState<StorePortalTheme>('light');
  const [themeReady, setThemeReady] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  useEffect(() => {
    const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
    setTheme(storedTheme === 'dark' ? 'dark' : 'light');
    setThemeReady(true);
  }, []);

  useEffect(() => {
    if (!themeReady) return;
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme, themeReady]);

  const toggleTheme = useCallback(() => {
    setTheme((current) => current === 'dark' ? 'light' : 'dark');
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadContext() {
      setMessage('Validando acesso ao Portal da Loja...');
      const result = await getStorePortalContext(slug);
      if (cancelled) return;

      if (result.status === 'unauthenticated') {
        router.replace(`/login?redirectedFrom=${encodeURIComponent(pathname)}`);
        return;
      }

      if (result.status !== 'ok') {
        setContext(null);
        setMessage(result.error || 'Acesso bloqueado para este portal.');
        return;
      }

      setContext(result as StorePortalClientContext);
      setMessage('');
    }

    void loadContext();
    return () => {
      cancelled = true;
    };
  }, [pathname, router, slug]);

  const segment = useMemo(() => currentSegment(pathname, slug), [pathname, slug]);

  useEffect(() => {
    if (!context) return;
    const allowed = context.menu.some((item) => item.segment === segment);
    if (!allowed) router.replace(`/loja/${context.store.slug}`);
  }, [context, router, segment]);

  const portalValue = useMemo<StorePortalContextValue | null>(() => {
    if (!context) return null;
    return { ...context, theme, toggleTheme };
  }, [context, theme, toggleTheme]);

  if (!context || !portalValue) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#071020] p-6 text-center text-white">
        <div>
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-red-600/15 text-red-500"><Car size={28} /></div>
          <p className="mt-5 max-w-lg text-sm font-bold text-zinc-300">{message}</p>
        </div>
      </main>
    );
  }

  const dark = theme === 'dark';
  const ThemeIcon = dark ? Sun : Moon;
  const themeLabel = dark ? 'Usar tema claro' : 'Usar tema escuro';
  const pipelinePage = segment === 'pipeline';

  return (
    <PortalContext.Provider value={portalValue}>
      <main className={`premium-page store-portal-theme store-theme-${theme}`} style={{ paddingTop: '4px' }}>
        <section className="premium-shell flex min-h-screen items-stretch">
          <div className={`relative hidden shrink-0 transition-[width] duration-200 lg:block ${sidebarCollapsed ? 'w-[76px]' : 'w-72'}`}>
            <button
              type="button"
              onClick={() => setSidebarCollapsed((current) => !current)}
              className="absolute -right-4 top-5 z-[120] flex h-10 w-10 items-center justify-center rounded-full border-2 border-white bg-red-600 text-white shadow-xl shadow-black/30 transition hover:scale-105 hover:bg-red-500 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-red-200"
              aria-label={sidebarCollapsed ? 'Expandir menu' : 'Recolher menu'}
              title={sidebarCollapsed ? 'Expandir menu' : 'Recolher menu'}
            >
              {sidebarCollapsed ? <ChevronRight size={19} strokeWidth={3} /> : <ChevronLeft size={19} strokeWidth={3} />}
            </button>

            <aside className={`sticky top-6 flex h-[calc(100vh-48px)] w-full self-start flex-col overflow-y-auto bg-[#071020] py-7 text-white transition-[padding] duration-200 ${sidebarCollapsed ? 'px-3' : 'px-6'}`}>
              <div className={`flex items-center ${sidebarCollapsed ? 'justify-center' : 'gap-3'}`}>
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-red-600/15 text-red-500"><Car size={22} /></div>
                {!sidebarCollapsed ? <div><p className="text-sm font-black tracking-wide">AUTO CONTROLE</p><p className="text-[10px] uppercase tracking-[0.35em] text-zinc-500">Automotivo</p></div> : null}
              </div>

              <div className={`mt-9 rounded-2xl border border-white/10 bg-white/[0.04] ${sidebarCollapsed ? 'p-2' : 'p-4'}`} title={sidebarCollapsed ? `${context.profile.full_name} · ${context.store.store_name}` : undefined}>
                <div className={`flex items-center ${sidebarCollapsed ? 'justify-center' : 'gap-3'}`}>
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-red-600/20 text-sm font-black text-red-400">{initials(context.profile.full_name)}</div>
                  {!sidebarCollapsed ? <div className="min-w-0">
                    <p className="text-[9px] font-black uppercase tracking-[0.2em] text-zinc-500">Logado como</p>
                    <p className="mt-1 truncate text-sm font-black text-white">{context.profile.full_name}</p>
                    <p className="mt-0.5 truncate text-[11px] font-bold text-red-400">{context.profile.role_label}</p>
                  </div> : null}
                </div>
                {!sidebarCollapsed ? <div className="mt-3 border-t border-white/10 pt-3">
                  <p className="text-[9px] font-black uppercase tracking-[0.18em] text-zinc-600">Loja vinculada</p>
                  <p className="mt-1 truncate text-xs font-bold text-zinc-300">{context.store.store_name}</p>
                </div> : null}
              </div>

              <nav className="mt-7 space-y-2 text-sm">
                {context.menu.map((item) => {
                  const Icon = menuIcons[item.key] || LayoutDashboard;
                  return <Link key={item.key} href={item.href} title={sidebarCollapsed ? item.label : undefined} aria-label={sidebarCollapsed ? item.label : undefined} className={desktopMenuClass(segment === item.segment, sidebarCollapsed)}><Icon size={18} /> {!sidebarCollapsed ? item.label : null}</Link>;
                })}
              </nav>

              <div className="mt-auto space-y-1 pt-7">
                <button type="button" onClick={toggleTheme} title={sidebarCollapsed ? themeLabel : undefined} className={desktopMenuClass(false, sidebarCollapsed)} aria-label={themeLabel}><ThemeIcon size={18} /> {!sidebarCollapsed ? themeLabel : null}</button>
                <Link href="/logout" title={sidebarCollapsed ? 'Sair' : undefined} aria-label={sidebarCollapsed ? 'Sair' : undefined} className={desktopMenuClass(false, sidebarCollapsed)}><LogOut size={18} /> {!sidebarCollapsed ? 'Sair' : null}</Link>
              </div>
            </aside>
          </div>

          <div className="premium-canvas min-w-0 flex-1 overflow-x-clip">
            <header className={`store-mobile-header sticky top-0 z-40 px-4 py-3 backdrop-blur-lg lg:hidden ${dark ? 'border-b border-white/10 bg-[#0d1725]/95' : 'border-b border-zinc-200 bg-white/95'}`}>
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0"><p className={`truncate text-sm font-black ${dark ? 'text-white' : 'text-zinc-950'}`}>{context.store.store_name}</p><p className="truncate text-[11px] font-bold text-red-600">{context.profile.full_name} · {context.profile.role_label}</p></div>
                <div className="flex shrink-0 gap-2">
                  <button type="button" onClick={toggleTheme} className={`flex h-10 w-10 items-center justify-center rounded-xl border ${dark ? 'border-white/10 text-zinc-300' : 'border-zinc-200 text-zinc-600'}`} aria-label={themeLabel}><ThemeIcon size={18} /></button>
                  <Link href="/logout" className={`flex h-10 w-10 items-center justify-center rounded-xl border ${dark ? 'border-white/10 text-zinc-300' : 'border-zinc-200 text-zinc-600'}`} aria-label="Sair"><LogOut size={18} /></Link>
                </div>
              </div>
              <nav className="mt-3 flex gap-2 overflow-x-auto pb-1">
                {context.menu.map((item) => {
                  const Icon = menuIcons[item.key] || LayoutDashboard;
                  return <Link key={item.key} href={item.href} className={mobileMenuClass(segment === item.segment, dark)}><Icon size={14} /> {item.label}</Link>;
                })}
              </nav>
            </header>

            <div className={`store-portal-child min-w-0 max-w-full overflow-x-hidden px-4 pb-4 pt-1 md:px-7 md:pb-7 md:pt-1 ${pipelinePage ? 'store-pipeline-page pb-28' : ''}`}>{children}</div>
          </div>
        </section>
      </main>

      <style jsx global>{`
        .store-portal-child > .premium-page {
          min-height: 0;
          max-width: 100%;
          padding: 0;
          background: transparent;
          color: inherit;
        }

        .store-portal-child > .premium-page > .premium-shell {
          min-height: 0;
          width: 100%;
          max-width: none;
          overflow: visible;
          border: 0;
          border-radius: 0;
          background: transparent;
          box-shadow: none;
        }

        .store-portal-child > .premium-page > .premium-shell > aside {
          display: none !important;
        }

        .store-portal-child [data-sidebar-toggle='true'] {
          display: none !important;
        }

        .store-portal-child > .premium-page > .premium-shell > .premium-canvas {
          min-width: 0;
          width: 100%;
          padding: 0;
          overflow: visible;
          background: transparent;
          color: inherit;
        }

        .store-pipeline-page > .premium-page,
        .store-pipeline-page > .premium-page > .premium-shell,
        .store-pipeline-page > .premium-page > .premium-shell > .premium-canvas {
          max-width: 100%;
        }

        .store-pipeline-page .overflow-x-auto {
          max-width: 100%;
          overscroll-behavior-inline: contain;
          scrollbar-gutter: stable;
        }

        .store-pipeline-page [class*='min-w-[1760px]'] {
          padding-bottom: 8px;
        }

        @media (max-width: 1023px) {
          .store-pipeline-page {
            padding-bottom: 96px;
          }
        }
      `}</style>
    </PortalContext.Provider>
  );
}
