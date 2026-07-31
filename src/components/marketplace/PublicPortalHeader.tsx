import Link from 'next/link';
import { CarFront, LogIn, UserPlus } from 'lucide-react';
import type { PortalSettings } from '@/lib/portalSettings';
import { INTERNAL_SYSTEM_URL } from '@/lib/publicRoutes';

export function PublicPortalHeader({ settings }: { settings: PortalSettings }) {
  return (
    <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-[1480px] items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-3" aria-label={`Página inicial ${settings.brand_name}`}>
          {settings.logo_url ? (
            <span className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <img src={settings.logo_url} alt={`Logomarca ${settings.brand_name}`} className="h-full w-full object-contain" />
            </span>
          ) : (
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-950 text-white shadow-lg"><CarFront size={23} /></span>
          )}
          <span>
            <span className="block text-sm font-black tracking-tight text-slate-950 sm:text-base">{settings.brand_name}</span>
            <span className="block text-[9px] font-black uppercase tracking-[0.3em] text-red-600">{settings.brand_tagline}</span>
          </span>
        </Link>

        <nav className="hidden items-center gap-6 text-sm font-black text-slate-600 lg:flex" aria-label="Navegação principal">
          <Link href="/veiculos" className="transition hover:text-red-600">Veículos</Link>
          <Link href="/lojas" className="transition hover:text-red-600">Lojas</Link>
          <Link href="/cadastre-sua-loja" className="transition hover:text-red-600">Cadastre sua loja</Link>
          <Link href="/sobre" className="transition hover:text-red-600">Sobre</Link>
          <Link href="/contato" className="transition hover:text-red-600">Contato</Link>
        </nav>

        <div className="flex items-center gap-2">
          <Link href="/cadastre-sua-loja" className="hidden min-h-11 items-center justify-center gap-2 rounded-2xl bg-red-600 px-4 text-xs font-black text-white shadow-lg shadow-red-600/15 transition hover:bg-red-700 sm:inline-flex lg:hidden xl:inline-flex">
            <UserPlus size={17} /> <span className="hidden xl:inline">Cadastrar loja</span><span className="xl:hidden">Cadastrar</span>
          </Link>
          <a href={INTERNAL_SYSTEM_URL} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-xs font-black text-slate-800 shadow-sm transition hover:border-red-200 hover:text-red-600 sm:text-sm">
            <LogIn size={17} /> <span className="hidden sm:inline">Acesso da loja</span><span className="sm:hidden">Entrar</span>
          </a>
        </div>
      </div>
    </header>
  );
}
