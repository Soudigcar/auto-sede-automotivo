'use client';

import Link from 'next/link';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useParams, usePathname, useRouter } from 'next/navigation';
import {
  BarChart3,
  CalendarDays,
  Car,
  ClipboardList,
  LayoutDashboard,
  LogOut,
  MessageCircle,
  Package,
  Store,
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

const PortalContext = createContext<StorePortalClientContext | null>(null);

const menuIcons: Record<string, LucideIcon> = {
  dashboard: LayoutDashboard,
  store: Store,
  pipeline: BarChart3,
  whatsapp: MessageCircle,
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

function desktopMenuClass(active: boolean) {
  return active
    ? 'flex items-center gap-3 rounded-2xl bg-red-600 px-4 py-4 font-bold text-white shadow-lg shadow-red-600/20'
    : 'flex items-center gap-3 rounded-2xl px-4 py-4 font-bold text-zinc-400 transition hover:bg-white/5 hover:text-white';
}

function mobileMenuClass(active: boolean) {
  return active
    ? 'inline-flex shrink-0 items-center gap-2 rounded-xl bg-red-600 px-3 py-2 text-xs font-black text-white'
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

  if (!context) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#071020] p-6 text-center text-white">
        <div>
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-red-600/15 text-red-500"><Car size={28} /></div>
          <p className="mt-5 max-w-lg text-sm font-bold text-zinc-300">{message}</p>
        </div>
      </main>
    );
  }

  return (
    <PortalContext.Provider value={context}>
      <main className="premium-page">
        <section className="premium-shell flex min-h-screen">
          <aside className="hidden w-72 shrink-0 bg-[#071020] px-6 py-7 text-white lg:flex lg:flex-col">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-red-600/15 text-red-500"><Car size={22} /></div>
              <div><p className="text-sm font-black tracking-wide">AUTO CONTROLE</p><p className="text-[10px] uppercase tracking-[0.35em] text-zinc-500">Automotivo</p></div>
            </div>

            <div className="mt-9 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-red-600/20 text-sm font-black text-red-400">{initials(context.profile.full_name)}</div>
                <div className="min-w-0">
                  <p className="text-[9px] font-black uppercase tracking-[0.2em] text-zinc-500">Logado como</p>
                  <p className="mt-1 truncate text-sm font-black text-white">{context.profile.full_name}</p>
                  <p className="mt-0.5 truncate text-[11px] font-bold text-red-400">{context.profile.role_label}</p>
                </div>
              </div>
              <div className="mt-3 border-t border-white/10 pt-3">
                <p className="text-[9px] font-black uppercase tracking-[0.18em] text-zinc-600">Loja vinculada</p>
                <p className="mt-1 truncate text-xs font-bold text-zinc-300">{context.store.store_name}</p>
              </div>
            </div>

            <nav className="mt-7 space-y-2 text-sm">
              {context.menu.map((item) => {
                const Icon = menuIcons[item.key] || LayoutDashboard;
                return <Link key={item.key} href={item.href} className={desktopMenuClass(segment === item.segment)}><Icon size={18} /> {item.label}</Link>;
              })}
            </nav>

            <div className="mt-auto pt-7">
              <Link href="/logout" className={desktopMenuClass(false)}><LogOut size={18} /> Sair</Link>
            </div>
          </aside>

          <div className="premium-canvas min-w-0 flex-1 overflow-x-hidden">
            <header className="sticky top-0 z-40 border-b border-zinc-200 bg-white/95 px-4 py-3 backdrop-blur-lg lg:hidden">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0"><p className="truncate text-sm font-black text-zinc-950">{context.store.store_name}</p><p className="truncate text-[11px] font-bold text-red-600">{context.profile.full_name} · {context.profile.role_label}</p></div>
                <Link href="/logout" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-zinc-200 text-zinc-600" aria-label="Sair"><LogOut size={18} /></Link>
              </div>
              <nav className="mt-3 flex gap-2 overflow-x-auto pb-1">
                {context.menu.map((item) => {
                  const Icon = menuIcons[item.key] || LayoutDashboard;
                  return <Link key={item.key} href={item.href} className={mobileMenuClass(segment === item.segment)}><Icon size={14} /> {item.label}</Link>;
                })}
              </nav>
            </header>

            <div className="store-portal-child p-4 md:p-7">{children}</div>
          </div>
        </section>
      </main>

      <style jsx global>{`
        .store-portal-child > main,
        .store-portal-child > main > section,
        .store-portal-child > main > section > div {
          display: contents;
        }
        .store-portal-child > main > section > aside {
          display: none !important;
        }
      `}</style>
    </PortalContext.Provider>
  );
}
