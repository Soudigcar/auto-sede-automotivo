import Link from 'next/link';
import { ArrowLeft, CarFront, Search } from 'lucide-react';
import { PublicPortalFooter } from '@/components/marketplace/PublicPortalFooter';
import { PublicPortalHeader } from '@/components/marketplace/PublicPortalHeader';
import { loadPortalSettings } from '@/lib/server/portalSettings';

export default async function NotFoundPage() {
  const settings = await loadPortalSettings();

  return (
    <main className="min-h-screen bg-[#f4f6fa] text-slate-950">
      <PublicPortalHeader settings={settings} />
      <section className="flex min-h-[65vh] items-center px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto w-full max-w-3xl rounded-[34px] border border-slate-200 bg-white p-8 text-center shadow-[0_18px_55px_rgba(15,23,42,0.10)] sm:p-12">
          <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-red-600 text-white"><CarFront size={30} /></span>
          <p className="mt-6 text-xs font-black uppercase tracking-[0.22em] text-red-600">Erro 404</p>
          <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">Esta página não está disponível</h1>
          <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-slate-500 sm:text-base">O anúncio pode ter sido removido, vendido ou o endereço informado não existe. Consulte o catálogo atualizado.</p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Link href="/veiculos" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-red-600 px-5 text-sm font-black text-white"><Search size={18} /> Ver veículos</Link>
            <Link href="/" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 text-sm font-black text-slate-800"><ArrowLeft size={18} /> Voltar ao início</Link>
          </div>
        </div>
      </section>
      <PublicPortalFooter settings={settings} />
    </main>
  );
}
